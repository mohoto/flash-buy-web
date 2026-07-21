import { createClient } from "@/lib/supabase/server";

export default async function AdminWorkersPage() {
  // worker_health : lecture réservée à l'admin via la policy admin_reads_worker_health
  // (is_flassh_buy_admin()), donc le client public RLS suffit ici.
  const supabase = await createClient();

  const { data: workers } = await supabase
    .from("worker_health")
    .select("*")
    .order("updated_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Santé des workers
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Sert à décider quand ajouter une replica ou changer de plan côté
        Railway. Le scaling se pilote depuis le dashboard Railway, pas ici.
      </p>

      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">Worker</th>
              <th className="px-4 py-3 font-medium">Lives</th>
              <th className="px-4 py-3 font-medium">Lag event-loop (p99)</th>
              <th className="px-4 py-3 font-medium">Échecs WS</th>
              <th className="px-4 py-3 font-medium">Dernière mise à jour</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {(workers ?? []).map((worker) => {
              const staleSince = Date.now() - new Date(worker.updated_at).getTime();
              const isStale = staleSince > 60_000;
              return (
                <tr key={worker.worker_id}>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-950 dark:text-zinc-50">
                    {worker.worker_id}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {worker.lives_count}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {worker.event_loop_p99_ms?.toFixed(1) ?? "—"} ms
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        worker.ws_open_failures > 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-zinc-600 dark:text-zinc-400"
                      }
                    >
                      {worker.ws_open_failures}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        isStale
                          ? "rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300"
                          : "rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      }
                    >
                      {new Date(worker.updated_at).toLocaleTimeString("fr-FR")}
                    </span>
                  </td>
                </tr>
              );
            })}
            {(workers ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  Aucun worker n&apos;a encore reporté d&apos;état.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
