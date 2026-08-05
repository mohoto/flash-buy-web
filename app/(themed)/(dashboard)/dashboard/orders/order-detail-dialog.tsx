"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogPanel,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

type OrderItem = {
  product_name: string | null;
  size_label: string | null;
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
};

type OrderGroup = {
  orderNumber: number | null;
  totalCents: number;
  items: OrderItem[];
};

type OrderBlockDetail = {
  buyer_tiktok_username: string;
  nickname: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  status: "paid" | "unpaid";
  orderNumbers: number[];
  totalCents: number;
  latestDate: string;
  orderGroups: OrderGroup[];
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { dateStyle: "long" });
}

export function OrderDetailDialog({
  block,
  open,
  onOpenChange,
}: {
  block: OrderBlockDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!block) return null;

  const hasAddress = block.address && block.postal_code && block.city;
  const hasContact = block.email || block.phone;
  const statusLabel = block.status === "paid" ? "Payée" : "En attente";
  const statusVariant = block.status === "paid" ? "success" : "outline";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>
              {block.orderNumbers.length > 0
                ? block.orderNumbers.map((n) => `#${n}`).join(" · ")
                : "Commande"}
            </DialogTitle>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </div>
        </DialogHeader>
        <DialogPanel>
          <div className="flex flex-col gap-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Client
              </p>
              <p className="mt-2 font-semibold text-foreground">
                {block.full_name ?? block.nickname ?? block.buyer_tiktok_username}
              </p>
              <p className="text-sm text-muted-foreground">@{block.buyer_tiktok_username}</p>
              {hasContact && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {[block.email, block.phone].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Livraison
              </p>
              {hasAddress ? (
                <div className="mt-2 text-sm text-foreground">
                  <p>{block.address}</p>
                  <p>
                    {block.postal_code} {block.city}
                    {block.country ? ` — ${block.country}` : ""}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground italic">
                  Adresse non renseignée
                </p>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Articles
              </p>
              {block.orderGroups.map((group, groupIndex) => (
                <div key={groupIndex} className="overflow-hidden rounded-lg border">
                  <div className="flex items-center justify-between gap-4 bg-muted/40 p-3">
                    <p className="text-lg font-bold text-foreground">
                      {group.orderNumber !== null ? `#${group.orderNumber}` : "—"}
                    </p>
                    <p className="text-sm font-medium tabular-nums text-muted-foreground">
                      {(group.totalCents / 100).toFixed(2)} €
                    </p>
                  </div>
                  {group.items.map((item, itemIndex) => {
                    const lineTotal = item.unit_price_cents * item.quantity - item.discount_cents;
                    return (
                      <div
                        key={itemIndex}
                        className="flex items-center justify-between gap-4 border-t p-3"
                      >
                        <div>
                          <p className="font-medium text-foreground">
                            {item.product_name ?? "Article"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.size_label ? `${item.size_label} · ` : ""}Qté {item.quantity}
                          </p>
                        </div>
                        <p className="shrink-0 font-medium tabular-nums text-foreground">
                          {(lineTotal / 100).toFixed(2)} €
                        </p>
                      </div>
                    );
                  })}
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/40 p-3">
                <p className="font-semibold text-foreground">Total</p>
                <p className="font-semibold tabular-nums text-foreground">
                  {(block.totalCents / 100).toFixed(2)} €
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Dernière commande le {formatDate(block.latestDate)}
            </p>
          </div>
        </DialogPanel>
      </DialogContent>
    </Dialog>
  );
}
