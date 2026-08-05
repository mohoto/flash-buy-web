-- Une intention peut désormais avoir plusieurs produits assignés (au lieu
-- d'un seul remplacé à chaque glisser-déposer) : chaque ligne de cette table
-- = un produit assigné à une intention, avec sa propre quantité/remise/ligne
-- panier associée.
create table if not exists live_rapid_item_products (
  id                  uuid primary key default gen_random_uuid(),
  live_rapid_item_id  uuid not null references live_rapid_items(id) on delete cascade,
  live_product_id     uuid not null references live_products(id) on delete cascade,
  live_order_item_id  uuid references live_order_items(id) on delete set null,
  shop_id             uuid not null references shops(id) on delete cascade,
  quantity            int not null default 1 check (quantity > 0),
  discount_cents      int not null default 0,
  created_at          timestamptz not null default now(),
  unique (live_rapid_item_id, live_product_id)
);
create index if not exists live_rapid_item_products_item_idx on live_rapid_item_products (live_rapid_item_id);

alter table live_rapid_item_products enable row level security;

create policy seller_live_rapid_item_products on live_rapid_item_products
  for all
  using (shop_id in (select id from shops where owner_id = auth.uid()) or is_flassh_buy_admin())
  with check (shop_id in (select id from shops where owner_id = auth.uid()) or is_flassh_buy_admin());

alter publication supabase_realtime add table live_rapid_item_products;
alter table live_rapid_item_products replica identity full;

-- Colonnes désormais portées par live_rapid_item_products, retirées de
-- live_rapid_items (live_order_id reste : un panier par acheteur/live).
alter table live_rapid_items drop column if exists live_product_id;
alter table live_rapid_items drop column if exists quantity;
alter table live_rapid_items drop column if exists discount_cents;
alter table live_rapid_items drop column if exists live_order_item_id;
