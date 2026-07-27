-- Mode rapid : numéro de commande attribué à chaque intention d'achat dès
-- qu'un produit lui est assigné pour la première fois (glisser-déposer),
-- figé ensuite (ne change plus, même en cas de ré-assignation ou de
-- changement de quantité) — sert de référence stable pendant la préparation
-- de commande. Compteur par live, démarre à 100 (même pattern que
-- lives.rapid_product_seq pour les internal_ref des produits).

alter table lives
  add column if not exists rapid_intent_seq int not null default 99;

alter table live_rapid_items
  add column if not exists order_number int;

-- Attribution atomique : incrémente le compteur du live et fige le numéro
-- sur l'item, en une seule transaction pour éviter deux assignations
-- concurrentes qui se verraient attribuer le même numéro. N'attribue un
-- numéro que si l'item n'en a pas déjà un (première assignation) — les
-- assignations/ré-assignations suivantes de ce même item n'en génèrent pas
-- de nouveau.
create or replace function assign_rapid_item_order_number(p_live_id uuid, p_item_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing int;
  v_seq int;
begin
  if not exists (
    select 1 from public.lives l
    join public.shops s on s.id = l.shop_id
    where l.id = p_live_id and s.owner_id = auth.uid()
  ) and not public.is_flassh_buy_admin() then
    raise exception 'not authorized';
  end if;

  select order_number into v_existing from public.live_rapid_items where id = p_item_id and live_id = p_live_id;
  if v_existing is not null then
    return v_existing;
  end if;

  update public.lives
    set rapid_intent_seq = rapid_intent_seq + 1
    where id = p_live_id
    returning rapid_intent_seq into v_seq;

  update public.live_rapid_items
    set order_number = v_seq
    where id = p_item_id and live_id = p_live_id;

  return v_seq;
end;
$$;

grant execute on function assign_rapid_item_order_number(uuid, uuid) to authenticated;
