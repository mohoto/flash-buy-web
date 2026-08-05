import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { PageHeader } from "./page-header";
import { SummaryCard } from "./summary-card";

export default async function AdminPage() {
  const supabase = createServiceRoleClient();

  const [{ count: sellerCount }, { count: enabledCount }, { count: liveNowCount }, { count: staleWorkerCount }] =
    await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "pro"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "pro")
        .eq("flassh_buy_enabled", true),
      supabase.from("lives").select("id", { count: "exact", head: true }).eq("status", "live"),
      supabase
        .from("worker_health")
        .select("worker_id", { count: "exact", head: true })
        .lt("updated_at", new Date(Date.now() - 60_000).toISOString()),
    ]);

  return (
    <div>
      <PageHeader
        title="Tableau de bord"
        description="Vue d'ensemble des vendeurs et de l'infrastructure Flassh buy."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Vendeurs actifs"
          value={`${enabledCount ?? 0} / ${sellerCount ?? 0}`}
          hint="avec accès Flassh buy"
          href="/admin/comptes"
        />
        <SummaryCard
          label="Lives en cours"
          value={String(liveNowCount ?? 0)}
          hint="tous vendeurs confondus"
          href="/admin/lives"
        />
        <SummaryCard
          label="Workers en retard"
          value={String(staleWorkerCount ?? 0)}
          hint="heartbeat > 60s"
          href="/admin/workers"
          tone={staleWorkerCount && staleWorkerCount > 0 ? "warn" : "ok"}
        />
        <SummaryCard label="Paiement" value="Phase 2" hint="pas encore actif" href="/admin/stats" tone="muted" />
      </div>
    </div>
  );
}
