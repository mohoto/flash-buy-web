"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";

// Enregistre le pseudo TikTok, la numérotation de départ des étiquettes, puis
// bascule "scheduled" -> "live" en un seul submit : le worker ne réclame un
// live que sur status = 'live' (cf. worker/src/sharding.ts claimNextLive),
// donc c'est seulement à ce moment qu'il ouvre la connexion Euler, avec les
// réglages définitifs déjà en base. Les mots-clés de vente sont un réglage de
// boutique (shops.sale_keywords, cf. /dashboard/settings), copiés ici dans
// lives.sale_keywords — seule valeur relue par le worker.
//
// Mode rapid : rapid_intent_seq est incrémenté par assign_rapid_item_order_number
// AVANT d'être lu, donc la prochaine étiquette attribuée est toujours seq+1 —
// pour que ce soit le nombre choisi par le vendeur, on stocke (choix - 1). Ce
// choix n'a de sens qu'avant le début du live (aucune étiquette encore
// attribuée), donc pas de vérification de conflit ici contrairement à
// l'ancien réglage en cours de live.
export async function saveConnectionAndStart(liveId: string, formData: FormData) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  // name="tiktok_handle" côté formulaire (pas "tiktok_username") pour éviter
  // que les gestionnaires de mots de passe du navigateur ne prennent ce champ
  // pour un identifiant de connexion et proposent "Gérer les mots de passe".
  const tiktokUsername = String(formData.get("tiktok_handle") ?? "").trim();

  const startNumber = Math.round(Number(formData.get("start_number") ?? 0));
  const rapidIntentSeq = Number.isFinite(startNumber) && startNumber >= 1 ? startNumber - 1 : 0;

  await supabase
    .from("lives")
    .update({
      tiktok_username: tiktokUsername || null,
      sale_keywords: shop.sale_keywords,
      rapid_intent_seq: rapidIntentSeq,
      status: "live",
      started_at: new Date().toISOString(),
    })
    .eq("id", liveId)
    .eq("shop_id", shop.id)
    .eq("status", "scheduled");

  revalidatePath(`/dashboard/live/${liveId}`);
}

