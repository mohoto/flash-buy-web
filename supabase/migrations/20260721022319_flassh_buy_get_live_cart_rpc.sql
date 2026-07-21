-- Page acheteur (/live/[cartSlug]) : ne jamais exposer live_orders/live_order_items
-- via RLS anon (fuite d'autres paniers). Cette RPC security definer ne renvoie que
-- le panier du (cart_slug, buyer_tiktok_username) demandé.
create or replace function get_live_cart(p_cart_slug text, p_buyer text)
returns table (
  item_id uuid,
  product_name text,
  size_label text,
  quantity int,
  unit_price_cents int,
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
    oi.matched
  from public.live_orders o
  join public.shops s on s.id = o.shop_id and s.cart_slug = p_cart_slug
  join public.live_order_items oi on oi.live_order_id = o.id
  left join public.products p on p.id = oi.product_id
  where o.buyer_tiktok_username = p_buyer
    and o.status in ('pending', 'validated');
$$;

-- Résout le nom du shop + statut du live actif pour l'écran d'identification acheteur.
create or replace function get_live_shop_by_slug(p_cart_slug text)
returns table (
  shop_id uuid,
  shop_name text,
  active_live_id uuid
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    s.id,
    s.name,
    (select l.id from public.lives l
     where l.shop_id = s.id and l.status = 'live'
     order by l.started_at desc limit 1)
  from public.shops s
  where s.cart_slug = p_cart_slug;
$$;

grant execute on function get_live_cart(text, text) to anon, authenticated;
grant execute on function get_live_shop_by_slug(text) to anon, authenticated;
