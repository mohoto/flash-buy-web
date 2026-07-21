function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  eulerApiKey: process.env.EULER_API_KEY ?? "",

  // Plafond dur de sécurité : l'instance ne réclame plus de lives au-delà.
  maxLivesPerWorker: int("MAX_LIVES_PER_WORKER", 25),
  // Frein souple : au-delà de ce lag event-loop (ms), l'instance cesse de réclamer
  // même si elle n'a pas atteint le plafond dur.
  lagSoftLimitMs: int("LAG_SOFT_LIMIT_MS", 50),
  heartbeatIntervalMs: int("HEARTBEAT_INTERVAL_MS", 15_000),
  heartbeatStaleMs: int("HEARTBEAT_STALE_MS", 60_000),
  // Anti-thundering-herd : délai entre deux claims de lives (ouvertures WS espacées).
  claimStaggerMs: int("CLAIM_STAGGER_MS", 250),
  eulerMaxConcurrentWs: int("EULER_MAX_CONCURRENT_WS", 0), // 0 = pas de plafond local
  port: int("PORT", 8080),

  // Filet de sécurité catalogue Realtime (cf. spec section 5) : recharge périodique
  // même si un événement Realtime a été manqué.
  catalogRefreshIntervalMs: int("CATALOG_REFRESH_INTERVAL_MS", 5 * 60_000),

  workerId: process.env.WORKER_ID ?? `worker-${process.pid}-${Date.now()}`,
};

export function assertConfig() {
  const missing: string[] = [];
  if (!config.supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!config.supabaseServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}
