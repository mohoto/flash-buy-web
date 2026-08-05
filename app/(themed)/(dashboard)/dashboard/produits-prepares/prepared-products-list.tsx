"use client";

import { useRef, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent, PopoverTitle } from "@/components/ui/popover";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { createPreparedProduct, updatePreparedProduct, deletePreparedProduct } from "./actions";

type PreparedProduct = {
  id: string;
  name: string;
  price_cents: number;
  discount_tiers_cents: unknown;
  simple_discount_cents: number;
};

// Lecture défensive de discount_tiers_cents (typé Json côté généré) — même
// pattern que rapid-console-client.tsx.
function parseDiscountTiers(json: unknown): Record<string, number> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      out[key] = value;
    }
  }
  return out;
}

// "2" -> "2ème", "1" -> "1er".
function ordinal(n: number): string {
  return n === 1 ? "1er" : `${n}ème`;
}

function DiscountSummary({ tiers, simpleDiscountCents }: { tiers: Record<string, number>; simpleDiscountCents: number }) {
  const tierEntries = Object.entries(tiers)
    .map(([qty, cents]) => [Number(qty), cents] as const)
    .sort(([a], [b]) => a - b);

  if (tierEntries.length === 0 && simpleDiscountCents === 0) return null;

  const lines = [
    ...tierEntries.map(([qty, cents]) => `Remise sur le ${ordinal(qty)} article : -${(cents / 100).toFixed(2)} €`),
    ...(simpleDiscountCents > 0 ? [`Remise simple : -${(simpleDiscountCents / 100).toFixed(2)} €`] : []),
  ];

  return (
    <div className="flex flex-col gap-0.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

export function PreparedProductsList({ initialProducts }: { initialProducts: PreparedProduct[] }) {
  const [products, setProducts] = useState(initialProducts);

  return (
    <div className="flex flex-col gap-6">
      <CreatePreparedProductForm
        onCreated={(product) => setProducts((prev) => [product, ...prev])}
      />

      {products.length === 0 ? (
        <Empty className="rounded-xl border py-10">
          <EmptyHeader>
            <EmptyTitle>Aucun produit préparé</EmptyTitle>
            <EmptyDescription>
              Ajoute des produits ci-dessus pour les retrouver dans l&apos;onglet &quot;Catalogue&quot; de
              tes prochains lives.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <li key={product.id} className="list-none">
              <PreparedProductCard
                product={product}
                onChanged={(updated) =>
                  setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
                }
                onDeleted={(id) => setProducts((prev) => prev.filter((p) => p.id !== id))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreatePreparedProductForm({ onCreated }: { onCreated: (product: PreparedProduct) => void }) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Card>
      <CardContent className="py-4">
        <form
          ref={formRef}
          action={(formData) => {
            startTransition(async () => {
              const created = await createPreparedProduct(formData);
              if (created) onCreated(created);
            });
            formRef.current?.reset();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <Field className="w-48 gap-1.5">
            <FieldLabel htmlFor="name">Nom</FieldLabel>
            <Input id="name" name="name" placeholder="Ex : T-shirt oversize" required />
          </Field>
          <Field className="w-28 gap-1.5">
            <FieldLabel htmlFor="price">Prix (€)</FieldLabel>
            <Input id="price" name="price" type="number" min={0} step="0.01" required />
          </Field>
          <Button type="submit" disabled={isPending}>
            Ajouter
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PreparedProductCard({
  product,
  onChanged,
  onDeleted,
}: {
  product: PreparedProduct;
  onChanged: (product: PreparedProduct) => void;
  onDeleted: (id: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const tiers = parseDiscountTiers(product.discount_tiers_cents);

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-base font-medium text-foreground">{product.name}</p>
            <p className="text-sm text-muted-foreground">{(product.price_cents / 100).toFixed(2)} €</p>
          </div>
        </div>

        <DiscountSummary tiers={tiers} simpleDiscountCents={product.simple_discount_cents} />

        <Separator className="my-1" />

        <div className="flex items-center justify-end gap-2">
          <EditPreparedProductPopover product={product} onChanged={onChanged} />
          <DeletePreparedProductButton
            isPending={isPending}
            onDeleted={() => startTransition(async () => {
              await deletePreparedProduct(product.id);
              onDeleted(product.id);
            })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function EditPreparedProductPopover({
  product,
  onChanged,
}: {
  product: PreparedProduct;
  onChanged: (product: PreparedProduct) => void;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const tiers = parseDiscountTiers(product.discount_tiers_cents);

  const resetAllToZero = () => {
    formRef.current?.querySelectorAll<HTMLInputElement>('input[type="number"]').forEach((input) => {
      if (input.name.startsWith("discount")) input.value = "";
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button type="button" size="sm" variant="outline">Modifier</Button>} />
      <PopoverContent align="end" className="w-96">
        <PopoverTitle className="mb-3 text-sm">Modifier le produit</PopoverTitle>
        <form
          ref={formRef}
          action={(formData) => {
            setOpen(false);
            startTransition(async () => {
              await updatePreparedProduct(product.id, formData);
              const name = String(formData.get("name") ?? product.name).trim() || product.name;
              const priceEuros = Number(formData.get("price") ?? product.price_cents / 100);
              onChanged({
                ...product,
                name,
                price_cents: Number.isFinite(priceEuros) && priceEuros > 0
                  ? Math.round(priceEuros * 100)
                  : product.price_cents,
              });
            });
          }}
          className="flex flex-col gap-2"
        >
          <Field className="gap-1.5">
            <FieldLabel htmlFor={`edit-name-${product.id}`} className="text-xs">
              Nom
            </FieldLabel>
            <Input id={`edit-name-${product.id}`} name="name" autoFocus defaultValue={product.name} />
          </Field>
          <Field className="gap-1.5">
            <FieldLabel htmlFor={`edit-price-${product.id}`} className="text-xs">
              Prix (€)
            </FieldLabel>
            <Input
              id={`edit-price-${product.id}`}
              name="price"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={(product.price_cents / 100).toFixed(2)}
            />
          </Field>

          <Separator className="my-1" />

          <Field className="gap-1">
            <FieldLabel htmlFor={`edit-discount-simple-${product.id}`} className="text-xs">
              Remise simple (€)
            </FieldLabel>
            <Input
              id={`edit-discount-simple-${product.id}`}
              name="discount_simple"
              type="number"
              min={0}
              step="0.01"
              placeholder="0.00"
              defaultValue={product.simple_discount_cents ? (product.simple_discount_cents / 100).toFixed(2) : ""}
            />
          </Field>

          <p className="text-xs text-muted-foreground">
            Remises par quantité exacte (prioritaires sur la remise simple)
          </p>
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 8 }, (_, i) => i + 1).map((qty) => (
              <Field key={qty} className="gap-1">
                <FieldLabel htmlFor={`edit-discount-${product.id}-${qty}`} className="text-xs">
                  {qty}×
                </FieldLabel>
                <Input
                  id={`edit-discount-${product.id}-${qty}`}
                  name={`discount_${qty}`}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  defaultValue={tiers[String(qty)] ? (tiers[String(qty)] / 100).toFixed(2) : ""}
                />
              </Field>
            ))}
          </div>

          <div className="mt-1 flex items-center justify-between gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={resetAllToZero}>
              Réinitialiser à 0
            </Button>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" size="sm" variant="success" disabled={isPending}>
                Valider
              </Button>
            </div>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function DeletePreparedProductButton({
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
          <Button type="button" variant="ghost" size="sm" disabled={isPending} className="text-muted-foreground hover:text-destructive">
            <Trash2 />
          </Button>
        }
      />
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer ce produit préparé ?</AlertDialogTitle>
          <AlertDialogDescription>
            Il ne sera plus proposé dans l&apos;onglet &quot;Catalogue&quot; de tes prochains lives. Cette
            action est irréversible — les produits déjà utilisés dans un live passé ne sont pas affectés.
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
