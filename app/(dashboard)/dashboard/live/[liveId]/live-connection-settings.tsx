import { updateLiveTiktokUsername, updateLiveSaleKeywords } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";

export function LiveConnectionSettings({
  liveId,
  tiktokUsername,
  saleKeywords,
  workerId,
  heartbeatAt,
}: {
  liveId: string;
  tiktokUsername: string | null;
  saleKeywords: string[];
  workerId: string | null;
  heartbeatAt: string | null;
}) {
  const isConnected =
    !!workerId && !!heartbeatAt && Date.now() - new Date(heartbeatAt).getTime() <= 60_000;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Connexion TikTok LIVE</p>
        <Badge variant={isConnected ? "success" : "warning"} className="gap-1.5">
          <span
            className={
              isConnected
                ? "size-1.5 rounded-full bg-success-foreground"
                : "size-1.5 rounded-full bg-warning-foreground"
            }
          />
          {isConnected ? "Worker connecté" : "En attente de connexion"}
        </Badge>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        Aucun bouton à cliquer : dès que le live est actif, un worker s&apos;y connecte
        automatiquement. Ce statut se met à jour tout seul.
      </p>

      <form action={updateLiveTiktokUsername.bind(null, liveId)}>
        <Field>
          <FieldLabel htmlFor="tiktok_username">Pseudo TikTok pour ce live</FieldLabel>
          <div className="flex w-full gap-2">
            <Input
              id="tiktok_username"
              name="tiktok_username"
              defaultValue={tiktokUsername ?? ""}
              placeholder="@monshop"
              className="flex-1"
            />
            <Button type="submit" size="sm" variant="secondary">
              Enregistrer
            </Button>
          </div>
          <FieldDescription>
            Peut changer à chaque live (ex. compte différent, invité…). Pris en compte à la
            prochaine connexion du worker, pas en cours de session.
          </FieldDescription>
        </Field>
      </form>

      <form action={updateLiveSaleKeywords.bind(null, liveId)}>
        <Field>
          <FieldLabel htmlFor="sale_keywords">Mots-clés de vente</FieldLabel>
          <div className="flex w-full gap-2">
            <Input
              id="sale_keywords"
              name="sale_keywords"
              defaultValue={saleKeywords.join(", ")}
              placeholder="sold, vendu"
              className="flex-1"
            />
            <Button type="submit" size="sm" variant="secondary">
              Enregistrer
            </Button>
          </div>
          <FieldDescription>
            Séparés par des virgules. Un commentaire doit commencer par l&apos;un de ces mots
            pour être reconnu comme une vente. Pris en compte à la prochaine connexion du
            worker, pas en cours de session.
          </FieldDescription>
        </Field>
      </form>
    </div>
  );
}
