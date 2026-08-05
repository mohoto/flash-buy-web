-- État réel de la connexion Euler/TikTok pour un live, distinct du heartbeat
-- worker (lives.worker_id/heartbeat_at) : un worker peut avoir claim un live
-- et heartbeat normalement tout en échouant en boucle à ouvrir la websocket
-- Euler (ex. pseudo TikTok invalide -> close code 4400/INVALID_OPTIONS), ce
-- qu'aucune colonne existante ne capturait — le badge "Worker connecté"
-- restait vert indéfiniment pendant qu'aucun commentaire n'arrivait jamais.
--
-- 'connecting' : session démarrée, pas encore de succès ni d'échec répété.
-- 'connected'  : websocket Euler ouverte avec succès (au moins un onOpen).
-- 'failing'    : échecs consécutifs répétés (cf. worker/src/live-session.ts),
--                pas une coupure isolée vite rétablie.
alter table public.lives
  add column euler_status text not null default 'connecting'
    check (euler_status in ('connecting', 'connected', 'failing')),
  add column euler_last_error text,
  add column euler_failing_since timestamptz;
