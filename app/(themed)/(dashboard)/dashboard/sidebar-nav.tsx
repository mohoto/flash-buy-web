"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ChevronRight } from "lucide-react";
import { logout } from "@/lib/auth/actions";
import { NAV_ITEMS } from "./nav-items";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarRail,
} from "@/components/ui/sidebar";

const activeButtonClassName =
  "data-[active=true]:bg-primary data-[active=true]:text-primary-foreground [&_svg]:data-[active=true]:opacity-100";
const inactiveButtonClassName = "hover:bg-background hover:text-foreground";

type NavChild = { href: string; label: string; exact?: boolean };
type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  matchPrefixes?: string[];
  children?: NavChild[];
};

function isChildActive(pathname: string, child: NavChild) {
  return child.exact ? pathname === child.href : pathname === child.href || pathname.startsWith(child.href + "/");
}

function NavItemWithChildren({ item, pathname }: { item: NavItem; pathname: string }) {
  const hasActiveChild = item.children!.some((child) => isChildActive(pathname, child));
  const [open, setOpen] = useState(hasActiveChild);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
        <CollapsibleTrigger
          render={
            <SidebarMenuButton
              tooltip={item.label}
              className={inactiveButtonClassName}
            />
          }
        >
          <item.icon />
          <span>{item.label}</span>
          <ChevronRight className="ms-auto -me-0.5 size-4 shrink-0 opacity-80 transition-transform in-data-panel-open:rotate-90 group-data-[collapsible=icon]:hidden" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="gap-4">
            {item.children!.map((child) => {
              const active = isChildActive(pathname, child);
              return (
                <SidebarMenuSubItem key={child.href}>
                  <SidebarMenuSubButton
                    isActive={active}
                    render={<Link href={child.href} />}
                    className={
                      active
                        ? "data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                        : undefined
                    }
                  >
                    <span>{child.label}</span>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export function SidebarNav({ shopName }: { shopName: string }) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader>
        <div className="mt-4 mb-4 flex items-center gap-2.5 px-2 py-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
            F
          </span>
          <div className="leading-tight group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-semibold">Flassh buy</p>
            <p className="truncate text-[11px] text-muted-foreground">{shopName}</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1">
        <SidebarGroup className="mt-10">
          <SidebarGroupContent>
            <SidebarMenu className="gap-6">
              {NAV_ITEMS.map((item) => {
                if (item.children) {
                  return <NavItemWithChildren key={item.href} item={item} pathname={pathname} />;
                }

                const isActive = item.exact
                  ? pathname === item.href
                  : pathname === item.href ||
                    pathname.startsWith(item.href + "/") ||
                    (item.matchPrefixes?.some((prefix) => pathname.startsWith(prefix)) ?? false);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      render={<Link href={item.href} />}
                      className={isActive ? activeButtonClassName : inactiveButtonClassName}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <form action={logout}>
          <SidebarMenuButton tooltip="Se déconnecter" render={<button type="submit" />}>
            <LogOut />
            <span>Se déconnecter</span>
          </SidebarMenuButton>
        </form>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
