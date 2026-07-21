import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Shop } from "@/lib/database.aliases";

// Un vendeur Flassh buy possède toujours au plus un shop (owner_id unique).
export async function getOwnShop(): Promise<Shop> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: shop } = await supabase
    .from("shops")
    .select("*")
    .eq("owner_id", user.id)
    .single();

  if (!shop) redirect("/dashboard?error=no_shop");

  return shop;
}
