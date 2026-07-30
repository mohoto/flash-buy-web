import http from "node:http";
import { randomUUID } from "node:crypto";
import { supabase } from "./supabase.js";
import { parseSaleComment } from "./parsing.js";
import { trackRapidLive, enqueueRapidComment } from "./rapid-batch-queue.js";

// Lives déjà suivis par ce serveur de simulation, pour ne pas rappeler
// trackRapidLive à chaque requête — même souci qu'un vrai worker : la file
// en mémoire ne doit être enregistrée qu'une fois par live.
const simulatedRapidLives = new Set<string>();

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
      .select("id, shop_id, sale_keywords")
      .eq("id", liveId)
      .single();

    if (!live) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "live_not_found" }));
      return;
    }

    if (!simulatedRapidLives.has(liveId)) {
      simulatedRapidLives.add(liveId);
      trackRapidLive(liveId, live.shop_id);
    }

    const hasKeyword = parseSaleComment(text, [], live.sale_keywords ?? undefined).isSale;
    enqueueRapidComment(
      liveId,
      live.shop_id,
      {
        commentId: `sim-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        userId: randomUUID(),
        username,
        nickname: username,
        profilePictureUrl: null,
        text,
      },
      hasKeyword
    );

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ mode: "rapid", accepted: true }));
  });

  server.listen(port, () => {
    console.log(JSON.stringify({ level: "info", msg: `simulation server listening on :${port}` }));
  });

  return server;
}
