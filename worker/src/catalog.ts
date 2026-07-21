import { supabase } from "./supabase.js";
import { config } from "./config.js";
import type { CatalogProduct } from "./parsing.js";

type ShopCatalog = {
  shopId: string;
  catalog: CatalogProduct[];
  refCount: number; // nombre de lives actifs pour ce vendeur sur cette instance
};

const catalogsByShop = new Map<string, ShopCatalog>();
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

export async function loadCatalog(shopId: string): Promise<CatalogProduct[]> {
  const { data: products } = await supabase
    .from("products")
    .select("id, name, price_cents, product_variants(id, label)")
    .eq("shop_id", shopId)
    .eq("status", "active");

  return (products ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    priceCents: p.price_cents,
    variants: (p.product_variants ?? []).map((v) => ({ id: v.id, label: v.label })),
  }));
}

export function getCatalog(shopId: string): CatalogProduct[] {
  return catalogsByShop.get(shopId)?.catalog ?? [];
}

// Appelé au claim d'un live : charge (ou référence) le catalogue du vendeur,
// et s'abonne aux changements Realtime de ce vendeur si ce n'est pas déjà fait.
export async function trackShop(shopId: string) {
  const existing = catalogsByShop.get(shopId);
  if (existing) {
    existing.refCount += 1;
    return;
  }

  const catalog = await loadCatalog(shopId);
  catalogsByShop.set(shopId, { shopId, catalog, refCount: 1 });
  ensureRealtimeSubscription();
}

// Appelé à la fin du live / SIGTERM : décrémente, et libère la mémoire si plus
// aucun live actif ne suit ce vendeur sur cette instance.
export function untrackShop(shopId: string) {
  const existing = catalogsByShop.get(shopId);
  if (!existing) return;
  existing.refCount -= 1;
  if (existing.refCount <= 0) {
    catalogsByShop.delete(shopId);
  }
}

async function reloadShopCatalog(shopId: string) {
  if (!catalogsByShop.has(shopId)) return;
  const catalog = await loadCatalog(shopId);
  const entry = catalogsByShop.get(shopId);
  if (entry) entry.catalog = catalog;
}

// Une seule connexion Realtime par replica (jamais une par live) : tous les
// vendeurs suivis partagent le même WebSocket via ce channel unique.
function ensureRealtimeSubscription() {
  if (realtimeChannel) return;

  realtimeChannel = supabase
    .channel("worker-catalog-tracking")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "products" },
      (payload) => {
        const shopId = (payload.new as { shop_id?: string })?.shop_id
          ?? (payload.old as { shop_id?: string })?.shop_id;
        if (shopId && catalogsByShop.has(shopId)) reloadShopCatalog(shopId);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "product_variants" },
      (payload) => {
        const shopId = (payload.new as { shop_id?: string })?.shop_id
          ?? (payload.old as { shop_id?: string })?.shop_id;
        if (shopId && catalogsByShop.has(shopId)) reloadShopCatalog(shopId);
      }
    )
    .subscribe((status) => {
      // Filet de sécurité : Realtime ne garantit pas la livraison, on recharge
      // tout à chaque (re)connexion pour rattraper un éventuel événement manqué.
      if (status === "SUBSCRIBED") reloadAllTrackedCatalogs();
    });
}

async function reloadAllTrackedCatalogs() {
  await Promise.all([...catalogsByShop.keys()].map(reloadShopCatalog));
}

// Filet de sécurité périodique (ex. toutes les 5 min), en complément du
// rechargement sur événement Realtime et sur reconnexion.
export function startPeriodicCatalogRefresh() {
  return setInterval(() => {
    reloadAllTrackedCatalogs();
  }, config.catalogRefreshIntervalMs);
}

export function stopRealtimeSubscription() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}
