import { requireAdminAccess } from "@/lib/auth/require-access";
import { SidebarNav } from "./sidebar-nav";
import { PageHeaderTitle } from "./page-header-title";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireAdminAccess();

  return (
    <SidebarProvider className="has-data-[variant=inset]:bg-background">
      <SidebarNav adminName={profile.full_name ?? profile.pseudo ?? "Admin"} />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger />
          <PageHeaderTitle />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 px-14 py-10">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
