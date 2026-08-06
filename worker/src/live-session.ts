import { supabase } from "./supabase.js";
import { parseSaleComment } from "./parsing.js";
import {
  connectToLive,
  normalizeTiktokUsername,
  describeCloseCode,
  NOT_LIVE_CLOSE_CODE,
  type EulerConnection,
  type LiveComment,
} from "./euler.js";
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

// Seuil déclenchant lives.euler_status = 'failing' : une coupure isolée vite
// rétablie (réseau, erreur serveur transitoire) ne doit jamais alerter le
// vendeur — seule une panne qui persiste (ex. pseudo TikTok invalide,
// close_4400/INVALID_OPTIONS, jamais résolu par un retry) le justifie. cf.
// bug observé le 2026-08-05 : un live est resté indéfiniment sans
// commentaires, "Worker connecté" restant vert car le process avait bien
// heartbeat malgré des centaines d'échecs de connexion Euler consécutifs.
const EULER_FAILING_THRESHOLD = 3;
const EULER_FAILING_WINDOW_MS = 15_000;

// Code de fermeture Euler signifiant une erreur de configuration (pseudo/clé
// invalide) plutôt qu'un incident réseau transitoire — jamais résolu par un
// simple retry, donc reconnu immédiatement dans le message affiché au
// vendeur (cf. buildEulerErrorMessage) sans attendre le seuil de répétition.
const CONFIG_ERROR_CLOSE_CODES = [4400, 4401, 4403, 4404];

function extractCloseCode(reason: string): number | null {
  const match = /^close_(\d+)$/.exec(reason);
  return match ? Number(match[1]) : null;
}

function buildEulerErrorMessage(reason: string): string {
  const code = extractCloseCode(reason);
  if (code === null) return reason;
  return `${describeCloseCode(code)} (code ${code})`;
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

// État de connexion Euler affiché au vendeur (cf. ConnectionStatusBadge côté
// web) — distinct du heartbeat worker (lives.worker_id/heartbeat_at), qui ne
// prouve que "le process a bien ce live en charge", pas que la websocket
// TikTok fonctionne. Sans ça, un pseudo TikTok invalide pouvait boucler en
// close_4400 indéfiniment sans jamais rien signaler côté dashboard.
//
// euler_ever_connected passe à true ici et n'est JAMAIS remis à false
// ensuite (contrairement à euler_status, qui reflète l'état COURANT et peut
// redevenir 'failing' après une coupure tardive) — sert côté web
// (/dashboard/live/[liveId]) à distinguer un live qui a réellement fonctionné
// un moment d'un live jamais connecté du tout (ex. pseudo invalide, NOT_LIVE
// immédiat) une fois qu'il est "ended" : seul le premier mérite une console
// consultable après coup.
async function markEulerConnected(liveId: string) {
  await supabase
    .from("lives")
    .update({
      euler_status: "connected",
      euler_last_error: null,
      euler_failing_since: null,
      euler_ever_connected: true,
    })
    .eq("id", liveId)
    .neq("euler_status", "connected"); // évite une écriture à chaque frame reçue
}

async function markEulerFailing(liveId: string, message: string) {
  const { data } = await supabase
    .from("lives")
    .select("euler_failing_since")
    .eq("id", liveId)
    .single();

  await supabase
    .from("lives")
    .update({
      euler_status: "failing",
      euler_last_error: message,
      euler_failing_since: data?.euler_failing_since ?? new Date().toISOString(),
    })
    .eq("id", liveId);
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

  const rawTiktokUsername = liveRow?.tiktok_username;
  if (!rawTiktokUsername) {
    throw new Error(`Live ${liveId} has no tiktok_username configured`);
  }
  // Nettoie un pseudo collé avec un "@", une URL TikTok complète, ou un "/"
  // de fin (ex. "tiktok.com/@pseudo/live" tronqué) — sans ça, Euler renvoie
  // close_4400 (INVALID_OPTIONS) en boucle, jamais résolu par un retry.
  const tiktokUsername = normalizeTiktokUsername(rawTiktokUsername);
  const saleKeywords = liveRow?.sale_keywords;

  // Repart toujours de 'connecting' au démarrage d'une session : un live
  // relancé (nouveau claim après un ended/released) ne doit pas hériter d'un
  // euler_status périmé (ex. 'failing' d'une session précédente terminée
  // depuis).
  await supabase
    .from("lives")
    .update({ euler_status: "connecting", euler_last_error: null, euler_failing_since: null })
    .eq("id", liveId);

  let reconnectAttempt = 0;
  let stopped = false;
  let currentConnection: EulerConnection | null = null;
  const sessionStartedAt = Date.now();
  let earlyNotLiveRetries = 0;
  // Horodatages des échecs récents (fenêtre glissante) — sert uniquement à
  // décider quand écrire euler_status = 'failing' (cf. EULER_FAILING_THRESHOLD),
  // jamais persisté tel quel.
  const recentFailureTimestamps: number[] = [];

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

    // Marqué au premier onOpen "franc" (voir plus bas) plutôt qu'à chaque
    // frame — une seule écriture DB par connexion réussie, pas une par
    // message reçu.
    let connectedMarked = false;

    currentConnection = connectToLive(tiktokUsername, {
      onOpen: () => {
        reconnectAttempt = 0;
      },
      // onOpen (ouverture TCP/WS) n'est pas fiable : Euler peut fermer juste
      // après avec close_4400 pour un uniqueId invalide. La première frame
      // effectivement reçue est le seul signal fiable que la session est
      // réellement établie — cf. commentaire sur onFrameReceived (euler.ts).
      onFrameReceived: () => {
        if (connectedMarked) return;
        connectedMarked = true;
        recentFailureTimestamps.length = 0;
        markEulerConnected(liveId).catch((err) =>
          console.error(JSON.stringify({ level: "error", msg: "failed to mark euler connected", liveId, error: (err as Error).message }))
        );
      },
      onComment: (comment) => handleComment(liveId, shopId, comment, saleKeywords),
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

        // Fenêtre glissante d'échecs récents : une coupure isolée vite
        // rétablie ne doit jamais alerter, seule une panne qui persiste sur
        // EULER_FAILING_THRESHOLD tentatives consécutives dans la fenêtre le
        // justifie (cf. constantes en tête de fichier).
        const now = Date.now();
        recentFailureTimestamps.push(now);
        while (
          recentFailureTimestamps.length > 0 &&
          now - recentFailureTimestamps[0] > EULER_FAILING_WINDOW_MS
        ) {
          recentFailureTimestamps.shift();
        }

        const isConfigError = CONFIG_ERROR_CLOSE_CODES.some((code) => reason === `close_${code}`);
        if (isConfigError || recentFailureTimestamps.length >= EULER_FAILING_THRESHOLD) {
          markEulerFailing(liveId, buildEulerErrorMessage(reason)).catch((err) =>
            console.error(JSON.stringify({ level: "error", msg: "failed to mark euler failing", liveId, error: (err as Error).message }))
          );
        }

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
  comment: LiveComment,
  saleKeywords?: string[]
) {
  broadcastComment(liveId, comment);
  await trackActiveCommenter(liveId, comment);

  // Pré-filtre déterministe : un commentaire contenant le mot-clé de vente
  // du live (ex: "jp") est TOUJOURS une intention d'achat, sans dépendre
  // du classificateur LLM (rapid-intent-detection.ts) qui peut occasionnellement
  // rater un cas explicite. Les commentaires sans mot-clé (ex: énumération
  // implicite de couleurs "une kaki eh une bleu jean") passent quand même
  // par le LLM, seul moyen de les détecter.
  const hasKeyword = parseSaleComment(comment.text, [], saleKeywords).isSale;
  enqueueRapidComment(liveId, shopId, comment, hasKeyword);
}
