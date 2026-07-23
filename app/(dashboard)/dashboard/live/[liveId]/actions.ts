"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";

// Le pseudo TikTok peut changer d'un live à l'autre (compte différent, event
// ponctuel…) : réglage par live (lives.tiktok_username), distinct du réglage
// global sur /dashboard/settings (shops.tiktok_username).
export async function updateLiveTiktokUsername(liveId: string, formData: FormData) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const tiktokUsername = String(formData.get("tiktok_username") ?? "").trim();

  await supabase
    .from("lives")
    .update({ tiktok_username: tiktokUsername || null })
    .eq("id", liveId)
    .eq("shop_id", shop.id);

  revalidatePath(`/dashboard/live/${liveId}`);
}

// Mots-clés de vente reconnus par le worker pour CE live (ex. "sold, vendu,
// jprends"), au lieu du tableau en dur côté worker/src/parsing.ts.
export async function updateLiveSaleKeywords(liveId: string, formData: FormData) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const raw = String(formData.get("sale_keywords") ?? "");
  const keywords = [
    ...new Set(
      raw
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];

  await supabase
    .from("lives")
    .update({ sale_keywords: keywords.length > 0 ? keywords : ["sold", "vendu"] })
    .eq("id", liveId)
    .eq("shop_id", shop.id);

  revalidatePath(`/dashboard/live/${liveId}`);
}

export async function addManualItem(liveId: string, formData: FormData) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const buyerTiktokUsername = String(formData.get("buyer") ?? "").trim();
  const productId = String(formData.get("product_id") ?? "");
  const variantId = String(formData.get("variant_id") ?? "") || null;
  const quantity = Math.max(1, Number(formData.get("quantity") ?? 1));

  if (!buyerTiktokUsername || !productId) return;

  const { data: product } = await supabase
    .from("products")
    .select("id, name, price_cents, shop_id")
    .eq("id", productId)
    .eq("shop_id", shop.id)
    .single();

  if (!product) return;

  let variantLabel: string | null = null;
  if (variantId) {
    const { data: variant } = await supabase
      .from("product_variants")
      .select("label")
      .eq("id", variantId)
      .single();
    variantLabel = variant?.label ?? null;
  }

  // Un panier "ouvert" par acheteur et par live (index unique partiel côté DB).
  let { data: order } = await supabase
    .from("live_orders")
    .select("id")
    .eq("live_id", liveId)
    .eq("buyer_tiktok_username", buyerTiktokUsername)
    .in("status", ["pending", "validated"])
    .maybeSingle();

  if (!order) {
    const { data: created } = await supabase
      .from("live_orders")
      .insert({
        live_id: liveId,
        shop_id: shop.id,
        buyer_tiktok_username: buyerTiktokUsername,
      })
      .select("id")
      .single();
    order = created;
  }

  if (!order) return;

  await supabase.from("live_order_items").insert({
    live_order_id: order.id,
    product_id: product.id,
    variant_id: variantId,
    size_label: variantLabel,
    quantity,
    unit_price_cents: product.price_cents,
    matched: true,
    source_comment: null,
  });

  await recomputeOrderTotal(order.id);

  revalidatePath(`/dashboard/live/${liveId}`);
}

export async function correctItem(
  liveId: string,
  itemId: string,
  formData: FormData
) {
  await getOwnShop();
  const supabase = await createClient();

  const productId = String(formData.get("product_id") ?? "");
  const variantId = String(formData.get("variant_id") ?? "") || null;
  if (!productId) return;

  const { data: product } = await supabase
    .from("products")
    .select("price_cents")
    .eq("id", productId)
    .single();

  let variantLabel: string | null = null;
  if (variantId) {
    const { data: variant } = await supabase
      .from("product_variants")
      .select("label")
      .eq("id", variantId)
      .single();
    variantLabel = variant?.label ?? null;
  }

  const { data: item } = await supabase
    .from("live_order_items")
    .update({
      product_id: productId,
      variant_id: variantId,
      size_label: variantLabel,
      unit_price_cents: product?.price_cents ?? 0,
      matched: true,
    })
    .eq("id", itemId)
    .select("live_order_id")
    .single();

  if (item) await recomputeOrderTotal(item.live_order_id);

  revalidatePath(`/dashboard/live/${liveId}`);
}

export async function deleteItem(liveId: string, itemId: string) {
  await getOwnShop();
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("live_order_items")
    .delete()
    .eq("id", itemId)
    .select("live_order_id")
    .single();

  if (item) await recomputeOrderTotal(item.live_order_id);

  revalidatePath(`/dashboard/live/${liveId}`);
}

// Le stock est engagé à la validation, pas avant (cf. spec section 3).
export async function validateOrder(liveId: string, orderId: string) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("live_order_items")
    .select("product_id, variant_id, quantity")
    .eq("live_order_id", orderId);

  // adjust_stock() est réservée au service_role (restrict_adjust_stock_to_service_role,
  // migration app mobile). L'appartenance du shop est déjà vérifiée par getOwnShop()
  // ci-dessus et par p_shop_id passé à la fonction (vérifié côté SQL par shop_id = p_shop_id).
  const serviceClient = createServiceRoleClient();

  for (const item of items ?? []) {
    if (!item.product_id) continue;
    if (item.variant_id) {
      await serviceClient.rpc("adjust_stock", {
        p_target: "variant",
        p_id: item.variant_id,
        p_quantity: -item.quantity,
        p_shop_id: shop.id,
      });
    } else {
      await serviceClient.rpc("adjust_stock", {
        p_target: "product",
        p_id: item.product_id,
        p_quantity: -item.quantity,
        p_shop_id: shop.id,
      });
    }
  }

  await supabase
    .from("live_orders")
    .update({ status: "validated" })
    .eq("id", orderId)
    .eq("shop_id", shop.id);

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

  await supabase
    .from("live_orders")
    .update({ total_cents: total })
    .eq("id", orderId);
}
