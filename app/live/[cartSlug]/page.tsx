import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { identifyBuyer } from "./actions";
import { BuyerCartClient } from "./buyer-cart-client";

export default async function BuyerLivePage({
  params,
  searchParams,
}: {
  params: Promise<{ cartSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { cartSlug } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: shopRows } = await supabase.rpc("get_live_shop_by_slug", {
    p_cart_slug: cartSlug,
  });
  const shop = shopRows?.[0];

  if (!shop) notFound();

  const cookieStore = await cookies();
  const buyerUsername = cookieStore.get(`flassh_buyer_${cartSlug}`)?.value;

  if (!buyerUsername) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black">
        <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            {shop.shop_name}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Quel est ton pseudo TikTok ? On retrouve ton panier avec.
          </p>

          {error === "missing_username" && (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              Merci de renseigner ton pseudo.
            </p>
          )}

          <form
            action={identifyBuyer.bind(null, cartSlug)}
            className="mt-6 flex flex-col gap-4"
          >
            <input
              name="username"
              placeholder="@tonpseudo"
              required
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="submit"
              className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950"
            >
              Voir mon panier
            </button>
          </form>
        </div>
      </div>
    );
  }

  const { data: cartItems } = await supabase.rpc("get_live_cart", {
    p_cart_slug: cartSlug,
    p_buyer: buyerUsername,
  });

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-8">
      <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
        {shop.shop_name}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Panier de @{buyerUsername}
        {shop.active_live_id
          ? " — live en cours, ton panier se remplit en direct."
          : "."}
      </p>

      <BuyerCartClient
        cartSlug={cartSlug}
        buyerUsername={buyerUsername}
        initialItems={cartItems ?? []}
      />
    </div>
  );
}
