"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
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
  matched: boolean;
  match_score: number | null;
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

export function LiveConsoleClient({
  liveId,
  initialOrders,
  products,
}: {
  liveId: string;
  initialOrders: OrderWithItems[];
  products: ProductOption[];
}) {
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
          "id, live_order_id, product_id, variant_id, size_label, quantity, unit_price_cents, raw_product_text, raw_size_text, matched, match_score"
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
    <div className="mt-6 flex flex-col gap-4">
      <ManualAddForm liveId={liveId} products={products} />

      {orders.length === 0 && (
        <p className="text-sm text-zinc-500">
          Aucun achat pour l&apos;instant. Les commentaires &quot;sold …&quot;
          apparaîtront ici en direct.
        </p>
      )}

      {orders.map((order) => (
        <div
          key={order.id}
          className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium text-zinc-950 dark:text-zinc-50">
              @{order.buyer_tiktok_username}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-500">
                {(order.total_cents / 100).toFixed(2)} €
              </span>
              {order.status === "pending" && (
                <button
                  disabled={isPending}
                  onClick={() =>
                    startTransition(() => validateOrder(liveId, order.id))
                  }
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  Valider
                </button>
              )}
              {order.status === "validated" && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  Validée
                </span>
              )}
            </div>
          </div>

          <ul className="mt-3 flex flex-col gap-2">
            {order.items.map((item) => (
              <li
                key={item.id}
                className={
                  item.matched
                    ? "flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900"
                    : "flex items-center justify-between rounded-md bg-red-50 px-3 py-2 text-sm dark:bg-red-950"
                }
              >
                {item.matched ? (
                  <span>
                    {item.quantity}× {productNameFor(products, item.product_id)}
                    {item.size_label ? ` — ${item.size_label}` : ""}
                  </span>
                ) : (
                  <div className="flex flex-1 items-center gap-2">
                    <span className="text-red-700 dark:text-red-300">
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
                  className="ml-2 text-xs text-zinc-500 hover:text-red-600"
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
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
      className="flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Pseudo acheteur
        </label>
        <input
          name="buyer"
          required
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Produit
        </label>
        <select
          name="product_id"
          value={selectedProduct}
          onChange={(e) => setSelectedProduct(e.target.value)}
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {variants.length > 0 && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Taille
          </label>
          <select
            name="variant_id"
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">—</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Qté
        </label>
        <input
          name="quantity"
          type="number"
          min={1}
          defaultValue={1}
          className="w-16 rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <button
        type="submit"
        className="rounded-md bg-zinc-950 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950"
      >
        Ajouter manuellement
      </button>
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
        className="rounded-md border border-zinc-300 px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      >
        <option value="">Choisir…</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-md bg-zinc-950 px-2 py-1 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950"
      >
        Corriger
      </button>
    </form>
  );
}
