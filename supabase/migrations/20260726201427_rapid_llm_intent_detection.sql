-- Redesign du mode "rapid" : détection d'intention d'achat déplacée vers un
-- LLM (Claude Haiku 4.5, par lots côté worker) plutôt que regex/dictionnaire.
-- Plus d'extraction couleur/taille, plus de rattachement automatique au
-- produit actif — l'assignation est désormais 100% glisser-déposer côté
-- vendeur. Cf. worker/src/rapid-intent-detection.ts et
-- worker/src/rapid-batch-queue.ts (remplacent rapid-parsing.ts,
-- rapid-dictionary.ts, rapid-active-product.ts, supprimés dans le même lot).

-- ── live_products : has_color/has_size ne sont plus consommées nulle part ──
alter table live_products
  drop column if exists has_color,
  drop column if exists has_size;

-- ── live_rapid_items : nouvelle forme, plus simple ─────────────────────────
-- raw_color_text/raw_size_text : plus rien ne les produit (pas d'extraction).
-- resolution_reason : plus rien ne le produit (pas de codes d'échec regex).
-- resolution_state : la distinction qui comptait ("auto" vs "à corriger" vs
-- "IA" vs "corrigé manuellement") disparaît — TOUT ce qui existe dans cette
-- table a été détecté par le LLM, donc "Détecté" est vrai pour 100% des
-- lignes par construction. La seule distinction d'état qui reste pertinente
-- est assigné/non-assigné, et `live_product_id is null` la capture déjà
-- entièrement (pas de state machine supplémentaire nécessaire). On droppe
-- donc la colonne, puis le type enum (aucune colonne ne le référence plus).
alter table live_rapid_items
  drop column if exists raw_color_text,
  drop column if exists raw_size_text,
  drop column if exists resolution_reason,
  drop column if exists resolution_state,
  drop column if exists resolved_at;

drop type if exists rapid_resolution_state;

-- quantity : conservée mais toujours 1 désormais (plus d'extraction de
-- quantité chiffrée dans le commentaire).
alter table live_rapid_items
  alter column quantity set default 1;

-- ── create_and_activate_live_product : nouvelle signature à 4 paramètres ──
-- Même comportement (retire l'ancien actif, incrémente le compteur, insère,
-- bascule l'actif) MOINS p_has_color/p_has_size, retirés du signature ET de
-- l'insert. Conserve le correctif "retire-previous" de la migration
-- 20260726185355 (ne pas le reperdre).
drop function if exists create_and_activate_live_product(uuid, uuid, text, int, boolean, boolean);

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

  insert into public.live_products (live_id, shop_id, name, price_cents, internal_ref)
  values (p_live_id, p_shop_id, p_name, p_price_cents, v_ref)
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

grant execute on function create_and_activate_live_product(uuid, uuid, text, int) to authenticated;
