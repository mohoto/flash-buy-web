import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { startLive } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Programmé",
  live: "En direct",
  ended: "Terminé",
};

const STATUS_VARIANT: Record<string, "success" | "secondary" | "outline"> = {
  live: "success",
  scheduled: "outline",
  ended: "secondary",
};

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Lives</h1>
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

      <div className="mt-6 flex flex-col gap-2">
        {(lives ?? []).map((live) => (
          <Card key={live.id} render={<Link href={`/dashboard/live/${live.id}`} />} className="hover:border-primary/50">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-foreground">
                {new Date(live.created_at).toLocaleString("fr-FR")}
              </span>
              <Badge variant={STATUS_VARIANT[live.status] ?? "outline"}>
                {STATUS_LABEL[live.status] ?? live.status}
              </Badge>
            </div>
          </Card>
        ))}
        {(lives ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun live pour l&apos;instant.</p>
        )}
      </div>
    </div>
  );
}
