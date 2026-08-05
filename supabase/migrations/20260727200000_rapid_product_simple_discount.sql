-- Remise fixe indépendante de la quantité, en complément des paliers
-- (discount_tiers_cents) : s'applique quelle que soit la quantité glissée,
-- sauf si un palier exact existe pour cette quantité (le palier est alors
-- prioritaire, cf. lookupDiscountCents côté Server Action).
alter table live_products
  add column if not exists simple_discount_cents int not null default 0;
