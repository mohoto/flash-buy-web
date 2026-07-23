-- TikTok n'expose aucun événement listant les spectateurs présents (juste un
-- compteur agrégé WebcastRoomUserSeqMessage). live_viewers change donc de
-- sens : elle liste les personnes ayant posté au moins un commentaire pendant
-- le live (tous commentaires, pas seulement les "jp ..." reconnus comme
-- vente), dédupliquées par utilisateur, jamais supprimées avant la fin du
-- live. joined_at devient last_comment_at (mis à jour à chaque commentaire).
alter table live_viewers rename column joined_at to last_comment_at;

-- Compteur réel de spectateurs fourni par TikTok (WebcastRoomUserSeqMessage),
-- affiché à côté de la liste des commentateurs actifs.
alter table lives add column if not exists viewer_count int;
