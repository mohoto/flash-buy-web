"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Programmé",
  live: "En live",
  ended: "Terminé",
};

const STATUS_VARIANT: Record<string, "success" | "secondary" | "outline"> = {
  live: "success",
  scheduled: "outline",
  ended: "secondary",
};

type Live = {
  id: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
};

type Range = "day" | "week" | "month" | "all";

const RANGE_LABEL: Record<Range, string> = {
  day: "Jour",
  week: "Semaine",
  month: "Mois",
  all: "Tout",
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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function LivesList({ lives }: { lives: Live[] }) {
  const [range, setRange] = useState<Range>("day");
  const [anchor, setAnchor] = useState(() => new Date());

  const filteredLives = useMemo(() => {
    if (range === "all") return lives;
    const { start, end } = periodBounds(anchor, range);
    return lives.filter((live) => {
      const reference = new Date(live.started_at ?? live.created_at);
      return reference >= start && reference < end;
    });
  }, [lives, range, anchor]);

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

        {range !== "all" && (
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
        )}
      </div>

      <div className="flex flex-col gap-2">
        {filteredLives.map((live) => (
          <Card key={live.id} render={<Link href={`/dashboard/live/${live.id}`} />} className="hover:border-primary/50">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-foreground">
                  {new Date(live.started_at ?? live.created_at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {live.started_at ? formatTime(live.started_at) : "—"}
                  {" → "}
                  {live.ended_at ? formatTime(live.ended_at) : "en cours"}
                </span>
              </div>
              <Badge variant={STATUS_VARIANT[live.status] ?? "outline"}>
                {STATUS_LABEL[live.status] ?? live.status}
              </Badge>
            </div>
          </Card>
        ))}
        {filteredLives.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun live sur cette période.</p>
        )}
      </div>
    </div>
  );
}
