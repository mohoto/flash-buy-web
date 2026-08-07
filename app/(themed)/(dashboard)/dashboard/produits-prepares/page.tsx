import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";
import { PreparedProductsList } from "./prepared-products-list";
import { ProductCatalogsList } from "./product-catalogs-list";
import { Separator } from "@/components/ui/separator";

export default async function PreparedProductsPage() {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data: preparedProducts } = await supabase
    .from("prepared_products")
    .select("id, name, price_cents, discount_tiers_cents, simple_discount_cents")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false });

  const { data: catalogs } = await supabase
    .from("product_catalogs")
    .select("id, name, scheduled_for, created_at, product_catalog_items(count)")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <p className="text-sm text-muted-foreground">
        Une bibliothèque de produits (nom, prix, remises) réutilisable d&apos;un live à l&apos;autre —
        disponible dans l&apos;onglet &quot;Catalogue&quot; de la console live, à côté de la création à la
        volée.
      </p>

      <div className="mt-6">
        <PreparedProductsList initialProducts={preparedProducts ?? []} />
      </div>

      <Separator className="my-10" />

      <div>
        <h2 className="mb-1 text-base font-semibold text-foreground">Catalogues</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Regroupe des produits préparés pour un live précis (ex. « Catalogue du 15 août ») — choisis
          ensuite dans l&apos;onglet &quot;Catalogue&quot; de la console live. Un catalogue reste réutilisable
          après usage.
        </p>

        <ProductCatalogsList
          initialCatalogs={(catalogs ?? []).map((c) => ({
            id: c.id,
            name: c.name,
            scheduled_for: c.scheduled_for,
            created_at: c.created_at,
            product_count: c.product_catalog_items[0]?.count ?? 0,
          }))}
          preparedProducts={preparedProducts ?? []}
        />
      </div>
    </div>
  );
}
