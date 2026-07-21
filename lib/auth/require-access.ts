import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/database.aliases";

// Un vendeur mobile existant n'a accès à Flassh buy que si flassh_buy_enabled = true.
// L'admin (profiles.is_admin = true) accède toujours. Réutilise l'Auth Supabase
// existante (partagée avec l'app mobile) : aucun second système de login.
export async function requireSellerAccess(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");
  if (!profile.is_admin && !profile.flassh_buy_enabled) redirect("/login?denied=1");

  return profile;
}

export async function requireAdminAccess(): Promise<Profile> {
  const profile = await requireSellerAccess();
  if (!profile.is_admin) redirect("/dashboard");
  return profile;
}
