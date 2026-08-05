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

  // Reprend le pseudo TikTok et les mots-clés de vente de la dernière live
  // du vendeur : évite de devoir les ressaisir à chaque nouvelle session
  // (stockés par live, pas par shop, cf. migration add_lives_sale_keywords).
  const { data: lastLive } = await supabase
    .from("lives")
    .select("tiktok_username, sale_keywords")
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

// Bouton "Terminer le live" (live en cours, status="live") ET "Annuler"
// (live jamais démarré, status="scheduled") passent tous les deux par ici.
// Un live "scheduled" annulé n'a jamais été réclamé par le worker ni généré
// la moindre donnée (pas de commande, pas de commentaire) — on le supprime
// entièrement plutôt que de le marquer "ended", pour ne pas polluer
// l'historique avec des lives jamais réellement tenus. Un live "live"
// terminé, lui, garde son historique (status="ended") et reste sur place
// pour laisser voir le récapitulatif final des commandes.
export async function endLive(liveId: string) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data: before } = await supabase
    .from("lives")
    .select("status")
    .eq("id", liveId)
    .eq("shop_id", shop.id)
    .single();

  if (before?.status === "scheduled") {
    await supabase.from("lives").delete().eq("id", liveId).eq("shop_id", shop.id);
    revalidatePath("/dashboard/lives");
    redirect("/dashboard/lives");
  }

  await supabase
    .from("lives")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", liveId)
    .eq("shop_id", shop.id);

  await supabase.from("live_viewers").delete().eq("live_id", liveId);

  revalidatePath("/dashboard/lives");
  revalidatePath(`/dashboard/live/${liveId}`);
}
