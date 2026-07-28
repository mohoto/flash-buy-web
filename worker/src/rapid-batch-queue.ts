import { randomUUID } from "node:crypto";
import { supabase } from "./supabase.js";
import { config } from "./config.js";
import { classifyPurchaseIntents, type ClassifiedComment } from "./rapid-intent-detection.js";
import type { LiveComment } from "./euler.js";

type QueuedComment = {
  id: string; // id de corrélation LLM (randomUUID), indépendant de tiktok_comment_id
  liveId: string;
  shopId: string;
  comment: LiveComment;
  // true si le mot-clé de vente du live (ex: "jp") est présent — détection
  // déterministe faite en amont (live-session.ts), court-circuite le LLM.
  hasKeyword: boolean;
};

const queueByLive = new Map<string, QueuedComment[]>();
const trackedRapidLives = new Map<string, { shopId: string; refCount: number }>();
let flushTimer: ReturnType<typeof setInterval> | null = null;

// Appelé au claim d'un live en mode rapid : démarre le minuteur de lot
// partagé au premier live suivi. Pas de lecture DB, pas de cache Realtime —
// contrairement à l'ancien rapid-active-product.ts, il n'y a plus de notion
// de "produit actif à attendre" (l'assignation se fait après coup, par
// glisser-déposer côté vendeur), donc rien à précharger.
export function trackRapidLive(liveId: string, shopId: string): void {
  const existing = trackedRapidLives.get(liveId);
  if (existing) {
    existing.refCount += 1;
    return;
  }
  trackedRapidLives.set(liveId, { shopId, refCount: 1 });
  ensureFlushTimer();
}

export function untrackRapidLive(liveId: string): void {
  const existing = trackedRapidLives.get(liveId);
  if (!existing) return;
  existing.refCount -= 1;
  if (existing.refCount <= 0) {
    trackedRapidLives.delete(liveId);
    // Tout ce qui n'a pas encore été classifié est perdu : le live est
    // terminé, il n'y a plus rien à quoi le rattacher.
    queueByLive.delete(liveId);
  }
}

export function enqueueRapidComment(
  liveId: string,
  shopId: string,
  comment: LiveComment,
  hasKeyword: boolean
): void {
  const list = queueByLive.get(liveId) ?? [];
  list.push({ id: randomUUID(), liveId, shopId, comment, hasKeyword });
  queueByLive.set(liveId, list);
}

function ensureFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(flushAllLives, config.rapidBatchIntervalMs);
}

export function stopRapidBatchTimer() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

async function flushAllLives() {
  // Séquentiel par live, pas Promise.all : borne l'usage concurrent de
  // l'API Anthropic au nombre de lives rapid suivis par CETTE instance à un
  // instant donné, et isole les erreurs (l'échec d'un live ne touche jamais
  // la file d'un autre).
  for (const liveId of queueByLive.keys()) {
    await flushOneLive(liveId);
  }
}

async function flushOneLive(liveId: string) {
  const pending = queueByLive.get(liveId);
  if (!pending || pending.length === 0) return; // lot vide : aucun appel LLM

  const tracked = trackedRapidLives.get(liveId);
  if (!tracked) {
    queueByLive.delete(liveId); // live terminé entre-temps
    return;
  }

  // Court-circuit déterministe : mot-clé présent = persisté directement,
  // aucun appel LLM, aucun risque de faux négatif de classification pour ces
  // commentaires-là (cf. bug observé : "Jp saumon et bleu clair top" raté par
  // le LLM malgré "jp" explicite). Seuls les commentaires sans mot-clé (ex.
  // énumération implicite de couleurs) passent par le classificateur.
  const keywordMatches = pending.filter((p) => p.hasKeyword);
  const needsClassification = pending.filter((p) => !p.hasKeyword);

  if (keywordMatches.length > 0) {
    await persistDetectedIntents(liveId, tracked.shopId, keywordMatches);
  }

  if (needsClassification.length === 0) {
    queueByLive.delete(liveId);
    return;
  }

  let classified: ClassifiedComment[];
  try {
    classified = await classifyPurchaseIntents(
      needsClassification.map((p) => ({ id: p.id, text: p.comment.text }))
    );
  } catch (err) {
    // Le lot entier échoue ensemble (un seul appel API classifiant tout le
    // lot) : la file reste intacte (moins les keywordMatches déjà persistés
    // ci-dessus), mêmes commentaires retentés au tick suivant — aucun
    // commentaire perdu, aucun doublon.
    console.error(JSON.stringify({
      level: "error",
      liveId,
      msg: "rapid batch classification failed, will retry next tick",
      error: (err as Error).message,
      batchSize: needsClassification.length,
    }));
    queueByLive.set(liveId, needsClassification);
    return;
  }

  const classifiedIds = new Set(classified.map((c) => c.id));
  const toPersist = needsClassification.filter((p) => {
    const match = classified.find((c) => c.id === p.id);
    return match?.isPurchaseIntent === true;
  });

  await persistDetectedIntents(liveId, tracked.shopId, toPersist);

  // Ne retire de la file que les ids effectivement retournés par le LLM
  // (vrai ou faux) — un id absent de la réponse (cas réponse partielle)
  // reste en file pour le prochain tick, sans jamais être renvoyé deux fois
  // au LLM une fois qu'il a reçu un verdict.
  const remaining = needsClassification.filter((p) => !classifiedIds.has(p.id));
  if (remaining.length > 0) queueByLive.set(liveId, remaining);
  else queueByLive.delete(liveId);
}

async function persistDetectedIntents(liveId: string, shopId: string, items: QueuedComment[]) {
  for (const item of items) {
    const { error } = await supabase.from("live_rapid_items").insert({
      live_id: liveId,
      shop_id: shopId,
      buyer_tiktok_username: item.comment.username,
      nickname: item.comment.nickname,
      profile_picture_url: item.comment.profilePictureUrl,
      source_comment: item.comment.text,
      tiktok_comment_id: item.comment.commentId,
      received_at: new Date().toISOString(),
    });
    if (error && error.code !== "23505") {
      // 23505 = doublon idempotent (redelivery WebSocket), attendu.
      console.error(JSON.stringify({ level: "error", liveId, msg: "failed to persist rapid item", error: error.message }));
    }
  }
}
