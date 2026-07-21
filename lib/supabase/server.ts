import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

// Client public (RLS respectée) pour Server Components / Server Actions / Route Handlers.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Peut échouer si appelé depuis un Server Component (lecture seule) ;
          // sans effet ici car un middleware ou une Server Action gère le refresh de session.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // ignoré : cf. commentaire ci-dessus
          }
        },
      },
    }
  );
}
