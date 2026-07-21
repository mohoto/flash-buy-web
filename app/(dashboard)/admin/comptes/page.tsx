import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ToggleButton } from "./toggle-button";

export default async function AdminComptesPage() {
  // Lecture cross-vendeur : profiles_select_own limite la RLS au propriétaire,
  // donc l'admin lit ici via service role (accès déjà vérifié par le layout
  // /admin qui appelle requireAdminAccess()).
  const supabase = createServiceRoleClient();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, pseudo, role, flassh_buy_enabled, is_admin, shops(name, cart_slug)")
    .eq("role", "pro")
    .order("full_name", { ascending: true });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Comptes vendeurs
      </h1>

      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">Vendeur</th>
              <th className="px-4 py-3 font-medium">Boutique</th>
              <th className="px-4 py-3 font-medium">Lien live</th>
              <th className="px-4 py-3 font-medium">Accès Flassh buy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {(profiles ?? []).map((profile) => {
              const shop = Array.isArray(profile.shops) ? profile.shops[0] : profile.shops;
              return (
                <tr key={profile.id}>
                  <td className="px-4 py-3 text-zinc-950 dark:text-zinc-50">
                    {profile.full_name ?? profile.pseudo ?? profile.id}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {shop?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {shop?.cart_slug ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <ToggleButton profileId={profile.id} enabled={profile.flassh_buy_enabled} />
                  </td>
                </tr>
              );
            })}
            {(profiles ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  Aucun vendeur pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
