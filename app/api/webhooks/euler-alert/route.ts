import { createHmac, timingSafeEqual } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// LIVE Alert Euler Stream : notifie quand un vendeur suivi passe en direct.
// NOTE D'INTÉGRATION : le nom exact du header de signature et l'algorithme
// n'ont pas pu être confirmés via la documentation publique Euler Stream
// (voir section "TikTok LIVE Alert Targets" — payload/signature non détaillés
// publiquement). On applique ici le schéma HMAC-SHA256 générique demandé par
// la spec (header x-webhook-signature), à ajuster si la doc/le comportement
// réel diffère une fois un premier webhook de test reçu.
function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return false;
  return timingSafeEqual(expectedBuf, signatureBuf);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature");
  const secret = process.env.EULER_WEBHOOK_SECRET;

  if (!secret || !verifySignature(rawBody, signature, secret)) {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: { unique_id?: string; room_id?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const tiktokUsername = payload.unique_id;
  if (!tiktokUsername) {
    return Response.json({ error: "missing_unique_id" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: shop } = await supabase
    .from("shops")
    .select("id")
    .eq("tiktok_username", tiktokUsername)
    .maybeSingle();

  if (!shop) {
    // Vendeur non configuré côté Flassh buy : on ignore silencieusement,
    // ce n'est pas une erreur du point de vue du webhook.
    return Response.json({ ok: true, ignored: true });
  }

  // Un seul live "à surveiller" par vendeur : réutilise un live scheduled/live
  // existant plutôt que d'en créer un doublon si l'alerte est redélivrée.
  const { data: existing } = await supabase
    .from("lives")
    .select("id")
    .eq("shop_id", shop.id)
    .in("status", ["scheduled", "live"])
    .maybeSingle();

  if (existing) {
    await supabase
      .from("lives")
      .update({ status: "live", started_at: new Date().toISOString(), euler_alert_id: payload.room_id ?? null })
      .eq("id", existing.id);
  } else {
    await supabase.from("lives").insert({
      shop_id: shop.id,
      status: "live",
      started_at: new Date().toISOString(),
      euler_alert_id: payload.room_id ?? null,
      tiktok_room_id: payload.room_id ?? null,
    });
  }

  return Response.json({ ok: true });
}
