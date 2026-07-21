"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

export async function updateLiveSettings(formData: FormData) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const tiktokUsername = String(formData.get("tiktok_username") ?? "").trim();
  const cartSlug = String(formData.get("cart_slug") ?? "").trim().toLowerCase();

  if (cartSlug && !SLUG_RE.test(cartSlug)) {
    redirect("/dashboard/settings?error=invalid_slug");
  }

  const { error } = await supabase
    .from("shops")
    .update({
      tiktok_username: tiktokUsername || null,
      cart_slug: cartSlug || null,
    })
    .eq("id", shop.id);

  if (error) {
    redirect(
      error.code === "23505"
        ? "/dashboard/settings?error=slug_taken"
        : "/dashboard/settings?error=update_failed"
    );
  }

  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?saved=1");
}
