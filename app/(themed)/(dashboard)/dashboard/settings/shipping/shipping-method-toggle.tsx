"use client";

import { useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function ShippingMethodToggle({
  groupKey,
  displayName,
  description,
  examplePriceLabel,
  isActive,
  action,
}: {
  groupKey: string;
  displayName: string;
  description: string;
  examplePriceLabel: string;
  isActive: boolean;
  action: (groupKey: string, nextValue: boolean) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={`shipping-${groupKey}`} className="text-lg/normal font-normal sm:text-lg/normal">
          {displayName}
        </Label>
        <p className="text-sm text-muted-foreground">{description}</p>
        <p className="text-sm text-muted-foreground">{examplePriceLabel}</p>
      </div>
      <Switch
        id={`shipping-${groupKey}`}
        checked={isActive}
        disabled={isPending}
        onCheckedChange={(checked) => startTransition(() => action(groupKey, checked))}
        className="[--thumb-size:--spacing(6)] sm:[--thumb-size:--spacing(6)]"
      />
    </div>
  );
}
