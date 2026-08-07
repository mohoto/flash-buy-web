"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogClose,
} from "@/components/ui/alert-dialog";
import {
  createProductCatalog,
  updateProductCatalog,
  deleteProductCatalog,
  getProductCatalogItems,
} from "./actions";

type PreparedProduct = { id: string; name: string; price_cents: number };

type Catalog = {
  id: string;
  name: string;
  scheduled_for: string | null;
  created_at: string;
  product_count: number;
};

// Même pattern de sélecteur de période que lives-list.tsx (Jour/Semaine/Mois/
// Tout + navigation) — filtre les catalogues par leur date PRÉVUE
// (scheduled_for), pas leur date de création : un catalogue préparé le
// 1er août pour un live du 15 doit apparaître sous "15 août", pas "1er août".
// Un catalogue sans date prévue n'apparaît que sous "Tout".
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
    return { start, end: addRange(start, "day", 1) };
  }
  if (range === "week") {
    const start = startOfWeek(anchor);
    return { start, end: addRange(start, "week", 1) };
  }
  const start = startOfMonth(anchor);
  return { start, end: addRange(start, "month", 1) };
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

export function ProductCatalogsList({
  initialCatalogs,
  preparedProducts,
}: {
  initialCatalogs: Catalog[];
  preparedProducts: PreparedProduct[];
}) {
  const [catalogs, setCatalogs] = useState(initialCatalogs);
  const [range, setRange] = useState<Range>("all");
  const [anchor, setAnchor] = useState(() => new Date());

  const filteredCatalogs = useMemo(() => {
    if (range === "all") return catalogs;
    const { start, end } = periodBounds(anchor, range);
    return catalogs.filter((catalog) => {
      if (!catalog.scheduled_for) return false;
      const reference = new Date(`${catalog.scheduled_for}T00:00:00`);
      return reference >= start && reference < end;
    });
  }, [catalogs, range, anchor]);

  return (
    <div className="flex flex-col gap-6">
      <CreateCatalogForm
        preparedProducts={preparedProducts}
        onCreated={(catalog) => setCatalogs((prev) => [catalog, ...prev])}
      />

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

      {filteredCatalogs.length === 0 ? (
        <Empty className="rounded-xl border py-10">
          <EmptyHeader>
            <EmptyTitle>Aucun catalogue</EmptyTitle>
            <EmptyDescription>
              {range === "all"
                ? "Crée un catalogue ci-dessus pour le retrouver dans l'onglet \"Catalogue\" de tes prochains lives."
                : "Aucun catalogue prévu sur cette période."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCatalogs.map((catalog) => (
            <li key={catalog.id} className="list-none">
              <CatalogCard
                catalog={catalog}
                preparedProducts={preparedProducts}
                onChanged={(updated) =>
                  setCatalogs((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
                }
                onDeleted={(id) => setCatalogs((prev) => prev.filter((c) => c.id !== id))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateCatalogForm({
  preparedProducts,
  onCreated,
}: {
  preparedProducts: PreparedProduct[];
  onCreated: (catalog: Catalog) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const formRef = useRef<HTMLFormElement>(null);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-4">
        <form
          ref={formRef}
          action={(formData) => {
            for (const id of selectedIds) formData.append("product_ids", id);
            startTransition(async () => {
              const created = await createProductCatalog(formData);
              if (created) onCreated(created);
            });
            formRef.current?.reset();
            setSelectedIds(new Set());
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-wrap items-end gap-3">
            <Field className="w-56 gap-1.5">
              <FieldLabel htmlFor="catalog-name">Nom du catalogue</FieldLabel>
              <Input id="catalog-name" name="name" placeholder="Ex : Catalogue du 15 août" required />
            </Field>
            <Field className="w-40 gap-1.5">
              <FieldLabel htmlFor="catalog-scheduled-for">Date prévue</FieldLabel>
              <Input id="catalog-scheduled-for" name="scheduled_for" type="date" nativeInput />
            </Field>
          </div>

          {preparedProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ajoute d&apos;abord des produits préparés ci-dessus pour pouvoir les regrouper ici.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Produits inclus ({selectedIds.size})
              </p>
              <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
                {preparedProducts.map((product) => (
                  <label
                    key={product.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      checked={selectedIds.has(product.id)}
                      onCheckedChange={() => toggle(product.id)}
                    />
                    <span className="min-w-0 flex-1 truncate text-foreground">{product.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {(product.price_cents / 100).toFixed(2)} €
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <Button type="submit" disabled={isPending} className="self-start">
            Créer le catalogue
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function formatScheduledFor(scheduledFor: string | null): string {
  if (!scheduledFor) return "Aucune date prévue";
  return new Date(`${scheduledFor}T00:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function CatalogCard({
  catalog,
  preparedProducts,
  onChanged,
  onDeleted,
}: {
  catalog: Catalog;
  preparedProducts: PreparedProduct[];
  onChanged: (catalog: Catalog) => void;
  onDeleted: (id: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-foreground">{catalog.name}</p>
          <p className="text-sm text-muted-foreground">{formatScheduledFor(catalog.scheduled_for)}</p>
        </div>

        <Badge variant="secondary" size="sm" className="w-fit">
          {catalog.product_count} produit{catalog.product_count > 1 ? "s" : ""}
        </Badge>

        <div className="mt-2 flex items-center justify-end gap-2 border-t pt-3">
          <EditCatalogPopover
            catalog={catalog}
            preparedProducts={preparedProducts}
            onChanged={onChanged}
          />
          <DeleteCatalogButton
            isPending={isPending}
            onDeleted={() =>
              startTransition(async () => {
                await deleteProductCatalog(catalog.id);
                onDeleted(catalog.id);
              })
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function EditCatalogPopover({
  catalog,
  preparedProducts,
  onChanged,
}: {
  catalog: Catalog;
  preparedProducts: PreparedProduct[];
  onChanged: (catalog: Catalog) => void;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Charge la composition actuelle à l'ouverture plutôt qu'au chargement de
  // la page (rarement consulté, ne vaut pas d'alourdir le fetch initial) —
  // même pattern que "Reprendre un live précédent" dans la console live.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && selectedIds === null) {
      getProductCatalogItems(catalog.id).then((ids) => setSelectedIds(new Set(ids)));
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={<Button type="button" size="sm" variant="outline">Modifier</Button>} />
      <PopoverContent align="end" className="w-96">
        <PopoverTitle className="mb-3 text-sm">Modifier le catalogue</PopoverTitle>
        <form
          ref={formRef}
          action={(formData) => {
            for (const id of selectedIds ?? []) formData.append("product_ids", id);
            setOpen(false);
            startTransition(async () => {
              await updateProductCatalog(catalog.id, formData);
              const name = String(formData.get("name") ?? catalog.name).trim() || catalog.name;
              const scheduledFor = String(formData.get("scheduled_for") ?? "").trim() || null;
              onChanged({
                ...catalog,
                name,
                scheduled_for: scheduledFor,
                product_count: (selectedIds ?? new Set()).size,
              });
            });
          }}
          className="flex flex-col gap-3"
        >
          <Field className="gap-1.5">
            <FieldLabel htmlFor={`edit-catalog-name-${catalog.id}`} className="text-xs">
              Nom
            </FieldLabel>
            <Input
              id={`edit-catalog-name-${catalog.id}`}
              name="name"
              autoFocus
              defaultValue={catalog.name}
            />
          </Field>
          <Field className="gap-1.5">
            <FieldLabel htmlFor={`edit-catalog-date-${catalog.id}`} className="text-xs">
              Date prévue
            </FieldLabel>
            <Input
              id={`edit-catalog-date-${catalog.id}`}
              name="scheduled_for"
              type="date"
              nativeInput
              defaultValue={catalog.scheduled_for ?? ""}
            />
          </Field>

          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Produits inclus</p>
            {selectedIds === null ? (
              <p className="py-2 text-center text-sm text-muted-foreground">Chargement…</p>
            ) : (
              <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-lg border p-2">
                {preparedProducts.map((product) => (
                  <label
                    key={product.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      checked={selectedIds.has(product.id)}
                      onCheckedChange={() => toggle(product.id)}
                    />
                    <span className="min-w-0 flex-1 truncate text-foreground">{product.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={isPending || selectedIds === null}>
              Valider
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function DeleteCatalogButton({
  isPending,
  onDeleted,
}: {
  isPending: boolean;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 />
          </Button>
        }
      />
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer ce catalogue ?</AlertDialogTitle>
          <AlertDialogDescription>
            Les produits préparés qu&apos;il contient ne sont pas supprimés, seul ce regroupement
            disparaît. Cette action est irréversible.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="secondary">Annuler</Button>} />
          <Button
            variant="destructive"
            onClick={() => {
              setOpen(false);
              onDeleted();
            }}
          >
            Supprimer
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
