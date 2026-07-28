import WebSocket from "ws";
import {
  createWebSocketUrl,
  ClientCloseCode,
  type WebcastChatMessage,
  type WebcastRoomUserSeqMessage,
} from "@eulerstream/euler-websocket-sdk";
import { config } from "./config.js";

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
    onComment: (comment: LiveComment) => void;
    onViewerCount: (viewerCount: number) => void;
    // Le streamer a réellement arrêté le live (ou n'était déjà plus en
    // live) — définitif, jamais retenté.
    onLiveEnded: (reason: string) => void;
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
      handlers.onLiveEnded(`close_${code}`);
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
