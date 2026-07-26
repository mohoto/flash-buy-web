import { supabase } from "./supabase.js";
import { config } from "./config.js";
import type { ActiveRapidProduct } from "./rapid-parsing.js";
import type { LiveComment } from "./euler.js";

type TrackedLive = {
  liveId: string;
  shopId: string;
  refCount: number; // toujours 1 en pratique (un live = une session), même style que catalog.ts pour homogénéité
};

const trackedLives = new Map<string, TrackedLive>();
const activeByLive = new Map<string, ActiveRapidProduct | null>();
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

// Tampon anti-race-condition : des "jp" peuvent arriver via le WebSocket
// TikTok dans la même seconde qu'un produit vient d'être créé côté dashboard
// (Server Action), avant que ce worker n'ait appris son existence via
// Realtime. Ces commentaires patientent ici quelques secondes, jamais perdus
// (cf. plan section "Tampon anti-race-condition") : soit ils se rattachent
// dès que le produit actif est connu, soit ils expirent en "à corriger" avec
// leur horodatage d'origine.
export type OrphanRapidComment = {
  liveId: string;
  shopId: string;
  comment: LiveComment;
  receivedAt: number; // Date.now() au moment du commentaire, PAS du flush
};

const orphanBuffer = new Map<string, OrphanRapidComment[]>(); // clé: liveId

export async function loadActiveProduct(liveId: string): Promise<ActiveRapidProduct | null> {
  const { data: live } = await supabase
    .from("lives")
    .select("active_product_id")
    .eq("id", liveId)
    .single();

  if (!live?.active_product_id) return null;

  const { data: product } = await supabase
    .from("live_products")
    .select("id, name, price_cents, internal_ref, has_color, has_size")
    .eq("id", live.active_product_id)
    .single();

  if (!product) return null;

  return {
    id: product.id,
    name: product.name,
    priceCents: product.price_cents,
    internalRef: product.internal_ref,
    hasColor: product.has_color,
    hasSize: product.has_size,
  };
}

export function getActiveProduct(liveId: string): ActiveRapidProduct | null {
  return activeByLive.get(liveId) ?? null;
}

// Appelé au claim d'un live en mode rapid : charge le produit actif courant
// (s'il existe déjà) et s'assure que le canal Realtime partagé tourne.
export async function trackRapidLive(liveId: string, shopId: string) {
  const existing = trackedLives.get(liveId);
  if (existing) {
    existing.refCount += 1;
    return;
  }

  trackedLives.set(liveId, { liveId, shopId, refCount: 1 });
  const product = await loadActiveProduct(liveId);
  activeByLive.set(liveId, product);
  ensureRealtimeSubscription();

  if (product) await flushOrphanBuffer(liveId, product);
}

export function untrackRapidLive(liveId: string) {
  const existing = trackedLives.get(liveId);
  if (!existing) return;
  existing.refCount -= 1;
  if (existing.refCount <= 0) {
    trackedLives.delete(liveId);
    activeByLive.delete(liveId);
    orphanBuffer.delete(liveId);
  }
}

async function reloadActiveProduct(liveId: string) {
  if (!trackedLives.has(liveId)) return;
  const product = await loadActiveProduct(liveId);
  activeByLive.set(liveId, product);
  if (product) await flushOrphanBuffer(liveId, product);
}

// Un seul canal Realtime partagé par instance worker (même principe que
// worker/src/catalog.ts) : écoute les lives suivis en mode rapid, sur les
// deux tables dont dépend "quel produit est à l'antenne".
function ensureRealtimeSubscription() {
  if (realtimeChannel) return;

  realtimeChannel = supabase
    .channel("worker-rapid-product-tracking")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "lives" },
      (payload) => {
        const liveId = (payload.new as { id?: string })?.id;
        if (liveId && trackedLives.has(liveId)) reloadActiveProduct(liveId);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "live_products" },
      (payload) => {
        const liveId = (payload.new as { live_id?: string })?.live_id
          ?? (payload.old as { live_id?: string })?.live_id;
        if (liveId && trackedLives.has(liveId)) reloadActiveProduct(liveId);
      }
    )
    .subscribe((status) => {
      // Filet de sécurité : Realtime ne garantit pas la livraison, on
      // recharge tout à chaque (re)connexion pour rattraper un événement manqué.
      if (status === "SUBSCRIBED") {
        for (const liveId of trackedLives.keys()) reloadActiveProduct(liveId);
      }
    });
}

export function stopRapidRealtimeSubscription() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

// Met en attente un "jp" reçu alors que le produit actif de ce live n'est
// pas encore connu de ce worker.
export function bufferOrphanComment(orphan: OrphanRapidComment) {
  const list = orphanBuffer.get(orphan.liveId) ?? [];
  list.push(orphan);
  orphanBuffer.set(orphan.liveId, list);
}

async function flushOrphanBuffer(
  liveId: string,
  product: ActiveRapidProduct,
  onResolved?: (orphan: OrphanRapidComment, product: ActiveRapidProduct) => Promise<void>
) {
  const pending = orphanBuffer.get(liveId);
  if (!pending || pending.length === 0) return;
  orphanBuffer.delete(liveId);

  if (onResolved) {
    for (const orphan of pending) await onResolved(orphan, product);
  }
}

// Enregistre le callback de résolution appelé pour chaque orphelin qui se
// rattache à un produit désormais connu — évite une dépendance circulaire
// avec live-session.ts (qui a la logique d'écriture live_rapid_items).
let orphanResolvedCallback:
  | ((orphan: OrphanRapidComment, product: ActiveRapidProduct) => Promise<void>)
  | null = null;

export function onOrphanResolved(
  callback: (orphan: OrphanRapidComment, product: ActiveRapidProduct) => Promise<void>
) {
  orphanResolvedCallback = callback;
}

async function flushAllDueOrphans(onExpired: (orphan: OrphanRapidComment) => Promise<void>) {
  const now = Date.now();
  for (const [liveId, pending] of orphanBuffer.entries()) {
    const product = activeByLive.get(liveId);
    if (product && orphanResolvedCallback) {
      orphanBuffer.delete(liveId);
      for (const orphan of pending) await orphanResolvedCallback(orphan, product);
      continue;
    }

    const stillPending: OrphanRapidComment[] = [];
    const expired: OrphanRapidComment[] = [];
    for (const orphan of pending) {
      if (now - orphan.receivedAt >= config.rapidOrphanMaxAgeMs) {
        expired.push(orphan);
      } else {
        stillPending.push(orphan);
      }
    }

    if (stillPending.length > 0) orphanBuffer.set(liveId, stillPending);
    else orphanBuffer.delete(liveId);

    for (const orphan of expired) await onExpired(orphan);
  }
}

// Filet périodique (ex. toutes les secondes) : reconsulte le produit actif
// pour chaque live avec un tampon non vide (belt-and-suspenders si un
// événement Realtime a été manqué), et fait expirer les orphelins trop
// anciens en "à corriger" (jamais silencieusement perdus).
export function startRapidOrphanSweep(onExpired: (orphan: OrphanRapidComment) => Promise<void>) {
  return setInterval(() => {
    for (const liveId of orphanBuffer.keys()) {
      if (trackedLives.has(liveId)) reloadActiveProduct(liveId);
    }
    flushAllDueOrphans(onExpired);
  }, config.rapidOrphanRetryMs);
}
