import WebSocket from "ws";
import {
  createWebSocketUrl,
  ClientCloseCode,
  type WebcastChatMessage,
  type PresenceRecord,
} from "@eulerstream/euler-websocket-sdk";
import { config } from "./config.js";

export type LiveComment = {
  commentId: string;
  username: string;
  text: string;
};

export type LiveViewer = {
  userId: string;
  username: string;
  nickname: string;
  profilePictureUrl: string | null;
};

export type EulerConnection = {
  disconnect: () => void;
};

function toLiveViewer(record: PresenceRecord): LiveViewer {
  return {
    userId: record.user.userId,
    username: record.user.uniqueId,
    nickname: record.user.nickname,
    profilePictureUrl: record.user.profilePicture?.url?.[0] ?? null,
  };
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
    onComment: (comment: LiveComment) => void;
    onViewerJoin: (viewer: LiveViewer) => void;
    onViewerLeave: (viewer: LiveViewer) => void;
    onDisconnect: (reason: string) => void;
    onError: (error: Error) => void;
  }
): EulerConnection {
  const url = createWebSocketUrl({
    uniqueId: tiktokUsername,
    apiKey: config.eulerApiKey,
    features: { syntheticPresence: true },
  });

  const ws = new WebSocket(url);

  ws.on("open", () => {
    console.log(JSON.stringify({ level: "info", msg: "euler websocket opened", tiktokUsername }));
  });

  ws.on("message", (raw) => {
    const envelopes = parseIncomingMessages(raw);

    for (const envelope of envelopes) {
      if (envelope.type === "WebcastChatMessage") {
        const chat = envelope.data as WebcastChatMessage;
        if (!chat.common?.msgId || !chat.user?.uniqueId) continue;
        handlers.onComment({
          commentId: chat.common.msgId,
          username: chat.user.uniqueId,
          text: chat.comment,
        });
      }

      if (envelope.type === "tiktok.disconnect") {
        handlers.onDisconnect("tiktok.disconnect");
      }

      if (envelope.type === "SyntheticJoinMessage") {
        handlers.onViewerJoin(toLiveViewer(envelope.data as PresenceRecord));
      }

      if (envelope.type === "SyntheticLeaveMessage") {
        handlers.onViewerLeave(toLiveViewer(envelope.data as PresenceRecord));
      }
    }
  });

  ws.on("close", (code) => {
    if (code === ClientCloseCode.STREAM_END || code === ClientCloseCode.NOT_LIVE) {
      handlers.onDisconnect(`close_${code}`);
    } else if (code !== ClientCloseCode.NORMAL) {
      // Fermeture inattendue : traité comme un échec d'ouverture par l'appelant
      // (incrémente ws_open_failures) plutôt qu'une fin de live normale.
      handlers.onError(new Error(`WebSocket closed unexpectedly (code ${code})`));
    }
  });

  ws.on("error", (err) => handlers.onError(err));

  return {
    disconnect: () => ws.close(ClientCloseCode.NORMAL),
  };
}
