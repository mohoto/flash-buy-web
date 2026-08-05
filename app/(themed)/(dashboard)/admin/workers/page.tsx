import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";

const MAX_LIVES_PER_WORKER = Number.parseInt(process.env.MAX_LIVES_PER_WORKER ?? "25", 10);

export default async function AdminWorkersPage() {
  // worker_health : lecture réservée à l'admin via la policy admin_reads_worker_health
  // (is_flassh_buy_admin()), donc le client public RLS suffit ici.
  const supabase = await createClient();

  const { data: workers } = await supabase
    .from("worker_health")
    .select("*")
    .order("updated_at", { ascending: false });

  const railwayProjectUrl = process.env.RAILWAY_PROJECT_URL;

  const activeWorkers = (workers ?? []).filter(
    (w) => Date.now() - new Date(w.updated_at).getTime() <= 60_000
  );
  const totalLives = activeWorkers.reduce((sum, w) => sum + w.lives_count, 0);
  const totalCapacity = activeWorkers.length * MAX_LIVES_PER_WORKER;

  return (
    <div>
      <PageHeader
        title="Santé des workers"
        description="Sert à décider quand ajouter une replica ou changer de plan côté Railway. Le scaling (nombre de replicas, plan) se pilote depuis le dashboard Railway, pas ici — cette page ne fait que lire l'état que les workers publient eux-mêmes dans Supabase."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>
          {activeWorkers.length} worker{activeWorkers.length > 1 ? "s" : ""} actif
          {activeWorkers.length > 1 ? "s" : ""} · {totalLives}/{totalCapacity || "—"} lives en charge
        </span>
        <span>
          Alertes de déploiement : voir{" "}
          <a href="/admin/railway" className="underline underline-offset-2">
            Alertes Railway
          </a>
        </span>
        {railwayProjectUrl && (
          <a
            href={railwayProjectUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 underline underline-offset-2"
          >
            Ouvrir le projet Railway
            <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Worker</TableHead>
              <TableHead className="text-right">Lives</TableHead>
              <TableHead className="text-right">Lag event-loop (p99)</TableHead>
              <TableHead className="text-right">Échecs WS</TableHead>
              <TableHead className="text-right">Dernière mise à jour</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(workers ?? []).map((worker) => {
              const staleSince = Date.now() - new Date(worker.updated_at).getTime();
              const isStale = staleSince > 60_000;
              const hasFailures = worker.ws_open_failures > 0;
              return (
                <TableRow key={worker.worker_id}>
                  <TableCell className="font-mono text-xs text-foreground">{worker.worker_id}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums text-foreground">
                    {worker.lives_count}/{MAX_LIVES_PER_WORKER}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                    {worker.event_loop_p99_ms?.toFixed(1) ?? "—"} ms
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    <span className={hasFailures ? "text-destructive" : "text-muted-foreground"}>
                      {worker.ws_open_failures}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={isStale ? "error" : "success"}>
                      {new Date(worker.updated_at).toLocaleTimeString("fr-FR")}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
            {(workers ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  Aucun worker n&apos;a encore reporté d&apos;état.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
