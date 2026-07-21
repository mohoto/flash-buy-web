import http from "node:http";
import { supabase } from "./supabase.js";
import { loadCatalog } from "./catalog.js";
import { parseSaleComment } from "./parsing.js";

// Injecteur de commentaires factices : permet de tester tout le pipeline
// parsing/matching/écriture sans live TikTok réel ni crédit Euler.
// POST /simulate/comment { liveId, username, text }
export function startSimulationServer(port: number) {
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/simulate/comment") {
      res.writeHead(404);
      res.end();
      return;
    }

    let body = "";
    for await (const chunk of req) body += chunk;

    let payload: { liveId?: string; username?: string; text?: string };
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_json" }));
      return;
    }

    const { liveId, username, text } = payload;
    if (!liveId || !username || !text) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "missing_fields", required: ["liveId", "username", "text"] }));
      return;
    }

    const { data: live } = await supabase
      .from("lives")
      .select("id, shop_id")
      .eq("id", liveId)
      .single();

    if (!live) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "live_not_found" }));
      return;
    }

    const catalog = await loadCatalog(live.shop_id);
    const parsed = parseSaleComment(text, catalog);

    if (!parsed.isSale) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ isSale: false }));
      return;
    }

    let { data: order } = await supabase
      .from("live_orders")
      .select("id")
      .eq("live_id", liveId)
      .eq("buyer_tiktok_username", username)
      .in("status", ["pending", "validated"])
      .maybeSingle();

    if (!order) {
      const { data: created } = await supabase
        .from("live_orders")
        .insert({ live_id: liveId, shop_id: live.shop_id, buyer_tiktok_username: username })
        .select("id")
        .single();
      order = created;
    }

    if (!order) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "order_creation_failed" }));
      return;
    }

    const { error } = await supabase.from("live_order_items").insert({
      live_order_id: order.id,
      product_id: parsed.product?.id ?? null,
      variant_id: parsed.variant?.id ?? null,
      size_label: parsed.variant?.label ?? null,
      quantity: parsed.quantity,
      unit_price_cents: parsed.product?.priceCents ?? 0,
      tiktok_comment_id: `sim-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      source_comment: text,
      raw_product_text: parsed.rawProductText ?? null,
      raw_size_text: parsed.rawSizeText ?? null,
      matched: parsed.matched,
      match_score: parsed.matchScore ?? null,
    });

    const { data: items } = await supabase
      .from("live_order_items")
      .select("quantity, unit_price_cents")
      .eq("live_order_id", order.id);
    const total = (items ?? []).reduce((sum, i) => sum + i.quantity * i.unit_price_cents, 0);
    await supabase.from("live_orders").update({ total_cents: total }).eq("id", order.id);

    res.writeHead(error ? 500 : 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ isSale: true, matched: parsed.matched, orderId: order.id, error: error?.message }));
  });

  server.listen(port, () => {
    console.log(JSON.stringify({ level: "info", msg: `simulation server listening on :${port}` }));
  });

  return server;
}
