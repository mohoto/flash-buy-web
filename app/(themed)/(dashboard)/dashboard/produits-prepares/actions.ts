"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";

// Lecture défensive de discount_tiers_cents (typé Json côté généré, plus
// large qu'un Record<string, number>) — même pattern que rapid-actions.ts
// (lookupDiscountCents), dupliqué ici pour rester indépendant de la console
// live.
function parseDiscountTiers(formData: FormData): Record<string, number> {
  const tiers: Record<string, number> = {};
  for (let qty = 1; qty <= 8; qty++) {
    const raw = formData.get(`discount_${qty}`);
    const euros = raw === null || raw === "" ? null : Number(raw);
    if (euros !== null && Number.isFinite(euros) && euros > 0) {
      tiers[String(qty)] = Math.round(euros * 100);
    }
  }
  return tiers;
}

function parseSimpleDiscountCents(formData: FormData): number {
  const raw = formData.get("discount_simple");
  const euros = raw === null || raw === "" ? null : Number(raw);
  return euros !== null && Number.isFinite(euros) && euros > 0 ? Math.round(euros * 100) : 0;
}

export async function createPreparedProduct(formData: FormData) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const priceEuros = Number(formData.get("price") ?? 0);
  if (!name || !Number.isFinite(priceEuros) || priceEuros <= 0) return null;

  const { data: created } = await supabase
    .from("prepared_products")
    .insert({
      shop_id: shop.id,
      name,
      price_cents: Math.round(priceEuros * 100),
      discount_tiers_cents: parseDiscountTiers(formData),
      simple_discount_cents: parseSimpleDiscountCents(formData),
    })
    .select("id, name, price_cents, discount_tiers_cents, simple_discount_cents")
    .single();

  revalidatePath("/dashboard/produits-prepares");
  return created;
}

export async function updatePreparedProduct(productId: string, formData: FormData) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const priceEuros = Number(formData.get("price") ?? 0);
  if (!name || !Number.isFinite(priceEuros) || priceEuros <= 0) return;

  await supabase
    .from("prepared_products")
    .update({
      name,
      price_cents: Math.round(priceEuros * 100),
      discount_tiers_cents: parseDiscountTiers(formData),
      simple_discount_cents: parseSimpleDiscountCents(formData),
    })
    .eq("id", productId)
    .eq("shop_id", shop.id);

  revalidatePath("/dashboard/produits-prepares");
}

export async function deletePreparedProduct(productId: string) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  await supabase.from("prepared_products").delete().eq("id", productId).eq("shop_id", shop.id);

  revalidatePath("/dashboard/produits-prepares");
}
