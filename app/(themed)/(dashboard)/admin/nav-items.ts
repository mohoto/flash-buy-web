import { LayoutDashboard, BarChart3, Users, Server, AlertTriangle, Radio } from "lucide-react";

export const NAV_SECTIONS = [
  {
    label: "Vue d'ensemble",
    items: [
      { href: "/admin", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
      { href: "/admin/stats", label: "Statistiques", icon: BarChart3 },
    ],
  },
  {
    label: "Vendeurs",
    items: [
      { href: "/admin/comptes", label: "Comptes", icon: Users },
      { href: "/admin/lives", label: "Lives en cours", icon: Radio },
    ],
  },
  {
    label: "Infrastructure",
    items: [
      { href: "/admin/workers", label: "Santé des workers", icon: Server },
      { href: "/admin/railway", label: "Alertes Railway", icon: AlertTriangle },
    ],
  },
];

export const NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);
