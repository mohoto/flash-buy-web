import { requireSellerAccess } from "@/lib/auth/require-access";

export default async function DashboardPage() {
  const profile = await requireSellerAccess();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Bonjour {profile.full_name ?? profile.pseudo ?? ""}
      </h1>
      <p className="mt-2 text-zinc-500">
        Dashboard vendeur — catalogue, lives et commandes arrivent à l&apos;étape 3.
      </p>
    </div>
  );
}
