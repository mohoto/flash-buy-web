"use client";

import { useTransition } from "react";
import { toggleFlasshBuyAccess } from "./actions";

export function ToggleButton({
  profileId,
  enabled,
}: {
  profileId: string;
  enabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(() => toggleFlasshBuyAccess(profileId, !enabled))}
      className={
        enabled
          ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
          : "rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
      }
    >
      {enabled ? "Activé — révoquer" : "Désactivé — activer"}
    </button>
  );
}
