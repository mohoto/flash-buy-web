import { createServiceRoleClient } from "@/lib/supabase/service-role";

export default async function AdminStatsPage() {
  const supabase = createServiceRoleClient();

  const [{ count: livesCount }, { count: validatedCount }, { data: validatedOrders }, { data: topShops }] =
    await Promise.all([
      supabase.from("lives").select("id", { count: "exact", head: true }),
      supabase
        .from("live_orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "validated"),
      supabase
        .from("live_orders")
        .select("total_cents")
        .in("status", ["validated", "paid"]),
      supabase
        .from("live_orders")
        .select("shop_id, total_cents, shops(name)")
        .in("status", ["validated", "paid"]),
    ]);

  const gmvCents = (validatedOrders ?? []).reduce((sum, o) => sum + o.total_cents, 0);

  const { count: totalOrdersCount } = await supabase
    .from("live_orders")
    .select("id", { count: "exact", head: true });

  const conversionRate =
    totalOrdersCount && totalOrdersCount > 0
      ? ((validatedCount ?? 0) / totalOrdersCount) * 100
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

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Statistiques globales
      </h1>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="GMV (validé + payé)" value={`${(gmvCents / 100).toFixed(2)} €`} />
        <StatCard label="Nombre de lives" value={String(livesCount ?? 0)} />
        <StatCard label="Taux de conversion" value={`${conversionRate.toFixed(1)}%`} />
      </div>

      <h2 className="mt-8 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
        Top vendeurs (GMV)
      </h2>
      <ul className="mt-4 flex flex-col gap-2">
        {topSellers.map((seller, i) => (
          <li
            key={i}
            className="flex items-center justify-between rounded-md border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
          >
            <span className="text-zinc-950 dark:text-zinc-50">{seller.name}</span>
            <span className="text-zinc-500">{(seller.total / 100).toFixed(2)} €</span>
          </li>
        ))}
        {topSellers.length === 0 && (
          <li className="text-sm text-zinc-500">Aucune commande validée pour l&apos;instant.</li>
        )}
      </ul>

      <h2 className="mt-8 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
        Facturation des commissions
      </h2>
      <p className="mt-2 text-sm text-zinc-500">
        Emplacement réservé — dépend de l&apos;intégration du paiement (phase 2).
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{value}</p>
    </div>
  );
}
