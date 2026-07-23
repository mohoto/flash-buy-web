import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";
import { LiveConsoleClient } from "./live-console-client";
import { LiveBadge } from "./live-badge";
import { TiktokPanel } from "./tiktok-panel";
import { LiveConnectionSettings } from "./live-connection-settings";
import { LiveViewersPanel } from "./live-viewers-panel";
import { endLive } from "../../lives/actions";
import { Button } from "@/components/ui/button";

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
    .select("id, status, started_at, sale_keywords, worker_id, heartbeat_at, viewer_count")
    .eq("id", liveId)
    .eq("shop_id", shop.id)
    .single();

  if (!live) notFound();

  const { data: products } = await supabase
    .from("products")
    .select("id, name, product_variants(id, label)")
    .eq("shop_id", shop.id)
    .eq("status", "active");

  const { data: orders } = await supabase
    .from("live_orders")
    .select("id, buyer_tiktok_username, status, total_cents")
    .eq("live_id", liveId)
    .in("status", ["pending", "validated"]);

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

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">Console Live</h1>
          {live.status === "live" && <LiveBadge />}
        </div>
        {live.status === "live" && (
          <form action={endLive.bind(null, liveId)}>
            <Button type="submit" variant="destructive-outline">
              Terminer le live
            </Button>
          </form>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <LiveConsoleClient
          liveId={liveId}
          initialOrders={initialOrders}
          products={productOptions}
          saleKeywords={live.sale_keywords}
        />
        <div className="flex flex-col gap-6">
          <TiktokPanel tiktokUsername={shop.tiktok_username} />
          <LiveConnectionSettings
            liveId={liveId}
            tiktokUsername={shop.tiktok_username}
            saleKeywords={live.sale_keywords}
            workerId={live.worker_id}
            heartbeatAt={live.heartbeat_at}
          />
          <LiveViewersPanel
            liveId={liveId}
            initialCommenters={commenters ?? []}
            initialViewerCount={live.viewer_count}
          />
        </div>
      </div>
    </div>
  );
}
