import { createProduct } from "../actions";

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Nouveau produit
      </h1>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Merci de vérifier les champs saisis.
        </p>
      )}

      <form action={createProduct} className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Nom du produit
          </label>
          <input
            id="name"
            name="name"
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
              defaultValue={0}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
        </div>
        <button
          type="submit"
          className="mt-2 self-start rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950"
        >
          Créer le produit
        </button>
      </form>
    </div>
  );
}
