-- Retire "validated" de live_order_status : statut intermédiaire hérité du
-- mode legacy Catalogue/Création à la volée (bouton "Valider" qui engageait
-- le stock avant paiement), jamais utilisé en mode rapid et jugé inutile
-- dans le système actuel. Aucune ligne live_orders n'a ce statut au moment
-- de cette migration (vérifié avant écriture).
--
-- PostgreSQL n'autorise pas ALTER TYPE ... DROP VALUE : on recrée le type
-- sans "validated", en repointant la colonne dessus.
alter type live_order_status rename to live_order_status_old;

create type live_order_status as enum ('pending', 'paid', 'cancelled');

alter table live_orders
  alter column status drop default;

alter table live_orders
  alter column status type live_order_status
  using status::text::live_order_status;

alter table live_orders
  alter column status set default 'pending';

drop type live_order_status_old;

-- get_live_cart filtrait sur ('pending', 'validated') — plus que 'pending'
-- désormais (un panier "ouvert" avant paiement). Même schéma de retour que
-- la version précédente (20260728100000_get_live_cart_discount.sql).
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
    and o.status = 'pending';
$$;

grant execute on function get_live_cart(text, text) to anon, authenticated;
