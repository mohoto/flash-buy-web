"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { StatusBadge } from "./status-badge";

const WORKER_STALE_MS = 60_000;
const POLL_INTERVAL_MS = 10_000;

type EulerStatus = "connecting" | "connected" | "failing";

type ConnectionRow = {
  workerId: string | null;
  heartbeatAt: string | null;
  eulerStatus: EulerStatus;
  eulerLastError: string | null;
};

function isWorkerActive(workerId: string | null, heartbeatAt: string | null): boolean {
  return (
    !!workerId && !!heartbeatAt && Date.now() - new Date(heartbeatAt).getTime() <= WORKER_STALE_MS
  );
}

const ConnectionStatusContext = createContext<(ConnectionRow & { workerActive: boolean }) | null>(
  null
);

// Un seul abonnement Realtime par live, partagé par ConnectionStatusBadge et
// EulerFailureAlert via le contexte ci-dessous — Supabase réutilise le canal
// déjà créé pour un même nom (`live-connection-${liveId}`), donc deux hooks
// indépendants appelant chacun .channel(...).on(...).subscribe() sur ce même
// nom levaient "cannot add postgres_changes callbacks ... after subscribe()"
// dès que badge et alerte étaient montés en même temps (cf. page.tsx).
//
// Combine aussi deux signaux distincts en un seul état : le heartbeat worker
// (lives.worker_id/heartbeat_at, "le process a bien ce live en charge") et
// euler_status (lives.euler_status, "la websocket TikTok fonctionne
// réellement"). Un worker peut heartbeat normalement tout en échouant en
// boucle à se connecter à Euler (ex. pseudo TikTok invalide) — avant, le
// badge "Worker connecté" restait vert dans ce cas, alors qu'aucun
// commentaire n'arrivait jamais. cf. worker/src/live-session.ts
// (markEulerConnected/markEulerFailing).
export function ConnectionStatusProvider({
  liveId,
  workerId,
  heartbeatAt,
  eulerStatus,
  eulerLastError,
  children,
}: {
  liveId: string;
  workerId: string | null;
  heartbeatAt: string | null;
  eulerStatus: EulerStatus;
  eulerLastError: string | null;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<ConnectionRow>({
    workerId,
    heartbeatAt,
    eulerStatus,
    eulerLastError,
  });

  // Sans cet abonnement, l'état reste figé sur ce qui a été lu au chargement
  // de la page tant qu'aucune Server Action ne redéclenche un rendu.
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`live-connection-${liveId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lives", filter: `id=eq.${liveId}` },
        (payload) => {
          const next = payload.new as {
            worker_id: string | null;
            heartbeat_at: string | null;
            euler_status: EulerStatus;
            euler_last_error: string | null;
          };
          setState({
            workerId: next.worker_id,
            heartbeatAt: next.heartbeat_at,
            eulerStatus: next.euler_status,
            eulerLastError: next.euler_last_error,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveId]);

  // Filet de sécurité : le canal postgres_changes ci-dessus peut rater des
  // événements ou rester silencieux après une reconnexion WebSocket ratée
  // côté navigateur, laissant l'état figé sur un statut périmé — un polling
  // régulier comble ces trous.
  useEffect(() => {
    const supabase = createClient();

    const poll = async () => {
      const { data } = await supabase
        .from("lives")
        .select("worker_id, heartbeat_at, euler_status, euler_last_error")
        .eq("id", liveId)
        .single();
      if (data) {
        setState({
          workerId: data.worker_id,
          heartbeatAt: data.heartbeat_at,
          eulerStatus: data.euler_status as EulerStatus,
          eulerLastError: data.euler_last_error,
        });
      }
    };

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [liveId]);

  // isWorkerActive dépend de Date.now(), donc redevient obsolète avec le
  // temps même sans nouvel événement Realtime (ex. le worker plante sans
  // jamais renvoyer d'UPDATE) — force un nouveau rendu périodique pour le
  // réévaluer.
  const [, forceRerender] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceRerender((n) => n + 1), 5_000);
    return () => clearInterval(interval);
  }, []);

  const workerActive = isWorkerActive(state.workerId, state.heartbeatAt);

  return (
    <ConnectionStatusContext.Provider value={{ ...state, workerActive }}>
      {children}
    </ConnectionStatusContext.Provider>
  );
}

function useConnectionStatus() {
  const value = useContext(ConnectionStatusContext);
  if (!value) {
    throw new Error("useConnectionStatus must be used within a ConnectionStatusProvider");
  }
  return value;
}

// Badge compact destiné à l'en-tête de la page une fois le live connecté :
// évite de garder un encart entier juste pour un statut, une fois qu'il n'y a
// plus de formulaire à afficher. Un seul badge, un seul état vrai à la fois :
// pas de worker -> pas de connexion Euler possible -> pas de commentaire, la
// cause la plus en amont prime toujours sur les suivantes. Doit être monté
// sous ConnectionStatusProvider (cf. page.tsx).
export function ConnectionStatusBadge() {
  const status = useConnectionStatus();

  if (!status.workerActive) {
    return <StatusBadge variant="warning">Aucun worker connecté</StatusBadge>;
  }
  if (status.eulerStatus === "failing") {
    return <StatusBadge variant="destructive">Connexion TikTok en échec</StatusBadge>;
  }
  if (status.eulerStatus === "connecting") {
    return <StatusBadge variant="warning">Connexion en cours…</StatusBadge>;
  }
  return (
    <StatusBadge variant="success" className="bg-[#00F2EA] text-black">
      Connecté
    </StatusBadge>
  );
}

// Bandeau affiché avant les sections commentaires/produits/intentions
// (cf. page.tsx) dès que la connexion TikTok échoue — indépendant du badge
// ci-dessus, pour que le vendeur comprenne immédiatement pourquoi rien ne
// s'affiche plutôt que de découvrir un live silencieux après coup. cf. bug du
// 2026-08-05 : un pseudo TikTok mal saisi (URL collée avec un "/" de fin)
// faisait échouer Euler en boucle (close_4400/INVALID_OPTIONS) sans aucun
// signal visible côté dashboard. Doit être monté sous
// ConnectionStatusProvider (cf. page.tsx).
export function EulerFailureAlert() {
  const status = useConnectionStatus();

  if (status.eulerStatus !== "failing") return null;

  return (
    <Alert variant="error">
      <TriangleAlert />
      <AlertTitle>La connexion TikTok ne s&apos;établit pas</AlertTitle>
      <AlertDescription>
        <p>
          Les commentaires, produits et intentions d&apos;achat ne peuvent pas s&apos;afficher
          tant que cette connexion échoue.
          {status.eulerLastError && (
            <>
              {" "}
              Erreur : <span className="font-medium text-foreground">{status.eulerLastError}</span>
            </>
          )}
        </p>
        <p>
          Vérifie le pseudo TikTok réglé pour ce live (sans « @ », sans URL, sans « / » final) puis
          relance la connexion.
        </p>
      </AlertDescription>
    </Alert>
  );
}

// Le formulaire de mise en route (pseudo TikTok, étiquette de départ,
// mots-clés) vit désormais sur /dashboard/lives/new (cf. NewLiveForm), qui
// crée le live déjà en status="live" — il n'y a plus d'étape "scheduled" à
// configurer depuis cette page.
