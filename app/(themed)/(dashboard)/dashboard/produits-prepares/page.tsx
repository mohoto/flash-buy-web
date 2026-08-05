import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";
import { PreparedProductsList } from "./prepared-products-list";

export default async function PreparedProductsPage() {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data: preparedProducts } = await supabase
    .from("prepared_products")
    .select("id, name, price_cents, discount_tiers_cents, simple_discount_cents")
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
    </div>
  );
}
