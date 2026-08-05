"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";
import { normalizeTiktokUsername } from "@/lib/dashboard/normalize-tiktok-username";

// Si un live scheduled/live existe déjà pour ce shop, y renvoyer plutôt que
// d'en créer un second — sinon plusieurs lives actives pour le même shop
// finissent chacune réclamée par le worker, qui ouvre alors plusieurs
// connexions Euler concurrentes vers le même compte TikTok (cf. garde
// équivalente côté webhook Euler Alert). Utilisé par /dashboard/lives (bouton
// "Rejoindre"/"Démarrer un live") et par la page /lives/new elle-même.
export async function findActiveLiveId(): Promise<string | null> {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("lives")
    .select("id")
    .eq("shop_id", shop.id)
    .in("status", ["scheduled", "live"])
    .maybeSingle();

  return existing?.id ?? null;
}

// Reprend le pseudo TikTok et les mots-clés de vente de la dernière live du
// vendeur, pour pré-remplir le formulaire /dashboard/lives/new — évite de les
// ressaisir à chaque nouvelle session (stockés par live, pas par shop, cf.
// migration add_lives_sale_keywords).
export async function getLastLiveDefaults(): Promise<{
  tiktokUsername: string | null;
  rapidIntentSeq: number;
}> {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data: lastLive } = await supabase
    .from("lives")
    .select("tiktok_username, rapid_intent_seq")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    tiktokUsername: lastLive?.tiktok_username ?? shop.tiktok_username,
    rapidIntentSeq: lastLive?.rapid_intent_seq ?? -1,
  };
}

// Crée le live et le démarre en un seul submit (formulaire /dashboard/lives/new)
// : pseudo TikTok, étiquette de départ et mots-clés de vente sont déjà
// définitifs au moment où le worker le réclame (status = 'live' d'emblée,
// cf. worker/src/sharding.ts claimNextLive) — plus d'étape "scheduled"
// intermédiaire à configurer depuis la console live.
//
// Mode rapid : rapid_intent_seq est incrémenté par assign_rapid_item_order_number
// AVANT d'être lu, donc la prochaine étiquette attribuée est toujours seq+1 —
// pour que ce soit le nombre choisi par le vendeur, on stocke (choix - 1).
export async function createAndStartLive(formData: FormData) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const existingId = await findActiveLiveId();
  if (existingId) {
    redirect(`/dashboard/live/${existingId}`);
  }

  // name="tiktok_handle" (pas "tiktok_username") pour éviter que les
  // gestionnaires de mots de passe du navigateur ne prennent ce champ pour un
  // identifiant de connexion et proposent "Gérer les mots de passe".
  const rawTiktokUsername = String(formData.get("tiktok_handle") ?? "").trim();
  const tiktokUsername = rawTiktokUsername ? normalizeTiktokUsername(rawTiktokUsername) : null;

  const startNumber = Math.round(Number(formData.get("start_number") ?? 0));
  const rapidIntentSeq = Number.isFinite(startNumber) && startNumber >= 1 ? startNumber - 1 : 0;

  const { data, error } = await supabase
    .from("lives")
    .insert({
      shop_id: shop.id,
      status: "live",
      started_at: new Date().toISOString(),
      tiktok_username: tiktokUsername,
      sale_keywords: shop.sale_keywords,
      rapid_intent_seq: rapidIntentSeq,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect("/dashboard/lives/new?error=start_failed");
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
