import { Badge } from "@/components/ui/badge";

export function LiveBadge() {
  return (
    <Badge variant="error" className="gap-1.5">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
      </span>
      En direct
    </Badge>
  );
}
