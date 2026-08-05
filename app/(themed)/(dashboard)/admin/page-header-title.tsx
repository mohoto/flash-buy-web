"use client";

import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";

export function PageHeaderTitle() {
  const pathname = usePathname();

  const activeItem = NAV_ITEMS.find((item) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/")
  );

  if (!activeItem) return null;

  return <span className="text-sm font-medium text-foreground">{activeItem.label}</span>;
}
