import { Home, MapPin } from "lucide-react";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { toggleShippingMethodGroup } from "./actions";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShippingMethodToggle } from "./shipping-method-toggle";

// Même en-tête que /dashboard/settings (icône colorée + titre + description) :
// dupliqué localement plutôt qu'extrait en composant partagé, pour ne pas
// coupler deux dossiers de settings pour un si petit bloc de présentation.
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

type ShippingGroup = { groupKey: string; displayName: string; carrier: string; isActive: boolean };

// Description + tarif d'exemple pour un colis de 0.5-1kg (relevé sur le
// compte Sendcloud à titre indicatif — les tarifs réels varient selon la
// tranche de poids exacte du panier, calculés en direct côté acheteur).
const GROUP_INFO: Record<string, { description: string; examplePriceLabel: string }> = {
  colissimo_home: {
    description: "Livraison à domicile",
    examplePriceLabel: "Ex. colis 0,5-1 kg : 9,85 €",
  },
  colissimo_home_signature: {
    description: "Livraison à domicile avec signature",
    examplePriceLabel: "Ex. colis 0,5-1 kg : 11,04 €",
  },
  chrono_shop2shop: {
    description: "Livraison en point relais",
    examplePriceLabel: "Ex. colis 0,5-1 kg : 4,00 €",
  },
  mondial_relay_point_relais_qr: {
    description: "Livraison en point relais avec QR code",
    examplePriceLabel: "Ex. colis 0,5-1 kg : 4,39 €",
  },
  mondial_relay_point_relais: {
    description: "Livraison en point relais",
    examplePriceLabel: "Ex. colis 0,5-1 kg : 4,39 €",
  },
  mondial_relay_locker: {
    description: "Retrait en consigne automatique (casier)",
    examplePriceLabel: "Ex. colis 0,5-1 kg : 4,29 €",
  },
};

export default async function ShippingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const supabase = createServiceRoleClient();

  const { data: variants } = await supabase
    .from("shipping_method_variants")
    .select("group_key, display_name, carrier, is_active, position, requires_service_point")
    .order("position", { ascending: true });

  // Un groupe = plusieurs lignes (tranches de poids) partageant group_key ;
  // is_active du groupe = true si au moins une tranche est active (toutes
  // les lignes d'un même groupe sont togglées ensemble par l'action).
  // requires_service_point sépare les groupes livrés à domicile de ceux en
  // point relais/consigne — identique pour toutes les tranches d'un groupe.
  const { homeGroups, pickupGroups } = (variants ?? []).reduce<{
    homeGroups: Record<string, ShippingGroup>;
    pickupGroups: Record<string, ShippingGroup>;
  }>(
    (acc, v) => {
      const bucket = v.requires_service_point ? acc.pickupGroups : acc.homeGroups;
      bucket[v.group_key] ??= {
        groupKey: v.group_key,
        displayName: v.display_name,
        carrier: v.carrier,
        isActive: false,
      };
      if (v.is_active) bucket[v.group_key].isActive = true;
      return acc;
    },
    { homeGroups: {}, pickupGroups: {} }
  );

  return (
    <div className="flex max-w-lg flex-col gap-6">
      {saved && (
        <Alert variant="success">
          <AlertDescription>Réglages enregistrés.</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="error">
          <AlertDescription>La mise à jour a échoué, réessaie.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="flex flex-col gap-5 p-5">
          <SettingSectionHeader
            icon={Home}
            title="Livraison à domicile"
            description="Modes d'envoi livrés directement chez l'acheteur."
          />
          <div className="flex flex-col gap-4 border-t border-dashed pt-5">
            {Object.values(homeGroups).length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun mode de livraison à domicile configuré.</p>
            ) : (
              Object.values(homeGroups).map((group) => (
                <ShippingMethodToggle
                  key={group.groupKey}
                  groupKey={group.groupKey}
                  displayName={group.displayName}
                  description={GROUP_INFO[group.groupKey]?.description ?? ""}
                  examplePriceLabel={GROUP_INFO[group.groupKey]?.examplePriceLabel ?? ""}
                  isActive={group.isActive}
                  action={toggleShippingMethodGroup}
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-5 p-5">
          <SettingSectionHeader
            icon={MapPin}
            title="Point relais"
            description="Modes d'envoi à retirer par l'acheteur dans un point relais ou une consigne."
          />
          <div className="flex flex-col gap-4 border-t border-dashed pt-5">
            {Object.values(pickupGroups).length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun point relais configuré.</p>
            ) : (
              Object.values(pickupGroups).map((group) => (
                <ShippingMethodToggle
                  key={group.groupKey}
                  groupKey={group.groupKey}
                  displayName={group.displayName}
                  description={GROUP_INFO[group.groupKey]?.description ?? ""}
                  examplePriceLabel={GROUP_INFO[group.groupKey]?.examplePriceLabel ?? ""}
                  isActive={group.isActive}
                  action={toggleShippingMethodGroup}
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
