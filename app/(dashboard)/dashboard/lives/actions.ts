"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";

// Démarrage manuel côté dashboard (le webhook Euler LIVE Alert fera la même
// chose automatiquement à l'étape 5, une fois le worker branché).
export async function startLive() {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lives")
    .insert({
      shop_id: shop.id,
      status: "live",
      started_at: new Date().toISOString(),
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

  revalidatePath("/dashboard/lives");
  revalidatePath(`/dashboard/live/${liveId}`);
}
