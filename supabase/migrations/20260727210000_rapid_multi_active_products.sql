-- Plusieurs produits peuvent désormais être "à l'antenne" simultanément —
-- retired_at IS NULL est la seule source de vérité pour "actif", plus besoin
-- d'un pointeur "LE" produit actif sur lives.
drop function if exists create_and_activate_live_product(uuid, uuid, text, int);

create or replace function create_and_activate_live_product(
  p_live_id uuid,
  p_shop_id uuid,
  p_name text,
  p_price_cents int
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

  insert into public.live_products (live_id, shop_id, name, price_cents, internal_ref)
  values (p_live_id, p_shop_id, p_name, p_price_cents, v_ref)
  returning * into v_product;

  return v_product;
end;
$$;

grant execute on function create_and_activate_live_product(uuid, uuid, text, int) to authenticated;

alter table lives drop column if exists active_product_id;
