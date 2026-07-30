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
import { trackRapidLive, untrackRapidLive, stopRapidBatchTimer } from "./rapid-batch-queue.js";
import { startLiveSession, type LiveSession } from "./live-session.js";
import { startHealthServer } from "./health-server.js";
import { startSimulationServer } from "./simulation-server.js";

assertConfig();

const activeSessions = new Map<string, LiveSession>();
let wsOpenFailuresTotal = 0;
let shuttingDown = false;

function log(level: "info" | "error", msg: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ level, msg, workerId: config.workerId, ...extra }));
}

async function onLiveEnded(liveId: string) {
  const session = activeSessions.get(liveId);
  if (!session) return;
  activeSessions.delete(liveId);
  untrackRapidLive(liveId);
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
      try {
        // Produits créés à la volée, pas de catalogue à charger en mémoire —
        // juste l'enregistrement de la file de lot LLM (cf. rapid-batch-queue.ts).
        trackRapidLive(claimed.id, claimed.shop_id);
        const session = await startLiveSession(
          claimed.id,
          claimed.shop_id,
          onLiveEnded,
          onWsOpenFailure
        );
        activeSessions.set(claimed.id, session);
        log("info", "claimed live", { liveId: claimed.id, shopId: claimed.shop_id });
      } catch (err) {
        log("error", "failed to start live session, releasing", {
          liveId: claimed.id,
          error: (err as Error).message,
        });
        untrackRapidLive(claimed.id);
        await releaseLive(claimed.id);
      }
    }
  }

  setTimeout(claimLoop, config.claimStaggerMs);
}

// Heartbeat de tous les lives actifs sur cette instance — vérifie au passage
// que chacun est toujours `status = 'live'` en base : un live terminé par un
// autre chemin (ex. le vendeur clique "Terminer le live" côté dashboard) ne
// notifie jamais le worker directement, donc sans ce contrôle la session
// Euler resterait ouverte indéfiniment après la fin affichée côté vendeur.
function startHeartbeatLoop() {
  return setInterval(async () => {
    await Promise.all(
      [...activeSessions.entries()].map(async ([liveId, session]) => {
        const status = await heartbeat(liveId);
        if (status !== null && status !== "live") {
          log("info", "live ended externally, stopping session", { liveId, status });
          session.connection.disconnect();
          await onLiveEnded(liveId);
        }
      })
    );
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
claimLoop();

log("info", "worker started", {
  maxLivesPerWorker: config.maxLivesPerWorker,
  lagSoftLimitMs: config.lagSoftLimitMs,
});
