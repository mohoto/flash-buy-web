-- get_live_cart ne renvoyait pas discount_cents (colonne ajoutée après
-- l'écriture initiale de cette RPC) : le panier acheteur affichait donc un
-- total sans remise, incohérent avec la console vendeur qui, elle, en tient
-- compte depuis la fonctionnalité de remises par quantité (mode rapid).
-- drop nécessaire : changement de la table de retour (returns table), pas
-- juste du corps de la fonction.
drop function if exists get_live_cart(text, text);

create function get_live_cart(p_cart_slug text, p_buyer text)
returns table (
  item_id uuid,
  product_name text,
  size_label text,
  quantity int,
  unit_price_cents int,
  discount_cents int,
  matched boolean
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    oi.id,
    coalesce(p.name, oi.raw_product_text),
    oi.size_label,
    oi.quantity,
    oi.unit_price_cents,
    oi.discount_cents,
    oi.matched
  from public.live_orders o
  join public.shops s on s.id = o.shop_id and s.cart_slug = p_cart_slug
  join public.live_order_items oi on oi.live_order_id = o.id
  left join public.products p on p.id = oi.product_id
  where o.buyer_tiktok_username = p_buyer
    and o.status in ('pending', 'validated');
$$;

grant execute on function get_live_cart(text, text) to anon, authenticated;
