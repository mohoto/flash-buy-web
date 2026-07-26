-- Mode "rapid" : le vendeur crée les produits pendant le live (pas de
-- catalogue pré-existant), un seul produit "à l'antenne" à la fois par live.
-- Les acheteurs signalent l'intention d'achat par un "jp" nu, résolu contre
-- le produit actif (cf. worker/src/rapid-parsing.ts). Mode ajouté à côté de
-- catalog/freeform, sans les modifier.

-- ── lives : compteur de labels internes + produit actif ────────────────────
alter table lives
  add column if not exists rapid_product_seq int not null default 0;

-- lives.mode a un CHECK constraint existant (catalog|freeform, appliqué
-- directement sur le remote sans migration trackée ici) : on l'étend pour
-- accepter le nouveau mode sans le retirer.
alter table lives drop constraint if exists lives_mode_check;
alter table lives add constraint lives_mode_check
  check (mode = any (array['catalog', 'freeform', 'rapid']));

-- ── live_products ───────────────────────────────────────────────────────────
create table if not exists live_products (
  id           uuid primary key default gen_random_uuid(),
  live_id      uuid not null references lives(id) on delete cascade,
  shop_id      uuid not null references shops(id) on delete cascade, -- dénormalisé, filtrage Realtime worker (cf. product_variants.shop_id)
  name         text not null,
  price_cents  int not null check (price_cents > 0),
  internal_ref text not null, -- "A13" — jamais montré à l'acheteur, préparation de commande
  has_color    boolean not null default false,
  has_size     boolean not null default false,
  retired_at   timestamptz, -- non-null => plus "à l'antenne", visible seulement dans "produits précédents"
  created_at   timestamptz not null default now()
);
create index if not exists live_products_live_idx on live_products (live_id);
create index if not exists live_products_live_active_idx on live_products (live_id) where retired_at is null;

alter table lives
  add column if not exists active_product_id uuid references live_products(id) on delete set null;

-- ── live_rapid_items : intentions d'achat "jp", résolues ou non ────────────
do $$ begin
  create type rapid_resolution_state as enum ('auto', 'ai', 'needs_correction', 'resolved_manual');
exception when duplicate_object then null; end $$;

create table if not exists live_rapid_items (
  id                    uuid primary key default gen_random_uuid(),
  live_id               uuid not null references lives(id) on delete cascade,
  shop_id               uuid not null references shops(id) on delete cascade,
  live_order_id         uuid references live_orders(id) on delete set null, -- rempli une fois attaché au panier acheteur
  live_order_item_id    uuid references live_order_items(id) on delete set null, -- ligne miroir créée à la résolution
  live_product_id       uuid references live_products(id) on delete set null, -- null tant que non résolu / produit supprimé
  buyer_tiktok_username text not null,
  nickname              text,
  profile_picture_url   text,
  source_comment        text not null,
  tiktok_comment_id     text, -- idempotence (redelivery WebSocket)
  quantity              int not null default 1,
  raw_color_text        text, -- token brut détecté ("choco", "noir"…)
  raw_size_text         text, -- token brut détecté ("L", "M"…)
  resolution_state      rapid_resolution_state not null default 'needs_correction',
  resolution_reason     text, -- ex. "produit_non_trouve", "dimension_manquante", "orphelin_expire"
  received_at           timestamptz not null default now(), -- horodatage du commentaire (affiché "reçu à HH:MM:SS" si orphelin expiré)
  resolved_at           timestamptz,
  created_at            timestamptz not null default now()
);
create index if not exists live_rapid_items_live_idx on live_rapid_items (live_id, created_at desc);
create index if not exists live_rapid_items_state_idx on live_rapid_items (live_id, resolution_state);
create unique index if not exists live_rapid_items_comment_idempotency
  on live_rapid_items (live_id, tiktok_comment_id)
  where tiktok_comment_id is not null;

-- ── Realtime ────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table live_products;
alter publication supabase_realtime add table live_rapid_items;

-- ── RLS (même principe que seller_live_orders / seller_live_order_items) ──
alter table live_products    enable row level security;
alter table live_rapid_items enable row level security;

create policy seller_live_products on live_products
  for all
  using (shop_id in (select id from shops where owner_id = auth.uid()) or is_flassh_buy_admin())
  with check (shop_id in (select id from shops where owner_id = auth.uid()) or is_flassh_buy_admin());

create policy seller_live_rapid_items on live_rapid_items
  for all
  using (shop_id in (select id from shops where owner_id = auth.uid()) or is_flassh_buy_admin())
  with check (shop_id in (select id from shops where owner_id = auth.uid()) or is_flassh_buy_admin());

-- Pas de policy anon : jamais consulté par la page acheteur (/live/[cartSlug]),
-- seulement par la console vendeur (RLS ci-dessus) et le worker (service_role).

-- ── Création + activation atomique ("à l'antenne") ─────────────────────────
-- Une seule fonction pour éviter une race entre "insert produit" et "update
-- lives.active_product_id" vues comme deux requêtes séparées (double-clic /
-- double-Entrée sur la barre express) : le compteur, l'insertion et le
-- bascule d'actif se font dans la même transaction.
create or replace function create_and_activate_live_product(
  p_live_id uuid,
  p_shop_id uuid,
  p_name text,
  p_price_cents int,
  p_has_color boolean,
  p_has_size boolean
) returns live_products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq int;
  v_ref text;
  v_product public.live_products;
begin
  if not exists (
    select 1 from public.lives l
    join public.shops s on s.id = l.shop_id
    where l.id = p_live_id and l.shop_id = p_shop_id and s.owner_id = auth.uid()
  ) and not public.is_flassh_buy_admin() then
    raise exception 'not authorized';
  end if;

  update public.lives
    set rapid_product_seq = rapid_product_seq + 1
    where id = p_live_id
    returning rapid_product_seq into v_seq;

  v_ref := 'A' || v_seq::text;

  insert into public.live_products (live_id, shop_id, name, price_cents, internal_ref, has_color, has_size)
  values (p_live_id, p_shop_id, p_name, p_price_cents, v_ref, p_has_color, p_has_size)
  returning * into v_product;

  update public.lives set active_product_id = v_product.id where id = p_live_id;

  return v_product;
end;
$$;

grant execute on function create_and_activate_live_product(uuid, uuid, text, int, boolean, boolean) to authenticated;
