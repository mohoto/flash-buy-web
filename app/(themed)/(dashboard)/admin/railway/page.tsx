import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT: Record<string, "success" | "error" | "warning"> = {
  DEPLOY_FAILED: "error",
  DEPLOY_SUCCESS: "success",
  VOLUME_ALERT: "warning",
};

export default async function AdminRailwayPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("railway_events")
    .select("*")
    .order("received_at", { ascending: false })
    .limit(50);

  return (
    <div>
      <PageHeader
        title="Alertes Railway"
        description="Déploiements et alertes du worker, reçus via le webhook Railway."
      />

      <Card>
        <CardContent className="p-0 divide-y">
          {(events ?? []).length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Aucune alerte reçue pour l&apos;instant.
            </p>
          ) : (
            (events ?? []).map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Badge variant={STATUS_VARIANT[event.event_type] ?? "warning"} className="font-mono">
                    {event.event_type}
                  </Badge>
                  <span className="truncate text-sm text-muted-foreground">
                    {event.service_name ?? "—"} · {event.environment ?? "—"}
                  </span>
                </div>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {new Date(event.received_at).toLocaleString("fr-FR")}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
