import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Json } from "@/lib/database.types";

export async function POST(request: Request) {
  const secret = process.env.RAILWAY_WEBHOOK_SECRET;
  if (secret) {
    const provided = request.headers.get("x-railway-signature");
    if (provided !== secret) {
      return Response.json({ error: "invalid_signature" }, { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  await supabase.from("railway_events").insert({
    event_type: String(payload.type ?? payload.event ?? "UNKNOWN"),
    status: typeof payload.status === "string" ? payload.status : null,
    service_name: typeof payload.serviceName === "string" ? payload.serviceName : null,
    environment: typeof payload.environment === "string" ? payload.environment : null,
    payload: payload as Json,
  });

  return Response.json({ ok: true });
}
