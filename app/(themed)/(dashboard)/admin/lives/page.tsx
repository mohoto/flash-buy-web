import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { PageHeader } from "../page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Programmé",
  live: "En live",
  ended: "Terminé",
};

const STATUS_VARIANT: Record<string, "success" | "secondary" | "outline"> = {
  live: "success",
  scheduled: "outline",
  ended: "secondary",
};

export default async function AdminLivesPage() {
  const supabase = createServiceRoleClient();

  const { data: lives } = await supabase
    .from("lives")
    .select("id, status, tiktok_room_id, worker_id, started_at, created_at, shops(name, tiktok_username)")
    .eq("status", "live")
    .order("started_at", { ascending: false });

  const liveList = lives ?? [];

  return (
    <div>
      <PageHeader
        title="Lives en cours"
        description="Tous les lives actuellement en direct, tous vendeurs confondus."
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Boutique</TableHead>
              <TableHead>Compte TikTok</TableHead>
              <TableHead>Worker</TableHead>
              <TableHead className="text-right">Démarré</TableHead>
              <TableHead className="text-right">Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {liveList.map((live) => {
              const shop = Array.isArray(live.shops) ? live.shops[0] : live.shops;
              return (
                <TableRow key={live.id}>
                  <TableCell className="text-sm font-medium text-foreground">
                    {shop?.name ?? "Boutique supprimée"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {shop?.tiktok_username ?? live.tiktok_room_id ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {live.worker_id ?? "non assigné"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                    {live.started_at ? new Date(live.started_at).toLocaleTimeString("fr-FR") : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={STATUS_VARIANT[live.status] ?? "outline"}>
                      {STATUS_LABEL[live.status] ?? live.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
            {liveList.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  Aucun live en cours pour l&apos;instant.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
