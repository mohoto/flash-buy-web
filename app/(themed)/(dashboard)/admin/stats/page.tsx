import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { PageHeader } from "../page-header";
import { StatCard } from "./stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default async function AdminStatsPage() {
  const supabase = createServiceRoleClient();

  const [{ count: livesCount }, { count: paidCount }, { data: paidOrders }, { data: topShops }] =
    await Promise.all([
      supabase.from("lives").select("id", { count: "exact", head: true }),
      supabase
        .from("live_orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "paid"),
      supabase
        .from("live_orders")
        .select("total_cents")
        .eq("status", "paid"),
      supabase
        .from("live_orders")
        .select("shop_id, total_cents, shops(name)")
        .eq("status", "paid"),
    ]);

  const gmvCents = (paidOrders ?? []).reduce((sum, o) => sum + o.total_cents, 0);

  const { count: totalOrdersCount } = await supabase
    .from("live_orders")
    .select("id", { count: "exact", head: true });

  const conversionRate =
    totalOrdersCount && totalOrdersCount > 0
      ? ((paidCount ?? 0) / totalOrdersCount) * 100
      : 0;

  const gmvByShop = new Map<string, { name: string; total: number }>();
  for (const order of topShops ?? []) {
    const shop = Array.isArray(order.shops) ? order.shops[0] : order.shops;
    const name = shop?.name ?? "Boutique supprimée";
    const entry = gmvByShop.get(order.shop_id) ?? { name, total: 0 };
    entry.total += order.total_cents;
    gmvByShop.set(order.shop_id, entry);
  }
  const topSellers = [...gmvByShop.values()].sort((a, b) => b.total - a.total).slice(0, 10);
  const maxTotal = topSellers[0]?.total ?? 0;

  return (
    <div>
      <PageHeader title="Statistiques" description="Performance globale du live-selling, tous vendeurs confondus." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="GMV payé" value={`${(gmvCents / 100).toFixed(2)} €`} />
        <StatCard label="Lives enregistrés" value={String(livesCount ?? 0)} />
        <StatCard
          label="Taux de conversion"
          value={`${conversionRate.toFixed(1)}%`}
          sub={`${paidCount ?? 0} / ${totalOrdersCount ?? 0} paniers`}
        />
      </div>

      <h2 className="mt-10 mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Top vendeurs par GMV
      </h2>
      <Card>
        <CardContent className="p-0 divide-y">
          {topSellers.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Aucune commande payée pour l&apos;instant.
            </p>
          ) : (
            topSellers.map((seller, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <span className="w-32 shrink-0 truncate text-sm font-medium text-foreground">
                  {seller.name}
                </span>
                <Progress value={maxTotal > 0 ? (seller.total / maxTotal) * 100 : 0} className="flex-1" />
                <span className="w-24 shrink-0 text-right font-mono text-sm tabular-nums text-foreground">
                  {(seller.total / 100).toFixed(2)} €
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <h2 className="mt-10 mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Facturation des commissions
      </h2>
      <Card className="border-dashed">
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Emplacement réservé — dépend de l&apos;intégration du paiement (phase 2).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
