import { Badge, type BadgeProps } from "@/components/ui/badge";

// Fine wrapper autour de Badge pour les statuts de cette page (live-badge,
// connexion, spectateurs) : garde un point d'extension commun sans dupliquer
// le variant/props partout.
export function StatusBadge(props: BadgeProps) {
  return <Badge {...props} />;
}
