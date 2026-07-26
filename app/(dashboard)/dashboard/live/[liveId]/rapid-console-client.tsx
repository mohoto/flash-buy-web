"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { AnimatePresence, motion } from "motion/react";
import { Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { LiveCommentsFeed } from "./live-comments-feed";
import {
  createAndActivateRapidProduct,
  reactivateRapidProduct,
  assignRapidItemToProduct,
  deleteRapidItem,
} from "./rapid-actions";

type LiveProduct = {
  id: string;
  name: string;
  price_cents: number;
  internal_ref: string;
  retired_at: string | null;
};

type RapidItem = {
  id: string;
  live_product_id: string | null;
  buyer_tiktok_username: string;
  nickname: string | null;
  profile_picture_url: string | null;
  source_comment: string;
  quantity: number;
  received_at: string;
  created_at: string;
};

const listItemMotion = {
  initial: { scale: 0.96, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.96, opacity: 0 },
  transition: { type: "spring" as const, stiffness: 350, damping: 40 },
};

export function RapidConsoleClient({
  liveId,
  initialProducts,
  initialItems,
}: {
  liveId: string;
  initialProducts: LiveProduct[];
  initialItems: RapidItem[];
}) {
  const [products, setProducts] = useState(initialProducts);
  const [items, setItems] = useState(initialItems);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();

    const refetch = async () => {
      const [{ data: liveProducts }, { data: rapidItems }] = await Promise.all([
        supabase
          .from("live_products")
          .select("id, name, price_cents, internal_ref, retired_at")
          .eq("live_id", liveId)
          .order("created_at", { ascending: true }),
        supabase
          .from("live_rapid_items")
          .select(
            "id, live_product_id, buyer_tiktok_username, nickname, profile_picture_url, source_comment, quantity, received_at, created_at"
          )
          .eq("live_id", liveId)
          .order("created_at", { ascending: false }),
      ]);

      if (liveProducts) setProducts(liveProducts);
      if (rapidItems) setItems(rapidItems);
    };

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveId]);

  const activeProduct = products.find((p) => !p.retired_at) ?? null;
  const previousProducts = products.filter((p) => p.retired_at).reverse();

  const countByProduct = new Map<string, number>();
  for (const item of items) {
    if (!item.live_product_id) continue;
    countByProduct.set(item.live_product_id, (countByProduct.get(item.live_product_id) ?? 0) + item.quantity);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="flex min-w-0 flex-col gap-3">
          <RapidCreationBar liveId={liveId} nextSeqHint={products.length + 1} />
          <ActiveAndPreviousProducts
            liveId={liveId}
            activeProduct={activeProduct}
            previousProducts={previousProducts}
            countByProduct={countByProduct}
            isPending={isPending}
            startTransition={startTransition}
          />
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
          <div className="flex h-160 flex-col">
            <RapidIntentFeed
              liveId={liveId}
              items={items}
              products={products}
              isPending={isPending}
              startTransition={startTransition}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

// Barre de création express : toujours visible, un seul geste ("un article =
// un geste en moins d'une seconde"). Le prix est le seul champ obligatoire et
// reste focus par défaut ; Entrée valide (crée + active) puis refocus le prix
// pour l'article suivant, sans jamais ouvrir de modale.
function RapidCreationBar({ liveId, nextSeqHint }: { liveId: string; nextSeqHint: number }) {
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

        <Button onClick={submit} disabled={isPending} className="w-full">
          <Radio />
          À l&apos;antenne
        </Button>
      </CardContent>
    </Card>
  );
}

// Cartes produit = sources de glisser-déposer (draggable). Transporte
// uniquement l'id du produit via dataTransfer, lu par RapidIntentCard au dépôt.
function ActiveAndPreviousProducts({
  liveId,
  activeProduct,
  previousProducts,
  countByProduct,
  isPending,
  startTransition,
}: {
  liveId: string;
  activeProduct: LiveProduct | null;
  previousProducts: LiveProduct[];
  countByProduct: Map<string, number>;
  isPending: boolean;
  startTransition: (callback: () => void) => void;
}) {
  return (
    <>
      {activeProduct ? (
        <Card
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", activeProduct.id);
            e.dataTransfer.effectAllowed = "copy";
          }}
          className="cursor-grab border-primary/50 active:cursor-grabbing"
        >
          <CardContent className="py-4">
            <Badge className="mb-2">À l&apos;antenne</Badge>
            <h3 className="font-heading text-xl font-semibold text-foreground">
              {activeProduct.name}
            </h3>
            <p className="text-sm text-muted-foreground">
              Réf. interne {activeProduct.internal_ref} · {(activeProduct.price_cents / 100).toFixed(2)} €
            </p>
            <div className="mt-3 flex items-center gap-2 border-t pt-3">
              <span className="font-heading text-2xl font-semibold tabular-nums text-primary">
                {countByProduct.get(activeProduct.id) ?? 0}
              </span>
              <span className="text-sm text-muted-foreground">preneurs</span>
            </div>
          </CardContent>
        </Card>
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
          <ScrollArea className="max-h-[calc(100vh-28rem)]" scrollFade>
            <ul className="flex flex-col gap-2 pr-1">
              {previousProducts.map((product) => (
                <li key={product.id} className="list-none">
                  <Card
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", product.id);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className="cursor-grab active:cursor-grabbing"
                  >
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
                          onClick={() =>
                            startTransition(() => reactivateRapidProduct(liveId, product.id))
                          }
                        >
                          Remettre à l&apos;antenne
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>
      )}
    </>
  );
}

function RapidIntentFeed({
  liveId,
  items,
  products,
  isPending,
  startTransition,
}: {
  liveId: string;
  items: RapidItem[];
  products: LiveProduct[];
  isPending: boolean;
  startTransition: (callback: () => void) => void;
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
      <div className="flex flex-col gap-2 pr-1">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.div key={item.id} layout {...listItemMotion}>
              <RapidIntentCard
                liveId={liveId}
                item={item}
                products={products}
                isPending={isPending}
                startTransition={startTransition}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ScrollArea>
  );
}

// Carte d'intention = cible de dépôt (assignée ou non, pour permettre la
// ré-assignation). onDragOver DOIT appeler preventDefault() sinon onDrop ne
// se déclenche jamais (comportement par défaut du navigateur : refuse le
// dépôt) — piège classique du DnD HTML5 natif.
function RapidIntentCard({
  liveId,
  item,
  products,
  isPending,
  startTransition,
}: {
  liveId: string;
  item: RapidItem;
  products: LiveProduct[];
  isPending: boolean;
  startTransition: (callback: () => void) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const assignedProduct = products.find((p) => p.id === item.live_product_id);

  return (
    <Card
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragEnter={() => setIsDragOver(true)}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const productId = e.dataTransfer.getData("text/plain");
        if (!productId) return;
        startTransition(() => assignRapidItemToProduct(liveId, item.id, productId));
      }}
      className={cn(isDragOver && "ring-2 ring-primary bg-primary/5")}
    >
      <CardContent className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          <Avatar className="size-7 shrink-0">
            <AvatarImage src={item.profile_picture_url ?? undefined} alt={item.buyer_tiktok_username} />
            <AvatarFallback className="text-xs">
              {item.buyer_tiktok_username.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            @{item.buyer_tiktok_username}
          </p>
          <Badge variant="success">Détecté</Badge>
          <button
            onClick={() => startTransition(() => deleteRapidItem(liveId, item.id))}
            disabled={isPending}
            className="shrink-0 text-muted-foreground hover:text-destructive"
            aria-label="Supprimer"
          >
            ×
          </button>
        </div>

        <p className="truncate text-xs text-muted-foreground">
          &quot;{item.source_comment}&quot;
        </p>

        {assignedProduct ? (
          <p className="text-sm text-foreground">
            {item.quantity}× {assignedProduct.name} ({assignedProduct.internal_ref})
          </p>
        ) : (
          <p className="rounded border border-dashed p-2 text-center text-xs text-muted-foreground">
            Glisser un produit ici
          </p>
        )}
      </CardContent>
    </Card>
  );
}
