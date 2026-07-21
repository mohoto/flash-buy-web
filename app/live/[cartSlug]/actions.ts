"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function identifyBuyer(cartSlug: string, formData: FormData) {
  const username = String(formData.get("username") ?? "")
    .trim()
    .replace(/^@/, "");

  if (!username) {
    redirect(`/live/${cartSlug}?error=missing_username`);
  }

  const cookieStore = await cookies();
  // Cookie par vendeur (cart_slug) : l'acheteur peut suivre plusieurs vendeurs
  // sans que l'identification de l'un écrase celle d'un autre.
  cookieStore.set(`flassh_buyer_${cartSlug}`, username, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect(`/live/${cartSlug}`);
}
