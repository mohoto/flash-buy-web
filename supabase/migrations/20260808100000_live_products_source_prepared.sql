-- Trace le prepared_product d'origine d'un live_products matérialisé via
-- l'onglet Catalogue (cf. create_live_product_from_prepared) — sans ça,
-- impossible de savoir "ce produit à l'antenne vient de CE produit du
-- catalogue", nécessaire pour que la carte catalogue puisse basculer entre
-- son état "à l'antenne" (bordure cyan, Modifier/Remises/Retirer) et son
-- état simple ("Mettre à l'antenne") selon qu'il a déjà été matérialisé pour
-- CE live. ON DELETE SET NULL : la suppression du prepared_product source
-- (rare, cf. deleteProductCatalog qui ne supprime jamais les produits eux-
-- mêmes) ne doit jamais faire disparaître le live_products déjà créé.
alter table public.live_products
  add column source_prepared_product_id uuid references public.prepared_products(id) on delete set null;

create index live_products_source_prepared_idx on public.live_products (source_prepared_product_id);

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
    discount_tiers_cents, simple_discount_cents, source_prepared_product_id
  )
  values (
    p_live_id, p_shop_id, v_prepared.name, v_prepared.price_cents, v_ref,
    v_prepared.discount_tiers_cents, v_prepared.simple_discount_cents, p_prepared_product_id
  )
  returning * into v_product;

  return v_product;
end;
$$;
