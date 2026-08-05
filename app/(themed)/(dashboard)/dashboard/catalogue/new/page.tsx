import { createProduct } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold text-foreground">Nouveau produit</h1>

      {error && (
        <Alert variant="error" className="mt-4">
          <AlertDescription>Merci de vérifier les champs saisis.</AlertDescription>
        </Alert>
      )}

      <form action={createProduct} className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nom du produit</Label>
          <Input id="name" name="name" required />
        </div>
        <div className="flex gap-4">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="price">Prix (€)</Label>
            <Input id="price" name="price" type="number" step="0.01" min="0" required />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="stock">Stock</Label>
            <Input id="stock" name="stock" type="number" min="0" defaultValue={0} />
          </div>
        </div>
        <Button type="submit" className="mt-2 self-start">
          Créer le produit
        </Button>
      </form>
    </div>
  );
}
