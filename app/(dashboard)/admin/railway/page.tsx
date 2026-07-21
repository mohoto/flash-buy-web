import { createClient } from "@/lib/supabase/server";

const STATUS_COLOR: Record<string, string> = {
  DEPLOY_FAILED: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  DEPLOY_SUCCESS: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  VOLUME_ALERT: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
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
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Alertes Railway
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Déploiements et alertes du worker, reçus via le webhook Railway.
      </p>

      <ul className="mt-6 flex flex-col gap-2">
        {(events ?? []).map((event) => (
          <li
            key={event.id}
            className="flex items-center justify-between rounded-md border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
          >
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  STATUS_COLOR[event.event_type] ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {event.event_type}
              </span>
              <span className="text-zinc-600 dark:text-zinc-400">
                {event.service_name ?? "—"} · {event.environment ?? "—"}
              </span>
            </div>
            <span className="text-xs text-zinc-500">
              {new Date(event.received_at).toLocaleString("fr-FR")}
            </span>
          </li>
        ))}
        {(events ?? []).length === 0 && (
          <li className="text-sm text-zinc-500">Aucune alerte reçue pour l&apos;instant.</li>
        )}
      </ul>
    </div>
  );
}
