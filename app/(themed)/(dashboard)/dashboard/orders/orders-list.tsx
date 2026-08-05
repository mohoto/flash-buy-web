"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { StatCard } from "@/app/(themed)/(dashboard)/admin/stats/stat-card";
import { OrderDetailDialog } from "./order-detail-dialog";
import { cn } from "@/lib/utils";

const OVERDUE_THRESHOLD_HOURS = 24;

const STATUS_LABEL: Record<string, string> = {
  pending: "En attente",
  paid: "Payée",
  cancelled: "Annulée",
};

const STATUS_VARIANT: Record<string, "success" | "outline" | "secondary"> = {
  paid: "success",
  pending: "outline",
  cancelled: "secondary",
};

type OrderItem = {
  product_name: string | null;
  size_label: string | null;
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
};

type Order = {
  id: string;
  buyer_tiktok_username: string;
  status: string;
  total_cents: number;
  created_at: string;
  live_id: string | null;
  order_number: number | null;
  nickname: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  items_count: number;
  items: OrderItem[];
};

type Range = "day" | "week" | "month";

const RANGE_LABEL: Record<Range, string> = {
  day: "Jour",
  week: "Semaine",
  month: "Mois",
};

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfWeek(d: Date): Date {
  const copy = startOfDay(d);
  const day = (copy.getDay() + 6) % 7; // lundi = 0
  copy.setDate(copy.getDate() - day);
  return copy;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addRange(d: Date, range: Range, delta: number): Date {
  const copy = new Date(d);
  if (range === "day") copy.setDate(copy.getDate() + delta);
  if (range === "week") copy.setDate(copy.getDate() + delta * 7);
  if (range === "month") copy.setMonth(copy.getMonth() + delta);
  return copy;
}

function periodBounds(anchor: Date, range: Range): { start: Date; end: Date } {
  if (range === "day") {
    const start = startOfDay(anchor);
    const end = addRange(start, "day", 1);
    return { start, end };
  }
  if (range === "week") {
    const start = startOfWeek(anchor);
    const end = addRange(start, "week", 1);
    return { start, end };
  }
  const start = startOfMonth(anchor);
  const end = addRange(start, "month", 1);
  return { start, end };
}

function formatPeriodLabel(anchor: Date, range: Range): string {
  if (range === "day") {
    return anchor.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  if (range === "week") {
    const { start, end } = periodBounds(anchor, "week");
    const lastDay = addRange(end, "day", -1);
    const sameMonth = start.getMonth() === lastDay.getMonth();
    const startLabel = start.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: sameMonth ? undefined : "long",
    });
    const endLabel = lastDay.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return `${startLabel} – ${endLabel}`;
  }
  return anchor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { dateStyle: "short" });
}

function isOverdue(order: Order, now: number): boolean {
  if (order.status !== "pending") return false;
  const hoursSinceCreation = (now - new Date(order.created_at).getTime()) / (1000 * 60 * 60);
  return hoursSinceCreation > OVERDUE_THRESHOLD_HOURS;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Découpe les commandes d'un acheteur en blocs par jour calendaire (ordre le
// plus récent en premier, hérité du tri de la requête), puis à l'intérieur de
// chaque jour sépare payées / non-payées (pending + cancelled) — un sous-bloc
// avec son propre sous-total par jour et par statut, plutôt qu'une liste
// plate triée par order_number.
function groupByDayThenStatus(orders: Order[]) {
  const days: { dateKey: string; dateIso: string; paidOrders: Order[]; unpaidOrders: Order[] }[] = [];
  const dayIndex = new Map<string, number>();
  for (const order of orders) {
    const key = dayKey(order.created_at);
    let idx = dayIndex.get(key);
    if (idx === undefined) {
      idx = days.length;
      dayIndex.set(key, idx);
      days.push({ dateKey: key, dateIso: order.created_at, paidOrders: [], unpaidOrders: [] });
    }
    if (order.status === "paid") days[idx].paidOrders.push(order);
    else days[idx].unpaidOrders.push(order);
  }
  const byOrderNumber = (a: Order, b: Order) => (a.order_number ?? 0) - (b.order_number ?? 0);
  for (const day of days) {
    day.paidOrders.sort(byOrderNumber);
    day.unpaidOrders.sort(byOrderNumber);
  }
  return days;
}

// Regroupement par acheteur (boucle externe, un seul bloc par acheteur dans
// le tableau), puis au sein de chaque acheteur, découpage par jour puis par
// statut payé/non-payé — cf. groupByDayThenStatus.
function groupByBuyer(orders: Order[]) {
  const groups: { buyer: string; days: ReturnType<typeof groupByDayThenStatus>; hasPaid: boolean }[] = [];
  const groupIndex = new Map<string, number>();
  const ordersByBuyer = new Map<string, Order[]>();
  for (const order of orders) {
    const buyer = order.buyer_tiktok_username;
    if (groupIndex.get(buyer) === undefined) {
      groupIndex.set(buyer, groups.length);
      groups.push({ buyer, days: [], hasPaid: false });
    }
    const list = ordersByBuyer.get(buyer) ?? [];
    list.push(order);
    ordersByBuyer.set(buyer, list);
  }
  for (const group of groups) {
    group.days = groupByDayThenStatus(ordersByBuyer.get(group.buyer) ?? []);
    group.hasPaid = group.days.some((day) => day.paidOrders.length > 0);
  }
  // Acheteurs avec au moins une commande payée en premier ; l'ordre relatif
  // (le plus récent en premier, hérité de la requête triée par created_at)
  // est préservé grâce au tri stable.
  groups.sort((a, b) => Number(b.hasPaid) - Number(a.hasPaid));
  return groups;
}

export function OrdersList({ orders }: { orders: Order[] }) {
  const router = useRouter();
  const [range, setRange] = useState<Range>("day");
  const [anchor, setAnchor] = useState(() => new Date());
  const [openBlocks, setOpenBlocks] = useState<Set<string>>(new Set());
  const [selectedBlock, setSelectedBlock] = useState<{
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
    orderGroups: { orderNumber: number | null; totalCents: number; items: OrderItem[] }[];
  } | null>(null);

  const toggleBlock = (key: string) => {
    setOpenBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filteredOrders = useMemo(() => {
    const { start, end } = periodBounds(anchor, range);
    return orders.filter((order) => {
      const reference = new Date(order.created_at);
      return reference >= start && reference < end;
    });
  }, [orders, range, anchor]);

  const paidCount = filteredOrders.filter((o) => o.status === "paid").length;
  const paidTotalCents = filteredOrders
    .filter((o) => o.status === "paid")
    .reduce((sum, o) => sum + o.total_cents, 0);
  const buyerCount = new Set(filteredOrders.map((o) => o.buyer_tiktok_username)).size;
  const [now] = useState(() => Date.now());
  const overdueCount = filteredOrders.filter((o) => isOverdue(o, now)).length;

  const groups = useMemo(() => groupByBuyer(filteredOrders), [filteredOrders]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={range} onValueChange={(value) => setRange(value as Range)}>
          <TabsList>
            {(Object.keys(RANGE_LABEL) as Range[]).map((key) => (
              <TabsTab key={key} value={key}>
                {RANGE_LABEL[key]}
              </TabsTab>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Période précédente"
            onClick={() => setAnchor((prev) => addRange(prev, range, -1))}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-40 text-center text-sm capitalize text-foreground">
            {formatPeriodLabel(anchor, range)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Période suivante"
            onClick={() => setAnchor((prev) => addRange(prev, range, 1))}
          >
            <ChevronRight />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
            Auj.
          </Button>
        </div>
      </div>

      <div className="mt-4 mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Commandes" value={String(filteredOrders.length)} />
        <StatCard label="Acheteurs" value={String(buyerCount)} />
        <StatCard label="Payées" value={String(paidCount)} />
        <StatCard label="Délai dépassé" value={String(overdueCount)} sub={`> ${OVERDUE_THRESHOLD_HOURS}h`} />
        <StatCard label="CA payé" value={`${(paidTotalCents / 100).toFixed(2)} €`} />
      </div>

      <div>
        {filteredOrders.length === 0 ? (
          <Empty className="rounded-xl border py-10">
            <EmptyHeader>
              <EmptyTitle>Aucune commande sur cette période</EmptyTitle>
              <EmptyDescription>
                Les commandes de tes lives apparaîtront ici.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table
            variant="card"
            className="table-fixed"
            render={<div className="max-h-[70vh] overflow-auto" />}
          >
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="[&>th]:relative [&>th]:border-b-2 [&>th]:border-border [&>th]:bg-muted [&>th]:after:absolute [&>th]:after:inset-x-0 [&>th]:after:top-full [&>th]:after:h-3 [&>th]:after:bg-background">
                <TableHead className="h-auto w-[11.11%] rounded-tl-xl py-6">Commande</TableHead>
                <TableHead className="h-auto w-[11.11%] py-6">Client</TableHead>
                <TableHead className="h-auto w-[11.11%] py-6">Articles</TableHead>
                <TableHead className="h-auto w-[11.11%] py-6 pr-12 text-right">Montant</TableHead>
                <TableHead className="h-auto w-[11.11%] py-6">Statut</TableHead>
                <TableHead className="h-auto w-[11.11%] py-6">Livraison</TableHead>
                <TableHead className="h-auto w-[11.11%] py-6">Date</TableHead>
                <TableHead className="h-auto w-[11.11%] py-6" />
                <TableHead className="h-auto w-[11.11%] rounded-tr-xl py-6" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group, groupIndex) => {
                const renderOrderRow = (order: Order) => (
                  <TableRow
                    key={order.id}
                    className={order.live_id ? "cursor-pointer hover:bg-accent/50" : undefined}
                    onClick={() => order.live_id && router.push(`/dashboard/live/${order.live_id}`)}
                  >
                    <TableCell>
                      {order.order_number !== null ? (
                        <Badge variant="secondary" className="rounded-md font-bold">
                          #{order.order_number}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-foreground">
                      {order.nickname ?? order.buyer_tiktok_username}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {order.items_count} article{order.items_count > 1 ? "s" : ""}
                    </TableCell>
                    <TableCell className="pr-12 text-right font-medium tabular-nums text-foreground">
                      {(order.total_cents / 100).toFixed(2)} €
                    </TableCell>
                    <TableCell>
                      {isOverdue(order, now) ? (
                        <Badge variant="destructive">Annulée</Badge>
                      ) : (
                        <Badge variant={STATUS_VARIANT[order.status] ?? "outline"}>
                          {STATUS_LABEL[order.status] ?? order.status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">Chronopost</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(order.created_at)}</TableCell>
                    <TableCell />
                    <TableCell />
                  </TableRow>
                );

                const renderSummaryRow = (
                  dayKeyValue: string,
                  blockOrders: Order[],
                  blockTotalCents: number,
                  variant: "paid" | "unpaid",
                ) => {
                  const key = `${group.buyer}-${dayKeyValue}-${variant}`;
                  const isOpen = openBlocks.has(key);
                  const first = blockOrders[0];
                  const itemsTotal = blockOrders.reduce((sum, o) => sum + o.items_count, 0);
                  const latestDate = blockOrders.reduce(
                    (latest, o) => (o.created_at > latest ? o.created_at : latest),
                    blockOrders[0].created_at,
                  );
                  const allOverdue = variant === "unpaid" && blockOrders.every((o) => isOverdue(o, now));

                  return (
                    <>
                      <TableRow
                        className={cn(
                          "cursor-pointer",
                          variant === "paid" ? "bg-success/6" : "bg-muted/40",
                        )}
                        onClick={() => toggleBlock(key)}
                      >
                        <TableCell className="whitespace-normal">
                          <p className="text-foreground">{first.nickname ?? group.buyer}</p>
                          <p className="text-xs text-muted-foreground">@{group.buyer}</p>
                        </TableCell>
                        <TableCell
                          className={cn(
                            "whitespace-normal",
                            first.full_name ? "text-foreground" : "text-muted-foreground italic",
                          )}
                        >
                          {first.full_name ?? "Non renseigné"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {itemsTotal} article{itemsTotal > 1 ? "s" : ""}
                        </TableCell>
                        <TableCell className="pr-12 text-right font-medium tabular-nums text-foreground">
                          {(blockTotalCents / 100).toFixed(2)} €
                        </TableCell>
                        <TableCell>
                          <Badge variant={allOverdue ? "destructive" : variant === "paid" ? "success" : "outline"}>
                            {allOverdue ? "Annulée" : variant === "paid" ? "Payée" : "En attente"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">Chronopost</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(latestDate)}</TableCell>
                        <TableCell>
                          <div className="flex justify-center">
                            <button
                              type="button"
                              aria-label="Voir le détail de la commande"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBlock({
                                  buyer_tiktok_username: group.buyer,
                                  nickname: first.nickname,
                                  full_name: first.full_name,
                                  email: first.email,
                                  phone: first.phone,
                                  address: first.address,
                                  postal_code: first.postal_code,
                                  city: first.city,
                                  country: first.country,
                                  status: variant,
                                  orderNumbers: blockOrders
                                    .map((o) => o.order_number)
                                    .filter((n): n is number => n !== null),
                                  totalCents: blockTotalCents,
                                  latestDate,
                                  orderGroups: blockOrders.map((o) => ({
                                    orderNumber: o.order_number,
                                    totalCents: o.total_cents,
                                    items: o.items,
                                  })),
                                });
                              }}
                            >
                              <Eye className="size-4 text-muted-foreground" />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="pr-4">
                          <div className="flex justify-end">
                            <ChevronDown
                              className={cn(
                                "size-4 text-muted-foreground transition-transform duration-200",
                                isOpen && "rotate-180",
                              )}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                      {isOpen && blockOrders.map((order) => renderOrderRow(order))}
                    </>
                  );
                };

                return (
                  <Fragment key={group.buyer}>
                    {groupIndex > 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="bg-background! border-b-0! p-2!" />
                      </TableRow>
                    )}
                    {group.days.map((day) => (
                      <Fragment key={day.dateKey}>
                        {day.paidOrders.length > 0 &&
                          renderSummaryRow(
                            day.dateKey,
                            day.paidOrders,
                            day.paidOrders.reduce((sum, o) => sum + o.total_cents, 0),
                            "paid",
                          )}
                        {day.unpaidOrders.length > 0 &&
                          renderSummaryRow(
                            day.dateKey,
                            day.unpaidOrders,
                            day.unpaidOrders.reduce((sum, o) => sum + o.total_cents, 0),
                            "unpaid",
                          )}
                      </Fragment>
                    ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <OrderDetailDialog
        block={selectedBlock}
        open={selectedBlock !== null}
        onOpenChange={(open) => !open && setSelectedBlock(null)}
      />
    </div>
  );
}
