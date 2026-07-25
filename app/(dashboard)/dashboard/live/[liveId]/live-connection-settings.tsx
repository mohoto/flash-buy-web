"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveConnectionAndStart } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { RadioGroup, Radio } from "@/components/ui/radio-group";
import { StatusBadge } from "./status-badge";

const WORKER_STALE_MS = 60_000;

function isWorkerActive(workerId: string | null, heartbeatAt: string | null): boolean {
  return (
    !!workerId && !!heartbeatAt && Date.now() - new Date(heartbeatAt).getTime() <= WORKER_STALE_MS
  );
}

function useWorkerConnection(
  liveId: string,
  initialWorkerId: string | null,
  initialHeartbeatAt: string | null
) {
  const [workerId, setWorkerId] = useState(initialWorkerId);
  const [heartbeatAt, setHeartbeatAt] = useState(initialHeartbeatAt);
  const isConnected = isWorkerActive(workerId, heartbeatAt);

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
          const next = payload.new as { worker_id: string | null; heartbeat_at: string | null };
          setWorkerId(next.worker_id);
          setHeartbeatAt(next.heartbeat_at);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveId]);

  // isConnected dépend de Date.now(), donc redevient obsolète avec le temps
  // même sans nouvel événement Realtime (ex. le worker plante sans jamais
  // renvoyer d'UPDATE) — force un nouveau rendu périodique pour le réévaluer.
  const [, forceRerender] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceRerender((n) => n + 1), 5_000);
    return () => clearInterval(interval);
  }, []);

  return isConnected;
}

// Badge compact destiné à l'en-tête de la page une fois le live connecté :
// évite de garder un encart entier juste pour un statut, une fois qu'il n'y a
// plus de formulaire à afficher.
export function ConnectionStatusBadge({
  liveId,
  workerId,
  heartbeatAt,
}: {
  liveId: string;
  workerId: string | null;
  heartbeatAt: string | null;
}) {
  const isConnected = useWorkerConnection(liveId, workerId, heartbeatAt);

  return (
    <StatusBadge variant={isConnected ? "success" : "warning"}>
      {isConnected ? "Worker connecté" : "En attente de connexion"}
    </StatusBadge>
  );
}

// Formulaire de mise en route, affiché tant que le live n'a pas démarré
// (status = "scheduled") : pseudo, mots-clés et mode se règlent en un seul
// submit qui lance aussi la connexion — le worker ne réclame le live qu'à
// partir de status = "live" (cf. worker/src/sharding.ts claimNextLive), donc
// rien ne se connecte à Euler avant ce clic.
export function LiveConnectionForm({
  liveId,
  tiktokUsername,
  saleKeywords,
  mode,
}: {
  liveId: string;
  tiktokUsername: string | null;
  saleKeywords: string[];
  mode: string;
}) {
  return (
    <form action={saveConnectionAndStart.bind(null, liveId)} className="flex flex-col gap-5">
      <Field>
        <FieldLabel htmlFor="tiktok_username">Pseudo TikTok pour ce live</FieldLabel>
        <Input
          id="tiktok_username"
          name="tiktok_username"
          defaultValue={tiktokUsername ?? ""}
          placeholder="@monshop"
        />
        <FieldDescription>
          Peut changer à chaque live (ex. compte différent, invité…).
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="sale_keywords">Mots-clés de vente</FieldLabel>
        <Input
          id="sale_keywords"
          name="sale_keywords"
          defaultValue={saleKeywords.join(", ")}
          placeholder="sold, vendu"
        />
        <FieldDescription>
          Séparés par des virgules. Un commentaire doit contenir l&apos;un de ces mots pour être
          reconnu comme une vente.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>Produits</FieldLabel>
        <RadioGroup name="mode" defaultValue={mode} className="gap-2.5">
          <label className="flex items-start gap-2.5 text-sm text-foreground">
            <Radio value="catalog" className="mt-0.5" />
            <span>
              <span className="block font-medium">Catalogue</span>
              <span className="block text-xs text-muted-foreground">
                Les commentaires sont comparés aux produits déjà en ligne.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-sm text-foreground">
            <Radio value="freeform" className="mt-0.5" />
            <span>
              <span className="block font-medium">Création à la volée</span>
              <span className="block text-xs text-muted-foreground">
                Aucun produit associé automatiquement : les commentaires reconnus
                s&apos;affichent bruts, à toi de créer le produit et de l&apos;associer ensuite.
              </span>
            </span>
          </label>
        </RadioGroup>
      </Field>

      <Button type="submit">Connexion</Button>
    </form>
  );
}
