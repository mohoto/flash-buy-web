import { supabase } from "./supabase.js";
import { getCatalog } from "./catalog.js";
import { parseSaleComment } from "./parsing.js";
import { connectToLive, type EulerConnection, type LiveComment } from "./euler.js";

export type LiveSession = {
  liveId: string;
  shopId: string;
  connection: EulerConnection;
  wsOpenFailures: number;
};

// Debounce en mémoire pour éviter de saturer Supabase en écriture sous fort
// trafic (spectateur qui spam les commentaires, viewerCount envoyé plusieurs
// fois par seconde par TikTok) — la fraîcheur perçue sur le dashboard reste
// quasi temps réel, seul le volume d'écritures DB est réduit.
const DB_WRITE_DEBOUNCE_MS = 5_000;
const lastCommenterWriteAt = new Map<string, number>(); // clé: `${liveId}:${userId}`
const lastViewerCountWriteAt = new Map<string, number>(); // clé: liveId

function clearDebounceState(liveId: string) {
  lastViewerCountWriteAt.delete(liveId);
  for (const key of lastCommenterWriteAt.keys()) {
    if (key.startsWith(`${liveId}:`)) lastCommenterWriteAt.delete(key);
  }
}

export async function startLiveSession(
  liveId: string,
  shopId: string,
  onEnded: (liveId: string) => void,
  onWsOpenFailure: (liveId: string, err: Error) => void
): Promise<LiveSession> {
  const { data: shop } = await supabase
    .from("shops")
    .select("tiktok_username")
    .eq("id", shopId)
    .single();

  const tiktokUsername = shop?.tiktok_username;
  if (!tiktokUsername) {
    throw new Error(`Shop ${shopId} has no tiktok_username configured`);
  }

  // Mots-clés figés au démarrage de la session : un changement fait depuis la
  // console live pendant que le live tourne ne s'appliquera qu'à la prochaine
  // connexion (pas de relecture par commentaire).
  const { data: liveRow } = await supabase
    .from("lives")
    .select("sale_keywords")
    .eq("id", liveId)
    .single();
  const saleKeywords = liveRow?.sale_keywords;

  const session: LiveSession = {
    liveId,
    shopId,
    wsOpenFailures: 0,
    connection: null as unknown as EulerConnection,
  };

  session.connection = connectToLive(tiktokUsername, {
    onComment: (comment) => handleComment(liveId, shopId, comment, saleKeywords),
    onViewerCount: (viewerCount) => handleViewerCount(liveId, viewerCount),
    onDisconnect: async () => {
      await supabase
        .from("lives")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", liveId);
      await supabase.from("live_viewers").delete().eq("live_id", liveId);
      clearDebounceState(liveId);
      onEnded(liveId);
    },
    onError: (err) => {
      session.wsOpenFailures += 1;
      onWsOpenFailure(liveId, err);
    },
  });

  return session;
}

async function handleViewerCount(liveId: string, viewerCount: number) {
  const now = Date.now();
  const lastWrite = lastViewerCountWriteAt.get(liveId) ?? 0;
  if (now - lastWrite < DB_WRITE_DEBOUNCE_MS) return;
  lastViewerCountWriteAt.set(liveId, now);

  await supabase.from("lives").update({ viewer_count: viewerCount }).eq("id", liveId);
}

// Un commentateur actif = quelqu'un ayant posté au moins un commentaire
// (TikTok n'expose aucune liste des spectateurs présents, seulement un
// compteur agrégé — cf. handleViewerCount). Mis à jour pour tout
// commentaire, reconnu comme vente ou non. Debounce par utilisateur : un
// spectateur qui enchaîne les commentaires ne déclenche qu'un upsert toutes
// les DB_WRITE_DEBOUNCE_MS, pas un par message.
async function trackActiveCommenter(liveId: string, comment: LiveComment) {
  const key = `${liveId}:${comment.userId}`;
  const now = Date.now();
  const lastWrite = lastCommenterWriteAt.get(key) ?? 0;
  if (now - lastWrite < DB_WRITE_DEBOUNCE_MS) return;
  lastCommenterWriteAt.set(key, now);

  await supabase.from("live_viewers").upsert(
    {
      live_id: liveId,
      tiktok_user_id: comment.userId,
      tiktok_username: comment.username,
      nickname: comment.nickname,
      profile_picture_url: comment.profilePictureUrl,
      last_comment_at: new Date().toISOString(),
    },
    { onConflict: "live_id,tiktok_user_id" }
  );
}

async function handleComment(
  liveId: string,
  shopId: string,
  comment: LiveComment,
  saleKeywords?: string[]
) {
  await trackActiveCommenter(liveId, comment);

  const catalog = getCatalog(shopId);
  const parsed = parseSaleComment(comment.text, catalog, saleKeywords);
  console.log(JSON.stringify({
    level: "info",
    msg: "comment parsed",
    liveId,
    saleKeywords,
    rawText: comment.text,
    isSale: parsed.isSale,
    matched: parsed.matched,
  }));
  if (!parsed.isSale) return;

  const buyerTiktokUsername = comment.username;

  // Un panier "ouvert" par acheteur et par live (contrainte unique côté DB
  // pending/validated agit comme filet en cas de course).
  let { data: order } = await supabase
    .from("live_orders")
    .select("id")
    .eq("live_id", liveId)
    .eq("buyer_tiktok_username", buyerTiktokUsername)
    .in("status", ["pending", "validated"])
    .maybeSingle();

  if (!order) {
    const { data: created } = await supabase
      .from("live_orders")
      .insert({ live_id: liveId, shop_id: shopId, buyer_tiktok_username: buyerTiktokUsername })
      .select("id")
      .single();
    order = created;
  }
  if (!order) return;

  const unitPriceCents = parsed.product?.priceCents ?? 0;

  // Idempotence : l'index unique (live_order_id, tiktok_comment_id) empêche
  // le doublon si le WebSocket redélivre le même commentaire après reconnexion.
  const { error } = await supabase.from("live_order_items").insert({
    live_order_id: order.id,
    product_id: parsed.product?.id ?? null,
    variant_id: parsed.variant?.id ?? null,
    size_label: parsed.variant?.label ?? null,
    quantity: parsed.quantity,
    unit_price_cents: unitPriceCents,
    tiktok_comment_id: comment.commentId,
    source_comment: comment.text,
    raw_product_text: parsed.rawProductText ?? null,
    raw_size_text: parsed.rawSizeText ?? null,
    matched: parsed.matched,
    match_score: parsed.matchScore ?? null,
  });

  if (error && error.code !== "23505") {
    // 23505 = doublon idempotent, attendu en cas de redelivery ; toute autre
    // erreur mérite d'être visible dans les logs du worker.
    console.error(JSON.stringify({ level: "error", liveId, error: error.message }));
    return;
  }

  await recomputeOrderTotal(order.id);
}

async function recomputeOrderTotal(orderId: string) {
  const { data: items } = await supabase
    .from("live_order_items")
    .select("quantity, unit_price_cents")
    .eq("live_order_id", orderId);

  const total = (items ?? []).reduce(
    (sum, item) => sum + item.quantity * item.unit_price_cents,
    0
  );

  await supabase.from("live_orders").update({ total_cents: total }).eq("id", orderId);
}
