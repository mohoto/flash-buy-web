"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel } from "@/components/ui/field";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
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
}: {
  liveId: string;
  initialOrders: OrderWithItems[];
  products: ProductOption[];
  saleKeywords: string[];
}) {
  const saleKeyword = saleKeywords[0] ?? "sold";
  const [orders, setOrders] = useState(initialOrders);
  const [isPending, startTransition] = useTransition();

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

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-foreground">Ajouter une commande manuellement</h2>
        <ManualAddForm liveId={liveId} products={products} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-foreground">
          Commandes ({orders.length})
        </h2>

        {orders.length === 0 && (
          <Empty className="rounded-xl border py-10">
            <EmptyHeader>
              <EmptyTitle>Aucun achat pour l&apos;instant</EmptyTitle>
              <EmptyDescription>
                Les commentaires &quot;{saleKeyword} …&quot; apparaîtront ici en direct.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        <AnimatePresence initial={false}>
          {orders.map((order) => (
            <motion.div
              key={order.id}
              layout
              {...listItemMotion}
              className="rounded-xl border bg-card p-4 shadow-xs/5"
            >
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
                  {order.status === "validated" && <Badge variant="success">Validée</Badge>}
                </div>
              </div>

              <ul className="mt-3 flex flex-col gap-2">
                <AnimatePresence initial={false}>
                  {order.items.map((item) => (
                    <motion.li key={item.id} layout {...listItemMotion} className="list-none">
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
                          className="ml-2 text-xs text-muted-foreground hover:text-destructive"
                        >
                          Supprimer
                        </button>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </motion.div>
          ))}
        </AnimatePresence>
      </section>

      <RecognizedComments orders={orders} saleKeyword={saleKeyword} />
    </div>
  );
}

function RecognizedComments({
  orders,
  saleKeyword,
}: {
  orders: OrderWithItems[];
  saleKeyword: string;
}) {
  const comments = orders
    .flatMap((order) =>
      order.items
        .filter((item) => item.matched)
        .map((item) => ({ ...item, buyer: order.buyer_tiktok_username }))
    )
    .sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-foreground">Commentaires reconnus</h2>
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun commentaire &quot;{saleKeyword} …&quot; reconnu pour l&apos;instant.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
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
      )}
    </section>
  );
}

function productNameFor(products: ProductOption[], productId: string | null) {
  return products.find((p) => p.id === productId)?.name ?? "Produit supprimé";
}

function ManualAddForm({
  liveId,
  products,
}: {
  liveId: string;
  products: ProductOption[];
}) {
  const [selectedProduct, setSelectedProduct] = useState(products[0]?.id ?? "");
  const variants = products.find((p) => p.id === selectedProduct)?.variants ?? [];

  return (
    <form
      action={addManualItem.bind(null, liveId)}
      className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-xs/5"
    >
      <Field className="gap-1.5">
        <FieldLabel htmlFor="buyer" className="text-xs">
          Pseudo acheteur
        </FieldLabel>
        <input
          id="buyer"
          name="buyer"
          required
          className="h-8 w-40 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring"
        />
      </Field>
      <Field className="gap-1.5">
        <FieldLabel htmlFor="product_id" className="text-xs">
          Produit
        </FieldLabel>
        <select
          id="product_id"
          name="product_id"
          value={selectedProduct}
          onChange={(e) => setSelectedProduct(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring"
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      {variants.length > 0 && (
        <Field className="gap-1.5">
          <FieldLabel htmlFor="variant_id" className="text-xs">
            Taille
          </FieldLabel>
          <select
            id="variant_id"
            name="variant_id"
            className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring"
          >
            <option value="">—</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field className="gap-1.5">
        <FieldLabel htmlFor="quantity" className="text-xs">
          Qté
        </FieldLabel>
        <input
          id="quantity"
          name="quantity"
          type="number"
          min={1}
          defaultValue={1}
          className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring"
        />
      </Field>
      <Button type="submit" size="sm">
        Ajouter manuellement
      </Button>
    </form>
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
      <select
        name="product_id"
        required
        className="h-7 rounded-md border border-input bg-background px-1.5 text-xs outline-none focus:border-ring"
      >
        <option value="">Choisir…</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="secondary">
        Corriger
      </Button>
    </form>
  );
}
