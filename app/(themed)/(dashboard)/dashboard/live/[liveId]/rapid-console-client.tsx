"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { AnimatePresence, motion } from "motion/react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Radio, Trash2, Package, Minus, Plus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogClose,
} from "@/components/ui/alert-dialog";
import { toastManager } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { LiveCommentsFeed } from "./live-comments-feed";
import {
  createAndActivateRapidProduct,
  retireRapidProduct,
  reactivateRapidProduct,
  updateRapidProductPrice,
  updateRapidProductDiscountTiers,
  deleteRapidProduct,
  assignRapidItemToProduct,
  unassignRapidItem,
  deleteRapidItem,
  materializeFromPrepared,
  getCatalogProducts,
} from "./rapid-actions";
// Actions du catalogue préparé (prepared_products, cf.
// /dashboard/produits-prepares) — un produit "catalog:" pas encore
// matérialisé n'est pas un live_products, donc Modifier/Remises sur sa
// carte (CatalogProductCard) doivent modifier le prepared_product
// directement, pas via updateRapidProductPrice/DiscountTiers (réservées aux
// live_products déjà matérialisés).
import {
  updatePreparedProductPrice,
  updatePreparedProductDiscountTiers,
  deletePreparedProduct,
} from "../../produits-prepares/actions";

type LiveProduct = {
  id: string;
  name: string;
  price_cents: number;
  internal_ref: string;
  retired_at: string | null;
  discount_tiers_cents: Record<string, number>;
  simple_discount_cents: number;
};

// Onglet "Catalogue" : produits de la bibliothèque préparée à l'avance
// (indépendante de ce live, cf. /dashboard/produits-prepares), pas encore
// matérialisés en live_products — donc pas de internal_ref ni retired_at.
type PreparedProduct = {
  id: string;
  name: string;
  price_cents: number;
  discount_tiers_cents: Record<string, number>;
  simple_discount_cents: number;
};

// Produit d'un catalogue préparé (source "catalog:") avec l'éventuel
// live_products déjà matérialisé pour CE live (cf. getCatalogProducts,
// rapid-actions.ts, via live_products.source_prepared_product_id) — permet à
// CatalogProductCard de basculer entre son rendu "à l'antenne" (identique
// aux produits à la volée actifs) et son rendu simple ("Mettre à
// l'antenne"), null quand jamais matérialisé pour ce live.
type CatalogProduct = PreparedProduct & {
  liveProduct: { id: string; retired_at: string | null; internal_ref: string } | null;
};

// Catalogue préparé à l'avance (product_catalogs, cf.
// /dashboard/produits-prepares) — un regroupement nommé de PreparedProduct,
// choisi dans l'onglet Catalogue (cf. CatalogProductsPanel).
type ProductCatalog = {
  id: string;
  name: string;
  scheduled_for: string | null;
};

type RapidItem = {
  id: string;
  buyer_tiktok_username: string;
  nickname: string | null;
  profile_picture_url: string | null;
  source_comment: string;
  order_number: number | null;
  live_order_id: string | null;
  received_at: string;
  created_at: string;
};

// Une intention peut avoir plusieurs produits assignés — chaque ligne de
// live_rapid_item_products (une par produit distinct assigné à une
// intention) devient un RapidItemProduct côté client.
type RapidItemProduct = {
  id: string;
  live_rapid_item_id: string;
  live_product_id: string;
  quantity: number;
  discount_cents: number;
};

type Order = {
  id: string;
  buyer_tiktok_username: string;
  status: string;
  total_cents: number;
};

// Dernier ajout par commande (mode rapid) — sert à calculer "Délai
// dépassé" : le compte à rebours redémarre à chaque nouveau produit ajouté,
// pas à la création de la commande.
type OrderItemDate = {
  live_order_id: string;
  created_at: string;
};

// pending_order_expiry_minutes : null = "toujours" (pas de limite), -1 =
// "jusqu'à minuit", sinon un nombre de minutes.
type ShopSettings = {
  pendingOrderExpiryMinutes: number | null;
  unpaidOrderRestriction: "none" | "block" | "ceiling" | string;
  unpaidOrderCeilingCents: number | null;
};

// Glisser-déposer mis en attente le temps que le vendeur confirme ou annule
// dans PendingOrderAlertDialog (délai dépassé, achat non payé, ou plafond
// dépassé — cf. handleDragEnd).
type PendingConfirmation = {
  itemId: string;
  productId: string;
  quantity: number;
  title: string;
  description: string;
};

// Vrai si la commande est "pending", qu'un délai est configuré, et que le
// dernier produit ajouté date de plus longtemps que ce délai — purement
// visuel, ne modifie jamais l'état en base.
function isOrderExpired(
  order: Order,
  lastAddedAt: string | undefined,
  settings: ShopSettings
): boolean {
  if (order.status !== "pending") return false;
  if (settings.pendingOrderExpiryMinutes === null) return false;
  if (!lastAddedAt) return false;

  const reference = new Date(lastAddedAt).getTime();
  if (settings.pendingOrderExpiryMinutes === -1) {
    const midnight = new Date(lastAddedAt);
    midnight.setHours(24, 0, 0, 0);
    return Date.now() > midnight.getTime();
  }
  return Date.now() - reference > settings.pendingOrderExpiryMinutes * 60_000;
}

// Lecture défensive de discount_tiers_cents (typé Json côté Supabase, plus
// large qu'un Record<string, number>) — même logique que côté serveur
// (rapid-actions.ts lookupDiscountCents), dupliquée ici pour ne pas avoir à
// partager du code entre Server Action et composant client.
function parseDiscountTiers(json: unknown): Record<string, number> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      out[key] = value;
    }
  }
  return out;
}

const listItemMotion = {
  initial: { scale: 0.96, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.96, opacity: 0, transition: { duration: 0.08 } },
  transition: { type: "spring" as const, stiffness: 500, damping: 35 },
};

export function RapidConsoleClient({
  liveId,
  initialProducts,
  initialItems,
  initialItemProducts,
  initialOrders,
  initialOrderItemDates,
  productCatalogs,
  shopSettings,
}: {
  liveId: string;
  initialProducts: (Omit<LiveProduct, "discount_tiers_cents"> & { discount_tiers_cents: unknown })[];
  initialItems: RapidItem[];
  initialItemProducts: RapidItemProduct[];
  initialOrders: Order[];
  initialOrderItemDates: OrderItemDate[];
  productCatalogs: ProductCatalog[];
  shopSettings: ShopSettings;
}) {
  const [products, setProducts] = useState<LiveProduct[]>(() =>
    initialProducts.map((p) => ({ ...p, discount_tiers_cents: parseDiscountTiers(p.discount_tiers_cents) }))
  );
  // "À la volée" (comportement historique) vs "Catalogue" (produits repris
  // d'un catalogue préparé, cf. CatalogProductsPanel) — bascule purement
  // locale, ne change rien côté serveur tant qu'aucun produit catalogue
  // n'est glissé.
  const [productSource, setProductSource] = useState<"onthefly" | "catalog">("onthefly");
  // Produits du catalogue préparé sélectionné dans CatalogProductsPanel,
  // chargés à la demande (cf. getCatalogProducts) — gardés ici (pas dans le
  // panel) pour que handleDragEnd puisse résoudre le prix d'un produit
  // "catalog:" glissé (ex. calcul du plafond unpaidOrderRestriction).
  // Matérialisé via materializeFromPrepared comme n'importe quel produit
  // préparé.
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [items, setItems] = useState(initialItems);
  const [itemProducts, setItemProducts] = useState(initialItemProducts);
  const [orders, setOrders] = useState(initialOrders);
  const [orderItemDates, setOrderItemDates] = useState(initialOrderItemDates);
  const [isPending, startTransition] = useTransition();
  const [draggedProduct, setDraggedProduct] = useState<{
    name: string;
    price_cents: number;
    internal_ref?: string;
  } | null>(null);
  // Quantité propre à chaque produit actif (clé = product id) — chaque carte
  // a son propre stepper, appliqué uniquement quand CE produit est glissé.
  const [dragQuantities, setDragQuantities] = useState<Record<string, number>>({});
  const [intentSearch, setIntentSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  // Dernier statut connu par commande, en dehors du state React — sert
  // uniquement à détecter une transition vers "paid" pour déclencher un
  // toast (cf. refetch ci-dessous). Une ref, pas un state : la comparaison
  // se fait hors du cycle de rendu, jamais dans un updater de setState
  // (React interdit d'appeler toastManager.add depuis là — "Cannot update a
  // component while rendering a different component").
  const orderStatusRef = useRef<Map<string, string>>(
    new Map(initialOrders.map((o) => [o.id, o.status]))
  );

  const refetch = useCallback(async () => {
    const supabase = createClient();
    const [{ data: liveProducts }, { data: rapidItems }, { data: rapidItemProducts }, { data: liveOrders }] =
      await Promise.all([
        supabase
          .from("live_products")
          .select("id, name, price_cents, internal_ref, retired_at, discount_tiers_cents, simple_discount_cents")
          .eq("live_id", liveId)
          .order("created_at", { ascending: true }),
        supabase
          .from("live_rapid_items")
          .select(
            "id, buyer_tiktok_username, nickname, profile_picture_url, source_comment, order_number, live_order_id, received_at, created_at"
          )
          .eq("live_id", liveId)
          .order("created_at", { ascending: false }),
        supabase
          .from("live_rapid_item_products")
          .select("id, live_rapid_item_id, live_product_id, quantity, discount_cents"),
        supabase
          .from("live_orders")
          .select("id, buyer_tiktok_username, status, total_cents")
          .eq("live_id", liveId)
          .in("status", ["pending", "paid"]),
      ]);

    if (liveProducts) {
      setProducts(
        liveProducts.map((p) => ({ ...p, discount_tiers_cents: parseDiscountTiers(p.discount_tiers_cents) }))
      );
    }
    if (rapidItems) setItems(rapidItems);
    if (rapidItemProducts) setItemProducts(rapidItemProducts);
    if (liveOrders) {
      // Toast dès qu'une commande passe à "paid" entre deux refetch (paiement
      // confirmé) — comparé via orderStatusRef (hors state React) pour ne
      // jamais déclencher toastManager.add depuis un updater de setState.
      for (const order of liveOrders) {
        const previousStatus = orderStatusRef.current.get(order.id);
        if (order.status === "paid" && previousStatus && previousStatus !== "paid") {
          toastManager.add({
            type: "success",
            title: "Commande payée",
            description: `@${order.buyer_tiktok_username} a payé sa commande (${(order.total_cents / 100).toFixed(2)} €).`,
          });
        }
      }
      orderStatusRef.current = new Map(liveOrders.map((o) => [o.id, o.status]));
      setOrders(liveOrders);
      const { data: itemDates } = await supabase
        .from("live_order_items")
        .select("live_order_id, created_at")
        .in("live_order_id", liveOrders.map((o) => o.id));
      if (itemDates) setOrderItemDates(itemDates);
    }
  }, [liveId]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`live-rapid-${liveId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_products", filter: `live_id=eq.${liveId}` },
        refetch
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_rapid_items", filter: `live_id=eq.${liveId}` },
        refetch
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_rapid_item_products" },
        refetch
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_orders", filter: `live_id=eq.${liveId}` },
        refetch
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveId, refetch]);

  const normalizedProductSearch = productSearch.trim().toLowerCase();
  const matchesProductSearch = (product: LiveProduct) =>
    !normalizedProductSearch ||
    product.name.toLowerCase().includes(normalizedProductSearch) ||
    product.internal_ref.toLowerCase().includes(normalizedProductSearch);

  const activeProducts = products.filter((p) => !p.retired_at && matchesProductSearch(p)).reverse();
  const previousProducts = products.filter((p) => p.retired_at && matchesProductSearch(p)).reverse();

  const countByProduct = new Map<string, number>();
  for (const link of itemProducts) {
    countByProduct.set(link.live_product_id, (countByProduct.get(link.live_product_id) ?? 0) + link.quantity);
  }

  // Dernier produit ajouté par commande — sert à la fois à l'affichage
  // ("Délai dépassé" dans OrdersSummary) et au blocage du glisser-déposer
  // (handleDragEnd) : une commande expirée bloque toujours un nouvel ajout,
  // indépendamment du réglage unpaidOrderRestriction.
  const lastAddedAtByOrderId = new Map<string, string>();
  for (const { live_order_id, created_at } of orderItemDates) {
    const existing = lastAddedAtByOrderId.get(live_order_id);
    if (!existing || created_at > existing) {
      lastAddedAtByOrderId.set(live_order_id, created_at);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as string;
    if (id.startsWith("catalog:")) {
      const catalogProductId = id.slice("catalog:".length);
      setDraggedProduct(catalogProducts.find((p) => p.id === catalogProductId) ?? null);
      return;
    }
    setDraggedProduct(products.find((p) => p.id === id) ?? null);
  }

  // Filet de sécurité : chaque action doit se refléter immédiatement même si
  // le canal Realtime (postgres_changes) est déconnecté ou lent à relayer
  // l'événement — cf. bug observé où une assignation par glisser-déposer
  // était bien écrite en base mais n'apparaissait qu'après un F5. Remplace
  // startTransition brut pour toutes les actions passées aux enfants.
  const runAction = useCallback(
    (action: () => void | Promise<void>) => {
      startTransition(async () => {
        await action();
        await refetch();
      });
    },
    [refetch]
  );

  // Suppression optimiste : retire l'item (et tous ses produits assignés) de
  // la liste immédiatement au clic plutôt que d'attendre l'aller-retour
  // serveur (via runAction) avant de déclencher l'animation de sortie.
  const handleDeleteItem = useCallback(
    (itemId: string) => {
      setItems((prev) => prev.filter((item) => item.id !== itemId));
      setItemProducts((prev) => prev.filter((link) => link.live_rapid_item_id !== itemId));
      startTransition(async () => {
        await deleteRapidItem(liveId, itemId);
        await refetch();
      });
    },
    [liveId, refetch]
  );

  // Même principe côté désassignation d'UN produit (bouton poubelle sur sa
  // ligne) : on retire uniquement ce lien du state local tout de suite, les
  // autres produits assignés à la même intention restent affichés.
  const handleUnassignItem = useCallback(
    (itemId: string, productId: string) => {
      setItemProducts((prev) =>
        prev.filter((link) => !(link.live_rapid_item_id === itemId && link.live_product_id === productId))
      );
      startTransition(async () => {
        await unassignRapidItem(liveId, itemId, productId);
        await refetch();
      });
    },
    [liveId, refetch]
  );

  // Assignation effective, factorisée pour être appelée directement (aucun
  // blocage) ou après confirmation du vendeur dans PendingOrderAlertDialog.
  // productId peut porter un préfixe "catalog:" (cartes de l'onglet
  // Catalogue, cf. CatalogProductsPanel) — matérialise d'abord en
  // live_products via materializeFromPrepared, puis assigne normalement. Une
  // carte "à la volée" (déjà un live_products de CE live) n'a pas de préfixe
  // et saute directement à assignRapidItemToProduct comme avant.
  const performAssign = useCallback(
    (itemId: string, rawProductId: string, quantity: number) => {
      runAction(async () => {
        let productId = rawProductId;
        if (rawProductId.startsWith("catalog:")) {
          const materialized = await materializeFromPrepared(liveId, rawProductId.slice("catalog:".length));
          if (!materialized) return;
          productId = materialized.id;
        }
        await assignRapidItemToProduct(liveId, itemId, productId, quantity);
      });
      setDragQuantities((prev) => ({ ...prev, [rawProductId]: 1 }));
    },
    [liveId, runAction]
  );

  // Résout le prix d'un productId potentiellement préfixé ("catalog:") —
  // sert au calcul du plafond unpaidOrderRestriction dans handleDragEnd,
  // avant toute matérialisation.
  const resolveProductPriceCents = useCallback(
    (productId: string): number => {
      if (productId.startsWith("catalog:")) {
        const id = productId.slice("catalog:".length);
        return catalogProducts.find((p) => p.id === id)?.price_cents ?? 0;
      }
      return products.find((p) => p.id === productId)?.price_cents ?? 0;
    },
    [catalogProducts, products]
  );

  function handleDragEnd(event: DragEndEvent) {
    setDraggedProduct(null);
    const productId = event.active.id as string;
    const itemId = event.over?.id as string | undefined;
    if (!itemId) return;

    const quantity = dragQuantities[productId] ?? 1;
    const item = items.find((i) => i.id === itemId);
    // Ne considérer que les commandes pending D'UNE AUTRE intention : ajouter
    // un produit supplémentaire à la commande déjà liée à CETTE carte (même
    // acheteur, même intention) n'est jamais bloqué — c'est la même commande,
    // pas un nouvel achat en plus d'un impayé.
    const unpaidOrder = item
      ? orders.find(
          (o) =>
            o.buyer_tiktok_username === item.buyer_tiktok_username &&
            o.status === "pending" &&
            o.id !== item.live_order_id
        )
      : undefined;

    if (item && unpaidOrder) {
      // Une commande "Délai dépassé" concerne cet acheteur indépendamment du
      // réglage unpaidOrderRestriction (même "Aucune restriction" affiche la
      // confirmation) — le vendeur décide au cas par cas s'il autorise quand
      // même l'ajout.
      if (isOrderExpired(unpaidOrder, lastAddedAtByOrderId.get(unpaidOrder.id), shopSettings)) {
        setPendingConfirmation({
          itemId,
          productId,
          quantity,
          title: "Délai dépassé",
          description: `@${item.buyer_tiktok_username} a une commande en attente dont le délai est dépassé. Autoriser quand même l'ajout de ce produit ?`,
        });
        return;
      }

      if (shopSettings.unpaidOrderRestriction === "block") {
        setPendingConfirmation({
          itemId,
          productId,
          quantity,
          title: "Achat non payé",
          description: `@${item.buyer_tiktok_username} n'a pas payé sa première commande sur ce live. Autoriser quand même l'ajout de ce produit ?`,
        });
        return;
      }
      if (shopSettings.unpaidOrderRestriction === "ceiling") {
        const addedCents = resolveProductPriceCents(productId) * quantity;
        const ceiling = shopSettings.unpaidOrderCeilingCents;
        if (ceiling !== null && unpaidOrder.total_cents + addedCents > ceiling) {
          setPendingConfirmation({
            itemId,
            productId,
            quantity,
            title: "Plafond dépassé",
            description: `@${item.buyer_tiktok_username} n'a pas payé sa première commande et dépasserait le montant autorisé (${(ceiling / 100).toFixed(2)} €). Autoriser quand même l'ajout de ce produit ?`,
          });
          return;
        }
      }
    }

    performAssign(itemId, productId, quantity);
  }

  const normalizedSearch = intentSearch.trim().toLowerCase();
  const normalizedNumberSearch = normalizedSearch.replace(/^#/, "");
  const filteredItems = normalizedSearch
    ? items.filter(
        (item) =>
          item.buyer_tiktok_username.toLowerCase().includes(normalizedSearch) ||
          (item.nickname?.toLowerCase().includes(normalizedSearch) ?? false) ||
          (item.order_number !== null && String(item.order_number) === normalizedNumberSearch)
      )
    : items;

  return (
    <DndContext id={`rapid-console-${liveId}`} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-12 xl:grid-cols-[minmax(0,4fr)_minmax(0,4fr)_minmax(0,4fr)]">
          <section className="flex min-w-0 flex-col gap-3">
            <h2 className="text-sm font-medium text-foreground">Produits pour ce live</h2>
            {productSource === "onthefly" ? (
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Rechercher un produit ou une référence…"
                className="w-full"
              />
            ) : (
              <Input
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Rechercher un produit préparé…"
                className="w-full"
              />
            )}
            <Tabs value={productSource} onValueChange={(v) => setProductSource(v as typeof productSource)}>
              <TabsList className="rounded-full **:data-[slot=tab-indicator]:rounded-full">
                <TabsTab value="onthefly" className="rounded-full">À la volée</TabsTab>
                <TabsTab value="catalog" className="rounded-full">Catalogue</TabsTab>
              </TabsList>
            </Tabs>

            {productSource === "onthefly" ? (
              <>
                <RapidCreationBar liveId={liveId} nextSeqHint={products.length + 1} onCreated={refetch} />
                <ActiveAndPreviousProducts
                  liveId={liveId}
                  activeProducts={activeProducts}
                  previousProducts={previousProducts}
                  countByProduct={countByProduct}
                  isPending={isPending}
                  startTransition={runAction}
                  dragQuantities={dragQuantities}
                  setDragQuantities={setDragQuantities}
                />
              </>
            ) : (
              <CatalogProductsPanel
                liveId={liveId}
                catalogSearch={catalogSearch}
                productCatalogs={productCatalogs}
                catalogProducts={catalogProducts}
                setCatalogProducts={setCatalogProducts}
                countByProduct={countByProduct}
                isPending={isPending}
                startTransition={runAction}
                dragQuantities={dragQuantities}
                setDragQuantities={setDragQuantities}
              />
            )}
          </section>

          <section className="flex min-w-0 flex-col gap-3">
            <h2 className="text-sm font-medium text-foreground">Tous les commentaires</h2>
            <div className="flex h-160 flex-col">
              <LiveCommentsFeed liveId={liveId} />
            </div>
          </section>

          <section className="flex min-w-0 flex-col gap-3">
            <h2 className="text-sm font-medium text-foreground">
              Intentions d&apos;achat en direct ({items.length})
            </h2>
            <Input
              value={intentSearch}
              onChange={(e) => setIntentSearch(e.target.value)}
              placeholder="Rechercher un pseudo, un username ou un numéro…"
              className="w-full"
            />
            <div className="flex h-160 flex-col">
              <RapidIntentFeed
                items={filteredItems}
                itemProducts={itemProducts}
                products={products}
                isPending={isPending}
                onDelete={handleDeleteItem}
                onUnassign={handleUnassignItem}
              />
            </div>
          </section>
        </div>

        <div className="mt-3">
          <h2 className="mb-6 text-base font-semibold text-foreground">
            Commandes en cours pour ce live
          </h2>
          <OrdersSummary
            items={items}
            itemProducts={itemProducts}
            products={products}
            orders={orders}
            lastAddedAtByOrderId={lastAddedAtByOrderId}
            shopSettings={shopSettings}
          />
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {draggedProduct && <DraggedProductPreview product={draggedProduct} />}
      </DragOverlay>

      <PendingOrderAlertDialog
        confirmation={pendingConfirmation}
        onCancel={() => setPendingConfirmation(null)}
        onConfirm={() => {
          if (!pendingConfirmation) return;
          performAssign(pendingConfirmation.itemId, pendingConfirmation.productId, pendingConfirmation.quantity);
          setPendingConfirmation(null);
        }}
      />
    </DndContext>
  );
}

// Confirmation affichée quand le glisser-déposer vise un acheteur ayant une
// commande impayée D'UNE AUTRE intention (délai dépassé, restriction
// "bloquer", ou plafond dépassé) — le vendeur décide au cas par cas s'il
// autorise quand même l'ajout, cf. handleDragEnd dans RapidConsoleClient.
function PendingOrderAlertDialog({
  confirmation,
  onCancel,
  onConfirm,
}: {
  confirmation: PendingConfirmation | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={confirmation !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirmation?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="secondary">Annuler</Button>} />
          <Button variant="destructive" onClick={onConfirm}>
            Autoriser quand même
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

// Heure locale (heure:min) d'une commande, affichée à côté de chaque
// étiquette — basée sur received_at (horodatage du commentaire détecté),
// pas created_at (identique en pratique mais received_at est la source de
// vérité "moment de l'intention").
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// Section pleine largeur sous les 3 colonnes : regroupée par acheteur — un
// même acheteur peut avoir plusieurs intentions/étiquettes (chacune sa
// propre live_order, cf. rapid-actions.ts assignRapidItemToProduct), toutes
// affichées sous une même carte acheteur avec sous-total et statut par
// étiquette (chaque étiquette peut être payée indépendamment).
function OrdersSummary({
  items,
  itemProducts,
  products,
  orders,
  lastAddedAtByOrderId,
  shopSettings,
}: {
  items: RapidItem[];
  itemProducts: RapidItemProduct[];
  products: LiveProduct[];
  orders: Order[];
  lastAddedAtByOrderId: Map<string, string>;
  shopSettings: ShopSettings;
}) {
  const rows = items
    .filter((item) => item.order_number !== null)
    .map((item) => {
      const links = itemProducts.filter((l) => l.live_rapid_item_id === item.id);
      const subtotalCents = links.reduce((sum, link) => {
        const product = products.find((p) => p.id === link.live_product_id);
        return sum + (product ? product.price_cents * link.quantity - link.discount_cents : 0);
      }, 0);
      const order = item.live_order_id ? orders.find((o) => o.id === item.live_order_id) : undefined;
      return { item, subtotalCents, order };
    })
    // Aucun produit réellement rattaché (intention jamais assignée, ou
    // résidu orphelin) — rien d'utile à montrer au vendeur.
    .filter((row) => row.subtotalCents > 0);

  const paidCount = rows.filter((r) => r.order?.status === "paid").length;
  const totalCents = rows.reduce((sum, r) => sum + r.subtotalCents, 0);

  // Regroupement par acheteur, dans l'ordre de première apparition — chaque
  // groupe garde ses lignes triées par order_number croissant (ordre
  // d'attribution des étiquettes).
  const groups: { buyer: string; rows: typeof rows }[] = [];
  const groupIndex = new Map<string, number>();
  for (const row of rows) {
    const buyer = row.item.buyer_tiktok_username;
    let idx = groupIndex.get(buyer);
    if (idx === undefined) {
      idx = groups.length;
      groupIndex.set(buyer, idx);
      groups.push({ buyer, rows: [] });
    }
    groups[idx].rows.push(row);
  }
  for (const group of groups) {
    group.rows.sort((a, b) => (a.item.order_number ?? 0) - (b.item.order_number ?? 0));
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {rows.length} commande{rows.length > 1 ? "s" : ""}
            {groups.length > 0 && ` · ${groups.length} acheteur${groups.length > 1 ? "s" : ""}`}
          </span>
          {rows.length > 0 && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">{paidCount}</span> payée
                {paidCount > 1 ? "s" : ""}
              </span>
              <span>
                Total :{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {(totalCents / 100).toFixed(2)} €
                </span>
              </span>
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <Empty className="rounded-xl border py-10">
            <EmptyHeader>
              <EmptyTitle>Aucune commande pour l&apos;instant</EmptyTitle>
              <EmptyDescription>
                Les commandes apparaîtront ici dès qu&apos;un produit sera assigné à une intention.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table variant="card" className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead>Acheteur</TableHead>
                <TableHead className="w-20">N°</TableHead>
                <TableHead className="w-24">Heure</TableHead>
                <TableHead className="w-28 text-right">Total</TableHead>
                <TableHead className="w-32 text-right">Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => {
                const groupTotalCents = group.rows.reduce((sum, r) => sum + r.subtotalCents, 0);
                return group.rows.map(({ item, subtotalCents, order }, i) => (
                  <TableRow key={item.id} className={cn(i === 0 && "border-t-2 border-t-border")}>
                    <TableCell>
                      {i === 0 ? (
                        <div className="flex items-center gap-2.5">
                          <span className="shrink-0 rounded-full bg-[conic-gradient(from_180deg,#FE2C55,#00F2EA,#FE2C55)] p-[1.5px]">
                            <Avatar className="size-8 border-2 border-card">
                              <AvatarImage
                                src={item.profile_picture_url ?? undefined}
                                alt={item.buyer_tiktok_username}
                              />
                              <AvatarFallback className="text-xs">
                                {item.buyer_tiktok_username.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-foreground">
                              {item.nickname ?? item.buyer_tiktok_username}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              @{item.buyer_tiktok_username}
                              {group.rows.length > 1 && (
                                <>
                                  {" · "}
                                  {(groupTotalCents / 100).toFixed(2)} € au total
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <span className="block pl-10.5 text-xs text-muted-foreground">
                          même acheteur
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="w-20">
                      <Badge
                        size="lg"
                        className="rounded-md bg-secondary px-3 py-1 text-xl font-bold text-secondary-foreground"
                      >
                        #{item.order_number}
                      </Badge>
                    </TableCell>
                    <TableCell className="w-24 tabular-nums text-muted-foreground">
                      {formatTime(item.received_at)}
                    </TableCell>
                    <TableCell className="w-28 text-right font-medium tabular-nums text-foreground">
                      {(subtotalCents / 100).toFixed(2)} €
                    </TableCell>
                    <TableCell className="w-32 text-right">
                      {order?.status === "paid" ? (
                        <Badge variant="success" className="bg-[#00F2EA] text-black">Payée</Badge>
                      ) : order && isOrderExpired(order, lastAddedAtByOrderId.get(order.id), shopSettings) ? (
                        <Badge variant="destructive">Délai dépassé</Badge>
                      ) : (
                        <Badge variant="outline">En attente</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ));
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// Aperçu net affiché sous le curseur pendant le glisser (DragOverlay) — un
// vrai composant React stylisé, pas la capture d'écran semi-transparente que
// le navigateur produit par défaut avec l'API HTML5 native.
function DraggedProductPreview({
  product,
}: {
  product: { name: string; price_cents: number; internal_ref?: string };
}) {
  return (
    <Card className="w-64 cursor-grabbing border-[#00F2EA] shadow-lg">
      <CardContent className="flex items-center gap-2 p-3">
        <Package className="size-5 shrink-0 text-cyan-500" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
          <p className="text-xs text-muted-foreground">
            {product.internal_ref ? `${product.internal_ref} · ` : ""}
            {(product.price_cents / 100).toFixed(2)} €
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// Barre de création express : toujours visible, un seul geste ("un article =
// un geste en moins d'une seconde"). Le prix est le seul champ obligatoire et
// reste focus par défaut ; Entrée valide (crée + active) puis refocus le prix
// pour l'article suivant, sans jamais ouvrir de modale.
function RapidCreationBar({
  liveId,
  nextSeqHint,
  onCreated,
}: {
  liveId: string;
  nextSeqHint: number;
  onCreated: () => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const priceRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const price = priceRef.current?.value;
    if (!price || Number(price) <= 0) {
      priceRef.current?.focus();
      return;
    }

    const formData = new FormData();
    formData.set("price", price);
    formData.set("name", nameRef.current?.value ?? "");

    startTransition(async () => {
      await createAndActivateRapidProduct(liveId, formData);
      // Filet de sécurité : le nouveau produit doit apparaître immédiatement
      // même si le canal Realtime est déconnecté/lent à relayer l'événement
      // — même piège que celui déjà corrigé sur assignRapidItemToProduct.
      await onCreated();
    });

    if (priceRef.current) priceRef.current.value = "";
    if (nameRef.current) nameRef.current.value = "";
    priceRef.current?.focus();
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-end gap-3">
          <Field className="w-24 gap-1.5">
            <FieldLabel htmlFor="rapid-price" className="text-xs">
              Prix
            </FieldLabel>
            <Input
              id="rapid-price"
              ref={priceRef}
              type="number"
              min={0}
              step="0.01"
              autoFocus
              placeholder="0 €"
              className="text-lg font-semibold tabular-nums"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </Field>

          <Field className="min-w-0 flex-1 gap-1.5">
            <FieldLabel htmlFor="rapid-name" className="text-xs">
              Nom
            </FieldLabel>
            <Input
              id="rapid-name"
              ref={nameRef}
              placeholder={`Auto : Article A${nextSeqHint}`}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </Field>
        </div>

        <Button
          onClick={submit}
          disabled={isPending}
          variant="secondary"
          className="w-full"
        >
          <Radio />
          À l&apos;antenne
        </Button>
      </CardContent>
    </Card>
  );
}

// Cartes produit = sources de glisser-déposer (useDraggable de @dnd-kit).
// Plusieurs produits peuvent être "à l'antenne" simultanément — la barre de
// création en ajoute un de plus sans jamais retirer les précédents (cf.
// rapid-actions.ts createAndActivateRapidProduct). Chaque carte a son propre
// stepper de quantité (dragQuantities, par product id) — glisser une carte
// applique la quantité réglée sur CETTE carte, indépendamment des autres.
function ActiveAndPreviousProducts({
  liveId,
  activeProducts,
  previousProducts,
  countByProduct,
  isPending,
  startTransition,
  dragQuantities,
  setDragQuantities,
}: {
  liveId: string;
  activeProducts: LiveProduct[];
  previousProducts: LiveProduct[];
  countByProduct: Map<string, number>;
  isPending: boolean;
  startTransition: (callback: () => void) => void;
  dragQuantities: Record<string, number>;
  setDragQuantities: (updater: (prev: Record<string, number>) => Record<string, number>) => void;
}) {
  return (
    <>
      {activeProducts.length > 0 ? (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col gap-3">
            {activeProducts.map((product) => (
              <li key={product.id} className="list-none">
                <DraggableProductCard id={product.id}>
                  <Card className="border-secondary shadow-[0_0_0_1px_rgba(37,244,238,0.08),0_8px_24px_-12px_rgba(37,244,238,0.35)]">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <Badge variant="default" className="mb-2">
                            À l&apos;antenne
                          </Badge>
                          <p className="truncate text-base font-medium text-foreground">
                            {product.name}
                          </p>
                          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <p className="text-sm text-muted-foreground">
                              {product.internal_ref} · {(product.price_cents / 100).toFixed(2)} €
                            </p>
                            <DiscountSummary product={product} />
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-3">
                          <span className="text-sm tabular-nums text-muted-foreground">
                            {countByProduct.get(product.id) ?? 0} preneurs
                          </span>
                          <QuantityStepper
                            value={dragQuantities[product.id] ?? 1}
                            onChange={(value) =>
                              setDragQuantities((prev) => ({ ...prev, [product.id]: value }))
                            }
                          />
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-end gap-2 border-t pt-3">
                        <EditablePrice
                          liveId={liveId}
                          product={product}
                          startTransition={startTransition}
                        />
                        <EditableDiscountTiers
                          liveId={liveId}
                          product={product}
                          startTransition={startTransition}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={isPending}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() =>
                            startTransition(() => retireRapidProduct(liveId, product.id))
                          }
                        >
                          Retirer
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </DraggableProductCard>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <Empty className="rounded-xl border py-10">
          <EmptyHeader>
            <EmptyTitle>Aucun produit à l&apos;antenne</EmptyTitle>
            <EmptyDescription>
              Utilise la barre de création ci-dessus pour lancer le prochain article.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {previousProducts.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-foreground">Produits précédents</h3>
          <ScrollArea className="h-42" scrollFade>
            <ul className="flex flex-col gap-2 pr-1">
              {previousProducts.map((product) => (
                <li key={product.id} className="list-none">
                  <DraggableProductCard id={product.id}>
                    <Card>
                      <CardContent className="flex items-center justify-between p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {product.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {product.internal_ref} · {(product.price_cents / 100).toFixed(2)} €
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="text-sm tabular-nums text-muted-foreground">
                            {countByProduct.get(product.id) ?? 0} preneurs
                          </span>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={isPending}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() =>
                              startTransition(() => reactivateRapidProduct(liveId, product.id))
                            }
                          >
                            Remettre à l&apos;antenne
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </DraggableProductCard>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>
      )}
    </>
  );
}

// Onglet "Catalogue" : cartes glissables préfixées ("catalog:") pour que
// performAssign (RapidConsoleClient) sache quelle RPC de matérialisation
// appeler avant assignRapidItemToProduct — glisser une de ces cartes ne
// modifie rien tant que le drop n'a pas eu lieu (contrairement à "À la
// volée", ces produits n'existent pas encore dans live_products pour CE
// live).
function CatalogProductsPanel({
  liveId,
  catalogSearch,
  productCatalogs,
  catalogProducts,
  setCatalogProducts,
  countByProduct,
  isPending,
  startTransition,
  dragQuantities,
  setDragQuantities,
}: {
  liveId: string;
  catalogSearch: string;
  productCatalogs: ProductCatalog[];
  catalogProducts: CatalogProduct[];
  setCatalogProducts: (products: CatalogProduct[]) => void;
  isPending: boolean;
  startTransition: (callback: () => void) => void;
  countByProduct: Map<string, number>;
  dragQuantities: Record<string, number>;
  setDragQuantities: (updater: (prev: Record<string, number>) => Record<string, number>) => void;
}) {
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);

  const normalizedSearch = catalogSearch.trim().toLowerCase();
  // Les produits déjà à l'antenne remontent en haut de la pile — sinon un
  // catalogue avec beaucoup de produits oblige à faire défiler pour
  // retrouver celui qu'on vient d'activer. Tri stable : l'ordre relatif
  // d'origine (celui de product_catalog_items, cf. getCatalogProducts) est
  // préservé à l'intérieur de chaque groupe actif/inactif.
  const sortedCatalogProducts = [...catalogProducts].sort((a, b) => {
    const aActive = a.liveProduct && !a.liveProduct.retired_at ? 1 : 0;
    const bActive = b.liveProduct && !b.liveProduct.retired_at ? 1 : 0;
    return bActive - aActive;
  });
  const filteredCatalogProducts = normalizedSearch
    ? sortedCatalogProducts.filter((p) => p.name.toLowerCase().includes(normalizedSearch))
    : sortedCatalogProducts;

  // Recharge catalogProducts (id, liveProduct/retired_at, internal_ref) —
  // startTransition (runAction du parent) rafraîchit déjà "Produits actifs"
  // côté À la volée après une action, mais catalogProducts est un state
  // séparé qu'il ne touche jamais : sans ce rappel explicite, une carte
  // catalogue restait figée sur son ancien état (toujours "Mettre à
  // l'antenne"/"Retirer" affiché) même quand l'action avait bien réussi.
  const refreshCatalog = async (catalogId: string) => {
    const refreshed = await getCatalogProducts(liveId, catalogId);
    setCatalogProducts(
      refreshed.map((p) => ({ ...p, discount_tiers_cents: parseDiscountTiers(p.discount_tiers_cents) }))
    );
  };

  const handleSelectCatalog = async (catalogId: string) => {
    setSelectedCatalogId(catalogId);
    setCatalogProducts([]);
    if (!catalogId) return;
    setIsLoadingCatalog(true);

    const products = await getCatalogProducts(liveId, catalogId);
    const parsed: CatalogProduct[] = products.map((p) => ({
      ...p,
      discount_tiers_cents: parseDiscountTiers(p.discount_tiers_cents),
    }));

    // Le premier produit du catalogue passe automatiquement à l'antenne dès
    // la sélection, s'il ne l'est pas déjà pour ce live — cohérent avec
    // "démarrer le live avec au moins un article visible" sans exiger un
    // clic supplémentaire. Les suivants restent inactifs jusqu'à un clic
    // explicite "Mettre à l'antenne".
    const first = parsed[0];
    if (first && !first.liveProduct) {
      startTransition(async () => {
        await materializeFromPrepared(liveId, first.id);
        await refreshCatalog(catalogId);
      });
    } else {
      setCatalogProducts(parsed);
    }

    setIsLoadingCatalog(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">Choisir un catalogue préparé</h3>
        <Select value={selectedCatalogId} onValueChange={(v) => handleSelectCatalog(v as string)}>
          <SelectTrigger>
            <SelectValue placeholder="Choisir un catalogue…" />
          </SelectTrigger>
          <SelectContent>
            {productCatalogs.map((catalog) => (
              // label explicite (texte pur) : le children JSX composé
              // ci-dessous (nom + date optionnelle) empêche Base UI d'en
              // extraire automatiquement un libellé, et SelectValue retombe
              // alors sur l'id brut affiché dans le champ — cf.
              // resolveSelectedLabel (@base-ui/react/internals).
              <SelectItem key={catalog.id} value={catalog.id} label={catalog.name}>
                {catalog.name}
                {catalog.scheduled_for &&
                  ` — ${new Date(`${catalog.scheduled_for}T00:00:00`).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                  })}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isLoadingCatalog ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Chargement…</p>
        ) : selectedCatalogId && filteredCatalogProducts.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Aucun produit dans ce catalogue.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {filteredCatalogProducts.map((product) => (
              <li key={product.id} className="list-none">
                <DraggableProductCard id={`catalog:${product.id}`}>
                  <CatalogPreparedProductCard
                    liveId={liveId}
                    product={product}
                    count={countByProduct.get(product.id) ?? 0}
                    quantity={dragQuantities[`catalog:${product.id}`] ?? 1}
                    onQuantityChange={(value) =>
                      setDragQuantities((prev) => ({ ...prev, [`catalog:${product.id}`]: value }))
                    }
                    isPending={isPending}
                    startTransition={(callback) =>
                      startTransition(async () => {
                        await callback();
                        await refreshCatalog(selectedCatalogId);
                      })
                    }
                    onProductChanged={(updated) =>
                      setCatalogProducts(
                        catalogProducts.map((p) =>
                          p.id === updated.id ? { ...updated, liveProduct: p.liveProduct } : p
                        )
                      )
                    }
                    onDeleted={() =>
                      setCatalogProducts(catalogProducts.filter((p) => p.id !== product.id))
                    }
                  />
                </DraggableProductCard>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Carte glissable pour "catalog:" (produits préparés, cf.
// CatalogProductsPanel) — bascule entre DEUX rendus complets selon que le
// produit a déjà été matérialisé en live_products pour CE live
// (product.liveProduct, cf. getCatalogProducts/source_prepared_product_id) :
//
// - Actif (liveProduct existe, retired_at null) : même rendu que les
//   produits "à la volée" actifs (ActiveAndPreviousProducts) — bordure
//   cyan, badge "À l'antenne", Modifier/Remises/Retirer. "Retirer" agit sur
//   le live_products matérialisé (retireRapidProduct), pas sur le
//   prepared_product source.
// - Retiré (liveProduct existe, retired_at posé) : rendu simple façon
//   "Produits précédents" (référence interne visible) + "Mettre à
//   l'antenne" qui RÉ-active ce même live_products (reactivateRapidProduct),
//   sans en recréer un second.
// - Jamais matérialisé (liveProduct null) : rendu simple sans référence +
//   "Mettre à l'antenne" qui matérialise pour la première fois
//   (materializeFromPrepared).
//
// Modifier/Remises éditent toujours le prepared_product directement (pas le
// live_products, même une fois actif) : la bibliothèque catalogue reste la
// source de vérité pour ces réglages, cohérent avec "un produit vit dans un
// catalogue" (cf. /dashboard/produits-prepares).
function CatalogPreparedProductCard({
  liveId,
  product,
  count,
  quantity,
  onQuantityChange,
  isPending,
  startTransition,
  onProductChanged,
  onDeleted,
}: {
  liveId: string;
  product: CatalogProduct;
  count: number;
  quantity: number;
  onQuantityChange: (value: number) => void;
  isPending: boolean;
  startTransition: (callback: () => void | Promise<void>) => void;
  onProductChanged: (product: CatalogProduct) => void;
  onDeleted: () => void;
}) {
  const isActive = !!product.liveProduct && !product.liveProduct.retired_at;

  if (isActive) {
    return (
      <Card className="border-secondary shadow-[0_0_0_1px_rgba(37,244,238,0.08),0_8px_24px_-12px_rgba(37,244,238,0.35)]">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Badge variant="default" className="mb-2">
                À l&apos;antenne
              </Badge>
              <p className="truncate text-base font-medium text-foreground">{product.name}</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <p className="text-sm text-muted-foreground">{(product.price_cents / 100).toFixed(2)} €</p>
                <DiscountSummary product={product} />
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-3">
              <span className="text-sm tabular-nums text-muted-foreground">{count} preneurs</span>
              <QuantityStepper value={quantity} onChange={onQuantityChange} />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2 border-t pt-3">
            <EditablePreparedProductPrice
              product={product}
              onChanged={onProductChanged}
              onDeleted={onDeleted}
            />
            <EditablePreparedProductDiscountTiers product={product} onChanged={onProductChanged} />
            <Button
              size="sm"
              variant="secondary"
              disabled={isPending}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                const liveProductId = product.liveProduct?.id;
                if (!liveProductId) return;
                startTransition(async () => {
                  await retireRapidProduct(liveId, liveProductId);
                });
              }}
            >
              Retirer
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex items-center justify-between p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
          <p className="text-xs text-muted-foreground">
            {product.liveProduct && `${product.liveProduct.internal_ref} · `}
            {(product.price_cents / 100).toFixed(2)} €
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm tabular-nums text-muted-foreground">{count} preneurs</span>
          <Button
            size="sm"
            variant="secondary"
            disabled={isPending}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              const liveProductId = product.liveProduct?.id;
              startTransition(async () => {
                if (liveProductId) {
                  await reactivateRapidProduct(liveId, liveProductId);
                } else {
                  await materializeFromPrepared(liveId, product.id);
                }
              });
            }}
          >
            Mettre à l&apos;antenne
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Même configuration Modifier/Remises que EditablePrice/EditableDiscountTiers
// (produits "à la volée" ci-dessus), mais branchée sur
// updatePreparedProductPrice/DiscountTiers (produits-prepares/actions.ts) —
// le produit d'une carte "catalog:" est un prepared_product, pas encore un
// live_products tant qu'il n'a pas été matérialisé (glissé, ou "Mettre à
// l'antenne"). onDeleted supprime ce prepared_product lui-même (donc sort le
// produit de tous les catalogues qui le contenaient, cf. ON DELETE CASCADE
// sur product_catalog_items) — n'affecte jamais un éventuel live_products
// déjà matérialisé pour ce produit (ON DELETE SET NULL sur
// source_prepared_product_id), qui continue d'exister côté "à la volée".
function EditablePreparedProductPrice<T extends PreparedProduct>({
  product,
  onChanged,
  onDeleted,
}: {
  product: T;
  onChanged: (product: T) => void;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmingDelete(false);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onPointerDown={(e) => e.stopPropagation()}
            className="shrink-0"
          >
            Modifier
          </Button>
        }
      />
      <PopoverContent align="end" className="w-56" onPointerDown={(e) => e.stopPropagation()}>
        <PopoverTitle className="mb-3 text-sm">Modifier le produit</PopoverTitle>
        <form
          action={(formData) => {
            const price = Number(formData.get("price") ?? 0);
            const name = String(formData.get("name") ?? "");
            setOpen(false);
            if (Number.isFinite(price) && price > 0) {
              updatePreparedProductPrice(product.id, formData);
              onChanged({
                ...product,
                name: name.trim() || product.name,
                price_cents: Math.round(price * 100),
              });
            }
          }}
          className="flex flex-col gap-3"
        >
          <Field className="gap-1.5">
            <FieldLabel htmlFor={`prepared-name-${product.id}`} className="text-xs">
              Nom
            </FieldLabel>
            <Input
              key={`${product.id}-${product.name}`}
              id={`prepared-name-${product.id}`}
              name="name"
              autoFocus
              defaultValue={product.name}
            />
          </Field>
          <Field className="gap-1.5">
            <FieldLabel htmlFor={`prepared-price-${product.id}`} className="text-xs">
              Prix (€)
            </FieldLabel>
            <Input
              key={`${product.id}-${product.price_cents}`}
              id={`prepared-price-${product.id}`}
              name="price"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={(product.price_cents / 100).toFixed(2)}
            />
          </Field>
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" size="sm">
              Valider
            </Button>
          </div>
        </form>

        <Separator className="my-3" />

        <Button
          type="button"
          size="sm"
          variant={confirmingDelete ? "destructive" : "ghost"}
          disabled={isDeleting}
          className={cn("w-full", !confirmingDelete && "text-destructive hover:text-destructive")}
          onClick={async () => {
            if (!confirmingDelete) {
              setConfirmingDelete(true);
              return;
            }
            setIsDeleting(true);
            await deletePreparedProduct(product.id);
            setOpen(false);
            onDeleted();
          }}
        >
          {confirmingDelete ? "Confirmer la suppression ?" : "Supprimer"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function EditablePreparedProductDiscountTiers<T extends PreparedProduct>({
  product,
  onChanged,
}: {
  product: T;
  onChanged: (product: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const resetAllToZero = () => {
    formRef.current?.querySelectorAll<HTMLInputElement>('input[type="number"]').forEach((input) => {
      input.value = "";
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onPointerDown={(e) => e.stopPropagation()}
            className="shrink-0"
          >
            Remises
          </Button>
        }
      />
      <PopoverContent align="end" className="w-96" onPointerDown={(e) => e.stopPropagation()}>
        <PopoverTitle className="mb-3 text-sm">Remises par quantité</PopoverTitle>
        <form
          ref={formRef}
          action={(formData) => {
            setOpen(false);
            updatePreparedProductDiscountTiers(product.id, formData);

            const tiers: Record<string, number> = {};
            for (let qty = 1; qty <= 8; qty++) {
              const raw = formData.get(`discount_${qty}`);
              const euros = raw === null || raw === "" ? null : Number(raw);
              if (euros !== null && Number.isFinite(euros) && euros > 0) {
                tiers[String(qty)] = Math.round(euros * 100);
              }
            }
            const rawSimple = formData.get("discount_simple");
            const simpleEuros = rawSimple === null || rawSimple === "" ? null : Number(rawSimple);
            const simpleDiscountCents =
              simpleEuros !== null && Number.isFinite(simpleEuros) && simpleEuros > 0
                ? Math.round(simpleEuros * 100)
                : 0;
            onChanged({ ...product, discount_tiers_cents: tiers, simple_discount_cents: simpleDiscountCents });
          }}
          className="flex flex-col gap-2"
        >
          <Field className="gap-1">
            <FieldLabel htmlFor={`prepared-discount-simple-${product.id}`} className="text-xs">
              Remise simple (€)
            </FieldLabel>
            <Input
              id={`prepared-discount-simple-${product.id}`}
              name="discount_simple"
              type="number"
              min={0}
              step="0.01"
              placeholder="0.00"
              defaultValue={
                product.simple_discount_cents ? (product.simple_discount_cents / 100).toFixed(2) : ""
              }
            />
          </Field>

          <Separator className="my-1" />

          <p className="text-xs text-muted-foreground">
            Remises par quantité exacte (prioritaires sur la remise simple)
          </p>
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 8 }, (_, i) => i + 1).map((qty) => (
              <Field key={qty} className="gap-1">
                <FieldLabel htmlFor={`prepared-discount-${product.id}-${qty}`} className="text-xs">
                  {qty}×
                </FieldLabel>
                <Input
                  id={`prepared-discount-${product.id}-${qty}`}
                  name={`discount_${qty}`}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  defaultValue={
                    product.discount_tiers_cents[String(qty)]
                      ? (product.discount_tiers_cents[String(qty)] / 100).toFixed(2)
                      : ""
                  }
                />
              </Field>
            ))}
          </div>

          <div className="mt-1 flex items-center justify-between gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={resetAllToZero}>
              Réinitialiser à 0
            </Button>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" size="sm" variant="success">
                Valider
              </Button>
            </div>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

// Quantité appliquée au prochain glisser-déposer du produit actif (cf.
// dragQuantity dans RapidConsoleClient) — stopPropagation sur pointerdown
// pour que cliquer +/- ne déclenche pas le drag de la carte parente
// (useDraggable écoute pointerdown via {...listeners} sur tout le conteneur).
function QuantityStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div
      className="flex items-center gap-1"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        className="flex size-6 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent"
        aria-label="Diminuer la quantité"
      >
        <Minus className="size-3" />
      </button>
      <span className="w-5 text-center text-sm font-medium tabular-nums text-foreground">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="flex size-6 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent"
        aria-label="Augmenter la quantité"
      >
        <Plus className="size-3" />
      </button>
    </div>
  );
}

// "2" -> "2ème", "1" -> "1er" — pour "Remise sur le Nème article".
function ordinal(n: number): string {
  return n === 1 ? "1er" : `${n}ème`;
}

// Résumé des remises configurées sur le produit actif, affiché directement
// sur la carte "à l'antenne" (paliers exacts + remise simple en fallback,
// cf. lookupDiscountCents côté serveur) — n'affiche rien si aucune remise
// n'est configurée.
function DiscountSummary({
  product,
}: {
  product: { discount_tiers_cents: Record<string, number>; simple_discount_cents: number };
}) {
  const tierEntries = Object.entries(product.discount_tiers_cents)
    .map(([qty, cents]) => [Number(qty), cents] as const)
    .sort(([a], [b]) => a - b);

  if (tierEntries.length === 0 && product.simple_discount_cents === 0) return null;

  const lines = [
    ...tierEntries.map(
      ([qty, cents]) => `Remise sur le ${ordinal(qty)} article : -${(cents / 100).toFixed(2)} €`
    ),
    ...(product.simple_discount_cents > 0
      ? [`Remise simple : -${(product.simple_discount_cents / 100).toFixed(2)} €`]
      : []),
  ];

  return (
    <div className="flex flex-col gap-0.5 text-sm font-medium text-cyan-600 dark:text-cyan-400">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

// Correction de prix sur la carte "à l'antenne" — même pattern Popover que
// ManualAddPopover/AddToCartPopover (live-console-client.tsx) : bouton
// déclencheur, champ + Annuler/Valider dans le popover. stopPropagation sur
// pointerdown pour ne pas déclencher le drag de la carte parente (même piège
// que QuantityStepper ci-dessus).
function EditablePrice({
  liveId,
  product,
  startTransition,
}: {
  liveId: string;
  product: LiveProduct;
  startTransition: (callback: () => void) => void;
}) {
  const [open, setOpen] = useState(false);
  // Confirmation à deux clics dans le même popover plutôt qu'un AlertDialog
  // imbriqué dans ce Popover (risque de conflit focus/z-index entre les deux
  // primitives Base UI) — le bouton "Supprimer" devient "Confirmer ?" au
  // premier clic, la suppression réelle n'a lieu qu'au second.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setConfirmingDelete(false);
          setDeleteError(null);
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onPointerDown={(e) => e.stopPropagation()}
            className="shrink-0"
          >
            Modifier
          </Button>
        }
      />
      <PopoverContent align="end" className="w-56" onPointerDown={(e) => e.stopPropagation()}>
        <PopoverTitle className="mb-3 text-sm">Modifier le produit</PopoverTitle>
        <form
          action={(formData) => {
            const price = Number(formData.get("price") ?? 0);
            const name = String(formData.get("name") ?? "");
            setOpen(false);
            if (Number.isFinite(price) && price > 0) {
              startTransition(() => updateRapidProductPrice(liveId, product.id, price, name));
            }
          }}
          className="flex flex-col gap-3"
        >
          <Field className="gap-1.5">
            <FieldLabel htmlFor={`name-${product.id}`} className="text-xs">
              Nom
            </FieldLabel>
            <Input
              key={`${product.id}-${product.name}`}
              id={`name-${product.id}`}
              name="name"
              autoFocus
              defaultValue={product.name}
            />
          </Field>
          <Field className="gap-1.5">
            <FieldLabel htmlFor={`price-${product.id}`} className="text-xs">
              Prix (€)
            </FieldLabel>
            <Input
              key={`${product.id}-${product.price_cents}`}
              id={`price-${product.id}`}
              name="price"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={(product.price_cents / 100).toFixed(2)}
            />
          </Field>
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" size="sm">
              Valider
            </Button>
          </div>
        </form>

        <Separator className="my-3" />

        {deleteError && <p className="mb-2 text-xs text-destructive">{deleteError}</p>}
        <Button
          type="button"
          size="sm"
          variant={confirmingDelete ? "destructive" : "ghost"}
          className={cn("w-full", !confirmingDelete && "text-destructive hover:text-destructive")}
          onClick={() => {
            if (!confirmingDelete) {
              setConfirmingDelete(true);
              return;
            }
            startTransition(async () => {
              const result = await deleteRapidProduct(liveId, product.id);
              if (result.error) {
                setConfirmingDelete(false);
                setDeleteError(result.error);
              } else {
                setOpen(false);
              }
            });
          }}
        >
          {confirmingDelete ? "Confirmer la suppression ?" : "Supprimer"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// Remises par quantité exacte (1 à 8, en euros) sur le produit actif — même
// pattern Popover que EditablePrice ci-dessus, stopPropagation pour ne pas
// déclencher le drag de la carte parente.
function EditableDiscountTiers({
  liveId,
  product,
  startTransition,
}: {
  liveId: string;
  product: LiveProduct;
  startTransition: (callback: () => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const resetAllToZero = () => {
    formRef.current?.querySelectorAll<HTMLInputElement>('input[type="number"]').forEach((input) => {
      input.value = "";
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onPointerDown={(e) => e.stopPropagation()}
            className="shrink-0"
          >
            Remises
          </Button>
        }
      />
      <PopoverContent align="end" className="w-96" onPointerDown={(e) => e.stopPropagation()}>
        <PopoverTitle className="mb-3 text-sm">Remises par quantité</PopoverTitle>
        <form
          ref={formRef}
          action={(formData) => {
            setOpen(false);
            startTransition(() => updateRapidProductDiscountTiers(liveId, product.id, formData));
          }}
          className="flex flex-col gap-2"
        >
          <Field className="gap-1">
            <FieldLabel htmlFor={`discount-simple-${product.id}`} className="text-xs">
              Remise simple (€)
            </FieldLabel>
            <Input
              id={`discount-simple-${product.id}`}
              name="discount_simple"
              type="number"
              min={0}
              step="0.01"
              placeholder="0.00"
              defaultValue={
                product.simple_discount_cents ? (product.simple_discount_cents / 100).toFixed(2) : ""
              }
            />
          </Field>

          <Separator className="my-1" />

          <p className="text-xs text-muted-foreground">
            Remises par quantité exacte (prioritaires sur la remise simple)
          </p>
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 8 }, (_, i) => i + 1).map((qty) => (
              <Field key={qty} className="gap-1">
                <FieldLabel htmlFor={`discount-${product.id}-${qty}`} className="text-xs">
                  {qty}×
                </FieldLabel>
                <Input
                  id={`discount-${product.id}-${qty}`}
                  name={`discount_${qty}`}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  defaultValue={
                    product.discount_tiers_cents[String(qty)]
                      ? (product.discount_tiers_cents[String(qty)] / 100).toFixed(2)
                      : ""
                  }
                />
              </Field>
            ))}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={resetAllToZero}>
              Réinitialiser à 0
            </Button>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button
                type="submit"
                size="sm"
                variant="success"
                className="border-[#00F2EA] bg-[#00F2EA] text-black shadow-[#00F2EA]/24 hover:bg-[#00F2EA]/90 data-pressed:bg-[#00F2EA]/90"
              >
                Valider
              </Button>
            </div>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function DraggableProductCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn("cursor-grab touch-none active:cursor-grabbing", isDragging && "opacity-40")}
    >
      {children}
    </div>
  );
}

function RapidIntentFeed({
  items,
  itemProducts,
  products,
  isPending,
  onDelete,
  onUnassign,
}: {
  items: RapidItem[];
  itemProducts: RapidItemProduct[];
  products: LiveProduct[];
  isPending: boolean;
  onDelete: (itemId: string) => void;
  onUnassign: (itemId: string, productId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <Empty className="rounded-xl border py-10">
        <EmptyHeader>
          <EmptyTitle>Aucune intention d&apos;achat pour l&apos;instant</EmptyTitle>
          <EmptyDescription>
            Les intentions d&apos;achat des acheteurs apparaîtront ici en temps réel.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ScrollArea className="max-h-[calc(100vh-20rem)]" scrollFade>
      <div className="flex flex-col gap-4 px-1">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.div key={item.id} layout {...listItemMotion}>
              <RapidIntentCard
                item={item}
                assignedLinks={itemProducts.filter((link) => link.live_rapid_item_id === item.id)}
                products={products}
                isPending={isPending}
                onDelete={onDelete}
                onUnassign={onUnassign}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ScrollArea>
  );
}

// Carte d'intention = cible de dépôt (useDroppable de @dnd-kit). Peut porter
// plusieurs produits assignés simultanément (assignedLinks), chacun avec son
// propre bouton de retrait — glisser un produit sur la carte AJOUTE toujours
// une ligne (cf. rapid-actions.ts assignRapidItemToProduct), ne remplace
// jamais les produits déjà assignés.
function RapidIntentCard({
  item,
  assignedLinks,
  products,
  isPending,
  onDelete,
  onUnassign,
}: {
  item: RapidItem;
  assignedLinks: RapidItemProduct[];
  products: LiveProduct[];
  isPending: boolean;
  onDelete: (itemId: string) => void;
  onUnassign: (itemId: string, productId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: item.id });

  return (
    <Card ref={setNodeRef} className={cn(isOver && "ring-2 ring-secondary bg-secondary/5")}>
      <CardContent className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded-full bg-[conic-gradient(from_180deg,#FE2C55,#00F2EA,#FE2C55)] p-[1.5px]">
            <Avatar className="size-7 border-2 border-card">
              <AvatarImage src={item.profile_picture_url ?? undefined} alt={item.buyer_tiktok_username} />
              <AvatarFallback className="text-xs">
                {item.buyer_tiktok_username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </span>
          <div className="min-w-0 flex-1">
            {item.nickname && (
              <p className="truncate text-sm font-medium text-foreground">{item.nickname}</p>
            )}
            <p className="truncate text-xs text-muted-foreground">@{item.buyer_tiktok_username}</p>
          </div>
          {item.order_number !== null && assignedLinks.length > 0 && (
            <Badge
              size="lg"
              className="rounded-md bg-secondary px-3 py-1 text-xl font-bold text-secondary-foreground"
            >
              #{item.order_number}
            </Badge>
          )}
        </div>

        <p className="truncate text-base font-medium text-foreground">
          &quot;{item.source_comment}&quot;
        </p>

        <Separator />

        {assignedLinks.length > 0 ? (
          <div className="flex flex-col gap-2">
            {assignedLinks.map((link) => {
              const product = products.find((p) => p.id === link.live_product_id);
              if (!product) return null;
              return (
                <RapidAssignedProductRow
                  key={link.id}
                  link={link}
                  product={product}
                  isPending={isPending}
                  onUnassign={() => onUnassign(item.id, link.live_product_id)}
                />
              );
            })}
          </div>
        ) : (
          <p className="rounded border border-dashed p-2 text-center text-xs text-muted-foreground">
            Glisser un produit ici
          </p>
        )}

        <DeleteIntentButton
          onConfirm={() => onDelete(item.id)}
          isPending={isPending}
          hasAssignedProducts={assignedLinks.length > 0}
        />
      </CardContent>
    </Card>
  );
}

// Bouton texte discret + confirmation, plutôt qu'une icône flottante sur la
// carte : la suppression d'une intention est définitive côté serveur
// (deleteRapidItem) et retire aussi tous ses produits assignés le cas
// échéant — mérite un geste explicite, pas un clic accidentel sur un "X".
function DeleteIntentButton({
  onConfirm,
  isPending,
  hasAssignedProducts,
}: {
  onConfirm: () => void;
  isPending: boolean;
  hasAssignedProducts: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            className="w-full justify-center text-muted-foreground hover:text-destructive"
          >
            <Trash2 />
            Supprimer cette intention
          </Button>
        }
      />
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer cette intention d&apos;achat ?</AlertDialogTitle>
          <AlertDialogDescription>
            {hasAssignedProducts
              ? "Les produits déjà assignés à cette intention seront aussi retirés de la commande. Cette action est irréversible."
              : "Cette action est irréversible."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="secondary">Annuler</Button>} />
          <Button
            variant="destructive"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            Supprimer
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

// Une ligne = un produit assigné (quantité, remise éventuelle, retrait
// individuel) — plusieurs de ces lignes peuvent coexister sur une même carte.
function RapidAssignedProductRow({
  link,
  product,
  isPending,
  onUnassign,
}: {
  link: RapidItemProduct;
  product: LiveProduct;
  isPending: boolean;
  onUnassign: () => void;
}) {
  if (link.discount_cents > 0) {
    return (
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm">
          <p className="text-muted-foreground">
            {link.quantity}× {product.name} ({product.internal_ref})
          </p>
          <p className="text-foreground">
            Sous-total : {((product.price_cents * link.quantity) / 100).toFixed(2)} €
          </p>
          <p className="text-destructive">
            Remise : -{(link.discount_cents / 100).toFixed(2)} €
          </p>
          <p className="font-medium text-foreground">
            Total : {((product.price_cents * link.quantity - link.discount_cents) / 100).toFixed(2)} €
          </p>
        </div>
        <button
          onClick={onUnassign}
          disabled={isPending}
          className="shrink-0 text-muted-foreground hover:text-destructive"
          aria-label="Retirer ce produit"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm text-foreground">
        {link.quantity}× {product.name} ({product.internal_ref}) —{" "}
        {((product.price_cents * link.quantity) / 100).toFixed(2)} €
      </p>
      <button
        onClick={onUnassign}
        disabled={isPending}
        className="shrink-0 text-muted-foreground hover:text-destructive"
        aria-label="Retirer ce produit"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
