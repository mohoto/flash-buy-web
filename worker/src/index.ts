import { config, assertConfig } from "./config.js";
import {
  canClaimMore,
  claimNextLive,
  releaseLive,
  releaseAllOwnLives,
  heartbeat,
  reapStaleLives,
  upsertWorkerHealth,
  resetEventLoopStats,
} from "./sharding.js";
import { trackShop, untrackShop, startPeriodicCatalogRefresh, stopRealtimeSubscription } from "./catalog.js";
import { trackRapidLive, untrackRapidLive, stopRapidBatchTimer } from "./rapid-batch-queue.js";
import { startLiveSession, type LiveSession } from "./live-session.js";
import { startHealthServer } from "./health-server.js";
import { startSimulationServer } from "./simulation-server.js";

assertConfig();

const activeSessions = new Map<string, LiveSession>();
// Mode du live gardé côté worker (pas dans LiveSession) : sert uniquement à
// savoir, à la fin de la session, si trackShop a été appelé pour elle — pour
// ne jamais untrackShop un shop qui n'a jamais été tracké (mode "freeform").
const sessionModes = new Map<string, string>();
let wsOpenFailuresTotal = 0;
let shuttingDown = false;

function log(level: "info" | "error", msg: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ level, msg, workerId: config.workerId, ...extra }));
}

async function onLiveEnded(liveId: string) {
  const session = activeSessions.get(liveId);
  if (!session) return;
  activeSessions.delete(liveId);
  if (sessionModes.get(liveId) === "catalog") untrackShop(session.shopId);
  if (sessionModes.get(liveId) === "rapid") untrackRapidLive(liveId);
  sessionModes.delete(liveId);
  await releaseLive(liveId);
  log("info", "live session ended", { liveId });
}

function onWsOpenFailure(liveId: string, err: Error) {
  wsOpenFailuresTotal += 1;
  log("error", "websocket open failure", {
    liveId,
    totalFailures: wsOpenFailuresTotal,
    error: err.message,
  });
}

// Boucle de claim : espacée par CLAIM_STAGGER_MS (anti-thundering-herd), ne
// réclame que si sous le plafond dur ET sous le frein souple event-loop.
async function claimLoop() {
  if (shuttingDown) return;

  if (canClaimMore(activeSessions.size)) {
    const claimed = await claimNextLive();
    if (claimed) {
      sessionModes.set(claimed.id, claimed.mode);
      try {
        // Mode "freeform" : le worker ne charge jamais le catalogue de ce
        // vendeur en mémoire pour ce live (cf. handleComment côté
        // live-session.ts, qui ignore getCatalog dans ce mode). Mode "rapid" :
        // pas de catalogue non plus (produits créés à la volée) — juste
        // l'enregistrement de la file de lot LLM (cf. rapid-batch-queue.ts).
        if (claimed.mode === "catalog") await trackShop(claimed.shop_id);
        if (claimed.mode === "rapid") trackRapidLive(claimed.id, claimed.shop_id);
        const session = await startLiveSession(
          claimed.id,
          claimed.shop_id,
          claimed.mode,
          onLiveEnded,
          onWsOpenFailure
        );
        activeSessions.set(claimed.id, session);
        log("info", "claimed live", { liveId: claimed.id, shopId: claimed.shop_id, mode: claimed.mode });
      } catch (err) {
        log("error", "failed to start live session, releasing", {
          liveId: claimed.id,
          error: (err as Error).message,
        });
        if (claimed.mode === "catalog") untrackShop(claimed.shop_id);
        if (claimed.mode === "rapid") untrackRapidLive(claimed.id);
        sessionModes.delete(claimed.id);
        await releaseLive(claimed.id);
      }
    }
  }

  setTimeout(claimLoop, config.claimStaggerMs);
}

// Heartbeat de tous les lives actifs sur cette instance.
function startHeartbeatLoop() {
  return setInterval(async () => {
    await Promise.all([...activeSessions.keys()].map(heartbeat));
  }, config.heartbeatIntervalMs);
}

// Auto-réparation : remet en file les lives dont le heartbeat est périmé
// (ex. worker planté), repris par une autre instance.
function startReapLoop() {
  return setInterval(() => {
    reapStaleLives();
  }, config.heartbeatStaleMs);
}

function startHealthReportLoop() {
  return setInterval(() => {
    resetEventLoopStats();
    upsertWorkerHealth({
      livesCount: activeSessions.size,
      wsOpenFailures: wsOpenFailuresTotal,
    });
  }, 10_000);
}

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("info", `received ${signal}, shutting down`, { livesCount: activeSessions.size });

  for (const session of activeSessions.values()) {
    session.connection.disconnect();
  }
  stopRealtimeSubscription();
  stopRapidBatchTimer();
  await releaseAllOwnLives();

  log("info", "shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

startHealthServer(config.port, () => activeSessions.size);
startSimulationServer(config.port + 1);
startHeartbeatLoop();
startReapLoop();
startHealthReportLoop();
startPeriodicCatalogRefresh();
claimLoop();

log("info", "worker started", {
  maxLivesPerWorker: config.maxLivesPerWorker,
  lagSoftLimitMs: config.lagSoftLimitMs,
});
