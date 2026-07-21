-- Flassh buy : autorisation d'accès web (l'Auth Supabase existe déjà, partagée avec l'app mobile).
-- Aucune nouvelle table utilisateur : on étend profiles/shops existants.

-- Autorisation explicite d'accès à Flassh buy, distincte du rôle mobile 'client'/'pro'.
alter table profiles
  add column if not exists flassh_buy_enabled boolean not null default false;

-- Rôle admin Flassh buy : colonne séparée pour ne pas toucher au check constraint
-- existant sur profiles.role (utilisé par l'app mobile et son trigger de transition
-- enforce_profile_role_transition).
alter table profiles
  add column if not exists is_admin boolean not null default false;

-- Lien TikTok du vendeur + slug de panier fixe (le seul lien cliquable en bio TikTok).
alter table shops
  add column if not exists tiktok_username text,
  add column if not exists cart_slug text unique;

-- Helper RLS : l'utilisateur courant est-il admin Flassh buy ?
create or replace function is_flassh_buy_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  );
$$;
