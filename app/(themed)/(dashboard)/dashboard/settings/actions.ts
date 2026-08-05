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

// Mots-clés de vente réglés une seule fois par boutique (au lieu de
// lives.sale_keywords, saisi live par live) — saveConnectionAndStart
// (app/(dashboard)/dashboard/live/[liveId]/actions.ts) copie shop.sale_keywords
// dans lives.sale_keywords à la connexion, seule valeur relue par le worker.
export async function updateSaleKeywords(formData: FormData) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const rawKeywords = String(formData.get("sale_keywords") ?? "");
  const keywords = [
    ...new Set(
      rawKeywords
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];

  const { error } = await supabase
    .from("shops")
    .update({ sale_keywords: keywords.length > 0 ? keywords : ["jp"] })
    .eq("id", shop.id);

  if (error) {
    redirect("/dashboard/settings?error=update_failed");
  }

  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?saved=1");
}

const RESTRICTION_VALUES = ["none", "block", "ceiling"];

// Réglages garde-fous mode rapide : délai avant "Délai dépassé" (purement
// visuel, calculé côté client à l'affichage) et restriction du
// glisser-déposer sur un acheteur dont une commande précédente est encore
// impayée sur ce live.
export async function updateOrderGuardrails(formData: FormData) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const rawExpiry = String(formData.get("pending_order_expiry") ?? "");
  const expiryMinutes =
    rawExpiry === "" ? null : rawExpiry === "midnight" ? -1 : Number(rawExpiry);

  const restriction = String(formData.get("unpaid_order_restriction") ?? "none");
  if (!RESTRICTION_VALUES.includes(restriction)) {
    redirect("/dashboard/settings?error=update_failed");
  }

  const rawCeiling = String(formData.get("unpaid_order_ceiling") ?? "").trim();
  const ceilingCents =
    restriction === "ceiling" && rawCeiling !== "" ? Math.round(Number(rawCeiling) * 100) : null;

  if (restriction === "ceiling" && (ceilingCents === null || !Number.isFinite(ceilingCents) || ceilingCents <= 0)) {
    redirect("/dashboard/settings?error=invalid_ceiling");
  }

  const { error } = await supabase
    .from("shops")
    .update({
      pending_order_expiry_minutes: expiryMinutes,
      unpaid_order_restriction: restriction,
      unpaid_order_ceiling_cents: ceilingCents,
    })
    .eq("id", shop.id);

  if (error) {
    redirect("/dashboard/settings?error=update_failed");
  }

  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?saved=1");
}
