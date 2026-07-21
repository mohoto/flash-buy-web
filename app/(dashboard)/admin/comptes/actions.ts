"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAccess } from "@/lib/auth/require-access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// La policy RLS profiles_update_own limite l'update à auth.uid() = id : un
// admin ne peut pas activer/désactiver l'accès d'un AUTRE vendeur via le
// client public. requireAdminAccess() vérifie déjà que l'appelant est admin
// avant qu'on bascule vers le service role pour cette opération précise.
export async function toggleFlasshBuyAccess(profileId: string, nextValue: boolean) {
  await requireAdminAccess();
  const supabase = createServiceRoleClient();

  await supabase
    .from("profiles")
    .update({ flassh_buy_enabled: nextValue })
    .eq("id", profileId);

  revalidatePath("/admin/comptes");
}
