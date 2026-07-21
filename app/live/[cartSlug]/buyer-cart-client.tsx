"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type CartItem = {
  item_id: string;
  product_name: string;
  size_label: string | null;
  quantity: number;
  unit_price_cents: number;
  matched: boolean;
};

export function BuyerCartClient({
  cartSlug,
  buyerUsername,
  initialItems,
}: {
  cartSlug: string;
  buyerUsername: string;
  initialItems: CartItem[];
}) {
  const [items, setItems] = useState(initialItems);

  useEffect(() => {
    const supabase = createClient();

    const refetch = async () => {
      const { data } = await supabase.rpc("get_live_cart", {
        p_cart_slug: cartSlug,
        p_buyer: buyerUsername,
      });
      if (data) setItems(data);
    };

    // Pas de filtre serveur possible ici (la RPC fait le filtrage, pas une
    // table directement accessible en anon) : on réagit à tout changement
    // de order_items/orders et on recharge via la RPC sécurisée.
    const channel = supabase
      .channel(`buyer-cart-${cartSlug}-${buyerUsername}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_order_items" },
        refetch
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_orders" },
        refetch
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [cartSlug, buyerUsername]);

  const total = items.reduce(
    (sum, item) => sum + item.quantity * item.unit_price_cents,
    0
  );

  return (
    <div className="mt-6 flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.item_id}
            className="flex items-center justify-between rounded-md border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
          >
            <span>
              {item.quantity}× {item.product_name}
              {item.size_label ? ` — ${item.size_label}` : ""}
            </span>
            <span className="text-zinc-500">
              {((item.quantity * item.unit_price_cents) / 100).toFixed(2)} €
            </span>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-zinc-500">
            Ton panier est vide pour l&apos;instant. Commente
            &quot;sold …&quot; pendant le live pour ajouter un article.
          </li>
        )}
      </ul>

      <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <span className="font-medium text-zinc-950 dark:text-zinc-50">
          Total
        </span>
        <span className="font-medium text-zinc-950 dark:text-zinc-50">
          {(total / 100).toFixed(2)} €
        </span>
      </div>

      <button
        type="button"
        disabled
        title="Paiement bientôt disponible"
        className="rounded-md bg-zinc-200 px-4 py-3 text-sm font-medium text-zinc-500 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-500"
      >
        Payer — paiement bientôt disponible
      </button>
    </div>
  );
}
