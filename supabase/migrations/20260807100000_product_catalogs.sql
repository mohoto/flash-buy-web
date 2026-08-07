-- Regroupements nommés de produits préparés (prepared_products), pensés
-- pour préparer à l'avance la sélection d'un live précis (ex. "Catalogue du
-- 15 août") sans dupliquer les produits eux-mêmes — chaque prepared_product
-- peut appartenir à plusieurs catalogues, et reste utilisable indéfiniment
-- après qu'un catalogue ait été choisi sur un live (pas de consommation à
-- usage unique). Distinct de prepared_products elle-même (bibliothèque plate,
-- déjà existante) : product_catalogs n'ajoute qu'un niveau de regroupement
-- par-dessus, sans toucher au schéma de prepared_products.
create table product_catalogs (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null references shops(id) on delete cascade,
  name           text not null,
  -- Date prévue d'utilisation (ex. le jour du live visé) — purement
  -- indicative, n'empêche jamais de choisir ce catalogue sur un live à une
  -- autre date. Nullable : un catalogue peut ne viser aucune date précise.
  scheduled_for  date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index product_catalogs_shop_idx on product_catalogs (shop_id);

alter table product_catalogs enable row level security;

create policy seller_product_catalogs on product_catalogs
  for all
  using (shop_id in (select id from shops where owner_id = auth.uid()) or is_flassh_buy_admin())
  with check (shop_id in (select id from shops where owner_id = auth.uid()) or is_flassh_buy_admin());

create trigger product_catalogs_touch_updated_at
  before update on product_catalogs
  for each row execute function set_updated_at();

-- Association many-to-many : un prepared_product peut appartenir à
-- plusieurs catalogues, un catalogue peut regrouper plusieurs
-- prepared_products.
create table product_catalog_items (
  catalog_id           uuid not null references product_catalogs(id) on delete cascade,
  prepared_product_id  uuid not null references prepared_products(id) on delete cascade,
  created_at           timestamptz not null default now(),
  primary key (catalog_id, prepared_product_id)
);
create index product_catalog_items_prepared_idx on product_catalog_items (prepared_product_id);

alter table product_catalog_items enable row level security;

-- Pas de shop_id direct sur cette table de jointure — l'accès passe par le
-- catalogue parent (même shop garanti par la contrainte FK + la policy
-- product_catalogs elle-même, cf. sous-requête).
create policy seller_product_catalog_items on product_catalog_items
  for all
  using (
    catalog_id in (
      select id from product_catalogs
      where shop_id in (select id from shops where owner_id = auth.uid())
    ) or is_flassh_buy_admin()
  )
  with check (
    catalog_id in (
      select id from product_catalogs
      where shop_id in (select id from shops where owner_id = auth.uid())
    ) or is_flassh_buy_admin()
  );
