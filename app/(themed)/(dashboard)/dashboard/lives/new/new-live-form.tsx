"use client";

import { createAndStartLive } from "../actions";
import { Radio } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";

// Formulaire de mise en route d'un nouveau live : pseudo TikTok, étiquette de
// départ et mots-clés de vente se règlent en un seul submit qui crée ET
// démarre le live (createAndStartLive) — le worker ne réclame un live que sur
// status = 'live' (cf. worker/src/sharding.ts claimNextLive), donc rien ne se
// connecte à Euler avant ce clic. Le mode est toujours "rapid" (fixé côté
// serveur), plus de choix ici.
export function NewLiveForm({
  tiktokUsername,
  saleKeywords,
  rapidIntentSeq,
}: {
  tiktokUsername: string | null;
  saleKeywords: string[];
  rapidIntentSeq: number;
}) {
  return (
    <form action={createAndStartLive} className="flex flex-col gap-5">
      <Field>
        <FieldLabel htmlFor="tiktok_handle">Pseudo TikTok pour ce live</FieldLabel>
        <Input
          id="tiktok_handle"
          name="tiktok_handle"
          defaultValue={tiktokUsername ?? ""}
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
          defaultValue={rapidIntentSeq + 1}
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

      <Button type="submit" size="xl" className="h-12 rounded-full">
        <Radio />
        Connexion au live
      </Button>
    </form>
  );
}
