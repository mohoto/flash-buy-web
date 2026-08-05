import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";
import { Button } from "@/components/ui/button";
import { startLive } from "./actions";
import { LivesList } from "./lives-list";

export default async function LivesPage() {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data: lives } = await supabase
    .from("lives")
    .select("id, status, started_at, ended_at, created_at")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false });

  const activeLive = (lives ?? []).find(
    (l) => l.status === "live" || l.status === "scheduled"
  );

  return (
    <div>
      <div className="flex items-center justify-end">
        {activeLive ? (
          <Button render={<Link href={`/dashboard/live/${activeLive.id}`} />}>
            {activeLive.status === "live" ? "Rejoindre le live en cours" : "Reprendre le live programmé"}
          </Button>
        ) : (
          <form action={startLive}>
            <Button type="submit">Démarrer un live</Button>
          </form>
        )}
      </div>

      <div className="mt-6">
        <LivesList lives={lives ?? []} />
      </div>
    </div>
  );
}
