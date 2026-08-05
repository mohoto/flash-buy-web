import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SummaryCard({
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  href: string;
  tone?: "default" | "ok" | "warn" | "muted";
}) {
  const dotClass =
    tone === "ok"
      ? "bg-success"
      : tone === "warn"
        ? "bg-warning"
        : tone === "muted"
          ? "bg-muted-foreground"
          : "bg-primary";

  return (
    <Card
      render={<Link href={href} />}
      className="transition-colors hover:border-primary/50"
    >
      <CardContent>
        <div className="flex items-center gap-2">
          <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        </div>
        <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
