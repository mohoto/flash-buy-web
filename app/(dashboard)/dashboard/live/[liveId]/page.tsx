import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";
import { LiveConsoleClient } from "./live-console-client";
import { RapidConsoleClient } from "./rapid-console-client";
import { LiveBadge } from "./live-badge";
import { ConnectionStatusBadge, LiveConnectionForm } from "./live-connection-settings";
import { LiveViewersPanel } from "./live-viewers-panel";
import { endLive } from "../../lives/actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

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
      "id, status, started_at, sale_keywords, tiktok_username, mode, worker_id, heartbeat_at, viewer_count, active_product_id, rapid_product_seq"
    )
    .eq("id", liveId)
    .eq("shop_id", shop.id)
    .single();

  if (!live) notFound();

  const { data: rapidProducts } =
    live.mode === "rapid"
      ? await supabase
          .from("live_products")
          .select("id, name, price_cents, internal_ref, retired_at")
          .eq("live_id", liveId)
          .order("created_at", { ascending: true })
      : { data: null };

  const { data: rapidItems } =
    live.mode === "rapid"
      ? await supabase
          .from("live_rapid_items")
          .select(
            "id, live_product_id, buyer_tiktok_username, nickname, profile_picture_url, source_comment, quantity, order_number, received_at, created_at"
          )
          .eq("live_id", liveId)
          .order("created_at", { ascending: false })
      : { data: null };

  const { data: products } = await supabase
    .from("products")
    .select("id, name, product_variants(id, label)")
    .eq("shop_id", shop.id)
    .eq("status", "active");

  const { data: orders } = await supabase
    .from("live_orders")
    .select("id, buyer_tiktok_username, status, total_cents")
    .eq("live_id", liveId)
    .in("status", ["pending", "validated", "paid"]);

  const { data: shippingInfo } = await supabase
    .from("live_buyer_shipping_info")
    .select("buyer_tiktok_username, first_name, last_name, email, phone, address, postal_code, city, country")
    .eq("shop_id", shop.id)
    .in("buyer_tiktok_username", (orders ?? []).map((o) => o.buyer_tiktok_username));

  const { data: items } = await supabase
    .from("live_order_items")
    .select(
      "id, live_order_id, product_id, variant_id, size_label, quantity, unit_price_cents, raw_product_text, raw_size_text, source_comment, matched, match_score, created_at"
    )
    .in("live_order_id", (orders ?? []).map((o) => o.id));

  const initialOrders = (orders ?? []).map((order) => ({
    ...order,
    items: (items ?? [])
      .filter((item) => item.live_order_id === order.id)
      .map(({ live_order_id: _live_order_id, ...item }) => item),
  }));

  const productOptions = (products ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    variants: p.product_variants ?? [],
  }));

  const { data: commenters } = await supabase
    .from("live_viewers")
    .select("id, tiktok_user_id, tiktok_username, nickname, profile_picture_url")
    .eq("live_id", liveId)
    .order("last_comment_at", { ascending: false });

  const { data: freeformComments } = await supabase
    .from("live_freeform_comments")
    .select("id, buyer_tiktok_username, nickname, profile_picture_url, text, added_to_cart_at, created_at")
    .eq("live_id", liveId)
    .order("created_at", { ascending: false });

  const pendingCount = initialOrders.filter((o) => o.status === "pending").length;
  const validatedTotalCents = initialOrders
    .filter((o) => o.status === "validated")
    .reduce((sum, o) => sum + o.total_cents, 0);

  const isScheduled = live.status === "scheduled";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold text-foreground">
            Console Live
          </h1>
          {live.status === "live" && <LiveBadge />}
          {!isScheduled && (
            <ConnectionStatusBadge
              liveId={liveId}
              workerId={live.worker_id}
              heartbeatAt={live.heartbeat_at}
            />
          )}
        </div>
        {(live.status === "live" || isScheduled) && (
          <form action={endLive.bind(null, liveId)}>
            <Button type="submit" variant={live.status === "live" ? "success" : "default"}>
              {live.status === "live" ? "Terminer le live" : "Annuler"}
            </Button>
          </form>
        )}
      </div>

      {isScheduled ? (
        <Card className="mx-auto w-full max-w-lg">
          <CardHeader>
            <CardTitle>Connexion TikTok LIVE</CardTitle>
          </CardHeader>
          <CardContent>
            <LiveConnectionForm
              liveId={liveId}
              tiktokUsername={live.tiktok_username}
              saleKeywords={live.sale_keywords}
              mode={live.mode}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
              <Stat label="Commandes en attente" value={String(pendingCount)} />
              <Separator orientation="vertical" className="hidden h-8 sm:block" />
              <Stat label="Total validé" value={`${(validatedTotalCents / 100).toFixed(2)} €`} />
              {/* Masqué pour le moment, ne pas supprimer :
              <Separator orientation="vertical" className="hidden h-8 sm:block" />
              <Stat
                label="Spectateurs"
                value={live.viewer_count !== null ? String(live.viewer_count) : "—"}
              />
              */}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6">
            {live.mode === "rapid" ? (
              <RapidConsoleClient
                liveId={liveId}
                initialProducts={rapidProducts ?? []}
                initialItems={rapidItems ?? []}
              />
            ) : (
              <LiveConsoleClient
                liveId={liveId}
                mode={live.mode}
                liveStartedAt={live.started_at}
                initialOrders={initialOrders}
                products={productOptions}
                saleKeywords={live.sale_keywords}
                commenters={commenters ?? []}
                shippingInfo={shippingInfo ?? []}
                initialFreeformComments={freeformComments ?? []}
              />
            )}

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
        </>
      )}
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
