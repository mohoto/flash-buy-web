"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "./status-badge";

const POLL_INTERVAL_MS = 10_000;

// Même pattern que ConnectionStatusBadge (live-connection-settings.tsx) :
// sans souscription + polling, ce badge resterait figé sur le status lu au
// chargement de la page (Server Component) — un live qui se termine côté
// worker (ex. TikTok signale NOT_LIVE) sans que le vendeur ne recharge la
// page affichait alors "En live" indéfiniment, incohérent avec
// ConnectionStatusBadge qui, lui, se met à jour et bascule sur "En attente
// de connexion".
function useLiveStatus(liveId: string, initialStatus: string) {
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`live-status-${liveId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lives", filter: `id=eq.${liveId}` },
        (payload) => {
          const next = payload.new as { status: string };
          setStatus(next.status);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveId]);

  // Filet de sécurité : comble les événements Realtime manqués ou un canal
  // resté silencieux après une reconnexion WebSocket ratée côté navigateur.
  useEffect(() => {
    const supabase = createClient();

    const poll = async () => {
      const { data } = await supabase.from("lives").select("status").eq("id", liveId).single();
      if (data) setStatus(data.status);
    };

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [liveId]);

  return status;
}

export function LiveBadge({ liveId, initialStatus }: { liveId: string; initialStatus: string }) {
  const status = useLiveStatus(liveId, initialStatus);

  if (status !== "live") return null;

  return (
    <StatusBadge variant="default" className="gap-1.5 pl-2 uppercase tracking-wide">
      <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary-foreground" />
      Live
    </StatusBadge>
  );
}
