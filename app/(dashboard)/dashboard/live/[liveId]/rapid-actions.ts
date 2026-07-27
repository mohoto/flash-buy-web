"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";

// Création + activation atomique ("à l'antenne") via la RPC security definer
// create_and_activate_live_product (cf. migration flassh_buy_rapid_mode) :
// incrémente le compteur de labels internes, insère le produit et bascule
// lives.active_product_id dans la même transaction, pour qu'un double-clic
// sur la barre express ne puisse jamais laisser deux produits actifs.
export async function createAndActivateRapidProduct(liveId: string, formData: FormData) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const rawName = String(formData.get("name") ?? "").trim();
  const priceEuros = Number(formData.get("price") ?? 0);

  if (!Number.isFinite(priceEuros) || priceEuros <= 0) return;

  // Nom auto-généré si laissé vide : "Article A{n+1}" — n+1 est calculé côté
  // client à partir de rapid_product_seq (affiché en placeholder), la RPC
  // incrémente elle-même le compteur réel pour éviter toute course ; si le
  // nom n'est pas fourni ici, on retombe sur un label neutre, la RPC fournit
  // de toute façon le internal_ref définitif.
  const { data: live } = await supabase
    .from("lives")
    .select("rapid_product_seq")
    .eq("id", liveId)
    .eq("shop_id", shop.id)
    .single();

  const nextSeq = (live?.rapid_product_seq ?? 0) + 1;
  const name = rawName || `Article A${nextSeq}`;

  await supabase.rpc("create_and_activate_live_product", {
    p_live_id: liveId,
    p_shop_id: shop.id,
    p_name: name,
    p_price_cents: Math.round(priceEuros * 100),
  });

  revalidatePath(`/dashboard/live/${liveId}`);
}

// Retrait manuel sans activer de remplaçant (ex. fin de segment, rien de
// prêt à passer à l'antenne) : le produit reste visible dans "produits
// précédents", seul lives.active_product_id repasse à null.
export async function retireActiveProduct(liveId: string) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data: live } = await supabase
    .from("lives")
    .select("active_product_id")
    .eq("id", liveId)
    .eq("shop_id", shop.id)
    .single();

  if (live?.active_product_id) {
    await supabase
      .from("live_products")
      .update({ retired_at: new Date().toISOString() })
      .eq("id", live.active_product_id);
  }

  await supabase
    .from("lives")
    .update({ active_product_id: null })
    .eq("id", liveId)
    .eq("shop_id", shop.id);

  revalidatePath(`/dashboard/live/${liveId}`);
}

// Remet un produit précédent à l'antenne (ex. rupture de stock résolue,
// retour sur un article) — retire l'actif courant s'il y en a un, réactive
// celui choisi. Ne repasse pas retired_at à null pour le produit
// actuellement actif si aucun n'est actif (cas déjà géré par le null-check).
export async function reactivateRapidProduct(liveId: string, productId: string) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data: live } = await supabase
    .from("lives")
    .select("active_product_id")
    .eq("id", liveId)
    .eq("shop_id", shop.id)
    .single();

  if (live?.active_product_id && live.active_product_id !== productId) {
    await supabase
      .from("live_products")
      .update({ retired_at: new Date().toISOString() })
      .eq("id", live.active_product_id);
  }

  await supabase
    .from("live_products")
    .update({ retired_at: null })
    .eq("id", productId)
    .eq("shop_id", shop.id);

  await supabase
    .from("lives")
    .update({ active_product_id: productId })
    .eq("id", liveId)
    .eq("shop_id", shop.id);

  revalidatePath(`/dashboard/live/${liveId}`);
}

// Assignation par glisser-déposer : rattache une intention d'achat détectée
// par l'IA (jusque-là non assignée, ou déjà assignée à un autre produit) au
// produit déposé dessus. Trois cas :
// - Pas encore assignée : crée la ligne panier, quantité 1.
// - Déjà assignée au MÊME produit (le vendeur re-glisse pour dire "il en
//   veut 2") : incrémente la quantité de la ligne existante au lieu de la
//   remplacer.
// - Déjà assignée à un AUTRE produit : remplace (supprime l'ancienne ligne,
//   recrée avec quantité 1) — le vendeur corrige une erreur d'assignation.
export async function assignRapidItemToProduct(liveId: string, itemId: string, productId: string) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data: product } = await supabase
    .from("live_products")
    .select("id, name, price_cents, internal_ref")
    .eq("id", productId)
    .eq("shop_id", shop.id)
    .single();
  if (!product) return;

  const { data: rapidItem } = await supabase
    .from("live_rapid_items")
    .select("id, buyer_tiktok_username, source_comment, live_product_id, live_order_item_id, live_order_id")
    .eq("id", itemId)
    .eq("shop_id", shop.id)
    .single();
  if (!rapidItem) return;

  if (rapidItem.live_product_id === productId && rapidItem.live_order_item_id && rapidItem.live_order_id) {
    const { data: existingItem } = await supabase
      .from("live_order_items")
      .select("quantity")
      .eq("id", rapidItem.live_order_item_id)
      .single();
    if (existingItem) {
      const newQuantity = existingItem.quantity + 1;
      await supabase
        .from("live_order_items")
        .update({ quantity: newQuantity })
        .eq("id", rapidItem.live_order_item_id);
      await supabase
        .from("live_rapid_items")
        .update({ quantity: newQuantity })
        .eq("id", itemId);
      await supabase.rpc("assign_rapid_item_order_number", { p_live_id: liveId, p_item_id: itemId });
      await recomputeOrderTotal(rapidItem.live_order_id);
      revalidatePath(`/dashboard/live/${liveId}`);
      return;
    }
  }

  if (rapidItem.live_order_item_id) {
    await supabase.from("live_order_items").delete().eq("id", rapidItem.live_order_item_id);
  }

  let { data: order } = await supabase
    .from("live_orders")
    .select("id")
    .eq("live_id", liveId)
    .eq("buyer_tiktok_username", rapidItem.buyer_tiktok_username)
    .in("status", ["pending", "validated"])
    .maybeSingle();

  if (!order) {
    const { data: created } = await supabase
      .from("live_orders")
      .insert({
        live_id: liveId,
        shop_id: shop.id,
        buyer_tiktok_username: rapidItem.buyer_tiktok_username,
      })
      .select("id")
      .single();
    order = created;
  }
  if (!order) return;

  const { data: orderItem } = await supabase
    .from("live_order_items")
    .insert({
      live_order_id: order.id,
      product_id: null,
      quantity: 1,
      unit_price_cents: product.price_cents,
      matched: true,
      raw_product_text: `${product.name} (${product.internal_ref})`,
      source_comment: rapidItem.source_comment,
    })
    .select("id")
    .single();

  await supabase
    .from("live_rapid_items")
    .update({
      live_product_id: product.id,
      quantity: 1,
      live_order_id: order.id,
      live_order_item_id: orderItem?.id ?? null,
    })
    .eq("id", itemId);

  await supabase.rpc("assign_rapid_item_order_number", { p_live_id: liveId, p_item_id: itemId });

  await recomputeOrderTotal(order.id);

  revalidatePath(`/dashboard/live/${liveId}`);
}

// Retire uniquement le produit assigné à une intention (l'intention reste
// dans la liste, redevient non-assignée) — supprime la ligne panier
// associée sans toucher au reste. order_number n'est PAS effacé : une fois
// attribué, il reste figé (cf. assign_rapid_item_order_number), même si
// l'intention est ensuite ré-assignée à un autre produit.
export async function unassignRapidItem(liveId: string, itemId: string) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data: rapidItem } = await supabase
    .from("live_rapid_items")
    .select("live_order_item_id, live_order_id")
    .eq("id", itemId)
    .eq("shop_id", shop.id)
    .single();
  if (!rapidItem) return;

  if (rapidItem.live_order_item_id) {
    await supabase.from("live_order_items").delete().eq("id", rapidItem.live_order_item_id);
  }

  await supabase
    .from("live_rapid_items")
    .update({
      live_product_id: null,
      quantity: 1,
      live_order_id: null,
      live_order_item_id: null,
    })
    .eq("id", itemId)
    .eq("shop_id", shop.id);

  if (rapidItem.live_order_id) await recomputeOrderTotal(rapidItem.live_order_id);

  revalidatePath(`/dashboard/live/${liveId}`);
}

export async function deleteRapidItem(liveId: string, itemId: string) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data: rapidItem } = await supabase
    .from("live_rapid_items")
    .select("live_order_item_id, live_order_id")
    .eq("id", itemId)
    .eq("shop_id", shop.id)
    .single();

  if (rapidItem?.live_order_item_id) {
    await supabase.from("live_order_items").delete().eq("id", rapidItem.live_order_item_id);
  }

  await supabase.from("live_rapid_items").delete().eq("id", itemId).eq("shop_id", shop.id);

  if (rapidItem?.live_order_id) await recomputeOrderTotal(rapidItem.live_order_id);

  revalidatePath(`/dashboard/live/${liveId}`);
}

async function recomputeOrderTotal(orderId: string) {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("live_order_items")
    .select("quantity, unit_price_cents")
    .eq("live_order_id", orderId);

  const total = (items ?? []).reduce(
    (sum, item) => sum + item.quantity * item.unit_price_cents,
    0
  );

  await supabase.from("live_orders").update({ total_cents: total }).eq("id", orderId);
}
