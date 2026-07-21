import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";
import { LiveConsoleClient } from "./live-console-client";
import { endLive } from "../../lives/actions";

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
    .select("id, status, started_at")
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
      "id, live_order_id, product_id, variant_id, size_label, quantity, unit_price_cents, raw_product_text, raw_size_text, matched, match_score"
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

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          Console Live
        </h1>
        {live.status === "live" && (
          <form action={endLive.bind(null, liveId)}>
            <button
              type="submit"
              className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
            >
              Terminer le live
            </button>
          </form>
        )}
      </div>

      <LiveConsoleClient
        liveId={liveId}
        initialOrders={initialOrders}
        products={productOptions}
      />
    </div>
  );
}
