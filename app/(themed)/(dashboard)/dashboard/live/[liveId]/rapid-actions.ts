"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";

// Création + activation atomique ("à l'antenne") via la RPC security definer
// create_and_activate_live_product (cf. migration flassh_buy_rapid_mode) :
// incrémente le compteur de labels internes et insère le produit — plusieurs
// produits peuvent être actifs simultanément, cette action n'en retire jamais
// aucun (retired_at IS NULL est la seule source de vérité pour "actif").
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

// Retrait manuel d'UN produit actif précis (ex. rupture de stock, fin de
// segment) — les autres produits actifs restent inchangés, le produit retiré
// reste visible dans "produits précédents".
export async function retireRapidProduct(liveId: string, productId: string) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  await supabase
    .from("live_products")
    .update({ retired_at: new Date().toISOString() })
    .eq("id", productId)
    .eq("live_id", liveId)
    .eq("shop_id", shop.id);

  revalidatePath(`/dashboard/live/${liveId}`);
}

// Remet un produit précédent à l'antenne (ex. rupture de stock résolue,
// retour sur un article) — s'ajoute aux produits déjà actifs, n'en retire
// aucun.
export async function reactivateRapidProduct(liveId: string, productId: string) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  await supabase
    .from("live_products")
    .update({ retired_at: null })
    .eq("id", productId)
    .eq("live_id", liveId)
    .eq("shop_id", shop.id);

  revalidatePath(`/dashboard/live/${liveId}`);
}

// Correction de nom/prix en cours de live (ex. erreur de saisie, changement
// de dernière minute) — ne touche pas aux live_order_items déjà créés : les
// intentions déjà assignées gardent le nom/prix qui était affiché au moment
// du glisser-déposer, seules les prochaines assignations verront la mise à
// jour. Le nom n'est mis à jour que si non vide (jamais de nom vide en base).
export async function updateRapidProductPrice(
  liveId: string,
  productId: string,
  priceEuros: number,
  name?: string
) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  if (!Number.isFinite(priceEuros) || priceEuros <= 0) return;

  const trimmedName = name?.trim();

  await supabase
    .from("live_products")
    .update({
      price_cents: Math.round(priceEuros * 100),
      ...(trimmedName ? { name: trimmedName } : {}),
    })
    .eq("id", productId)
    .eq("shop_id", shop.id);

  revalidatePath(`/dashboard/live/${liveId}`);
}

// Remises par quantité exacte (1 à 8) + remise simple (indépendante de la
// quantité), en euros, configurées côté carte "à l'antenne" — remplace
// intégralement la table de paliers et la remise simple à chaque sauvegarde
// (un champ vide/0 retire le palier / annule la remise simple). Ne touche
// pas aux live_order_items déjà créés, même logique que updateRapidProductPrice.
export async function updateRapidProductDiscountTiers(
  liveId: string,
  productId: string,
  formData: FormData
) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const tiers: Record<string, number> = {};
  for (let qty = 1; qty <= 8; qty++) {
    const raw = formData.get(`discount_${qty}`);
    const euros = raw === null || raw === "" ? null : Number(raw);
    if (euros !== null && Number.isFinite(euros) && euros > 0) {
      tiers[String(qty)] = Math.round(euros * 100);
    }
  }

  const rawSimple = formData.get("discount_simple");
  const simpleEuros = rawSimple === null || rawSimple === "" ? null : Number(rawSimple);
  const simpleDiscountCents =
    simpleEuros !== null && Number.isFinite(simpleEuros) && simpleEuros > 0
      ? Math.round(simpleEuros * 100)
      : 0;

  await supabase
    .from("live_products")
    .update({ discount_tiers_cents: tiers, simple_discount_cents: simpleDiscountCents })
    .eq("id", productId)
    .eq("shop_id", shop.id);

  revalidatePath(`/dashboard/live/${liveId}`);
}

// Lecture défensive de discount_tiers_cents (typé Json côté généré, plus
// large qu'un Record<string, number>) — correspondance exacte sur la
// quantité en priorité ; si aucun palier n'est configuré pour cette
// quantité, retombe sur la remise simple (indépendante de la quantité).
function lookupDiscountCents(tiers: unknown, quantity: number, simpleDiscountCents: number): number {
  if (tiers && typeof tiers === "object" && !Array.isArray(tiers)) {
    const value = (tiers as Record<string, unknown>)[String(quantity)];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.round(value);
    }
  }
  return Number.isFinite(simpleDiscountCents) && simpleDiscountCents > 0
    ? Math.round(simpleDiscountCents)
    : 0;
}

// Assignation par glisser-déposer : rattache une intention d'achat détectée
// par l'IA au produit déposé dessus, en AJOUTANT une ligne (jamais de
// remplacement) — une intention peut porter plusieurs produits différents.
// Deux cas :
// - Ce produit n'est pas encore assigné à cette intention : nouvelle ligne
//   de liaison (live_rapid_item_products) + nouvelle ligne panier.
// - Déjà assigné (le vendeur re-glisse le MÊME produit pour dire "il en
//   veut 2") : incrémente la quantité de la ligne existante.
export async function assignRapidItemToProduct(
  liveId: string,
  itemId: string,
  productId: string,
  quantity: number = 1
) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity) : 1;

  const { data: product } = await supabase
    .from("live_products")
    .select("id, name, price_cents, internal_ref, discount_tiers_cents, simple_discount_cents")
    .eq("id", productId)
    .eq("shop_id", shop.id)
    .single();
  if (!product) return;

  const { data: rapidItem } = await supabase
    .from("live_rapid_items")
    .select("id, buyer_tiktok_username, source_comment, live_order_id")
    .eq("id", itemId)
    .eq("shop_id", shop.id)
    .single();
  if (!rapidItem) return;

  // Une commande par intention d'achat (pas par acheteur) : chaque carte
  // d'intention = une étiquette = une live_order, même si un même acheteur a
  // plusieurs intentions dans le live. Créée une seule fois à la première
  // assignation de cette intention, puis réutilisée pour tous les produits
  // qui lui sont assignés ensuite.
  let orderId = rapidItem.live_order_id;
  if (!orderId) {
    const { data: created, error: createOrderError } = await supabase
      .from("live_orders")
      .insert({
        live_id: liveId,
        shop_id: shop.id,
        buyer_tiktok_username: rapidItem.buyer_tiktok_username,
      })
      .select("id")
      .single();
    if (createOrderError || !created) {
      console.error("assignRapidItemToProduct: failed to create live_order", createOrderError);
      return;
    }
    orderId = created.id;
    await supabase.from("live_rapid_items").update({ live_order_id: orderId }).eq("id", itemId);
  }

  const { data: existingLink } = await supabase
    .from("live_rapid_item_products")
    .select("id, quantity, live_order_item_id")
    .eq("live_rapid_item_id", itemId)
    .eq("live_product_id", productId)
    .maybeSingle();

  const newQuantity = (existingLink?.quantity ?? 0) + safeQuantity;
  const discountCents = lookupDiscountCents(
    product.discount_tiers_cents,
    newQuantity,
    product.simple_discount_cents
  );

  if (existingLink) {
    if (existingLink.live_order_item_id) {
      await supabase
        .from("live_order_items")
        .update({ quantity: newQuantity, discount_cents: discountCents })
        .eq("id", existingLink.live_order_item_id);
    }
    await supabase
      .from("live_rapid_item_products")
      .update({ quantity: newQuantity, discount_cents: discountCents })
      .eq("id", existingLink.id);
  } else {
    const { data: orderItem } = await supabase
      .from("live_order_items")
      .insert({
        live_order_id: orderId,
        product_id: null,
        quantity: safeQuantity,
        unit_price_cents: product.price_cents,
        discount_cents: discountCents,
        matched: true,
        raw_product_text: `${product.name} (${product.internal_ref})`,
        source_comment: rapidItem.source_comment,
      })
      .select("id")
      .single();

    await supabase.from("live_rapid_item_products").insert({
      live_rapid_item_id: itemId,
      live_product_id: productId,
      live_order_item_id: orderItem?.id ?? null,
      shop_id: shop.id,
      quantity: safeQuantity,
      discount_cents: discountCents,
    });
  }

  await supabase.rpc("assign_rapid_item_order_number", { p_live_id: liveId, p_item_id: itemId });
  await recomputeOrderTotal(orderId);
  revalidatePath(`/dashboard/live/${liveId}`);
}

// Retire UN produit assigné à une intention (les autres produits assignés à
// la même intention restent intacts) — supprime la ligne de liaison et sa
// ligne panier associée. Si c'était le DERNIER produit assigné, l'intention
// redevient "non assignée" : order_number est réinitialisé à null (une
// prochaine assignation en attribuera un nouveau, cf.
// assign_rapid_item_order_number) — sinon il reste figé tant qu'au moins un
// produit reste assigné.
export async function unassignRapidItem(liveId: string, itemId: string, productId: string) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data: link } = await supabase
    .from("live_rapid_item_products")
    .select("id, live_order_item_id")
    .eq("live_rapid_item_id", itemId)
    .eq("live_product_id", productId)
    .eq("shop_id", shop.id)
    .single();
  if (!link) return;

  if (link.live_order_item_id) {
    await supabase.from("live_order_items").delete().eq("id", link.live_order_item_id);
  }
  await supabase.from("live_rapid_item_products").delete().eq("id", link.id);

  const { data: rapidItem } = await supabase
    .from("live_rapid_items")
    .select("live_order_id")
    .eq("id", itemId)
    .single();
  if (rapidItem?.live_order_id) await recomputeOrderTotal(rapidItem.live_order_id);

  const { count: remainingLinks } = await supabase
    .from("live_rapid_item_products")
    .select("id", { count: "exact", head: true })
    .eq("live_rapid_item_id", itemId);
  if (!remainingLinks) {
    await supabase
      .from("live_rapid_items")
      .update({ order_number: null })
      .eq("id", itemId)
      .eq("shop_id", shop.id);
  }

  revalidatePath(`/dashboard/live/${liveId}`);
}

export async function deleteRapidItem(liveId: string, itemId: string) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data: links } = await supabase
    .from("live_rapid_item_products")
    .select("live_order_item_id")
    .eq("live_rapid_item_id", itemId)
    .eq("shop_id", shop.id);

  const orderItemIds = (links ?? [])
    .map((l) => l.live_order_item_id)
    .filter((id): id is string => !!id);
  if (orderItemIds.length > 0) {
    await supabase.from("live_order_items").delete().in("id", orderItemIds);
  }

  const { data: rapidItem } = await supabase
    .from("live_rapid_items")
    .select("live_order_id")
    .eq("id", itemId)
    .eq("shop_id", shop.id)
    .single();

  await supabase.from("live_rapid_items").delete().eq("id", itemId).eq("shop_id", shop.id);

  if (rapidItem?.live_order_id) await recomputeOrderTotal(rapidItem.live_order_id);

  revalidatePath(`/dashboard/live/${liveId}`);
}

async function recomputeOrderTotal(orderId: string) {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("live_order_items")
    .select("quantity, unit_price_cents, discount_cents")
    .eq("live_order_id", orderId);

  const total = (items ?? []).reduce(
    (sum, item) => sum + item.quantity * item.unit_price_cents - (item.discount_cents ?? 0),
    0
  );

  await supabase.from("live_orders").update({ total_cents: total }).eq("id", orderId);
}

// Onglet "Catalogue" de la console live : matérialise un produit préparé
// (bibliothèque indépendante de tout live, gérée dans
// /dashboard/produits-prepares) en un live_products propre à CE live —
// assignRapidItemToProduct attend toujours un productId référençant
// live_products, jamais prepared_products directement. Une nouvelle ligne
// live_products est créée à chaque première utilisation dans ce live (pas de
// déduplication), éditable/retirable ensuite comme n'importe quel produit
// créé "à la volée".
export async function materializeFromPrepared(
  liveId: string,
  preparedProductId: string
): Promise<{ id: string } | null> {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("create_live_product_from_prepared", {
      p_live_id: liveId,
      p_shop_id: shop.id,
      p_prepared_product_id: preparedProductId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("materializeFromPrepared failed", error);
    return null;
  }
  return data;
}

// Même principe que materializeFromPrepared, mais la source est un
// live_products d'un live précédent du même shop plutôt qu'un produit de la
// bibliothèque préparée — "reprendre les produits d'un live précédent"
// directement depuis l'onglet Catalogue.
export async function materializeFromPreviousLive(
  liveId: string,
  sourceLiveProductId: string
): Promise<{ id: string } | null> {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("create_live_product_from_previous", {
      p_live_id: liveId,
      p_shop_id: shop.id,
      p_source_live_product_id: sourceLiveProductId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("materializeFromPreviousLive failed", error);
    return null;
  }
  return data;
}

// Liste des live_products d'un live précédent (même shop) — appelée au
// changement de sélection dans le <Select> "Reprendre les produits d'un
// live précédent" de l'onglet Catalogue, plutôt qu'au chargement de la page
// (rarement consulté, ne vaut pas d'alourdir le fetch initial).
export async function getPreviousLiveProducts(sourceLiveId: string) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data } = await supabase
    .from("live_products")
    .select("id, name, price_cents, discount_tiers_cents, simple_discount_cents")
    .eq("live_id", sourceLiveId)
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: true });

  return data ?? [];
}

// Catalogues préparés à l'avance (product_catalogs, cf.
// /dashboard/produits-prepares) — chargés au rendu initial de la console
// (peu nombreux en pratique, contrairement aux produits qu'ils contiennent)
// pour peupler le <Select> "Choisir un catalogue préparé" de l'onglet
// Catalogue.
export async function getProductCatalogs(): Promise<
  { id: string; name: string; scheduled_for: string | null }[]
> {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data } = await supabase
    .from("product_catalogs")
    .select("id, name, scheduled_for")
    .eq("shop_id", shop.id)
    .order("scheduled_for", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  return data ?? [];
}

// Produits préparés (prepared_products) appartenant à UN catalogue donné —
// appelée au changement de sélection dans le <Select> "Choisir un catalogue
// préparé", même pattern que getPreviousLiveProducts. Matérialisés ensuite
// via materializeFromPrepared (même RPC que la source "Produits préparés" :
// un item de catalogue référence toujours un prepared_product_id, la
// matérialisation ne dépend jamais de son appartenance à un catalogue).
export async function getCatalogProducts(catalogId: string) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data } = await supabase
    .from("product_catalog_items")
    .select(
      "prepared_products!inner(id, name, price_cents, discount_tiers_cents, simple_discount_cents, shop_id)"
    )
    .eq("catalog_id", catalogId)
    .eq("prepared_products.shop_id", shop.id);

  return (data ?? []).map((row) => row.prepared_products);
}
