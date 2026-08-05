import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { PageHeader } from "../page-header";
import { ToggleButton } from "./toggle-button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function AdminComptesPage() {
  // Lecture cross-vendeur : profiles_select_own limite la RLS au propriétaire,
  // donc l'admin lit ici via service role (accès déjà vérifié par le layout
  // /admin qui appelle requireAdminAccess()).
  const supabase = createServiceRoleClient();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, pseudo, role, flassh_buy_enabled, is_admin, shops(name, cart_slug)")
    .eq("role", "pro")
    .order("full_name", { ascending: true });

  return (
    <div>
      <PageHeader
        title="Comptes vendeurs"
        description="Accorde ou révoque l'accès web à Flassh buy pour les vendeurs de l'app mobile."
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendeur</TableHead>
              <TableHead>Boutique</TableHead>
              <TableHead>Lien live</TableHead>
              <TableHead className="text-right">Accès Flassh buy</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(profiles ?? []).map((profile) => {
              const shop = Array.isArray(profile.shops) ? profile.shops[0] : profile.shops;
              return (
                <TableRow key={profile.id}>
                  <TableCell className="font-medium text-foreground">
                    {profile.full_name ?? profile.pseudo ?? profile.id}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{shop?.name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {shop?.cart_slug ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <ToggleButton profileId={profile.id} enabled={profile.flassh_buy_enabled} />
                  </TableCell>
                </TableRow>
              );
            })}
            {(profiles ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                  Aucun vendeur pour l&apos;instant.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
