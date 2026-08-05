"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";

export async function addVariant(productId: string, formData: FormData) {
  await getOwnShop(); // vérifie la session ; RLS product_variants_insert_own fait le reste
  const supabase = await createClient();

  const label = String(formData.get("label") ?? "").trim();
  const stock = Number(formData.get("stock") ?? 0);
  if (!label) return;

  await supabase.from("product_variants").insert({
    product_id: productId,
    label,
    stock: Number.isFinite(stock) ? Math.max(0, Math.round(stock)) : 0,
  });

  revalidatePath(`/dashboard/catalogue/${productId}`);
}

export async function deleteVariant(productId: string, variantId: string) {
  await getOwnShop();
  const supabase = await createClient();

  await supabase.from("product_variants").delete().eq("id", variantId);

  revalidatePath(`/dashboard/catalogue/${productId}`);
}
