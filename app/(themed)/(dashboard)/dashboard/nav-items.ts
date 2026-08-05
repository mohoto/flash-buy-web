import { LayoutGrid, Package, Radio, ShoppingBag, Settings, Boxes } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Accueil", icon: LayoutGrid, exact: true },
  { href: "/dashboard/catalogue", label: "Catalogue", icon: Package },
  { href: "/dashboard/produits-prepares", label: "Produits préparés", icon: Boxes },
  { href: "/dashboard/lives", label: "Lives", icon: Radio, matchPrefixes: ["/dashboard/live/"] },
  { href: "/dashboard/orders", label: "Commandes", icon: ShoppingBag },
  {
    href: "/dashboard/settings",
    label: "Paramètres",
    icon: Settings,
    children: [
      { href: "/dashboard/settings", label: "Configuration", exact: true },
      { href: "/dashboard/settings/shipping", label: "Mode de livraison" },
      { href: "/dashboard/settings/payment", label: "Moyen de paiement" },
    ],
  },
];
