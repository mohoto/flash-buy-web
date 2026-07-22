-- Liste des spectateurs actuellement présents sur un live, alimentée par les
-- événements de présence synthétique d'Euler Stream (SyntheticJoinMessage /
-- SyntheticLeaveMessage). Une ligne par (live, tiktok_user_id) ; le worker
-- upsert au join et delete au leave, donc le contenu de la table = qui
-- regarde là maintenant, pas un historique.
create table if not exists live_viewers (
  id                uuid primary key default gen_random_uuid(),
  live_id           uuid not null references lives(id) on delete cascade,
  tiktok_user_id    text not null,
  tiktok_username   text not null,
  nickname          text,
  profile_picture_url text,
  joined_at         timestamptz not null default now()
);
create unique index if not exists live_viewers_live_user_idx
  on live_viewers (live_id, tiktok_user_id);

alter table live_viewers enable row level security;

create policy seller_live_viewers on live_viewers
  for all
  using (
    exists (
      select 1 from lives l
      where l.id = live_viewers.live_id
        and (l.shop_id in (select id from shops where owner_id = auth.uid()) or is_flassh_buy_admin())
    )
  );

alter publication supabase_realtime add table live_viewers;
