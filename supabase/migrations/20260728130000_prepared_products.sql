-- Bibliothèque de produits "préparés à l'avance" par le vendeur, réutilisable
-- entre lives (mode rapid) — distincte de live_products (toujours liée à un
-- live précis) et du catalogue e-commerce products/product_variants (pas de
-- lien avec la marketplace mobile). Sert de nouvelle source dans l'onglet
-- "Catalogue" de la console live, à côté de "À la volée" (création manuelle
-- pendant le live, comportement existant inchangé).
create table if not exists prepared_products (
  id                    uuid primary key default gen_random_uuid(),
  shop_id               uuid not null references shops(id) on delete cascade,
  name                  text not null,
  price_cents           int not null check (price_cents > 0),
  discount_tiers_cents  jsonb not null default '{}'::jsonb,
  simple_discount_cents int not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists prepared_products_shop_idx on prepared_products (shop_id);

alter table prepared_products enable row level security;

create policy seller_prepared_products on prepared_products
  for all
  using (shop_id in (select id from shops where owner_id = auth.uid()) or is_flassh_buy_admin())
  with check (shop_id in (select id from shops where owner_id = auth.uid()) or is_flassh_buy_admin());

-- Pas de policy anon : jamais consulté côté page acheteur, seulement console
-- vendeur (RLS ci-dessus).

create trigger prepared_products_touch_updated_at
  before update on prepared_products
  for each row execute function set_updated_at();

-- ── Matérialisation dans live_products (glisser-déposer depuis l'onglet
-- Catalogue) — même pattern que create_and_activate_live_product : le
-- compteur de labels internes, l'insertion et la lecture de la source se
-- font dans la même transaction pour éviter toute course.
create or replace function create_live_product_from_prepared(
  p_live_id uuid,
  p_shop_id uuid,
  p_prepared_product_id uuid
) returns live_products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq int;
  v_ref text;
  v_prepared public.prepared_products;
  v_product public.live_products;
begin
  if not exists (
    select 1 from public.lives l
    join public.shops s on s.id = l.shop_id
    where l.id = p_live_id and l.shop_id = p_shop_id and s.owner_id = auth.uid()
  ) and not public.is_flassh_buy_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_prepared from public.prepared_products
    where id = p_prepared_product_id and shop_id = p_shop_id;
  if not found then
    raise exception 'prepared product not found';
  end if;

  update public.lives
    set rapid_product_seq = rapid_product_seq + 1
    where id = p_live_id
    returning rapid_product_seq into v_seq;

  v_ref := 'A' || v_seq::text;

  insert into public.live_products (
    live_id, shop_id, name, price_cents, internal_ref,
    discount_tiers_cents, simple_discount_cents
  )
  values (
    p_live_id, p_shop_id, v_prepared.name, v_prepared.price_cents, v_ref,
    v_prepared.discount_tiers_cents, v_prepared.simple_discount_cents
  )
  returning * into v_product;

  return v_product;
end;
$$;

grant execute on function create_live_product_from_prepared(uuid, uuid, uuid) to authenticated;

-- ── Reprise des produits d'un live précédent (même shop) — même
-- matérialisation, mais la source est une ligne live_products existante
-- plutôt que prepared_products.
create or replace function create_live_product_from_previous(
  p_live_id uuid,
  p_shop_id uuid,
  p_source_live_product_id uuid
) returns live_products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq int;
  v_ref text;
  v_source public.live_products;
  v_product public.live_products;
begin
  if not exists (
    select 1 from public.lives l
    join public.shops s on s.id = l.shop_id
    where l.id = p_live_id and l.shop_id = p_shop_id and s.owner_id = auth.uid()
  ) and not public.is_flassh_buy_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_source from public.live_products
    where id = p_source_live_product_id and shop_id = p_shop_id;
  if not found then
    raise exception 'source live product not found';
  end if;

  update public.lives
    set rapid_product_seq = rapid_product_seq + 1
    where id = p_live_id
    returning rapid_product_seq into v_seq;

  v_ref := 'A' || v_seq::text;

  insert into public.live_products (
    live_id, shop_id, name, price_cents, internal_ref,
    discount_tiers_cents, simple_discount_cents
  )
  values (
    p_live_id, p_shop_id, v_source.name, v_source.price_cents, v_ref,
    v_source.discount_tiers_cents, v_source.simple_discount_cents
  )
  returning * into v_product;

  return v_product;
end;
$$;

grant execute on function create_live_product_from_previous(uuid, uuid, uuid) to authenticated;
