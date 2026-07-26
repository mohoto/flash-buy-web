-- create_and_activate_live_product ne retirait jamais l'ancien produit actif
-- (retired_at restait null) : lives.active_product_id pointait bien vers le
-- nouveau, mais côté console la recherche du produit "à l'antenne" se fait
-- via live_products où retired_at is null, qui retournait alors n'importe
-- lequel des deux (le premier créé), donnant l'impression qu'un nouveau
-- produit créé pendant le live ne s'affichait pas.
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
  v_previous_active_id uuid;
  v_product public.live_products;
begin
  if not exists (
    select 1 from public.lives l
    join public.shops s on s.id = l.shop_id
    where l.id = p_live_id and l.shop_id = p_shop_id and s.owner_id = auth.uid()
  ) and not public.is_flassh_buy_admin() then
    raise exception 'not authorized';
  end if;

  select active_product_id into v_previous_active_id from public.lives where id = p_live_id;

  update public.lives
    set rapid_product_seq = rapid_product_seq + 1
    where id = p_live_id
    returning rapid_product_seq into v_seq;

  v_ref := 'A' || v_seq::text;

  insert into public.live_products (live_id, shop_id, name, price_cents, internal_ref, has_color, has_size)
  values (p_live_id, p_shop_id, p_name, p_price_cents, v_ref, p_has_color, p_has_size)
  returning * into v_product;

  if v_previous_active_id is not null then
    update public.live_products
      set retired_at = now()
      where id = v_previous_active_id and retired_at is null;
  end if;

  update public.lives set active_product_id = v_product.id where id = p_live_id;

  return v_product;
end;
$$;
