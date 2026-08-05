"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { logout } from "@/lib/auth/actions";
import { NAV_SECTIONS } from "./nav-items";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

export function SidebarNav({ adminName }: { adminName: string }) {
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
            <p className="text-[11px] text-muted-foreground">Admin</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-4 px-1">
        {NAV_SECTIONS.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const isActive = item.exact
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={item.label}
                        render={<Link href={item.href} />}
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
        ))}
      </SidebarContent>

      <SidebarFooter>
        <p className="truncate px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          {adminName}
        </p>
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
