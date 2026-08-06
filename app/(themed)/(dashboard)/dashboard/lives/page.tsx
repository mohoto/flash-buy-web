import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";
import { Button } from "@/components/ui/button";
import { LivesList } from "./lives-list";

export default async function LivesPage() {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data: lives } = await supabase
    .from("lives")
    .select("id, status, euler_status, started_at, ended_at, created_at")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false });

  // "live" ne suffit pas seul : un live encore en train de tenter sa toute
  // première connexion (euler_status='connecting'/'failing', jamais
  // confirmée) n'est pas un live "en cours" à rejoindre — même critère que
  // findActiveLiveId (cf. lives/actions.ts), pour ne jamais proposer de
  // "Rejoindre" un live qui n'a en réalité jamais fonctionné.
  const activeLive = (lives ?? []).find(
    (l) => l.status === "scheduled" || (l.status === "live" && l.euler_status === "connected")
  );

  return (
    <div>
      <div className="flex items-center justify-end">
        {activeLive ? (
          <Button render={<Link href={`/dashboard/live/${activeLive.id}`} />}>
            {activeLive.status === "live" ? "Rejoindre le live en cours" : "Reprendre le live programmé"}
          </Button>
        ) : (
          <Button render={<Link href="/dashboard/lives/new" />}>Démarrer un live</Button>
        )}
      </div>

      <div className="mt-6">
        <LivesList lives={lives ?? []} />
      </div>
    </div>
  );
}
