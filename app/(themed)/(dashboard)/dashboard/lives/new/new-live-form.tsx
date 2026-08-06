"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createAndStartLive, abandonFailedLive } from "../actions";
import { Radio } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";

type EulerStatus = "connecting" | "connected" | "failing";

// Un worker heartbeat toutes les HEARTBEAT_INTERVAL_MS (15s par défaut côté
// worker, cf. worker/src/config.ts) — un heartbeat plus vieux que ça veut
// dire soit que le worker n'a pas encore eu le temps de heartbeat une
// première fois, soit qu'il a planté depuis. Marge généreuse (30s) pour ne
// pas déclarer un worker "mort" par excès de zèle juste après le claim.
const HEARTBEAT_FRESH_MS = 30_000;
// Au-delà de ce délai sans jamais atteindre une connexion confirmée (euler_status
// = 'connected' ET heartbeat récent ET live toujours "live"), on abandonne
// comme pour un échec Euler classique plutôt que de laisser le vendeur devant
// un loader indéfini.
const CONNECTING_TIMEOUT_MS = 15_000;

type Phase =
  | { name: "form"; error: string | null }
  | { name: "connecting"; liveId: string };

// Crée le live et attend une confirmation réelle de connexion TikTok avant de
// naviguer vers la console — auparavant, le formulaire redirigeait dès la
// création du live (status="live"), avant même que le worker n'ait tenté quoi
// que ce soit côté Euler ; un pseudo invalide (ex. "/" de fin) redirigeait
// vers une console qui restait indéfiniment vide, sans jamais l'expliquer.
// cf. lives.euler_status (worker/src/live-session.ts markEulerConnected/
// markEulerFailing).
export function NewLiveForm({
  tiktokUsername,
  saleKeywords,
  rapidIntentSeq,
}: {
  tiktokUsername: string | null;
  saleKeywords: string[];
  rapidIntentSeq: number;
}) {
  const [phase, setPhase] = useState<Phase>({ name: "form", error: null });
  // Conserve la dernière saisie du vendeur (pas la valeur d'origine) pour
  // pré-remplir le formulaire après un échec — il vient peut-être de corriger
  // une faute de frappe, il ne faut pas revenir à l'ancienne valeur.
  const [lastValues, setLastValues] = useState({
    tiktokUsername: tiktokUsername ?? "",
    startNumber: rapidIntentSeq + 1,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setLastValues({
      tiktokUsername: String(formData.get("tiktok_handle") ?? ""),
      startNumber: Number(formData.get("start_number") ?? 0),
    });

    const result = await createAndStartLive(formData);
    setIsSubmitting(false);

    if ("error" in result) {
      setPhase({ name: "form", error: result.error });
      return;
    }

    setPhase({ name: "connecting", liveId: result.liveId });
  }

  if (phase.name === "connecting") {
    return (
      <ConnectingState
        liveId={phase.liveId}
        onFailed={(message) => setPhase({ name: "form", error: message })}
      />
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-5">
      {phase.error && (
        <Alert variant="error">
          <AlertTitle>La connexion n&apos;a pas pu être établie</AlertTitle>
          <AlertDescription>{phase.error}</AlertDescription>
        </Alert>
      )}

      <Field>
        <FieldLabel htmlFor="tiktok_handle">Pseudo TikTok pour ce live</FieldLabel>
        <Input
          id="tiktok_handle"
          name="tiktok_handle"
          defaultValue={lastValues.tiktokUsername}
          placeholder="@monshop"
          size="lg"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          className="**:data-[slot=input]:h-11 **:data-[slot=input]:text-base **:data-[slot=input]:leading-11"
        />
        <FieldDescription>
          Peut changer à chaque live (ex. compte différent, invité…). Un « @ », une URL TikTok
          collée ou un « / » de fin sont nettoyés automatiquement.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="start_number">Prochaine étiquette</FieldLabel>
        <Input
          id="start_number"
          name="start_number"
          type="number"
          min={1}
          step="1"
          defaultValue={lastValues.startNumber}
          nativeInput
        />
        <FieldDescription>
          Par défaut, la numérotation des étiquettes démarre à 100.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>Mots-clés de vente</FieldLabel>
        {saleKeywords.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {saleKeywords.map((keyword) => (
              <Badge
                key={keyword}
                variant="secondary"
                size="lg"
                className="min-w-16 justify-center text-xl sm:min-w-16"
              >
                {keyword}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucun mot-clé réglé.</p>
        )}
        <FieldDescription>
          Réglables dans Réglages → Mots-clés de vente, valables pour tous les lives de la
          boutique.
        </FieldDescription>
      </Field>

      <Button type="submit" size="xl" className="h-12 rounded-full" disabled={isSubmitting}>
        <Radio />
        Connexion au live
      </Button>
    </form>
  );
}

type LiveConnectionRow = {
  status: string;
  heartbeat_at: string | null;
  euler_status: EulerStatus;
  euler_last_error: string | null;
};

function isHeartbeatFresh(heartbeatAt: string | null): boolean {
  return !!heartbeatAt && Date.now() - new Date(heartbeatAt).getTime() <= HEARTBEAT_FRESH_MS;
}

// Remplace le formulaire pendant l'attente de connexion : souscrit à la ligne
// `lives` de CE live précis, avec un polling en filet de sécurité (même
// pattern que ConnectionStatusProvider, cf. live-connection-settings.tsx) —
// pas de contexte partagé ici, ce composant est monté seul, une fois par
// tentative.
//
// La connexion n'est considérée établie que si LES TROIS sont vrais en même
// temps : euler_status = 'connected' (une vraie frame de contenu du live a
// été reçue, cf. worker/src/euler.ts onFrameReceived), le live existe
// toujours avec status = 'live' (pas terminé entre-temps, ex. NOT_LIVE
// détecté juste après un faux "connected" — cf. bug du 2026-08-06 où une
// frame technique "workerInfo" avait déclenché 'connected' juste avant un
// NOT_LIVE), et le heartbeat du worker est récent (le process qui gère cette
// connexion est réellement vivant, pas juste un dernier état écrit avant de
// planter). euler_status seul ne suffit pas : rien ne garantit qu'il reste
// vrai dans la seconde qui suit sans vérifier que le worker est toujours là.
function ConnectingState({
  liveId,
  onFailed,
}: {
  liveId: string;
  onFailed: (message: string) => void;
}) {
  const router = useRouter();
  // Empêche toute action une fois qu'une résolution (succès/échec/timeout) a
  // déjà été traitée — plusieurs sources (Realtime, polling, timers) peuvent
  // sinon la déclencher deux fois.
  const resolvedRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    const resolveConnected = () => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      router.push(`/dashboard/live/${liveId}`);
    };

    const resolveFailed = (message: string) => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      // Pas d'attente ici (contrairement au succès) : un échec doit rendre la
      // main tout de suite pour corriger et resoumettre — cf. décision de
      // marquer le live "ended" en arrière-plan plutôt que d'attendre sa
      // confirmation (worker/src/index.ts heartbeat, jusqu'à 15s).
      abandonFailedLive(liveId);
      onFailed(message);
    };

    const evaluate = (row: LiveConnectionRow) => {
      if (resolvedRef.current) return;
      if (row.status !== "live") {
        // Le live a été terminé entre-temps (ex. NOT_LIVE juste après un
        // 'connected' prématuré, ou le vendeur/worker l'a arrêté) — jamais
        // une vraie connexion établie, même si euler_status avait pu passer
        // à 'connected' un instant avant.
        resolveFailed(row.euler_last_error ?? "Le live TikTok n'est plus actif.");
        return;
      }
      if (row.euler_status === "failing") {
        resolveFailed(row.euler_last_error ?? "La connexion TikTok a échoué.");
        return;
      }
      if (row.euler_status === "connected" && isHeartbeatFresh(row.heartbeat_at)) {
        resolveConnected();
      }
    };

    const channel = supabase
      .channel(`live-connecting-${liveId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lives", filter: `id=eq.${liveId}` },
        (payload) => evaluate(payload.new as LiveConnectionRow)
      )
      .subscribe();

    // Filet de sécurité : comble un événement Realtime manqué (même pattern
    // que ConnectionStatusProvider) — sert aussi à réévaluer isHeartbeatFresh
    // au fil du temps même sans nouvel UPDATE (un heartbeat qui vieillit sans
    // jamais être renouvelé doit finir par ne plus être considéré "frais").
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from("lives")
        .select("status, heartbeat_at, euler_status, euler_last_error")
        .eq("id", liveId)
        .maybeSingle();
      if (!data) {
        // Le live a disparu (ex. abandonné par une autre voie) — rien à
        // récupérer, retour au formulaire.
        resolveFailed("Le live a été interrompu, réessaie.");
        return;
      }
      evaluate(data as LiveConnectionRow);
    }, 2_000);

    const timeout = setTimeout(() => {
      resolveFailed(
        "La connexion prend plus de temps que prévu. Vérifie le pseudo TikTok puis réessaie."
      );
    }, CONNECTING_TIMEOUT_MS);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      clearTimeout(timeout);
    };
  }, [liveId, onFailed, router]);

  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <div className="relative size-12">
        <div className="absolute size-12 rounded-full border-8 border-solid border-gray-200" />
        <div className="absolute size-12 animate-spin rounded-full border-8 border-solid border-green-500 border-t-transparent" />
      </div>
      <div>
        <p className="font-medium text-foreground">Connexion au live en cours…</p>
        <p className="text-sm text-muted-foreground">
          Vérification de la connexion TikTok, quelques secondes.
        </p>
      </div>
    </div>
  );
}
