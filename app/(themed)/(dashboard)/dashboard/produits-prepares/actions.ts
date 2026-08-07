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

// ── Catalogues (product_catalogs) ──────────────────────────────────────────
// Regroupements nommés de produits préparés existants (many-to-many via
// product_catalog_items), pensés pour préparer à l'avance la sélection d'un
// live précis (ex. "Catalogue du 15 août") — choisis ensuite dans l'onglet
// Catalogue de /dashboard/live/[liveId] (cf. CatalogProductsPanel). Un
// catalogue reste disponible indéfiniment après usage, jamais "consommé" :
// scheduled_for est purement indicatif, n'empêche jamais de le réutiliser
// sur un live à une autre date.

export async function createProductCatalog(formData: FormData) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return null;

  const scheduledFor = String(formData.get("scheduled_for") ?? "").trim() || null;
  const productIds = formData.getAll("product_ids").map(String).filter(Boolean);

  const { data: catalog, error } = await supabase
    .from("product_catalogs")
    .insert({ shop_id: shop.id, name, scheduled_for: scheduledFor })
    .select("id, name, scheduled_for, created_at")
    .single();

  if (error || !catalog) return null;

  if (productIds.length > 0) {
    await supabase.from("product_catalog_items").insert(
      productIds.map((preparedProductId) => ({
        catalog_id: catalog.id,
        prepared_product_id: preparedProductId,
      }))
    );
  }

  revalidatePath("/dashboard/produits-prepares");
  return { ...catalog, product_count: productIds.length };
}

export async function updateProductCatalog(catalogId: string, formData: FormData) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const scheduledFor = String(formData.get("scheduled_for") ?? "").trim() || null;
  const productIds = formData.getAll("product_ids").map(String).filter(Boolean);

  await supabase
    .from("product_catalogs")
    .update({ name, scheduled_for: scheduledFor })
    .eq("id", catalogId)
    .eq("shop_id", shop.id);

  // Remplace entièrement la composition du catalogue plutôt que de calculer
  // un diff — plus simple et largement suffisant vu le volume attendu
  // (quelques dizaines de produits par catalogue au plus).
  await supabase.from("product_catalog_items").delete().eq("catalog_id", catalogId);
  if (productIds.length > 0) {
    await supabase.from("product_catalog_items").insert(
      productIds.map((preparedProductId) => ({
        catalog_id: catalogId,
        prepared_product_id: preparedProductId,
      }))
    );
  }

  revalidatePath("/dashboard/produits-prepares");
}

export async function deleteProductCatalog(catalogId: string) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  // Ne supprime jamais les prepared_products qu'il contenait — seulement le
  // regroupement lui-même (product_catalog_items suit via ON DELETE CASCADE).
  await supabase.from("product_catalogs").delete().eq("id", catalogId).eq("shop_id", shop.id);

  revalidatePath("/dashboard/produits-prepares");
}

// Composition détaillée d'un catalogue (utilisée pour pré-cocher les
// produits déjà inclus au moment d'éditer sa composition).
export async function getProductCatalogItems(catalogId: string): Promise<string[]> {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data } = await supabase
    .from("product_catalog_items")
    .select("prepared_product_id, product_catalogs!inner(shop_id)")
    .eq("catalog_id", catalogId)
    .eq("product_catalogs.shop_id", shop.id);

  return (data ?? []).map((row) => row.prepared_product_id);
}
