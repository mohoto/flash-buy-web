import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";
import { updateProduct, deleteProduct } from "../actions";
import { addVariant, deleteVariant } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

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
      <h1 className="text-2xl font-semibold text-foreground">{product.name}</h1>

      {saved && (
        <Alert variant="success" className="mt-4">
          <AlertDescription>Produit mis à jour.</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="error" className="mt-4">
          <AlertDescription>Merci de vérifier les champs saisis.</AlertDescription>
        </Alert>
      )}

      <form action={updateProductWithId} className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nom du produit</Label>
          <Input id="name" name="name" defaultValue={product.name} required />
        </div>
        <div className="flex gap-4">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="price">Prix (€)</Label>
            <Input
              id="price"
              name="price"
              type="number"
              step="0.01"
              min="0"
              defaultValue={(product.price_cents / 100).toFixed(2)}
              required
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="stock">Stock</Label>
            <Input id="stock" name="stock" type="number" min="0" defaultValue={product.stock} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status">Statut</Label>
          <select
            id="status"
            name="status"
            defaultValue={product.status}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring sm:h-8"
          >
            <option value="draft">Brouillon</option>
            <option value="active">Actif</option>
            <option value="archived">Archivé</option>
          </select>
        </div>
        <Button type="submit" className="mt-2 self-start">
          Enregistrer
        </Button>
      </form>

      <Separator className="my-8" />

      <h2 className="text-lg font-semibold text-foreground">Tailles / variantes</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Utilisées pour reconnaître la taille dans les commentaires &quot;sold …&quot; pendant le live.
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {(variants ?? []).map((variant) => (
          <li
            key={variant.id}
            className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
          >
            <span>
              {variant.label} — stock {variant.stock}
            </span>
            <form action={deleteVariant.bind(null, id, variant.id)}>
              <button type="submit" className="text-destructive hover:underline">
                Supprimer
              </button>
            </form>
          </li>
        ))}
        {(variants ?? []).length === 0 && (
          <li className="text-sm text-muted-foreground">Aucune variante.</li>
        )}
      </ul>

      <form action={addVariantWithId} className="mt-4 flex gap-2">
        <Input name="label" placeholder="Ex: M, 38, unique" required className="flex-1" />
        <Input name="stock" type="number" min="0" defaultValue={0} className="w-24" />
        <Button type="submit" variant="secondary">
          Ajouter
        </Button>
      </form>

      <Separator className="my-8" />

      <form action={deleteProductWithId}>
        <Button type="submit" variant="destructive-outline">
          Supprimer ce produit
        </Button>
      </form>
    </div>
  );
}
