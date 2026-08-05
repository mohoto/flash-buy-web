import { requireSellerAccess } from "@/lib/auth/require-access";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";
import { SidebarNav } from "./sidebar-nav";
import { PageHeaderTitle } from "./page-header-title";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { ToastProvider } from "@/components/ui/toast";

// Un admin n'a jamais de shop ni accès à /dashboard : requireSellerAccess()
// le redirige vers /admin avant même d'atteindre ce layout. Les vendeurs et
// les admins sont donc mutuellement exclusifs ici, pas besoin de distinguer
// les deux dans la nav.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSellerAccess();
  const shop = await getOwnShop();

  return (
    <ToastProvider position="top-center">
      <SidebarProvider className="has-data-[variant=inset]:bg-background">
        <SidebarNav shopName={shop.name} />
        <SidebarInset>
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
            <SidebarTrigger />
            <PageHeaderTitle />
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 px-12 py-8">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </ToastProvider>
  );
}
