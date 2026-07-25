"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { AnimatePresence, motion } from "motion/react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LiveCommentsFeed } from "./live-comments-feed";
import {
  addManualItem,
  correctItem,
  deleteItem,
  validateOrder,
} from "./actions";

type Item = {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  size_label: string | null;
  quantity: number;
  unit_price_cents: number;
  raw_product_text: string | null;
  raw_size_text: string | null;
  source_comment: string | null;
  matched: boolean;
  match_score: number | null;
  created_at: string;
};

type OrderWithItems = {
  id: string;
  buyer_tiktok_username: string;
  status: string;
  total_cents: number;
  items: Item[];
};

type ProductOption = {
  id: string;
  name: string;
  variants: { id: string; label: string }[];
};

type Commenter = {
  tiktok_username: string;
  nickname: string | null;
  profile_picture_url: string | null;
};

const listItemMotion = {
  initial: { scale: 0.96, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.96, opacity: 0 },
  transition: { type: "spring" as const, stiffness: 350, damping: 40 },
};

export function LiveConsoleClient({
  liveId,
  initialOrders,
  products,
  saleKeywords,
  commenters,
}: {
  liveId: string;
  initialOrders: OrderWithItems[];
  products: ProductOption[];
  saleKeywords: string[];
  commenters: Commenter[];
}) {
  const saleKeyword = saleKeywords[0] ?? "sold";
  const [orders, setOrders] = useState(initialOrders);
  const [isPending, startTransition] = useTransition();

  // Déjà chargé par la page pour LiveViewersPanel : réutilisé ici pour
  // afficher l'avatar du commentateur sur un item, sans requête supplémentaire.
  const commenterByUsername = new Map(commenters.map((c) => [c.tiktok_username, c]));

  useEffect(() => {
    const supabase = createClient();

    const refetch = async () => {
      const { data: liveOrders } = await supabase
        .from("live_orders")
        .select("id, buyer_tiktok_username, status, total_cents")
        .eq("live_id", liveId)
        .in("status", ["pending", "validated"]);

      if (!liveOrders) return;

      const { data: items } = await supabase
        .from("live_order_items")
        .select(
          "id, live_order_id, product_id, variant_id, size_label, quantity, unit_price_cents, raw_product_text, raw_size_text, source_comment, matched, match_score, created_at"
        )
        .in(
          "live_order_id",
          liveOrders.map((o) => o.id)
        );

      const grouped: OrderWithItems[] = liveOrders.map((order) => ({
        ...order,
        items: (items ?? [])
          .filter((item) => item.live_order_id === order.id)
          .map(({ live_order_id: _live_order_id, ...item }) => item),
      }));

      setOrders(grouped);
    };

    const channel = supabase
      .channel(`live-${liveId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_order_items" },
        refetch
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_orders",
          filter: `live_id=eq.${liveId}`,
        },
        refetch
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveId]);

  const recognizedComments = orders
    .flatMap((order) =>
      order.items
        .filter((item) => item.matched)
        .map((item) => ({ ...item, buyer: order.buyer_tiktok_username }))
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-sm font-medium text-foreground">Tous les commentaires</h2>
        <LiveCommentsFeed liveId={liveId} />
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <Tabs defaultValue="recognized">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTab value="recognized">
                Commentaires reconnus ({recognizedComments.length})
              </TabsTab>
              <TabsTab value="orders">Commandes ({orders.length})</TabsTab>
            </TabsList>
            <ManualAddPopover liveId={liveId} products={products} />
          </div>

          <TabsPanel value="recognized" className="pt-1">
            <RecognizedComments comments={recognizedComments} saleKeyword={saleKeyword} />
          </TabsPanel>

          <TabsPanel value="orders" className="pt-1">
            {orders.length === 0 ? (
              <Empty className="rounded-xl border py-10">
                <EmptyHeader>
                  <EmptyTitle>Aucun achat pour l&apos;instant</EmptyTitle>
                  <EmptyDescription>
                    Les commentaires &quot;{saleKeyword} …&quot; apparaîtront ici en direct.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ScrollArea className="max-h-[calc(100vh-20rem)]" scrollFade>
                <div className="flex flex-col gap-3 pr-1">
                  <AnimatePresence initial={false}>
                    {orders.map((order) => (
                      <motion.div key={order.id} layout {...listItemMotion}>
                        <Card>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-foreground">
                                @{order.buyer_tiktok_username}
                              </span>
                              <div className="flex items-center gap-3">
                                <span className="text-sm tabular-nums text-muted-foreground">
                                  {(order.total_cents / 100).toFixed(2)} €
                                </span>
                                {order.status === "pending" && (
                                  <Button
                                    size="sm"
                                    disabled={isPending}
                                    onClick={() =>
                                      startTransition(() => validateOrder(liveId, order.id))
                                    }
                                  >
                                    Valider
                                  </Button>
                                )}
                                {order.status === "validated" && (
                                  <Badge variant="success">Validée</Badge>
                                )}
                              </div>
                            </div>

                            <ul className="mt-3 flex flex-col gap-2">
                              <AnimatePresence initial={false}>
                                {order.items.map((item) => (
                                  <motion.li
                                    key={item.id}
                                    layout
                                    {...listItemMotion}
                                    className="list-none"
                                  >
                                    <div
                                      className={
                                        item.matched
                                          ? "flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm"
                                          : "flex items-center justify-between rounded-md bg-destructive/8 px-3 py-2 text-sm dark:bg-destructive/16"
                                      }
                                    >
                                      {item.matched ? (
                                        <span>
                                          {item.quantity}× {productNameFor(products, item.product_id)}
                                          {item.size_label ? ` — ${item.size_label}` : ""}
                                        </span>
                                      ) : (
                                        <div className="flex flex-1 items-center gap-2">
                                          {(() => {
                                            const commenter = commenterByUsername.get(
                                              order.buyer_tiktok_username
                                            );
                                            return (
                                              <Avatar className="size-6">
                                                <AvatarImage
                                                  src={commenter?.profile_picture_url ?? undefined}
                                                  alt={order.buyer_tiktok_username}
                                                />
                                                <AvatarFallback className="text-[10px]">
                                                  {order.buyer_tiktok_username.slice(0, 2).toUpperCase()}
                                                </AvatarFallback>
                                              </Avatar>
                                            );
                                          })()}
                                          <span className="text-destructive-foreground">
                                            &quot;{item.raw_product_text ?? "?"}
                                            {item.raw_size_text ? ` ${item.raw_size_text}` : ""}&quot;
                                            non reconnu
                                          </span>
                                          <CorrectItemForm
                                            liveId={liveId}
                                            itemId={item.id}
                                            products={products}
                                          />
                                        </div>
                                      )}
                                      <button
                                        onClick={() =>
                                          startTransition(() => deleteItem(liveId, item.id))
                                        }
                                        className="ml-2 shrink-0 text-muted-foreground hover:text-destructive"
                                        aria-label="Supprimer"
                                      >
                                        <X className="size-3.5" />
                                      </button>
                                    </div>
                                  </motion.li>
                                ))}
                              </AnimatePresence>
                            </ul>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </ScrollArea>
            )}
          </TabsPanel>
        </Tabs>
      </section>
    </div>
  );
}

function RecognizedComments({
  comments,
  saleKeyword,
}: {
  comments: (Item & { buyer: string })[];
  saleKeyword: string;
}) {
  if (comments.length === 0) {
    return (
      <Empty className="rounded-xl border py-10">
        <EmptyHeader>
          <EmptyTitle>Rien pour l&apos;instant</EmptyTitle>
          <EmptyDescription>
            Aucun commentaire &quot;{saleKeyword} …&quot; reconnu.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ScrollArea className="max-h-[calc(100vh-20rem)]" scrollFade>
      <ul className="flex flex-col gap-1.5 pr-1">
        {comments.map((comment) => (
          <li
            key={comment.id}
            className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
          >
            <span className="font-medium text-foreground">@{comment.buyer}</span>{" "}
            {comment.source_comment ??
              `${saleKeyword} ${comment.raw_product_text ?? ""} ${
                comment.raw_size_text ?? ""
              }`.trim()}
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}

function productNameFor(products: ProductOption[], productId: string | null) {
  return products.find((p) => p.id === productId)?.name ?? "Produit supprimé";
}

// Ajout manuel d'une commande, déplacé dans un Popover déclenché par un
// bouton : ce n'est pas une action fréquente, elle n'a pas besoin d'occuper
// en permanence de l'espace au-dessus du flux de commandes.
function ManualAddPopover({
  liveId,
  products,
}: {
  liveId: string;
  products: ProductOption[];
}) {
  const [open, setOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(products[0]?.id ?? "");
  const variants = products.find((p) => p.id === selectedProduct)?.variants ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button size="sm" variant="secondary">
            <Plus />
            Ajouter
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72">
        <PopoverTitle className="mb-3 text-sm">Ajouter une commande</PopoverTitle>
        <form
          action={async (formData) => {
            await addManualItem(liveId, formData);
            setOpen(false);
          }}
          className="flex flex-col gap-3"
        >
          <Field className="gap-1.5">
            <FieldLabel htmlFor="buyer" className="text-xs">
              Pseudo acheteur
            </FieldLabel>
            <Input id="buyer" name="buyer" required />
          </Field>
          <Field className="gap-1.5">
            <FieldLabel htmlFor="product_id" className="text-xs">
              Produit
            </FieldLabel>
            <Select
              name="product_id"
              value={selectedProduct}
              onValueChange={(value) => setSelectedProduct(value as string)}
            >
              <SelectTrigger id="product_id">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {variants.length > 0 && (
            <Field className="gap-1.5">
              <FieldLabel htmlFor="variant_id" className="text-xs">
                Taille
              </FieldLabel>
              <Select name="variant_id" defaultValue="">
                <SelectTrigger id="variant_id">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">—</SelectItem>
                  {variants.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field className="gap-1.5">
            <FieldLabel htmlFor="quantity" className="text-xs">
              Quantité
            </FieldLabel>
            <Input id="quantity" name="quantity" type="number" min={1} defaultValue={1} />
          </Field>
          <Button type="submit" size="sm" className="mt-1">
            Ajouter
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function CorrectItemForm({
  liveId,
  itemId,
  products,
}: {
  liveId: string;
  itemId: string;
  products: ProductOption[];
}) {
  return (
    <form
      action={correctItem.bind(null, liveId, itemId)}
      className="flex items-center gap-1"
    >
      <Select name="product_id" required>
        <SelectTrigger size="sm" className="min-w-32">
          <SelectValue placeholder="Choisir…" />
        </SelectTrigger>
        <SelectContent>
          {products.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" size="sm" variant="secondary">
        Corriger
      </Button>
    </form>
  );
}
