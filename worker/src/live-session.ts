import { supabase } from "./supabase.js";
import { getCatalog } from "./catalog.js";
import { parseSaleComment } from "./parsing.js";
import { connectToLive, NOT_LIVE_CLOSE_CODE, type EulerConnection, type LiveComment } from "./euler.js";
import { enqueueRapidComment } from "./rapid-batch-queue.js";

export type LiveSession = {
  liveId: string;
  shopId: string;
  connection: EulerConnection;
  wsOpenFailures: number;
};

// Backoff exponentiel plafonné entre deux tentatives de reconnexion Euler
// après une coupure non définitive (réseau, erreur serveur, timeout...) —
// retry indéfiniment tant que le live n'est pas marqué `ended` en base,
// jamais de nombre de tentatives limité (une panne réseau prolongée ne doit
// jamais clore un live à tort).
const RECONNECT_BASE_DELAY_MS = 2_000;
const RECONNECT_MAX_DELAY_MS = 30_000;

function reconnectDelayMs(attempt: number): number {
  return Math.min(RECONNECT_BASE_DELAY_MS * 2 ** attempt, RECONNECT_MAX_DELAY_MS);
}

// Un NOT_LIVE reçu dans les tout premiers instants d'une session peut être
// une latence de propagation côté TikTok (le live vient d'être démarré par
// le vendeur, l'API interne qu'Euler interroge n'a pas encore rattrapé) plus
// qu'une vraie fin de live — observé en pratique : un live clos par NOT_LIVE
// moins de 3s après son claim, alors que le vendeur affirmait le live
// toujours actif côté app TikTok. Un nombre de tentatives limité (contraste
// avec le retry indéfini de onDisconnected) : passé ce délai, NOT_LIVE
// redevient un signal fiable de vraie fin.
const EARLY_NOT_LIVE_GRACE_MS = 15_000;
const EARLY_NOT_LIVE_MAX_RETRIES = 3;
const EARLY_NOT_LIVE_RETRY_DELAY_MS = 3_000;

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

// Le live a-t-il été refermé par un autre chemin pendant qu'on retentait la
// connexion (ex. le vendeur clique "Terminer le live" manuellement) ? Vérifié
// avant chaque tentative de reconnexion pour ne jamais reconnecter un live
// que le vendeur a explicitement arrêté.
async function isLiveStillActive(liveId: string): Promise<boolean> {
  const { data } = await supabase.from("lives").select("status").eq("id", liveId).single();
  return data?.status === "live";
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

  let reconnectAttempt = 0;
  let stopped = false;
  let currentConnection: EulerConnection | null = null;
  const sessionStartedAt = Date.now();
  let earlyNotLiveRetries = 0;

  const session: LiveSession = {
    liveId,
    shopId,
    wsOpenFailures: 0,
    // Stable across reconnects : ferme la connexion Euler courante et
    // empêche tout retry planifié de repartir ensuite (ex. arrêt volontaire
    // du worker via shutdown() dans index.ts).
    connection: {
      disconnect: () => {
        stopped = true;
        currentConnection?.disconnect();
      },
    },
  };

  const markLiveEnded = async (reason: string) => {
    console.log(JSON.stringify({ level: "info", msg: "live session ended", liveId, tiktokUsername, reason }));
    stopped = true;
    await supabase
      .from("lives")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", liveId);
    await supabase.from("live_viewers").delete().eq("live_id", liveId);
    clearDebounceState(liveId);
    closeCommentChannel(liveId);
    onEnded(liveId);
  };

  const connect = () => {
    // Une erreur websocket ("error") est presque toujours suivie d'un "close"
    // pour le même incident côté module `ws` — sans ce flag, les deux
    // événements déclencheraient chacun un cycle de reconnexion, ouvrant deux
    // websockets concurrents pour le même live.
    let settled = false;

    currentConnection = connectToLive(tiktokUsername, {
      onOpen: () => {
        reconnectAttempt = 0;
      },
      onComment: (comment) => handleComment(liveId, shopId, mode, comment, saleKeywords),
      onViewerCount: (viewerCount) => handleViewerCount(liveId, viewerCount),
      onLiveEnded: (reason, code) => {
        if (stopped || settled) return;

        const withinGracePeriod = Date.now() - sessionStartedAt < EARLY_NOT_LIVE_GRACE_MS;
        if (
          code === NOT_LIVE_CLOSE_CODE &&
          withinGracePeriod &&
          earlyNotLiveRetries < EARLY_NOT_LIVE_MAX_RETRIES
        ) {
          settled = true;
          earlyNotLiveRetries += 1;
          console.log(JSON.stringify({
            level: "info",
            msg: "NOT_LIVE shortly after claim, retrying (possible TikTok propagation delay)",
            liveId,
            tiktokUsername,
            attempt: earlyNotLiveRetries,
          }));
          setTimeout(() => {
            if (!stopped) connect();
          }, EARLY_NOT_LIVE_RETRY_DELAY_MS);
          return;
        }

        settled = true;
        markLiveEnded(reason);
      },
      onDisconnected: async (reason) => {
        if (stopped || settled) return;
        settled = true;
        session.wsOpenFailures += 1;
        onWsOpenFailure(liveId, new Error(reason));

        if (!(await isLiveStillActive(liveId))) {
          // Terminé entre-temps par un autre chemin (ex. le vendeur a cliqué
          // "Terminer le live") — ne jamais reconnecter un live déjà fermé.
          stopped = true;
          clearDebounceState(liveId);
          closeCommentChannel(liveId);
          onEnded(liveId);
          return;
        }

        const delay = reconnectDelayMs(reconnectAttempt);
        reconnectAttempt += 1;
        console.log(JSON.stringify({
          level: "info",
          msg: "euler websocket disconnected, retrying",
          liveId,
          tiktokUsername,
          reason,
          attempt: reconnectAttempt,
          delayMs: delay,
        }));
        setTimeout(() => {
          if (!stopped) connect();
        }, delay);
      },
    });
  };

  connect();

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
    // Pré-filtre déterministe : un commentaire contenant le mot-clé de vente
    // du live (ex: "jp") est TOUJOURS une intention d'achat, sans dépendre
    // du classificateur LLM (rapid-intent-detection.ts) qui peut occasionnellement
    // rater un cas explicite. Les commentaires sans mot-clé (ex: énumération
    // implicite de couleurs "une kaki eh une bleu jean") passent quand même
    // par le LLM, seul moyen de les détecter.
    const hasKeyword = parseSaleComment(comment.text, [], saleKeywords).isSale;
    enqueueRapidComment(liveId, shopId, comment, hasKeyword);
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
