import { monitorEventLoopDelay } from "node:perf_hooks";
import { supabase } from "./supabase.js";
import { config } from "./config.js";

const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();

export function eventLoopP99Ms(): number {
  return loopDelay.percentile(99) / 1e6; // ns -> ms
}

export function resetEventLoopStats() {
  loopDelay.reset();
}

export function canClaimMore(currentLiveCount: number): boolean {
  if (currentLiveCount >= config.maxLivesPerWorker) return false; // plafond dur
  if (eventLoopP99Ms() > config.lagSoftLimitMs) return false; // frein souple
  return true;
}

// Claim atomique : une seule instance gagne, sans coordinateur central.
export async function claimNextLive(): Promise<{ id: string; shop_id: string } | null> {
  const { data: candidates } = await supabase
    .from("lives")
    .select("id, shop_id")
    .is("worker_id", null)
    .eq("status", "live")
    .order("created_at", { ascending: true })
    .limit(5);

  if (!candidates || candidates.length === 0) return null;

  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from("lives")
      .update({ worker_id: config.workerId, claimed_at: new Date().toISOString() })
      .eq("id", candidate.id)
      .is("worker_id", null) // condition atomique : gagne uniquement si encore libre
      .select("id, shop_id")
      .maybeSingle();

    if (!error && data) return data;
    // sinon un autre worker a gagné la course, on essaie le candidat suivant
  }

  return null;
}

export async function releaseLive(liveId: string) {
  await supabase
    .from("lives")
    .update({ worker_id: null, claimed_at: null })
    .eq("id", liveId)
    .eq("worker_id", config.workerId);
}

export async function heartbeat(liveId: string) {
  await supabase
    .from("lives")
    .update({ heartbeat_at: new Date().toISOString() })
    .eq("id", liveId)
    .eq("worker_id", config.workerId);
}

// Auto-réparation : remet en file les lives dont le heartbeat est périmé,
// qu'ils appartiennent à ce worker ou (surtout) à un worker planté.
export async function reapStaleLives() {
  const staleBefore = new Date(Date.now() - config.heartbeatStaleMs).toISOString();

  await supabase
    .from("lives")
    .update({ worker_id: null, claimed_at: null })
    .eq("status", "live")
    .not("worker_id", "is", null)
    .lt("heartbeat_at", staleBefore);
}

// Relâche tous les lives de cette instance (arrêt propre, SIGTERM).
export async function releaseAllOwnLives() {
  await supabase
    .from("lives")
    .update({ worker_id: null, claimed_at: null })
    .eq("worker_id", config.workerId);
}

export async function upsertWorkerHealth(params: {
  livesCount: number;
  wsOpenFailures: number;
}) {
  await supabase.from("worker_health").upsert({
    worker_id: config.workerId,
    lives_count: params.livesCount,
    event_loop_p99_ms: eventLoopP99Ms(),
    ws_open_failures: params.wsOpenFailures,
    updated_at: new Date().toISOString(),
  });
}
