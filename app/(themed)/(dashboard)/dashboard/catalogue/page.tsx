import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_VARIANT: Record<string, "success" | "secondary" | "outline"> = {
  active: "success",
  draft: "outline",
  archived: "secondary",
};

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
      <div className="flex items-center justify-end">
        <Button render={<Link href="/dashboard/catalogue/new" />}>Nouveau produit</Button>
      </div>

      <Card className="mt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Prix</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(products ?? []).map((product) => (
              <TableRow key={product.id}>
                <TableCell className="text-foreground">{product.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {(product.price_cents / 100).toFixed(2)} €
                </TableCell>
                <TableCell className="text-muted-foreground">{product.stock}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[product.status] ?? "outline"}>{product.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/dashboard/catalogue/${product.id}`} className="text-sm text-muted-foreground hover:underline">
                    Éditer
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {(products ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Aucun produit pour l&apos;instant.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
