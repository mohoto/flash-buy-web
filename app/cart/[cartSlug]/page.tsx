import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BuyerCartClient } from "./buyer-cart-client";

export default async function BuyerLivePage({
  params,
}: {
  params: Promise<{ cartSlug: string }>;
}) {
  const { cartSlug } = await params;
  const supabase = await createClient();

  const { data: shopRows } = await supabase.rpc("get_live_shop_by_slug", {
    p_cart_slug: cartSlug,
  });
  const shop = shopRows?.[0];

  if (!shop) notFound();

  return (
    <div className="mx-auto min-h-screen w-full max-w-lg px-4 py-8 sm:max-w-2xl">
      <h1 className="text-xl font-semibold text-foreground">{shop.shop_name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {shop.active_live_id
          ? "Live en cours — ton panier se remplit en direct."
          : "Renseigne ton pseudo TikTok pour retrouver ton panier."}
      </p>

      <BuyerCartClient cartSlug={cartSlug} />
    </div>
  );
}
