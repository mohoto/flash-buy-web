"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Trash2, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
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
  getCatalogPreparedProducts,
  createPreparedProductInCatalog,
  removeProductFromCatalog,
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

export function ProductCatalogsList({ initialCatalogs }: { initialCatalogs: Catalog[] }) {
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

        <div className="flex items-center gap-3">
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

          <CreateCatalogDialog onCreated={(catalog) => setCatalogs((prev) => [catalog, ...prev])} />
        </div>
      </div>

      {filteredCatalogs.length === 0 ? (
        <Empty className="rounded-xl border py-10">
          <EmptyHeader>
            <EmptyTitle>Aucun catalogue</EmptyTitle>
            <EmptyDescription>
              {range === "all"
                ? "Crée un catalogue pour le retrouver dans l'onglet \"Catalogue\" de tes prochains lives."
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

// Popup de création : nom + date prévue uniquement — les produits se gèrent
// ensuite, une fois le catalogue créé, via ManageCatalogProductsDialog (le
// catalogue doit exister avant de pouvoir lui rattacher des
// prepared_products, cf. product_catalog_items.catalog_id).
function CreateCatalogDialog({ onCreated }: { onCreated: (catalog: Catalog) => void }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button"><Plus />Créer un catalogue</Button>} />
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Créer un catalogue</DialogTitle>
          <DialogDescription>
            Tu pourras y ajouter des produits une fois le catalogue créé.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            ref={formRef}
            id="create-catalog-form"
            action={(formData) => {
              startTransition(async () => {
                const created = await createProductCatalog(formData);
                if (created) {
                  onCreated(created);
                  setOpen(false);
                  formRef.current?.reset();
                }
              });
            }}
            className="flex flex-col gap-4"
          >
            <Field className="gap-1.5">
              <FieldLabel htmlFor="catalog-name">Nom du catalogue</FieldLabel>
              <Input id="catalog-name" name="name" placeholder="Ex : Catalogue du 15 août" autoFocus required />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="catalog-scheduled-for">Date prévue</FieldLabel>
              <Input id="catalog-scheduled-for" name="scheduled_for" type="date" nativeInput />
            </Field>
          </form>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="secondary">Annuler</Button>} />
          <Button type="submit" form="create-catalog-form" disabled={isPending}>
            Créer
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
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
  onChanged,
  onDeleted,
}: {
  catalog: Catalog;
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

        <div className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t pt-3">
          <ManageCatalogProductsDialog
            catalog={catalog}
            onProductCountChanged={(count) => onChanged({ ...catalog, product_count: count })}
          />
          <EditCatalogDialog catalog={catalog} onChanged={onChanged} />
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

// Popup dédiée à la composition du catalogue : liste les produits déjà
// inclus (retirables un par un) et permet d'en créer un nouveau directement
// ici — createPreparedProductInCatalog crée le prepared_product ET l'attache
// à ce catalogue en une seule action, pas de bibliothèque à plat à cocher
// séparément (cf. suppression de "Produits préparés" sur cette page).
function ManageCatalogProductsDialog({
  catalog,
  onProductCountChanged,
}: {
  catalog: Catalog;
  onProductCountChanged: (count: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<PreparedProduct[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // Chargé à l'ouverture plutôt qu'au rendu de la carte (rarement consulté,
  // ne vaut pas d'alourdir le fetch initial) — même pattern que "Reprendre un
  // live précédent" dans la console live.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && products === null) {
      getCatalogPreparedProducts(catalog.id).then(setProducts);
    }
  };

  const handleCreate = (formData: FormData) => {
    startTransition(async () => {
      const created = await createPreparedProductInCatalog(catalog.id, formData);
      if (created) {
        setProducts((prev) => {
          const next = [...(prev ?? []), created];
          onProductCountChanged(next.length);
          return next;
        });
        formRef.current?.reset();
      }
    });
  };

  const handleRemove = (productId: string) => {
    startTransition(async () => {
      await removeProductFromCatalog(catalog.id, productId);
      setProducts((prev) => {
        const next = (prev ?? []).filter((p) => p.id !== productId);
        onProductCountChanged(next.length);
        return next;
      });
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline">Gérer les produits</Button>} />
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Produits — {catalog.name}</DialogTitle>
          <DialogDescription>
            Ajoute des produits directement ici, ils rejoignent ce catalogue immédiatement.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="flex flex-col gap-4">
            <form
              ref={formRef}
              action={handleCreate}
              className="flex flex-wrap items-end gap-3 rounded-lg border p-3"
            >
              <Field className="w-40 gap-1.5">
                <FieldLabel htmlFor={`new-product-name-${catalog.id}`} className="text-xs">
                  Nom
                </FieldLabel>
                <Input
                  id={`new-product-name-${catalog.id}`}
                  name="name"
                  placeholder="Ex : T-shirt oversize"
                  required
                />
              </Field>
              <Field className="w-24 gap-1.5">
                <FieldLabel htmlFor={`new-product-price-${catalog.id}`} className="text-xs">
                  Prix (€)
                </FieldLabel>
                <Input
                  id={`new-product-price-${catalog.id}`}
                  name="price"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                />
              </Field>
              <Button type="submit" size="sm" disabled={isPending}>
                <Plus />
                Ajouter
              </Button>
            </form>

            {products === null ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Chargement…</p>
            ) : products.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Aucun produit pour l&apos;instant — ajoute-en un ci-dessus.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {products.map((product) => (
                  <li key={product.id} className="list-none">
                    <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(product.price_cents / 100).toFixed(2)} €
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemove(product.id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="secondary">Fermer</Button>} />
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function EditCatalogDialog({
  catalog,
  onChanged,
}: {
  catalog: Catalog;
  onChanged: (catalog: Catalog) => void;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline">Modifier</Button>} />
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Modifier le catalogue</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <form
            id={`edit-catalog-form-${catalog.id}`}
            action={(formData) => {
              startTransition(async () => {
                await updateProductCatalog(catalog.id, formData);
                const name = String(formData.get("name") ?? catalog.name).trim() || catalog.name;
                const scheduledFor = String(formData.get("scheduled_for") ?? "").trim() || null;
                onChanged({ ...catalog, name, scheduled_for: scheduledFor });
                setOpen(false);
              });
            }}
            className="flex flex-col gap-4"
          >
            <Field className="gap-1.5">
              <FieldLabel htmlFor={`edit-catalog-name-${catalog.id}`}>Nom</FieldLabel>
              <Input
                id={`edit-catalog-name-${catalog.id}`}
                name="name"
                autoFocus
                defaultValue={catalog.name}
              />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel htmlFor={`edit-catalog-date-${catalog.id}`}>Date prévue</FieldLabel>
              <Input
                id={`edit-catalog-date-${catalog.id}`}
                name="scheduled_for"
                type="date"
                nativeInput
                defaultValue={catalog.scheduled_for ?? ""}
              />
            </Field>
          </form>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="secondary">Annuler</Button>} />
          <Button type="submit" form={`edit-catalog-form-${catalog.id}`} disabled={isPending}>
            Valider
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
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
            Les produits qu&apos;il contient ne sont pas supprimés, seul ce regroupement disparaît.
            Cette action est irréversible.
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
