"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";

// Crée le live en "scheduled", pas encore "live" : le worker ne le réclame
// que sur status = 'live' (cf. worker/src/sharding.ts claimNextLive), ce qui
// laisse le temps d'ajuster pseudo TikTok / mots-clés depuis la console live
// avant que le worker ouvre une connexion Euler avec les réglages définitifs.
export async function startLive() {
  const shop = await getOwnShop();
  const supabase = await createClient();

  // Réutilise une live en attente/en cours plutôt que d'en recréer une : sinon
  // plusieurs lives actives pour le même shop finissent chacune réclamée par
  // le worker, qui ouvre alors plusieurs connexions Euler concurrentes vers le
  // même compte TikTok (cf. garde équivalente côté webhook Euler Alert).
  const { data: existing } = await supabase
    .from("lives")
    .select("id")
    .eq("shop_id", shop.id)
    .in("status", ["scheduled", "live"])
    .maybeSingle();

  if (existing) {
    redirect(`/dashboard/live/${existing.id}`);
  }

  // Reprend le pseudo TikTok, les mots-clés de vente et le mode de la
  // dernière live du vendeur : évite de devoir les ressaisir à chaque
  // nouvelle session (stockés par live, pas par shop, cf. migration
  // add_lives_sale_keywords / add_lives_mode).
  const { data: lastLive } = await supabase
    .from("lives")
    .select("tiktok_username, sale_keywords, mode")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("lives")
    .insert({
      shop_id: shop.id,
      status: "scheduled",
      tiktok_username: lastLive?.tiktok_username ?? shop.tiktok_username,
      mode: lastLive?.mode ?? "catalog",
      ...(lastLive?.sale_keywords ? { sale_keywords: lastLive.sale_keywords } : {}),
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect("/dashboard/lives?error=start_failed");
  }

  revalidatePath("/dashboard/lives");
  redirect(`/dashboard/live/${data.id}`);
}

export async function endLive(liveId: string) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  await supabase
    .from("lives")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", liveId)
    .eq("shop_id", shop.id);

  await supabase.from("live_viewers").delete().eq("live_id", liveId);

  revalidatePath("/dashboard/lives");
  revalidatePath(`/dashboard/live/${liveId}`);
}
