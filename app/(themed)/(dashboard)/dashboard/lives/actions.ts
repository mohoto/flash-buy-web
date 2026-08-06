"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";
import { normalizeTiktokUsername } from "@/lib/dashboard/normalize-tiktok-username";

// Si un live RÉELLEMENT connecté (euler_status='connected', preuve qu'une
// vraie frame de contenu du live a été reçue) existe déjà pour ce shop, y
// renvoyer plutôt que d'en créer un second — sinon plusieurs lives actives
// pour le même shop finissent chacune réclamée par le worker, qui ouvre alors
// plusieurs connexions Euler concurrentes vers le même compte TikTok (cf.
// garde équivalente côté webhook Euler Alert). Utilisé par /dashboard/lives
// (bouton "Rejoindre"/"Démarrer un live") et par la page /lives/new
// elle-même.
//
// Ne considère PAS "scheduled" ni "live" avec euler_status='connecting'
// comme actif : un live encore en train de tenter sa toute première
// connexion (cf. NewLiveForm/ConnectingState) ne doit jamais court-circuiter
// une nouvelle tentative — bug observé le 2026-08-06 où resoumettre le
// formulaire pendant qu'un live précédent était encore en 'connecting'
// redirigeait directement vers ce live raté au lieu de laisser le nouveau
// flux d'attente suivre son cours.
export async function findActiveLiveId(): Promise<string | null> {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("lives")
    .select("id")
    .eq("shop_id", shop.id)
    .eq("status", "live")
    .eq("euler_status", "connected")
    .maybeSingle();

  return existing?.id ?? null;
}

// Marque "ended" tout live de ce shop resté "live" sans jamais avoir
// confirmé sa connexion (euler_status != 'connected') depuis plus de
// STALE_CONNECTING_MS — filet de sécurité pour le cas où abandonFailedLive
// (appelée côté client, cf. NewLiveForm) n'a jamais pu s'exécuter : le
// vendeur a fermé l'onglet, rechargé la page, ou perdu la connexion pendant
// que ConnectingState attendait encore une résolution. Sans ce nettoyage,
// ces lives resteraient "live" indéfiniment en base (le worker, lui, finit
// par les relâcher via NOT_LIVE/heartbeat, mais rien ne les repasse jamais à
// "ended" côté web).
const STALE_CONNECTING_MS = 60_000;

async function cleanupStaleConnectingLives(shopId: string) {
  const supabase = await createClient();
  const staleBefore = new Date(Date.now() - STALE_CONNECTING_MS).toISOString();

  await supabase
    .from("lives")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("shop_id", shopId)
    .eq("status", "live")
    .neq("euler_status", "connected")
    .lt("started_at", staleBefore);
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

// Crée le live et le démarre (formulaire /dashboard/lives/new) : pseudo
// TikTok, étiquette de départ et mots-clés de vente sont déjà définitifs au
// moment où le worker le réclame (status = 'live' d'emblée, cf.
// worker/src/sharding.ts claimNextLive) — plus d'étape "scheduled"
// intermédiaire à configurer depuis la console live.
//
// Ne redirige jamais elle-même : le formulaire (NewLiveForm) attend d'abord
// que lives.euler_status passe à 'connected' avant de naviguer vers la
// console — cf. commentaire sur NewLiveForm pour le pourquoi (le worker peut
// heartbeat/claim le live tout en échouant en boucle à joindre Euler, ex.
// pseudo TikTok invalide).
//
// Toujours un nouveau live, jamais de réutilisation d'un live précédent : un
// live déjà claim par un worker (worker_id posé) ne peut pas être "repris"
// depuis le web sans risquer une session Euler zombie en parallèle — le
// worker ne relit tiktok_username qu'une fois, au démarrage de sa session
// (cf. worker/src/live-session.ts startLiveSession), donc changer le pseudo
// en base sous un live déjà claim ne serait même pas pris en compte tant que
// ce worker ne relâche pas la main. cf. abandonFailedLive pour ce qui arrive
// à un live dont la connexion échoue.
//
// Mode rapid : rapid_intent_seq est incrémenté par assign_rapid_item_order_number
// AVANT d'être lu, donc la prochaine étiquette attribuée est toujours seq+1 —
// pour que ce soit le nombre choisi par le vendeur, on stocke (choix - 1).
export async function createAndStartLive(
  formData: FormData
): Promise<{ liveId: string } | { error: string }> {
  const shop = await getOwnShop();
  const supabase = await createClient();

  // Nettoie d'éventuels lives fantômes (tentative précédente jamais résolue
  // côté client, cf. STALE_CONNECTING_MS) avant de vérifier s'il existe un
  // vrai live actif — sinon un tel fantôme, bien que jamais connecté,
  // pourrait continuer à exister indéfiniment sans jamais gêner
  // findActiveLiveId (qui l'ignore déjà) mais en polluant l'historique.
  await cleanupStaleConnectingLives(shop.id);

  const otherActiveId = await findActiveLiveId();
  if (otherActiveId) {
    redirect(`/dashboard/live/${otherActiveId}`);
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
    return { error: "La création du live a échoué, réessaie." };
  }

  revalidatePath("/dashboard/lives");
  return { liveId: data.id };
}

// Appelée par NewLiveForm dès que la connexion Euler d'un live fraîchement
// créé échoue (ou n'aboutit jamais dans le délai imparti) — marque le live
// "ended" plutôt que de le supprimer tout de suite : c'est le seul signal que
// le worker surveille déjà (cf. son heartbeat, worker/src/index.ts
// startHeartbeatLoop, qui compare le status à chaque battement et s'arrête
// dès qu'il n'est plus "live") pour arrêter proprement sa session Euler en
// cours, dans un délai de quelques secondes à HEARTBEAT_INTERVAL_MS (15s par
// défaut). Ne bloque jamais le vendeur : le formulaire redevient utilisable
// immédiatement après cet appel, sans attendre que le worker ait confirmé
// avoir relâché le live — un live "ended" sans la moindre commande ni
// commentaire n'encombre pas l'historique de façon gênante.
export async function abandonFailedLive(liveId: string) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  await supabase
    .from("lives")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", liveId)
    .eq("shop_id", shop.id)
    .eq("status", "live");

  revalidatePath("/dashboard/lives");
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
