import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Proxy serveur vers l'Edge Function sendcloud-live-cart-shipping : l'acheteur
// du panier live n'a jamais de session Supabase (identifié par pseudo TikTok
// en localStorage), donc le navigateur ne peut pas invoquer cette fonction
// directement (verify_jwt: false côté Edge Function, appelable uniquement via
// le service-role key depuis le serveur).
export async function POST(request: Request) {
  const body = await request.json();
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.functions.invoke("sendcloud-live-cart-shipping", { body });

  if (error) {
    return Response.json({ error: "shipping_lookup_failed" }, { status: 502 });
  }

  return Response.json(data);
}
