"use client";

import { useState } from "react";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { Iphone } from "@/components/ui/iphone";
import { Button } from "@/components/ui/button";

export function TiktokPanel({ tiktokUsername }: { tiktokUsername: string | null }) {
  const [iframeFailed, setIframeFailed] = useState(false);
  const liveUrl = tiktokUsername ? `https://www.tiktok.com/@${tiktokUsername}/live` : null;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full text-center">
        <p className="text-sm font-medium text-foreground">Live TikTok</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          TikTok bloque souvent l&apos;affichage intégré : si l&apos;écran reste blanc,
          utilise le bouton ci-dessous.
        </p>
      </div>

      {!tiktokUsername ? (
        <p className="text-center text-sm text-muted-foreground">
          Aucun pseudo TikTok renseigné. Ajoute-le depuis les réglages de la boutique.
        </p>
      ) : (
        <div className="w-full max-w-55">
          <Iphone
            screen={
              iframeFailed ? (
                <div className="flex size-full flex-col items-center justify-center gap-2 bg-muted px-4 text-center">
                  <TriangleAlert className="size-5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    TikTok bloque l&apos;affichage intégré du live.
                  </p>
                </div>
              ) : (
                <iframe
                  src={liveUrl!}
                  title="Live TikTok"
                  className="size-full border-0"
                  allow="autoplay; encrypted-media"
                  onError={() => setIframeFailed(true)}
                />
              )
            }
          />
        </div>
      )}

      {liveUrl && (
        <Button variant="secondary" size="sm" render={<a href={liveUrl} target="_blank" rel="noreferrer" />}>
          Ouvrir sur TikTok
          <ExternalLink />
        </Button>
      )}
    </div>
  );
}
