import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/database.aliases";

// Un vendeur mobile existant n'a accès à Flassh buy que si flassh_buy_enabled = true.
// Réutilise l'Auth Supabase existante (partagée avec l'app mobile) : aucun
// second système de login.
//
// Un admin n'a jamais de shop et n'a donc rien à faire sur /dashboard (pages
// vendeur : catalogue, lives, réglages…) : il est redirigé vers /admin.
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
  if (profile.is_admin) redirect("/admin");
  if (!profile.flassh_buy_enabled) redirect("/login?denied=1");

  return profile;
}

export async function requireAdminAccess(): Promise<Profile> {
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
  if (!profile.is_admin) redirect("/dashboard");

  return profile;
}
