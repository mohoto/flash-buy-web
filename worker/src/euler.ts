import WebSocket from "ws";
import {
  createWebSocketUrl,
  normalizeUniqueId,
  ClientCloseCode,
  CloseMessageMap,
  type WebcastChatMessage,
  type WebcastRoomUserSeqMessage,
} from "@eulerstream/euler-websocket-sdk";
import { config } from "./config.js";

// normalizeUniqueId() (SDK) gère déjà @pseudo et les URLs TikTok complètes,
// mais laisse passer un "/" de fin isolé (ex. pseudo collé depuis
// tiktok.com/@pseudo/live sans le reste de l'URL) — confirmé en pratique :
// un tel pseudo produit un close_4400 (INVALID_OPTIONS) en boucle côté Euler,
// jamais résolu par un retry. cf. lives.tiktok_username, saisi librement par
// le vendeur dans LiveConnectionForm (live-connection-settings.tsx).
export function normalizeTiktokUsername(raw: string): string {
  return normalizeUniqueId(raw.trim()).replace(/\/+$/, "");
}

// Message lisible pour un close code Euler, affiché au vendeur (cf.
// live-session.ts markEulerFailing) — CloseMessageMap vient du SDK, jamais
// dupliqué ici pour rester à jour avec les codes qu'Euler peut renvoyer.
export function describeCloseCode(code: number): string {
  return CloseMessageMap[code as keyof typeof CloseMessageMap] ?? `Code ${code}`;
}

export type LiveComment = {
  commentId: string;
  userId: string;
  username: string;
  nickname: string;
  profilePictureUrl: string | null;
  text: string;
};

export type EulerConnection = {
  disconnect: () => void;
};

// Codes de fermeture signifiant que le live TikTok est réellement terminé
// (le streamer a coupé, ou n'était déjà plus en live) — toute autre
// fermeture non volontaire (erreur réseau, timeout, erreur serveur Euler...)
// est une coupure à retenter, pas une fin de live.
const LIVE_ENDED_CLOSE_CODES: number[] = [ClientCloseCode.STREAM_END, ClientCloseCode.NOT_LIVE];

export function isLiveEndedCloseCode(code: number): boolean {
  return LIVE_ENDED_CLOSE_CODES.includes(code);
}

export const NOT_LIVE_CLOSE_CODE = ClientCloseCode.NOT_LIVE;

// Confirmé sur un live réel : Euler bundle les événements par défaut
// (bundleEvents: true côté SDK) — chaque frame WebSocket contient
// `{ messages: [{ type, data }, ...], timestamp }`, jamais un message isolé
// à plat. createWebSocketUrl()/ClientCloseCode/WebcastChatMessage viennent du
// package officiel @eulerstream/euler-websocket-sdk — schéma v2 :
// WebcastChatMessage.comment = texte, .user.uniqueId = pseudo,
// .common.msgId = id unique pour l'idempotence.
type DecodedEnvelope = {
  type: string;
  data: unknown;
};

function parseIncomingMessages(raw: WebSocket.RawData): DecodedEnvelope[] {
  try {
    const parsed = JSON.parse(raw.toString());
    if (Array.isArray(parsed?.messages)) return parsed.messages;
    if (parsed && typeof parsed.type === "string") return [parsed];
    return [];
  } catch {
    return [];
  }
}

export function connectToLive(
  tiktokUsername: string,
  handlers: {
    onOpen?: () => void;
    // Toute frame Euler valide reçue (quel que soit son type) — signal fiable
    // que la session est réellement établie, contrairement à onOpen qui se
    // déclenche à l'ouverture TCP/WS, avant qu'Euler ait validé uniqueId
    // (confirmé en pratique : "euler websocket opened" suivi immédiatement
    // d'un close_4400 sur la même connexion). Ne pas confondre avec
    // onComment/onViewerCount, qui ne couvrent qu'un sous-ensemble des types
    // de frame et pourraient ne jamais se déclencher sur un live sans
    // interaction.
    onFrameReceived?: () => void;
    onComment: (comment: LiveComment) => void;
    onViewerCount: (viewerCount: number) => void;
    // Le streamer a réellement arrêté le live (ou n'était déjà plus en
    // live) — définitif, jamais retenté par défaut. `code` (absent pour
    // tiktok.disconnect, qui n'a pas de close code associé) permet à
    // l'appelant de distinguer NOT_LIVE des autres cas s'il veut faire
    // exception (cf. live-session.ts : NOT_LIVE juste après le claim d'un
    // live peut être une latence de propagation TikTok, pas une vraie fin).
    onLiveEnded: (reason: string, code?: number) => void;
    // Websocket coupé pour toute autre raison (réseau, erreur serveur
    // Euler, timeout...) — l'appelant décide de retenter la connexion.
    onDisconnected: (reason: string) => void;
  }
): EulerConnection {
  const url = createWebSocketUrl({
    uniqueId: tiktokUsername,
    apiKey: config.eulerApiKey,
  });

  const ws = new WebSocket(url);

  ws.on("open", () => {
    console.log(JSON.stringify({ level: "info", msg: "euler websocket opened", tiktokUsername }));
    handlers.onOpen?.();
  });

  ws.on("message", (raw) => {
    const envelopes = parseIncomingMessages(raw);
    // DEBUG TEMPORAIRE (2026-07-28) : diagnostic "commentaires n'arrivent plus" —
    // à retirer une fois la cause confirmée.
    console.log(
      JSON.stringify({
        level: "debug",
        msg: "euler frame received",
        tiktokUsername,
        rawByteLength: raw.toString().length,
        envelopeTypes: envelopes.map((e) => e.type),
        rawSample: envelopes.length === 0 ? raw.toString().slice(0, 500) : undefined,
      })
    );

    handlers.onFrameReceived?.();

    for (const envelope of envelopes) {
      if (envelope.type === "WebcastChatMessage") {
        const chat = envelope.data as WebcastChatMessage;
        if (!chat.common?.msgId || !chat.user?.uniqueId) continue;
        handlers.onComment({
          commentId: chat.common.msgId,
          userId: chat.user.userId,
          username: chat.user.uniqueId,
          nickname: chat.user.nickname,
          profilePictureUrl: chat.user.profilePicture?.url?.[0] ?? null,
          text: chat.comment,
        });
      }

      if (envelope.type === "tiktok.disconnect") {
        handlers.onLiveEnded("tiktok.disconnect");
      }

      if (envelope.type === "WebcastRoomUserSeqMessage") {
        const seq = envelope.data as WebcastRoomUserSeqMessage;
        handlers.onViewerCount(seq.viewerCount);
      }
    }
  });

  ws.on("close", (code) => {
    if (isLiveEndedCloseCode(code)) {
      handlers.onLiveEnded(`close_${code}`, code);
    } else if (code !== ClientCloseCode.NORMAL) {
      // Toute fermeture inattendue qui n'indique pas explicitement une fin
      // de live (erreur réseau, erreur serveur Euler, timeout...) — l'appelant
      // décide de retenter la connexion plutôt que de clore le live.
      handlers.onDisconnected(`close_${code}`);
    }
  });

  ws.on("error", (err) => handlers.onDisconnected(err.message));

  return {
    disconnect: () => ws.close(ClientCloseCode.NORMAL),
  };
}
