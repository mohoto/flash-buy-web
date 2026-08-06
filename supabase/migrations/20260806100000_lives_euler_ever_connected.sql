-- Distingue un live qui a réellement fonctionné un moment (au moins une
-- connexion Euler réussie) d'un live jamais connecté du tout (ex. pseudo
-- TikTok invalide, live pas réellement actif côté TikTok) — les deux
-- finissent status = 'ended' (via endLive pour le premier, abandonFailedLive
-- pour le second, cf. app/(dashboard)/dashboard/lives/actions.ts), mais
-- seul le premier mérite une console consultable (récapitulatif de
-- commandes). euler_status seul ne suffit pas : il reflète l'état COURANT
-- (peut redevenir 'failing' après une coupure tardive sur un live qui avait
-- pourtant bien fonctionné), pas "a-t-il déjà été connecté au moins une
-- fois". Jamais remis à false une fois posé (cf. worker/src/live-session.ts
-- markEulerConnected).
alter table public.lives
  add column euler_ever_connected boolean not null default false;
