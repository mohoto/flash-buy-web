import { supabase } from "./supabase.js";
import { getCatalog } from "./catalog.js";
import { parseSaleComment } from "./parsing.js";
import { connectToLive, type EulerConnection, type LiveComment } from "./euler.js";
import { parseRapidComment, type ActiveRapidProduct } from "./rapid-parsing.js";
import {
  getActiveProduct,
  bufferOrphanComment,
  onOrphanResolved,
  type OrphanRapidComment,
} from "./rapid-active-product.js";

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

// Flux éphémère de TOUS les commentaires (pas seulement ceux avec le mot-clé
// de vente) : diffusé en Realtime broadcast, jamais écrit en base — sinon un
// live très commenté saturerait la DB en écritures. Un onglet non ouvert au
// moment d'un commentaire le manque simplement, par design.
const commentChannels = new Map<string, ReturnType<typeof supabase.channel>>();

function getCommentChannel(liveId: string) {
  let channel = commentChannels.get(liveId);
  if (!channel) {
    channel = supabase.channel(`live-comments-${liveId}`);
    channel.subscribe();
    commentChannels.set(liveId, channel);
  }
  return channel;
}

function broadcastComment(liveId: string, comment: LiveComment) {
  getCommentChannel(liveId).send({
    type: "broadcast",
    event: "comment",
    payload: {
      username: comment.username,
      nickname: comment.nickname,
      profilePictureUrl: comment.profilePictureUrl,
      text: comment.text,
      createdAt: new Date().toISOString(),
    },
  });
}

function closeCommentChannel(liveId: string) {
  const channel = commentChannels.get(liveId);
  if (!channel) return;
  supabase.removeChannel(channel);
  commentChannels.delete(liveId);
}

export async function startLiveSession(
  liveId: string,
  shopId: string,
  mode: string,
  onEnded: (liveId: string) => void,
  onWsOpenFailure: (liveId: string, err: Error) => void
): Promise<LiveSession> {
  // Pseudo TikTok et mots-clés figés au démarrage de la session : un
  // changement fait depuis la console live pendant que le live tourne ne
  // s'appliquera qu'à la prochaine connexion (pas de relecture par commentaire).
  const { data: liveRow } = await supabase
    .from("lives")
    .select("tiktok_username, sale_keywords")
    .eq("id", liveId)
    .single();

  const tiktokUsername = liveRow?.tiktok_username;
  if (!tiktokUsername) {
    throw new Error(`Live ${liveId} has no tiktok_username configured`);
  }
  const saleKeywords = liveRow?.sale_keywords;

  const session: LiveSession = {
    liveId,
    shopId,
    wsOpenFailures: 0,
    connection: null as unknown as EulerConnection,
  };

  session.connection = connectToLive(tiktokUsername, {
    onComment: (comment) => handleComment(liveId, shopId, mode, comment, saleKeywords),
    onViewerCount: (viewerCount) => handleViewerCount(liveId, viewerCount),
    onDisconnect: async (reason) => {
      console.log(JSON.stringify({ level: "info", msg: "live session disconnect", liveId, tiktokUsername, reason }));
      await supabase
        .from("lives")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", liveId);
      await supabase.from("live_viewers").delete().eq("live_id", liveId);
      clearDebounceState(liveId);
      closeCommentChannel(liveId);
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
  mode: string,
  comment: LiveComment,
  saleKeywords?: string[]
) {
  broadcastComment(liveId, comment);
  await trackActiveCommenter(liveId, comment);

  if (mode === "rapid") {
    await handleRapidComment(liveId, comment, saleKeywords);
    return;
  }

  // Mode "freeform" : jamais d'écriture automatique en live_order_items (pour
  // éviter les faux positifs comme "1× les deux" ajoutés au panier sans
  // intention). Seuls les commentaires contenant le mot-clé sont persistés
  // dans live_freeform_comments, en attente d'un ajout manuel au panier par
  // le vendeur (bouton "Ajouter au panier" dans "Commentaires reconnus").
  if (mode !== "catalog") {
    const parsed = parseSaleComment(comment.text, [], saleKeywords);
    if (!parsed.isSale) return;

    const { error } = await supabase.from("live_freeform_comments").insert({
      live_id: liveId,
      buyer_tiktok_username: comment.username,
      nickname: comment.nickname,
      profile_picture_url: comment.profilePictureUrl,
      text: comment.text,
      tiktok_comment_id: comment.commentId,
    });

    if (error && error.code !== "23505") {
      // 23505 = doublon idempotent (redelivery WebSocket), attendu.
      console.error(JSON.stringify({ level: "error", liveId, error: error.message }));
    }
    return;
  }

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

// Mode "rapid" : un "jp" est attribué au produit "à l'antenne" du live
// (lives.active_product_id), jamais recherché par nom dans un catalogue (cf.
// worker/src/rapid-parsing.ts). Si le produit actif n'est pas encore connu
// de ce worker (course avec la création côté dashboard), le commentaire est
// mis en tampon plutôt que perdu (cf. worker/src/rapid-active-product.ts).
export async function handleRapidComment(liveId: string, comment: LiveComment, saleKeywords?: string[]) {
  const jpKeywords = saleKeywords && saleKeywords.length > 0 ? saleKeywords : ["jp"];

  const activeProduct = getActiveProduct(liveId);

  // parseRapidComment renvoie null uniquement si le mot-clé "jp" est absent
  // du commentaire (indépendamment du produit actif) — appelé avec
  // activeProduct=null ici s'il n'est pas encore connu, ce qui produit un
  // résultat "needs_correction/no_active_product" que l'on ignore : seul le
  // signal "est-ce bien un jp ?" nous intéresse à ce stade, pour décider de
  // bufferiser ou non.
  const probe = parseRapidComment(comment.text, activeProduct, jpKeywords);
  if (probe === null) return;

  if (!activeProduct) {
    bufferOrphanComment({ liveId, shopId: "", comment, receivedAt: Date.now() });
    return;
  }

  await resolveAndPersistRapidComment(liveId, comment, activeProduct, jpKeywords, Date.now());
}

async function resolveAndPersistRapidComment(
  liveId: string,
  comment: LiveComment,
  activeProduct: ActiveRapidProduct,
  jpKeywords: string[],
  receivedAtMs: number
) {
  const parsed = parseRapidComment(comment.text, activeProduct, jpKeywords);
  if (!parsed) return;

  const { data: shopRow } = await supabase
    .from("live_products")
    .select("shop_id")
    .eq("id", activeProduct.id)
    .single();
  const shopId = shopRow?.shop_id;
  if (!shopId) return;

  const resolutionState = parsed.state === "auto" ? "auto" : "needs_correction";

  const { data: rapidItem, error } = await supabase
    .from("live_rapid_items")
    .insert({
      live_id: liveId,
      shop_id: shopId,
      live_product_id: parsed.state === "auto" ? activeProduct.id : null,
      buyer_tiktok_username: comment.username,
      nickname: comment.nickname,
      profile_picture_url: comment.profilePictureUrl,
      source_comment: comment.text,
      tiktok_comment_id: comment.commentId,
      quantity: parsed.quantity,
      raw_color_text: parsed.colorToken,
      raw_size_text: parsed.sizeToken,
      resolution_state: resolutionState,
      resolution_reason: parsed.reason ?? null,
      received_at: new Date(receivedAtMs).toISOString(),
      resolved_at: parsed.state === "auto" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code !== "23505") {
      // 23505 = doublon idempotent (redelivery WebSocket), attendu.
      console.error(JSON.stringify({ level: "error", liveId, error: error.message }));
    }
    return;
  }

  if (parsed.state !== "auto" || !rapidItem) return;

  await attachRapidItemToCart(liveId, shopId, comment, activeProduct, parsed.quantity, rapidItem.id);
}

// Attache un "jp" résolu (auto ou corrigé manuellement) au panier acheteur,
// via le même schéma live_orders/live_order_items que les deux autres modes
// (le flux acheteur /live/[cartSlug] et le checkout Phase 2 n'ont donc rien
// à connaître du mode rapid).
async function attachRapidItemToCart(
  liveId: string,
  shopId: string,
  comment: LiveComment,
  activeProduct: ActiveRapidProduct,
  quantity: number,
  rapidItemId: string
) {
  const buyerTiktokUsername = comment.username;

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

  const { data: orderItem, error } = await supabase
    .from("live_order_items")
    .insert({
      live_order_id: order.id,
      product_id: null,
      quantity,
      unit_price_cents: activeProduct.priceCents,
      matched: true,
      raw_product_text: `${activeProduct.name} (${activeProduct.internalRef})`,
      source_comment: comment.text,
    })
    .select("id")
    .single();

  if (error) {
    console.error(JSON.stringify({ level: "error", liveId, error: error.message }));
    return;
  }

  await supabase
    .from("live_rapid_items")
    .update({ live_order_id: order.id, live_order_item_id: orderItem?.id ?? null })
    .eq("id", rapidItemId);

  await recomputeOrderTotal(order.id);
}

// Rejoué quand un orphelin du tampon anti-race-condition se rattache à un
// produit désormais connu (cf. worker/src/rapid-active-product.ts) : on
// reprend le parsing complet maintenant que les dimensions du produit sont
// disponibles, avec l'horodatage ORIGINAL du commentaire (pas celui du flush).
onOrphanResolved(async (orphan, product) => {
  await resolveAndPersistRapidComment(
    orphan.liveId,
    orphan.comment,
    product,
    ["jp"],
    orphan.receivedAt
  );
});

// Orphelins expirés (produit jamais trouvé dans le délai imparti) : insérés
// directement en "à corriger", horodatage d'origine conservé pour l'affichage
// "produit non trouvé, reçu à HH:MM:SS" côté vendeur. Aucun "jp" n'est perdu.
export async function persistExpiredRapidOrphan(orphan: OrphanRapidComment) {
  const { data: live } = await supabase
    .from("lives")
    .select("shop_id")
    .eq("id", orphan.liveId)
    .single();
  if (!live) return;

  const { error } = await supabase.from("live_rapid_items").insert({
    live_id: orphan.liveId,
    shop_id: live.shop_id,
    live_product_id: null,
    buyer_tiktok_username: orphan.comment.username,
    nickname: orphan.comment.nickname,
    profile_picture_url: orphan.comment.profilePictureUrl,
    source_comment: orphan.comment.text,
    tiktok_comment_id: orphan.comment.commentId,
    quantity: 1,
    resolution_state: "needs_correction",
    resolution_reason: "produit_non_trouve",
    received_at: new Date(orphan.receivedAt).toISOString(),
  });

  if (error && error.code !== "23505") {
    console.error(JSON.stringify({ level: "error", liveId: orphan.liveId, error: error.message }));
  }
}
