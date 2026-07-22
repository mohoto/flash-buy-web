import WebSocket from "ws";
import {
  createWebSocketUrl,
  ClientCloseCode,
  type WebcastChatMessage,
} from "@eulerstream/euler-websocket-sdk";
import { config } from "./config.js";

export type LiveComment = {
  commentId: string;
  username: string;
  text: string;
};

export type EulerConnection = {
  disconnect: () => void;
};

// NOTE D'INTÉGRATION (à vérifier au premier test réel avec un compte Euler
// Stream actif) : createWebSocketUrl()/ClientCloseCode/WebcastChatMessage
// viennent du package officiel @eulerstream/euler-websocket-sdk, confirmés en
// lisant ses types compilés — schéma v2 (export par défaut du SDK) :
// WebcastChatMessage.comment = texte, .user.uniqueId = pseudo,
// .common.msgId = id unique pour l'idempotence (v1 aurait été .event.msgId,
// mais le SDK réexporte tiktok-live-proto/v2 par défaut).
// Ce package ne fournit qu'un URL builder + des types — pas de client
// WebSocket clé-en-main avec décodage automatique intégré. Ce qui reste
// incertain et à valider avec un vrai live : la forme exacte des messages
// reçus sur le WebSocket (JSON déjà décodé côté serveur Euler vs. frames
// protobuf brutes à décoder soi-même via tiktok-live-proto). Le code
// ci-dessous suppose du JSON `{ type: "WebcastChatMessage", data: {...} }`
// (cohérent avec le typage DecodedData du SDK) ; si le test réel montre des
// frames binaires, seul parseIncomingMessage() doit changer.
type DecodedEnvelope = {
  type: string;
  data: unknown;
};

function parseIncomingMessage(raw: WebSocket.RawData): DecodedEnvelope | null {
  try {
    const parsed = JSON.parse(raw.toString());
    if (parsed && typeof parsed.type === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

export function connectToLive(
  tiktokUsername: string,
  handlers: {
    onComment: (comment: LiveComment) => void;
    onDisconnect: (reason: string) => void;
    onError: (error: Error) => void;
  }
): EulerConnection {
  const url = createWebSocketUrl({
    uniqueId: tiktokUsername,
    apiKey: config.eulerApiKey,
  });

  const ws = new WebSocket(url);

  ws.on("open", () => {
    console.log(JSON.stringify({ level: "info", msg: "euler websocket opened", tiktokUsername }));
  });

  ws.on("message", (raw) => {
    const envelope = parseIncomingMessage(raw);
    console.log(JSON.stringify({
      level: "info",
      msg: "euler websocket message",
      tiktokUsername,
      type: envelope?.type ?? null,
      rawPreview: raw.toString().slice(0, 300),
    }));
    if (!envelope) return;

    if (envelope.type === "WebcastChatMessage") {
      const chat = envelope.data as WebcastChatMessage;
      if (!chat.common?.msgId || !chat.user?.uniqueId) return;
      handlers.onComment({
        commentId: chat.common.msgId,
        username: chat.user.uniqueId,
        text: chat.comment,
      });
    }

    if (envelope.type === "tiktok.disconnect") {
      handlers.onDisconnect("tiktok.disconnect");
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
