"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";

export async function createProduct(formData: FormData) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const priceEuros = Number(formData.get("price") ?? 0);
  const stock = Number(formData.get("stock") ?? 0);

  if (!name || !Number.isFinite(priceEuros) || priceEuros < 0) {
    redirect("/dashboard/catalogue/new?error=invalid_fields");
  }

  const { data, error } = await supabase
    .from("products")
    .insert({
      shop_id: shop.id,
      name,
      price_cents: Math.round(priceEuros * 100),
      stock: Number.isFinite(stock) ? Math.max(0, Math.round(stock)) : 0,
      status: "active",
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect("/dashboard/catalogue/new?error=create_failed");
  }

  revalidatePath("/dashboard/catalogue");
  redirect(`/dashboard/catalogue/${data.id}`);
}

export async function updateProduct(productId: string, formData: FormData) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const priceEuros = Number(formData.get("price") ?? 0);
  const stock = Number(formData.get("stock") ?? 0);
  const status = String(formData.get("status") ?? "active");

  if (!name || !Number.isFinite(priceEuros) || priceEuros < 0) {
    redirect(`/dashboard/catalogue/${productId}?error=invalid_fields`);
  }

  await supabase
    .from("products")
    .update({
      name,
      price_cents: Math.round(priceEuros * 100),
      stock: Number.isFinite(stock) ? Math.max(0, Math.round(stock)) : 0,
      status,
    })
    .eq("id", productId)
    .eq("shop_id", shop.id);

  revalidatePath("/dashboard/catalogue");
  revalidatePath(`/dashboard/catalogue/${productId}`);
  redirect(`/dashboard/catalogue/${productId}?saved=1`);
}

export async function deleteProduct(productId: string) {
  const shop = await getOwnShop();
  const supabase = await createClient();

  await supabase.from("products").delete().eq("id", productId).eq("shop_id", shop.id);

  revalidatePath("/dashboard/catalogue");
  redirect("/dashboard/catalogue");
}
