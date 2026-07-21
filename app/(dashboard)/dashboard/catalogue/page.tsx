import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";

export default async function CataloguePage() {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data: products } = await supabase
    .from("products")
    .select("id, name, price_cents, stock, status")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          Catalogue
        </h1>
        <Link
          href="/dashboard/catalogue/new"
          className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950"
        >
          Nouveau produit
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Prix</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {(products ?? []).map((product) => (
              <tr key={product.id}>
                <td className="px-4 py-3 text-zinc-950 dark:text-zinc-50">
                  {product.name}
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                  {(product.price_cents / 100).toFixed(2)} €
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                  {product.stock}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {product.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/dashboard/catalogue/${product.id}`}
                    className="text-zinc-600 hover:underline dark:text-zinc-400"
                  >
                    Éditer
                  </Link>
                </td>
              </tr>
            ))}
            {(products ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  Aucun produit pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
