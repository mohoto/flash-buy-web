import Link from "next/link";
import { requireAdminAccess } from "@/lib/auth/require-access";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminAccess();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <nav className="flex items-center gap-6 text-sm font-medium text-zinc-600 dark:text-zinc-400">
          <Link href="/admin" className="text-zinc-950 dark:text-zinc-50">
            Admin Flassh buy
          </Link>
          <Link href="/admin/comptes">Comptes</Link>
          <Link href="/admin/stats">Statistiques</Link>
          <Link href="/admin/workers">Santé workers</Link>
          <Link href="/admin/railway">Alertes Railway</Link>
          <Link href="/dashboard">Retour dashboard</Link>
        </nav>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
