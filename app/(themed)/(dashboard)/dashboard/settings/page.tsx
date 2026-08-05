import { Radio as RadioIcon, Tags, ShoppingBag, Link2 } from "lucide-react";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";
import { updateLiveSettings, updateOrderGuardrails, updateSaleKeywords } from "./actions";
import { CopyLinkButton } from "./copy-link-button";
import { KeywordsInput } from "./keywords-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, Radio } from "@/components/ui/radio-group";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_slug: "Le lien ne peut contenir que des lettres minuscules, chiffres et tirets.",
  slug_taken: "Ce lien est déjà utilisé par une autre boutique.",
  update_failed: "La mise à jour a échoué, réessaie.",
  invalid_ceiling: "Merci d'indiquer un montant plafond valide.",
};

const EXPIRY_OPTIONS = [
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 heure" },
  { value: "120", label: "2 heures" },
  { value: "240", label: "4 heures" },
  { value: "360", label: "6 heures" },
  { value: "720", label: "12 heures" },
  { value: "1440", label: "24 heures" },
  { value: "midnight", label: "Jusqu'à minuit" },
  { value: "", label: "Toujours (pas de limite)" },
];

// Icône colorée dans un carré arrondi + titre en majuscules + description,
// en-tête commun à toutes les cards de cette page (cf. maquette "Terre de
// Parfums" fournie par l'utilisateur).
function SettingSectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Icon className="size-4.5" />
      </span>
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const shop = await getOwnShop();
  const { saved, error } = await searchParams;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const liveLink = shop.cart_slug ? `${appUrl}/cart/${shop.cart_slug}` : null;

  const expiryDefaultValue =
    shop.pending_order_expiry_minutes === null
      ? ""
      : shop.pending_order_expiry_minutes === -1
        ? "midnight"
        : String(shop.pending_order_expiry_minutes);

  return (
    <div className="flex max-w-lg flex-col gap-6">
      {saved && (
        <Alert variant="success">
          <AlertDescription>Réglages enregistrés.</AlertDescription>
        </Alert>
      )}
      {error && ERROR_MESSAGES[error] && (
        <Alert variant="error">
          <AlertDescription>{ERROR_MESSAGES[error]}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="flex flex-col gap-5 p-5">
          <SettingSectionHeader
            icon={RadioIcon}
            title="Connexion au live"
            description="Pseudo TikTok et lien de panier fixe de la boutique."
          />

          <form action={updateLiveSettings} className="flex flex-col gap-4 border-t border-dashed pt-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tiktok_username">Pseudo TikTok</Label>
              <Input
                id="tiktok_username"
                name="tiktok_username"
                defaultValue={shop.tiktok_username ?? ""}
                placeholder="@monshop"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cart_slug">Lien de panier (fixe)</Label>
              <Input
                id="cart_slug"
                name="cart_slug"
                defaultValue={shop.cart_slug ?? ""}
                placeholder="boutique-julie"
              />
              <p className="text-xs text-muted-foreground">
                C&apos;est le seul lien à mettre en bio TikTok. Il ne change pas entre les lives.
              </p>
            </div>
            <Button type="submit" className="mt-1 self-start">
              Enregistrer
            </Button>
          </form>
        </CardContent>
      </Card>

      {liveLink && (
        <Card>
          <CardContent className="flex flex-col gap-5 p-5">
            <SettingSectionHeader
              icon={Link2}
              title="Lien du panier"
              description="Le lien public de panier à partager avec tes acheteurs."
            />
            <div className="flex items-center justify-between gap-3 rounded-md border border-dashed p-3">
              <code className="truncate text-sm text-foreground">{liveLink}</code>
              <CopyLinkButton link={liveLink} />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col gap-5 p-5">
          <SettingSectionHeader
            icon={Tags}
            title="Mots-clés de vente"
            description="Valables pour tous les lives de la boutique. Un commentaire doit contenir l'un de ces mots pour être reconnu comme une intention d'achat."
          />

          <form action={updateSaleKeywords} className="flex flex-col gap-4 border-t border-dashed pt-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sale_keywords">Mots-clés</Label>
              <KeywordsInput id="sale_keywords" name="sale_keywords" defaultKeywords={shop.sale_keywords} />
              <p className="text-xs text-muted-foreground">
                Entrée ou virgule pour ajouter un mot-clé.
              </p>
            </div>
            <Button type="submit" className="mt-1 self-start">
              Enregistrer
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-5 p-5">
          <SettingSectionHeader
            icon={ShoppingBag}
            title="Commandes en direct"
            description="Réglages appliqués au mode rapide, sur tous tes lives."
          />

          <form
            action={updateOrderGuardrails}
            className="flex flex-col gap-5 border-t border-dashed pt-5"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pending_order_expiry">Délai avant &quot;Délai dépassé&quot;</Label>
              <Select name="pending_order_expiry" defaultValue={expiryDefaultValue}>
                <SelectTrigger id="pending_order_expiry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Une commande &quot;En attente&quot; sans nouveau produit ajouté depuis ce délai est
                signalée &quot;Délai dépassé&quot; dans la console live.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Acheteur avec une commande impayée</Label>
              <RadioGroup name="unpaid_order_restriction" defaultValue={shop.unpaid_order_restriction}>
                <label className="flex items-start gap-2.5 text-sm text-foreground">
                  <Radio value="none" className="mt-0.5" />
                  <span>
                    <span className="block font-medium">Aucune restriction</span>
                    <span className="block text-xs text-muted-foreground">
                      Le vendeur peut toujours ajouter des produits, même si un achat précédent
                      n&apos;est pas payé.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 text-sm text-foreground">
                  <Radio value="block" className="mt-0.5" />
                  <span>
                    <span className="block font-medium">Bloquer tant que non payé</span>
                    <span className="block text-xs text-muted-foreground">
                      Impossible d&apos;ajouter un produit à un acheteur qui a déjà une commande en
                      attente sur ce live.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 text-sm text-foreground">
                  <Radio value="ceiling" className="mt-0.5" />
                  <span>
                    <span className="block font-medium">Autoriser jusqu&apos;à un montant</span>
                    <span className="block text-xs text-muted-foreground">
                      Ajout autorisé tant que le total cumulé ne dépasse pas le montant ci-dessous.
                    </span>
                  </span>
                </label>
              </RadioGroup>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="unpaid_order_ceiling">Montant plafond (€)</Label>
              <Input
                id="unpaid_order_ceiling"
                name="unpaid_order_ceiling"
                type="number"
                step="0.01"
                min="0"
                nativeInput
                defaultValue={
                  shop.unpaid_order_ceiling_cents !== null
                    ? (shop.unpaid_order_ceiling_cents / 100).toFixed(2)
                    : ""
                }
              />
              <p className="text-xs text-muted-foreground">
                Utilisé uniquement si &quot;Autoriser jusqu&apos;à un montant&quot; est sélectionné
                ci-dessus.
              </p>
            </div>

            <Button type="submit" className="mt-1 self-start">
              Enregistrer
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
