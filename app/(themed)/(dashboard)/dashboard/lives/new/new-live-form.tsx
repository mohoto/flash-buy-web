"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createAndStartLive, abandonFailedLive } from "../actions";
import { Radio } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";

type EulerStatus = "connecting" | "connected" | "failing";

// Le loader reste visible au moins ce temps-là même si la connexion réussit
// quasi instantanément — évite un flash "form -> loader -> console" trop
// abrupt qui donnerait l'impression que rien ne s'est passé.
const MIN_LOADER_MS = 3_000;
// Au-delà de ce délai sans jamais atteindre 'connected' ni 'failing' confirmé
// (ex. aucun worker disponible pour claim le live), on abandonne comme pour
// un échec Euler classique plutôt que de laisser le vendeur devant un loader
// indéfini.
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

// Remplace le formulaire pendant l'attente de connexion : souscrit à
// lives.euler_status pour CE live précis, avec un polling en filet de
// sécurité (même pattern que ConnectionStatusProvider, cf.
// live-connection-settings.tsx) — pas de contexte partagé ici, ce composant
// est monté seul, une fois par tentative.
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
    const mountedAt = Date.now();
    const supabase = createClient();

    const resolveConnected = () => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      const elapsed = Date.now() - mountedAt;
      const remaining = Math.max(0, MIN_LOADER_MS - elapsed);
      setTimeout(() => router.push(`/dashboard/live/${liveId}`), remaining);
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

    const channel = supabase
      .channel(`live-connecting-${liveId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lives", filter: `id=eq.${liveId}` },
        (payload) => {
          const next = payload.new as { euler_status: EulerStatus; euler_last_error: string | null };
          if (next.euler_status === "connected") resolveConnected();
          if (next.euler_status === "failing") {
            resolveFailed(next.euler_last_error ?? "La connexion TikTok a échoué.");
          }
        }
      )
      .subscribe();

    // Filet de sécurité : comble un événement Realtime manqué (même pattern
    // que ConnectionStatusProvider).
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from("lives")
        .select("euler_status, euler_last_error")
        .eq("id", liveId)
        .single();
      if (!data) return;
      if (data.euler_status === "connected") resolveConnected();
      if (data.euler_status === "failing") {
        resolveFailed(data.euler_last_error ?? "La connexion TikTok a échoué.");
      }
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
      <Spinner className="size-8 text-muted-foreground" />
      <div>
        <p className="font-medium text-foreground">Connexion au live en cours…</p>
        <p className="text-sm text-muted-foreground">
          Vérification de la connexion TikTok, quelques secondes.
        </p>
      </div>
    </div>
  );
}
