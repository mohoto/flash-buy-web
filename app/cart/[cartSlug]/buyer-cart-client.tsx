"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, CreditCard, Home, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import {
  Drawer,
  DrawerPopup,
  DrawerHeader,
  DrawerTitle,
  DrawerPanel,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

type CartItem = {
  item_id: string;
  product_name: string;
  size_label: string | null;
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
  matched: boolean;
};

type ShippingInfo = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  postal_code: string;
  city: string;
  country: string;
};

type ShippingMethod = {
  variantId: string;
  groupKey: string;
  displayName: string;
  carrier: string;
  priceCents: number;
  weightGrams: number;
  requiresServicePoint: boolean;
};

type ServicePoint = {
  id: number;
  name: string;
  address: string;
  postalCode: string;
  city: string;
  distanceMeters: number | null;
};

type ShippingLookupResponse =
  | { methods: ShippingMethod[]; servicePoints: ServicePoint[] }
  | { error: "no_method_for_weight" | "shop_not_found" | "sendcloud_error" | "shipping_lookup_failed" };

const EMPTY_SHIPPING_INFO: ShippingInfo = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  address: "",
  postal_code: "",
  city: "",
  country: "",
};

const listItemMotion = {
  initial: { scale: 0.96, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.96, opacity: 0 },
  transition: { type: "spring" as const, stiffness: 350, damping: 40 },
};

function usernameStorageKey(cartSlug: string) {
  return `flassh_username_${cartSlug}`;
}

function shippingStorageKey(cartSlug: string, buyerUsername: string) {
  return `flassh_shipping_${cartSlug}_${buyerUsername}`;
}

function normalizeUsername(raw: string) {
  return raw.trim().replace(/^@/, "");
}

export function BuyerCartClient({ cartSlug }: { cartSlug: string }) {
  // Doit démarrer vide (identique au rendu serveur, qui n'a pas accès à
  // localStorage) : le lire dès le premier rendu client provoquerait un
  // mismatch d'hydratation dès qu'un pseudo était déjà mémorisé. Appliqué
  // juste après montage à la place (cf. useEffect plus bas), au prix d'un
  // flash minime le temps de ce premier effet.
  const [usernameInput, setUsernameInput] = useState("");
  const buyerUsername = normalizeUsername(usernameInput);

  useEffect(() => {
    // Synchronise avec localStorage, indisponible avant montage ; pas
    // d'alternative sans effet ici sans réintroduire le mismatch
    // d'hydratation corrigé ci-dessus (même pattern que components/theme-toggle.tsx).
    const stored = localStorage.getItem(usernameStorageKey(cartSlug));
    if (stored) setUsernameInput(stored);
  }, [cartSlug]);

  const [items, setItems] = useState<CartItem[]>([]);
  const [shipping, setShipping] = useState<ShippingInfo>(EMPTY_SHIPPING_INFO);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [shippingMethodError, setShippingMethodError] = useState<string | null>(null);
  const [servicePointPostalCode, setServicePointPostalCode] = useState("");
  const [servicePoints, setServicePoints] = useState<ServicePoint[]>([]);
  const [selectedServicePoint, setSelectedServicePoint] = useState<ServicePoint | null>(null);
  const [isLoadingServicePoints, setIsLoadingServicePoints] = useState(false);
  const [isServicePointsDrawerOpen, setIsServicePointsDrawerOpen] = useState(false);
  // Rétracté automatiquement dès que tous les champs requis sont remplis
  // (ex. coordonnées déjà connues chargées via get_live_buyer_shipping_info,
  // ou saisie manuelle terminée) — l'acheteur peut toujours la rouvrir pour
  // corriger. Initialisé à true : le formulaire vide se déplie de lui-même
  // dès que isShippingComplete devient false (cf. effet plus bas).
  const [isShippingOpen, setIsShippingOpen] = useState(true);
  const isShippingComplete = Object.values(shipping).every((value) => value.trim() !== "");
  // Transition incomplet -> complet (première fois que tous les champs sont
  // remplis, ex. saisie manuelle terminée ou coordonnées connues chargées
  // depuis get_live_buyer_shipping_info) : rétracte la card automatiquement.
  // Ne force jamais la fermeture à chaque rendu — l'acheteur reste libre de
  // rouvrir manuellement pour corriger sans que ça se referme tout seul.
  const [wasShippingComplete, setWasShippingComplete] = useState(isShippingComplete);
  if (isShippingComplete !== wasShippingComplete) {
    setWasShippingComplete(isShippingComplete);
    if (isShippingComplete) setIsShippingOpen(false);
    else setIsShippingOpen(true);
  }

  // "Adjusting state when a prop changes" (pattern React officiel) : on
  // efface la confirmation "Merci !" dès qu'on détecte un changement de
  // pseudo pendant le rendu, plutôt que via setState() dans un effet.
  const [lastBuyerUsername, setLastBuyerUsername] = useState(buyerUsername);
  if (buyerUsername !== lastBuyerUsername) {
    setLastBuyerUsername(buyerUsername);
    setSubmitted(false);
  }

  // Le panier et les coordonnées ne dépendent que du pseudo une fois résolu :
  // rien à charger tant qu'il est vide (le rendu ci-dessous masque de toute
  // façon panier/formulaire tant que buyerUsername est vide).
  useEffect(() => {
    if (!buyerUsername) return;

    localStorage.setItem(usernameStorageKey(cartSlug), buyerUsername);

    const supabase = createClient();

    const refetchCart = async () => {
      const { data } = await supabase.rpc("get_live_cart", {
        p_cart_slug: cartSlug,
        p_buyer: buyerUsername,
      });
      if (data) setItems(data);
    };
    refetchCart();

    supabase
      .rpc("get_live_buyer_shipping_info", { p_cart_slug: cartSlug, p_buyer: buyerUsername })
      .then(({ data }) => {
        const info = data?.[0];
        const stored = localStorage.getItem(shippingStorageKey(cartSlug, buyerUsername));
        const fromStorage = stored ? JSON.parse(stored) : {};
        setShipping({ ...EMPTY_SHIPPING_INFO, ...fromStorage, ...info });
      });

    // Pas de filtre serveur possible ici (la RPC fait le filtrage, pas une
    // table directement accessible en anon) : on réagit à tout changement
    // de order_items/orders et on recharge via la RPC sécurisée.
    const channel = supabase
      .channel(`buyer-cart-${cartSlug}-${buyerUsername}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_order_items" },
        refetchCart
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_orders" },
        refetchCart
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [cartSlug, buyerUsername]);

  // Le tarif dépend du poids du panier (recalculé côté DB dans
  // get_live_cart_shipping_context) : redéclenché à chaque changement du
  // contenu du panier, pas seulement au montage.
  useEffect(() => {
    if (!buyerUsername || items.length === 0) return;

    let cancelled = false;

    fetch("/api/cart/shipping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartSlug, buyer: buyerUsername }),
    })
      .then((res) => res.json())
      .then((data: ShippingLookupResponse) => {
        if (cancelled) return;
        if ("error" in data) {
          setShippingMethods([]);
          setShippingMethodError(data.error);
        } else {
          setShippingMethods(data.methods);
          setShippingMethodError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setShippingMethodError("sendcloud_error");
      });

    return () => {
      cancelled = true;
    };
  }, [cartSlug, buyerUsername, items.length]);

  async function searchServicePoints(carrier: string) {
    if (!servicePointPostalCode.trim() || !buyerUsername) return;
    setIsLoadingServicePoints(true);
    try {
      const res = await fetch("/api/cart/shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartSlug,
          buyer: buyerUsername,
          postalCode: servicePointPostalCode.trim(),
          carrier,
        }),
      });
      const data: ShippingLookupResponse = await res.json();
      if (!("error" in data)) {
        setServicePoints(data.servicePoints);
      }
    } finally {
      setIsLoadingServicePoints(false);
    }
  }

  function selectShippingMethod(method: ShippingMethod) {
    setSelectedMethodId(method.variantId);
    setSelectedServicePoint(null);
    setServicePoints([]);
    if (method.requiresServicePoint) {
      setIsServicePointsDrawerOpen(true);
      if (servicePointPostalCode.trim()) {
        searchServicePoints(method.carrier);
      }
    }
  }

  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unit_price_cents - (item.discount_cents ?? 0),
    0
  );
  const selectedMethod = shippingMethods.find((m) => m.variantId === selectedMethodId) ?? null;
  const shippingCents = selectedMethod?.priceCents ?? 0;
  const total = subtotal + shippingCents;

  const isShippingMethodComplete =
    selectedMethod !== null && (!selectedMethod.requiresServicePoint || selectedServicePoint !== null);

  const updateField = (field: keyof ShippingInfo) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setShipping((prev) => ({ ...prev, [field]: e.target.value }));
  };

  async function handleSubmit() {
    if (!selectedMethod || (selectedMethod.requiresServicePoint && !selectedServicePoint)) {
      setError("Choisis un mode d'envoi avant de valider.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const supabase = createClient();
    // Les paramètres p_service_point_* sont nullable côté SQL (une méthode
    // domicile n'a pas de point relais), mais le générateur de types
    // Supabase ne détecte pas la nullabilité réelle des arguments RPC — il
    // les type toujours comme requis (string/number), jamais `| null`. Cast
    // pour refléter le contrat SQL réel plutôt que d'assouplir le typage
    // plus largement ou d'introduire des chaînes vides artificielles.
    const { error: rpcError } = await supabase.rpc("submit_live_buyer_order", {
      p_cart_slug: cartSlug,
      p_buyer: buyerUsername,
      p_first_name: shipping.first_name,
      p_last_name: shipping.last_name,
      p_email: shipping.email,
      p_phone: shipping.phone,
      p_address: shipping.address,
      p_postal_code: shipping.postal_code,
      p_city: shipping.city,
      p_country: shipping.country,
      p_shipping_method_variant_id: selectedMethod.variantId,
      p_shipping_method_name: selectedMethod.displayName,
      p_shipping_cost_cents: selectedMethod.priceCents,
      p_shipping_weight_grams: selectedMethod.weightGrams,
      p_service_point_id: selectedServicePoint?.id ?? null,
      p_service_point_name: selectedServicePoint?.name ?? null,
      p_service_point_address: selectedServicePoint?.address ?? null,
      p_service_point_postal_code: selectedServicePoint?.postalCode ?? null,
      p_service_point_city: selectedServicePoint?.city ?? null,
    } as unknown as {
      p_cart_slug: string;
      p_buyer: string;
      p_first_name: string;
      p_last_name: string;
      p_email: string;
      p_phone: string;
      p_address: string;
      p_postal_code: string;
      p_city: string;
      p_country: string;
      p_shipping_method_variant_id: string;
      p_shipping_method_name: string;
      p_shipping_cost_cents: number;
      p_shipping_weight_grams: number;
      p_service_point_id: number;
      p_service_point_name: string;
      p_service_point_address: string;
      p_service_point_postal_code: string;
      p_service_point_city: string;
    });

    setIsSubmitting(false);

    if (rpcError) {
      setError("Une erreur est survenue, réessaie.");
      return;
    }

    localStorage.setItem(shippingStorageKey(cartSlug, buyerUsername), JSON.stringify(shipping));
    setSubmitted(true);
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <Field className="gap-1.5">
        <FieldLabel htmlFor="username" className="text-xs">
          Pseudo TikTok
        </FieldLabel>
        <Input
          id="username"
          placeholder="@tonpseudo"
          value={usernameInput}
          onChange={(e) => setUsernameInput(e.target.value)}
          size="lg"
          className="**:data-[slot=input]:h-12 **:data-[slot=input]:text-base **:data-[slot=input]:leading-12"
        />
      </Field>

      {buyerUsername && (
        <>
          <Card className="w-full">
            <Collapsible open={isShippingOpen} onOpenChange={setIsShippingOpen} className="w-full">
              <CollapsibleTrigger className="block w-full border-0 p-0 text-left">
                <CardHeader
                  className={cn(
                    "flex-row items-center justify-between px-4 py-3",
                    isShippingOpen && "pb-2"
                  )}
                >
                  {!isShippingOpen && isShippingComplete && (
                    <div>
                      <p className="text-base font-medium text-foreground">
                        {shipping.first_name} {shipping.last_name}
                      </p>
                      <p className="text-base text-muted-foreground">{shipping.address}</p>
                      <p className="text-base text-muted-foreground">
                        {shipping.postal_code} {shipping.city}
                      </p>
                      <p className="text-base text-muted-foreground">{shipping.country}</p>
                    </div>
                  )}
                  <ChevronDown
                    className={cn(
                      "size-4.5 shrink-0 text-muted-foreground transition-transform",
                      isShippingOpen && "rotate-180"
                    )}
                  />
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
            <CardContent className="flex flex-col gap-3 px-4 pt-0 pb-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field className="gap-1.5">
                  <FieldLabel htmlFor="first_name" className="text-xs">
                    Prénom
                  </FieldLabel>
                  <Input
                    id="first_name"
                    value={shipping.first_name}
                    onChange={updateField("first_name")}
                    required
                  />
                </Field>
                <Field className="gap-1.5">
                  <FieldLabel htmlFor="last_name" className="text-xs">
                    Nom
                  </FieldLabel>
                  <Input
                    id="last_name"
                    value={shipping.last_name}
                    onChange={updateField("last_name")}
                    required
                  />
                </Field>
              </div>

              <Field className="gap-1.5">
                <FieldLabel htmlFor="email" className="text-xs">
                  E-mail
                </FieldLabel>
                <Input
                  id="email"
                  type="email"
                  value={shipping.email}
                  onChange={updateField("email")}
                  required
                />
              </Field>

              <Field className="gap-1.5">
                <FieldLabel htmlFor="phone" className="text-xs">
                  N° Téléphone
                </FieldLabel>
                <Input
                  id="phone"
                  type="tel"
                  value={shipping.phone}
                  onChange={updateField("phone")}
                  required
                />
              </Field>

              <Field className="gap-1.5">
                <FieldLabel htmlFor="address" className="text-xs">
                  Adresse
                </FieldLabel>
                <Input
                  id="address"
                  value={shipping.address}
                  onChange={updateField("address")}
                  required
                />
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field className="gap-1.5">
                  <FieldLabel htmlFor="postal_code" className="text-xs">
                    Code postal
                  </FieldLabel>
                  <Input
                    id="postal_code"
                    value={shipping.postal_code}
                    onChange={updateField("postal_code")}
                    required
                  />
                </Field>
                <Field className="gap-1.5">
                  <FieldLabel htmlFor="city" className="text-xs">
                    Ville
                  </FieldLabel>
                  <Input
                    id="city"
                    value={shipping.city}
                    onChange={updateField("city")}
                    required
                  />
                </Field>
              </div>

              <Field className="gap-1.5">
                <FieldLabel htmlFor="country" className="text-xs">
                  Pays
                </FieldLabel>
                <Input
                  id="country"
                  value={shipping.country}
                  onChange={updateField("country")}
                  required
                />
              </Field>
            </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {items.map((item) => {
                const subtotalCents = item.quantity * item.unit_price_cents;
                const hasDiscount = item.discount_cents > 0;
                return (
                  <motion.li key={item.item_id} layout {...listItemMotion} className="list-none">
                    <Card>
                      <CardContent className="px-4 py-3 text-sm">
                        {hasDiscount ? (
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-muted-foreground">
                              {item.quantity}× {item.product_name}
                              {item.size_label ? ` — ${item.size_label}` : ""}
                            </span>
                            <div className="shrink-0 text-right">
                              <p className="text-muted-foreground">
                                Sous-total : {(subtotalCents / 100).toFixed(2)} €
                              </p>
                              <p className="text-destructive">
                                Remise : -{(item.discount_cents / 100).toFixed(2)} €
                              </p>
                              <p className="font-medium text-foreground">
                                Total : {((subtotalCents - item.discount_cents) / 100).toFixed(2)} €
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <span>
                              {item.quantity}× {item.product_name}
                              {item.size_label ? ` — ${item.size_label}` : ""}
                            </span>
                            <span className="text-muted-foreground">
                              {(subtotalCents / 100).toFixed(2)} €
                            </span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>

          {!submitted && (
            <Card className="w-full">
              <CardHeader className="px-4 py-3 pb-2">
                <CardTitle className="text-sm">Mode d&apos;envoi</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 px-4 pt-0 pb-3">
                {shippingMethodError === "no_method_for_weight" && (
                  <Alert variant="error">
                    <AlertDescription>
                      Ton panier dépasse le poids maximum livrable pour l&apos;instant, contacte le
                      vendeur.
                    </AlertDescription>
                  </Alert>
                )}
                {shippingMethodError &&
                  shippingMethodError !== "no_method_for_weight" && (
                    <Alert variant="error">
                      <AlertDescription>
                        Impossible de calculer les frais de livraison, réessaie plus tard.
                      </AlertDescription>
                    </Alert>
                  )}
                {!shippingMethodError && shippingMethods.length === 0 && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner className="size-4" />
                    Calcul des frais de livraison…
                  </div>
                )}

                {shippingMethods.map((method) => {
                  const isSelected = selectedMethodId === method.variantId;
                  // Fallback générique le temps que des logos transporteur
                  // (Mondial Relay, Colissimo, Chronopost…) soient fournis —
                  // aucun n'existe encore dans le repo.
                  const Icon = method.requiresServicePoint ? MapPin : Home;
                  return (
                    <button
                      key={method.variantId}
                      type="button"
                      onClick={() => selectShippingMethod(method)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg border-2 px-4 py-3 text-left transition-colors",
                        isSelected ? "border-primary bg-primary/4" : "border-input"
                      )}
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-foreground">
                            {method.requiresServicePoint
                              ? "Livraison en point relais"
                              : "Livraison à domicile"}
                          </span>
                          <span className="tabular-nums text-foreground">
                            {(method.priceCents / 100).toFixed(2)} €
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Icon className="size-4" />
                          {method.displayName}
                        </div>
                        {isSelected && method.requiresServicePoint && selectedServicePoint && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {selectedServicePoint.name} — {selectedServicePoint.postalCode}{" "}
                            {selectedServicePoint.city}
                          </p>
                        )}
                      </div>
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-4.5 shrink-0 items-center justify-center rounded-full border sm:size-4",
                          isSelected ? "border-primary" : "border-input"
                        )}
                      >
                        {isSelected && <span className="size-2 rounded-full bg-primary sm:size-1.5" />}
                      </span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <Drawer open={isServicePointsDrawerOpen} onOpenChange={setIsServicePointsDrawerOpen}>
            <DrawerPopup showCloseButton showBar>
              <DrawerHeader>
                <DrawerTitle>Points relais à proximité</DrawerTitle>
              </DrawerHeader>
              <DrawerPanel>
                <div className="flex flex-col gap-3">
                  <Field className="gap-1.5">
                    <FieldLabel htmlFor="service_point_postal_code" className="text-xs">
                      Code postal
                    </FieldLabel>
                    <div className="flex gap-2">
                      <Input
                        id="service_point_postal_code"
                        value={servicePointPostalCode}
                        onChange={(e) => setServicePointPostalCode(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => selectedMethod && searchServicePoints(selectedMethod.carrier)}
                        disabled={isLoadingServicePoints || !servicePointPostalCode.trim()}
                      >
                        {isLoadingServicePoints ? "Recherche…" : "Rechercher"}
                      </Button>
                    </div>
                  </Field>

                  {servicePoints.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Aucun point relais trouvé pour ce code postal.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      <AnimatePresence initial={false}>
                        {servicePoints.map((point) => (
                          <motion.li key={point.id} layout {...listItemMotion} className="list-none">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedServicePoint(point);
                                setIsServicePointsDrawerOpen(false);
                              }}
                              className={cn(
                                "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors",
                                selectedServicePoint?.id === point.id
                                  ? "border-primary bg-primary/4"
                                  : "border-input"
                              )}
                            >
                              <p className="font-medium text-foreground">{point.name}</p>
                              <p className="text-muted-foreground">
                                {point.address}, {point.postalCode} {point.city}
                              </p>
                            </button>
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </ul>
                  )}
                </div>
              </DrawerPanel>
            </DrawerPopup>
          </Drawer>

          <div className="flex flex-col gap-2 px-4 py-3 text-base">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Sous-total</span>
              <span className="tabular-nums text-muted-foreground">
                {(subtotal / 100).toFixed(2)} €
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Livraison</span>
              <span className="tabular-nums text-muted-foreground">
                {(shippingCents / 100).toFixed(2)} €
              </span>
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <span className="font-medium text-foreground">Total</span>
              <span className="font-medium tabular-nums text-foreground">
                {(total / 100).toFixed(2)} €
              </span>
            </div>
          </div>

          {error && (
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {submitted ? (
            <Alert variant="success">
              <AlertDescription>
                Merci ! Tes coordonnées ont bien été enregistrées.
              </AlertDescription>
            </Alert>
          ) : (
            <Button
              type="button"
              disabled={
                items.length === 0 || isSubmitting || !isShippingComplete || !isShippingMethodComplete
              }
              onClick={handleSubmit}
              size="xl"
              className="h-12 w-full rounded-full text-lg"
            >
              {isSubmitting ? (
                "Envoi…"
              ) : (
                <>
                  <CreditCard />
                  Procéder au paiement
                </>
              )}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
