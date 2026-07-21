import Link from "next/link";
import { requireSellerAccess } from "@/lib/auth/require-access";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireSellerAccess();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <nav className="flex items-center gap-6 text-sm font-medium text-zinc-600 dark:text-zinc-400">
          <Link href="/dashboard" className="text-zinc-950 dark:text-zinc-50">
            Flassh buy
          </Link>
          <Link href="/dashboard/catalogue">Catalogue</Link>
          <Link href="/dashboard/lives">Lives</Link>
          <Link href="/dashboard/orders">Commandes</Link>
          <Link href="/dashboard/settings">Réglages</Link>
          {profile.is_admin && <Link href="/admin">Admin</Link>}
        </nav>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
