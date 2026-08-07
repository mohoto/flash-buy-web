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

// Deux actions séparées (prix vs remises) plutôt qu'un update complet — même
// pattern que updateRapidProductPrice/updateRapidProductDiscountTiers
// (rapid-actions.ts, console live), pour la même raison : les popovers
// "Modifier"/"Remises" (EditablePreparedPrice/EditablePreparedDiscountTiers,
// cf. product-catalogs-list.tsx) soumettent chacun un formulaire PARTIEL —
// une seule action combinée aurait silencieusement écrasé les remises à
// chaque changement de prix (et inversement, jamais appliqué les remises
// faute de "name"/"price" dans ce formulaire-là).
export async function updatePreparedProductPrice(productId: string, formData: FormData) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const priceEuros = Number(formData.get("price") ?? 0);
  if (!name || !Number.isFinite(priceEuros) || priceEuros <= 0) return;

  await supabase
    .from("prepared_products")
    .update({ name, price_cents: Math.round(priceEuros * 100) })
    .eq("id", productId)
    .eq("shop_id", shop.id);

  revalidatePath("/dashboard/produits-prepares");
}

export async function updatePreparedProductDiscountTiers(productId: string, formData: FormData) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  await supabase
    .from("prepared_products")
    .update({
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
// Regroupements nommés de produits préparés (many-to-many via
// product_catalog_items), pensés pour préparer à l'avance la sélection d'un
// live précis (ex. "Catalogue du 15 août") — choisis ensuite dans l'onglet
// Catalogue de /dashboard/live/[liveId] (cf. CatalogProductsPanel). Un
// catalogue reste disponible indéfiniment après usage, jamais "consommé" :
// scheduled_for est purement indicatif, n'empêche jamais de le réutiliser
// sur un live à une autre date.
//
// Un prepared_product naît toujours à l'intérieur d'un catalogue (cf.
// createPreparedProductInCatalog) — il n'existe plus de bibliothèque plate
// indépendante à la racine de cette page (l'ancienne section "Produits
// préparés" a été retirée) ; createPreparedProduct/updatePreparedProduct/
// deletePreparedProduct ci-dessus restent néanmoins valides et réutilisées
// telles quelles.

export async function createProductCatalog(formData: FormData) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return null;

  const scheduledFor = String(formData.get("scheduled_for") ?? "").trim() || null;

  const { data: catalog, error } = await supabase
    .from("product_catalogs")
    .insert({ shop_id: shop.id, name, scheduled_for: scheduledFor })
    .select("id, name, scheduled_for, created_at")
    .single();

  if (error || !catalog) return null;

  revalidatePath("/dashboard/produits-prepares");
  return { ...catalog, product_count: 0 };
}

export async function updateProductCatalog(catalogId: string, formData: FormData) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const scheduledFor = String(formData.get("scheduled_for") ?? "").trim() || null;

  await supabase
    .from("product_catalogs")
    .update({ name, scheduled_for: scheduledFor })
    .eq("id", catalogId)
    .eq("shop_id", shop.id);

  revalidatePath("/dashboard/produits-prepares");
}

export async function deleteProductCatalog(catalogId: string) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  // Ne supprime jamais les prepared_products qu'il contenait — seulement le
  // regroupement lui-même (product_catalog_items suit via ON DELETE CASCADE).
  // Les produits restent en base, orphelins de tout catalogue, mais ne sont
  // plus proposés nulle part côté UI (plus de bibliothèque à plat) —
  // acceptable, cohérent avec "un produit vit dans un catalogue".
  await supabase.from("product_catalogs").delete().eq("id", catalogId).eq("shop_id", shop.id);

  revalidatePath("/dashboard/produits-prepares");
}

// Composition détaillée d'un catalogue — appelée à l'ouverture de la popup
// "Gérer les produits" (cf. ManageCatalogProductsDialog), pas au chargement
// de la page. Nom distinct de getCatalogProducts (rapid-actions.ts, console
// live) bien que la requête soit proche : signatures de retour différentes
// (celle-ci inclut les remises pour EditablePrice/EditableDiscountTiers,
// cf. product-catalogs-list.tsx), modules séparés sans import croisé.
export async function getCatalogPreparedProducts(catalogId: string): Promise<
  {
    id: string;
    name: string;
    price_cents: number;
    discount_tiers_cents: unknown;
    simple_discount_cents: number;
  }[]
> {
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

// Crée un prepared_product ET l'attache immédiatement à CE catalogue, en une
// seule action — c'est la seule façon de créer un produit préparé désormais
// (plus de formulaire de création indépendant, cf. suppression de
// PreparedProductsList). Les remises se règlent ensuite via
// updatePreparedProduct (même configuration Modifier/Remises que les
// produits créés à la volée, cf. EditablePrice/EditableDiscountTiers dans la
// console live).
export async function createPreparedProductInCatalog(
  catalogId: string,
  formData: FormData
): Promise<{
  id: string;
  name: string;
  price_cents: number;
  discount_tiers_cents: unknown;
  simple_discount_cents: number;
} | null> {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const priceEuros = Number(formData.get("price") ?? 0);
  if (!name || !Number.isFinite(priceEuros) || priceEuros <= 0) return null;

  const { data: product, error } = await supabase
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

  if (error || !product) return null;

  await supabase
    .from("product_catalog_items")
    .insert({ catalog_id: catalogId, prepared_product_id: product.id });

  revalidatePath("/dashboard/produits-prepares");
  return product;
}

// Retire un produit du catalogue SANS le supprimer (cf. deleteProductCatalog
// — même principe : product_catalog_items est un lien, pas le produit
// lui-même). Le produit reste en base, orphelin, mais n'est plus proposé
// dans l'onglet Catalogue via ce catalogue.
export async function removeProductFromCatalog(catalogId: string, preparedProductId: string) {
  await getOwnShop();
  const supabase = await createClient();

  await supabase
    .from("product_catalog_items")
    .delete()
    .eq("catalog_id", catalogId)
    .eq("prepared_product_id", preparedProductId);

  revalidatePath("/dashboard/produits-prepares");
}
