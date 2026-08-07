import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";
import { ProductCatalogsList } from "./product-catalogs-list";

export default async function PreparedProductsPage() {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data: catalogs } = await supabase
    .from("product_catalogs")
    .select("id, name, scheduled_for, created_at, product_catalog_items(count)")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <ProductCatalogsList
        initialCatalogs={(catalogs ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          scheduled_for: c.scheduled_for,
          created_at: c.created_at,
          product_count: c.product_catalog_items[0]?.count ?? 0,
        }))}
      />
    </div>
  );
}
