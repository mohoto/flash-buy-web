import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";
import { RapidConsoleClient } from "./rapid-console-client";
import { LiveBadge } from "./live-badge";
import {
  ConnectionStatusProvider,
  ConnectionStatusBadge,
  EulerFailureAlert,
} from "./live-connection-settings";
import { LiveViewersPanel } from "./live-viewers-panel";
import { endLive } from "../../lives/actions";
import { Button } from "@/components/ui/button";
import { Unplug } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default async function LiveConsolePage({
  params,
}: {
  params: Promise<{ liveId: string }>;
}) {
  const { liveId } = await params;
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data: live } = await supabase
    .from("lives")
    .select(
      "id, status, started_at, sale_keywords, tiktok_username, worker_id, heartbeat_at, euler_status, euler_last_error, euler_ever_connected, viewer_count, rapid_product_seq, rapid_intent_seq"
    )
    .eq("id", liveId)
    .eq("shop_id", shop.id)
    .single();

  if (!live) notFound();

  // Le formulaire de mise en route (pseudo TikTok, étiquette de départ,
  // mots-clés) vit désormais uniquement sur /dashboard/lives/new, qui crée le
  // live déjà en status="live" (cf. createAndStartLive) — un live encore
  // "scheduled" ici ne peut être qu'un résidu d'avant ce changement (jamais
  // réclamé par le worker, aucune donnée générée). Même traitement que
  // l'annulation existante (cf. endLive) : supprimé plutôt que redirigé tel
  // quel, pour ne jamais boucler avec /dashboard/lives/new qui renvoie ici
  // s'il trouve un live scheduled/live existant (cf. findActiveLiveId).
  if (live.status === "scheduled") {
    await supabase.from("lives").delete().eq("id", liveId).eq("shop_id", shop.id);
    redirect("/dashboard/lives/new");
  }

  // Un live "ended" qui n'a jamais atteint euler_status='connected' n'a
  // jamais réellement fonctionné (ex. pseudo TikTok invalide, live pas
  // réellement actif côté TikTok, abandonné par abandonFailedLive cf.
  // /dashboard/lives/new) — contrairement à un vrai live terminé (à
  // conserver pour son récapitulatif de commandes), sa console n'a rien
  // d'utile à montrer. euler_ever_connected (jamais remis à false, cf.
  // worker/src/live-session.ts markEulerConnected) est le seul signal fiable
  // ici : euler_status seul ne suffirait pas, un vrai live qui a fonctionné
  // peut aussi finir sur 'failing' après une coupure tardive.
  if (live.status === "ended" && !live.euler_ever_connected) {
    redirect("/dashboard/lives");
  }

  const { data: rapidProducts } = await supabase
    .from("live_products")
    .select("id, name, price_cents, internal_ref, retired_at, discount_tiers_cents, simple_discount_cents")
    .eq("live_id", liveId)
    .order("created_at", { ascending: true });

  const { data: rapidItems } = await supabase
    .from("live_rapid_items")
    .select(
      "id, buyer_tiktok_username, nickname, profile_picture_url, source_comment, order_number, live_order_id, received_at, created_at"
    )
    .eq("live_id", liveId)
    .order("created_at", { ascending: false });

  const { data: rapidItemProducts } = await supabase
    .from("live_rapid_item_products")
    .select("id, live_rapid_item_id, live_product_id, quantity, discount_cents")
    .eq("shop_id", shop.id);

  // Onglet "Catalogue" : bibliothèque de produits préparés à l'avance
  // (indépendante de ce live, gérée dans /dashboard/produits-prepares) +
  // liste des lives précédents du shop pour reprendre leurs produits.
  const { data: preparedProducts } = await supabase
    .from("prepared_products")
    .select("id, name, price_cents, discount_tiers_cents, simple_discount_cents")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false });

  const { data: previousLives } = await supabase
    .from("lives")
    .select("id, started_at")
    .eq("shop_id", shop.id)
    .eq("status", "ended")
    .neq("id", liveId)
    .order("started_at", { ascending: false })
    .limit(20);

  const { data: orders } = await supabase
    .from("live_orders")
    .select("id, buyer_tiktok_username, status, total_cents")
    .eq("live_id", liveId)
    .in("status", ["pending", "paid"]);

  // Dernier ajout par commande : sert à calculer côté client le "Délai
  // dépassé" (le compte à rebours redémarre à chaque nouveau produit ajouté,
  // pas à la création de la commande).
  const { data: rapidOrderItemDates } = await supabase
    .from("live_order_items")
    .select("live_order_id, created_at")
    .in("live_order_id", (orders ?? []).map((o) => o.id));

  const totalOrdersCount = orders?.length ?? 0;
  const pendingCount = (orders ?? []).filter((o) => o.status === "pending").length;
  const paidCount = (orders ?? []).filter((o) => o.status === "paid").length;
  const revenueCents = (orders ?? [])
    .filter((o) => o.status === "paid")
    .reduce((sum, o) => sum + o.total_cents, 0);

  const eulerStatus = live.euler_status as "connecting" | "connected" | "failing";

  // À ce stade, live.status ne peut plus être "scheduled" (redirigé plus haut)
  // — toujours "live" (ou "ended", cf. bouton "Terminer" côté header).
  return (
    <div className="flex flex-col gap-6 pb-12">
      <ConnectionStatusProvider
        liveId={liveId}
        workerId={live.worker_id}
        heartbeatAt={live.heartbeat_at}
        eulerStatus={eulerStatus}
        eulerLastError={live.euler_last_error}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <LiveBadge liveId={liveId} initialStatus={live.status} />
            <ConnectionStatusBadge />
          </div>
          {live.status === "live" && (
            <form action={endLive.bind(null, liveId)}>
              <Button type="submit" className="rounded-full">
                <Unplug />
                Terminer le live
              </Button>
            </form>
          )}
        </div>

        <EulerFailureAlert />

        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card>
            <CardContent className="py-4">
              <Stat label="Commandes totales" value={String(totalOrdersCount)} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <Stat label="Commandes en attente" value={String(pendingCount)} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <Stat label="Commandes payées" value={String(paidCount)} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <Stat label="Chiffre d'affaire" value={`${(revenueCents / 100).toFixed(2)} €`} />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <RapidConsoleClient
            liveId={liveId}
            initialProducts={rapidProducts ?? []}
            initialItems={rapidItems ?? []}
            initialItemProducts={rapidItemProducts ?? []}
            initialOrders={orders ?? []}
            initialOrderItemDates={rapidOrderItemDates ?? []}
            preparedProducts={preparedProducts ?? []}
            previousLives={previousLives ?? []}
            shopSettings={{
              pendingOrderExpiryMinutes: shop.pending_order_expiry_minutes,
              unpaidOrderRestriction: shop.unpaid_order_restriction,
              unpaidOrderCeilingCents: shop.unpaid_order_ceiling_cents,
            }}
          />

          {/* Masqué pour le moment, ne pas supprimer :
          <Card className="h-160 overflow-hidden">
            <CardContent className="flex h-full min-h-0 flex-col">
              <LiveViewersPanel
                liveId={liveId}
                initialCommenters={commenters ?? []}
                initialViewerCount={live.viewer_count}
                initialWorkerId={live.worker_id}
                initialHeartbeatAt={live.heartbeat_at}
              />
            </CardContent>
          </Card>
          */}
        </div>
      </ConnectionStatusProvider>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="font-heading text-xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}
