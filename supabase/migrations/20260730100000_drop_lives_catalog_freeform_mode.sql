-- Retire les modes "catalog" et "freeform" : le choix entre créer un produit
-- "à la volée" ou depuis le catalogue préparé se fait désormais à l'intérieur
-- de la même interface (onglets de RapidConsoleClient), plus au niveau du
-- live entier. "rapid" devient le seul mode possible.
--
-- Vérifié avant écriture : tous les lives existants sont déjà en mode
-- "rapid" (aucun live catalog/freeform en base au moment de cette
-- migration), donc pas de UPDATE de données nécessaire — seulement resserrer
-- le défaut et le CHECK constraint.
--
-- lives.mode est une colonne text avec CHECK (pas un vrai enum Postgres) :
-- son CHECK d'origine (catalog|freeform) a été appliqué directement sur le
-- remote sans migration trackée ici, puis étendu à rapid par
-- 20260726151606_flassh_buy_rapid_mode.sql.
alter table lives
  alter column mode set default 'rapid';

alter table lives
  drop constraint if exists lives_mode_check;

alter table lives
  add constraint lives_mode_check check (mode = 'rapid');
