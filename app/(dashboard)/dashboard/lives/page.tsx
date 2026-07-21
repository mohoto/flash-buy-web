import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";
import { startLive } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Programmé",
  live: "En direct",
  ended: "Terminé",
};

export default async function LivesPage() {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data: lives } = await supabase
    .from("lives")
    .select("id, status, started_at, ended_at, created_at")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false });

  const activeLive = (lives ?? []).find((l) => l.status === "live");

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          Lives
        </h1>
        {activeLive ? (
          <Link
            href={`/dashboard/live/${activeLive.id}`}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Rejoindre le live en cours
          </Link>
        ) : (
          <form action={startLive}>
            <button
              type="submit"
              className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950"
            >
              Démarrer un live
            </button>
          </form>
        )}
      </div>

      <ul className="mt-6 flex flex-col gap-2">
        {(lives ?? []).map((live) => (
          <li key={live.id}>
            <Link
              href={`/dashboard/live/${live.id}`}
              className="flex items-center justify-between rounded-md border border-zinc-200 px-4 py-3 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              <span className="text-zinc-950 dark:text-zinc-50">
                {new Date(live.created_at).toLocaleString("fr-FR")}
              </span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {STATUS_LABEL[live.status] ?? live.status}
              </span>
            </Link>
          </li>
        ))}
        {(lives ?? []).length === 0 && (
          <li className="text-sm text-zinc-500">Aucun live pour l&apos;instant.</li>
        )}
      </ul>
    </div>
  );
}
