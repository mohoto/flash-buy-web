import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";
import { updateProduct, deleteProduct } from "../actions";
import { addVariant, deleteVariant } from "./actions";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("shop_id", shop.id)
    .single();

  if (!product) notFound();

  const { data: variants } = await supabase
    .from("product_variants")
    .select("id, label, stock")
    .eq("product_id", id)
    .order("position", { ascending: true });

  const updateProductWithId = updateProduct.bind(null, id);
  const deleteProductWithId = deleteProduct.bind(null, id);
  const addVariantWithId = addVariant.bind(null, id);

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        {product.name}
      </h1>

      {saved && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          Produit mis à jour.
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Merci de vérifier les champs saisis.
        </p>
      )}

      <form action={updateProductWithId} className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Nom du produit
          </label>
          <input
            id="name"
            name="name"
            defaultValue={product.name}
            required
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="flex gap-4">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="price" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Prix (€)
            </label>
            <input
              id="price"
              name="price"
              type="number"
              step="0.01"
              min="0"
              defaultValue={(product.price_cents / 100).toFixed(2)}
              required
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="stock" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Stock
            </label>
            <input
              id="stock"
              name="stock"
              type="number"
              min="0"
              defaultValue={product.stock}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="status" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Statut
          </label>
          <select
            id="status"
            name="status"
            defaultValue={product.status}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="draft">Brouillon</option>
            <option value="active">Actif</option>
            <option value="archived">Archivé</option>
          </select>
        </div>
        <button
          type="submit"
          className="mt-2 self-start rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950"
        >
          Enregistrer
        </button>
      </form>

      <hr className="my-8 border-zinc-200 dark:border-zinc-800" />

      <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
        Tailles / variantes
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        Utilisées pour reconnaître la taille dans les commentaires
        &quot;sold …&quot; pendant le live.
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {(variants ?? []).map((variant) => (
          <li
            key={variant.id}
            className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
          >
            <span>
              {variant.label} — stock {variant.stock}
            </span>
            <form action={deleteVariant.bind(null, id, variant.id)}>
              <button type="submit" className="text-red-600 hover:underline">
                Supprimer
              </button>
            </form>
          </li>
        ))}
        {(variants ?? []).length === 0 && (
          <li className="text-sm text-zinc-500">Aucune variante.</li>
        )}
      </ul>

      <form action={addVariantWithId} className="mt-4 flex gap-2">
        <input
          name="label"
          placeholder="Ex: M, 38, unique"
          required
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          name="stock"
          type="number"
          min="0"
          defaultValue={0}
          className="w-24 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-50"
        >
          Ajouter
        </button>
      </form>

      <hr className="my-8 border-zinc-200 dark:border-zinc-800" />

      <form action={deleteProductWithId}>
        <button
          type="submit"
          className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
        >
          Supprimer ce produit
        </button>
      </form>
    </div>
  );
}
