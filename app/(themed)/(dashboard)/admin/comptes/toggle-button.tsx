"use client";

import { useTransition } from "react";
import { toggleFlasshBuyAccess } from "./actions";
import { Badge } from "@/components/ui/badge";

export function ToggleButton({
  profileId,
  enabled,
}: {
  profileId: string;
  enabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Badge
      variant={enabled ? "success" : "secondary"}
      render={
        <button
          disabled={isPending}
          onClick={() => startTransition(() => toggleFlasshBuyAccess(profileId, !enabled))}
        />
      }
      className="cursor-pointer px-3 disabled:opacity-50"
    >
      {enabled ? "Activé — révoquer" : "Désactivé — activer"}
    </Badge>
  );
}
