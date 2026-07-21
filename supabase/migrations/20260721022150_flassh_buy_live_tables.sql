-- Flassh buy : tables du live-selling. Le schéma existant (app mobile) utilise
-- shops (pas profiles) comme entité vendeur pour products/orders ; on reste cohérent
-- avec ça ici. Tables dédiées live_orders/live_order_items pour ne pas mélanger
-- le flux marketplace mobile (Sendcloud, shipping) avec les paniers de live TikTok.

create extension if not exists "pg_trgm";

-- ── Dénormalisation pour le Realtime catalogue (voir spec section 5) ─────────
-- product_variants n'a pas de shop_id direct (lié via product_id) ; on l'ajoute
-- pour permettre au worker de filtrer ses abonnements Realtime par vendeur.
alter table product_variants
  add column if not exists shop_id uuid references shops(id) on delete cascade;

update product_variants v
  set shop_id = p.shop_id
  from products p
  where p.id = v.product_id and v.shop_id is null;

create index if not exists product_variants_shop_idx on product_variants (shop_id);

create or replace function sync_product_variants_shop_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.shop_id := (select shop_id from public.products where id = new.product_id);
  return new;
end;
$$;

drop trigger if exists product_variants_sync_shop_id on product_variants;
create trigger product_variants_sync_shop_id
  before insert or update of product_id on product_variants
  for each row execute function sync_product_variants_shop_id();

-- ── Enums ─────────────────────────────────────────────────────────────────
do $$ begin
  create type live_status as enum ('scheduled', 'live', 'ended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type live_order_status as enum ('pending', 'validated', 'paid', 'cancelled');
exception when duplicate_object then null; end $$;

-- ── Lives ─────────────────────────────────────────────────────────────────
create table if not exists lives (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null references shops(id) on delete cascade,
  tiktok_room_id text,
  euler_alert_id text,
  status         live_status not null default 'scheduled',
  started_at     timestamptz,
  ended_at       timestamptz,
  -- Sharding worker (claim atomique, heartbeat, auto-réparation)
  worker_id      text,
  claimed_at     timestamptz,
  heartbeat_at   timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists lives_shop_status_idx on lives (shop_id, status);
create index if not exists lives_worker_idx on lives (worker_id) where worker_id is not null;

-- ── Commandes live (un panier "ouvert" par acheteur et par live) ──────────
create table if not exists live_orders (
  id                    uuid primary key default gen_random_uuid(),
  live_id               uuid references lives(id) on delete set null,
  shop_id               uuid not null references shops(id) on delete cascade,
  buyer_profile_id      uuid references profiles(id) on delete set null,
  buyer_tiktok_username text not null,
  status                live_order_status not null default 'pending',
  total_cents           int not null default 0,
  stripe_payment_intent text, -- Phase 2 (paiement), inutilisé pour l'instant
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists live_orders_shop_status_idx on live_orders (shop_id, status);
create index if not exists live_orders_live_idx on live_orders (live_id);
create unique index if not exists live_orders_open_per_buyer
  on live_orders (live_id, buyer_tiktok_username)
  where status in ('pending', 'validated');

create trigger live_orders_touch_updated_at
  before update on live_orders
  for each row execute function set_updated_at();

-- ── Lignes de commande live ────────────────────────────────────────────────
create table if not exists live_order_items (
  id               uuid primary key default gen_random_uuid(),
  live_order_id    uuid not null references live_orders(id) on delete cascade,
  product_id       uuid references products(id) on delete set null,
  variant_id       uuid references product_variants(id) on delete set null,
  design_size_stock_id uuid references design_size_stock(id) on delete set null,
  size_label       text,
  quantity         int not null default 1,
  unit_price_cents int not null default 0,
  tiktok_comment_id text, -- idempotence : id du commentaire fourni par Euler
  source_comment   text,
  raw_product_text text,
  raw_size_text    text,
  matched          boolean not null default false,
  match_score      real,
  created_at       timestamptz not null default now()
);
create index if not exists live_order_items_order_idx on live_order_items (live_order_id);
create unique index if not exists live_order_items_comment_idempotency
  on live_order_items (live_order_id, tiktok_comment_id)
  where tiktok_comment_id is not null;

-- ── Realtime ────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table live_orders;
alter publication supabase_realtime add table live_order_items;
alter publication supabase_realtime add table lives;

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table lives            enable row level security;
alter table live_orders      enable row level security;
alter table live_order_items enable row level security;

create policy seller_lives on lives
  for all
  using (shop_id in (select id from shops where owner_id = auth.uid()) or is_flassh_buy_admin())
  with check (shop_id in (select id from shops where owner_id = auth.uid()) or is_flassh_buy_admin());

create policy seller_live_orders on live_orders
  for all
  using (shop_id in (select id from shops where owner_id = auth.uid()) or is_flassh_buy_admin())
  with check (shop_id in (select id from shops where owner_id = auth.uid()) or is_flassh_buy_admin());

create policy seller_live_order_items on live_order_items
  for all
  using (
    exists (
      select 1 from live_orders lo
      where lo.id = live_order_items.live_order_id
        and (lo.shop_id in (select id from shops where owner_id = auth.uid()) or is_flassh_buy_admin())
    )
  );

-- Page acheteur : PAS de policy RLS anon sur live_orders/live_order_items.
-- Le panier est servi via une route serveur (service role) ou une RPC
-- security definer (get_live_cart, cf. migration dédiée) qui ne renvoie que
-- le panier demandé (cart_slug + buyer_tiktok_username).

-- ── Observabilité : santé des workers + alertes Railway ────────────────────
create table if not exists worker_health (
  worker_id          text primary key,
  lives_count        int  not null default 0,
  event_loop_p99_ms  real,
  ws_open_failures   int  not null default 0,
  updated_at         timestamptz not null default now()
);

create table if not exists railway_events (
  id           uuid primary key default gen_random_uuid(),
  event_type   text not null,
  status       text,
  service_name text,
  environment  text,
  payload      jsonb not null,
  received_at  timestamptz not null default now()
);
create index if not exists railway_events_received_idx on railway_events (received_at desc);

alter table worker_health  enable row level security;
alter table railway_events enable row level security;

create policy admin_reads_worker_health on worker_health
  for select using (is_flassh_buy_admin());
create policy admin_reads_railway_events on railway_events
  for select using (is_flassh_buy_admin());

alter publication supabase_realtime add table worker_health;
alter publication supabase_realtime add table railway_events;
