-- Reliquat de l'ancien modèle "un panier par acheteur/live" : cet index
-- unique interdisait plus d'une live_orders ouverte (pending/validated) par
-- (live_id, buyer_tiktok_username). Depuis le passage à "une commande par
-- intention d'achat" (assignRapidItemToProduct dans rapid-actions.ts), un
-- même acheteur peut légitimement avoir plusieurs live_orders ouvertes en
-- parallèle (une par étiquette #N) — l'index faisait échouer silencieusement
-- l'INSERT dès la 2e intention du même acheteur (erreur 23505 ignorée côté
-- app), qui semblait alors ne "rien faire" au glisser-déposer.
drop index if exists live_orders_open_per_buyer;
