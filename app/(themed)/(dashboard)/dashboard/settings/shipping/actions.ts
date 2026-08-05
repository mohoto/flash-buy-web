"use server";

import { revalidatePath } from "next/cache";
import { requireSellerAccess } from "@/lib/auth/require-access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// shipping_method_variants est global à la plateforme (pas scopé par shop) :
// requireSellerAccess() explicite ici, contrairement aux autres actions de
// /dashboard/settings qui s'appuient sur le layout, car cette action modifie
// une table partagée plutôt que le shop de l'appelant.
export async function toggleShippingMethodGroup(groupKey: string, nextValue: boolean) {
  await requireSellerAccess();
  const supabase = createServiceRoleClient();

  await supabase
    .from("shipping_method_variants")
    .update({ is_active: nextValue })
    .eq("group_key", groupKey);

  revalidatePath("/dashboard/settings/shipping");
}
