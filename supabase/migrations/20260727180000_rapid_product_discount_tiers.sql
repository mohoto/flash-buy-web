-- Remises par quantité exacte (1 à 8) sur les live_products (mode rapid
-- uniquement). Clé = quantité en texte ("2" -> 500 = -5,00€ pour 2 exact),
-- pas de fallback sur un palier inférieur. Validation du domaine (clés
-- "1".."8", valeurs >= 0) faite côté Server Action, pas en SQL.
alter table live_products
  add column if not exists discount_tiers_cents jsonb not null default '{}'::jsonb;

-- Montant de remise figé au moment de l'assignation, séparé de
-- unit_price_cents (qui reste le prix catalogue brut) pour ne pas fausser
-- l'affichage du prix unitaire et pour que les commandes déjà assignées ne
-- bougent pas rétroactivement si le vendeur modifie les paliers ensuite.
alter table live_order_items
  add column if not exists discount_cents int not null default 0;

-- Miroir dénormalisé sur live_rapid_items, même principe que quantity déjà
-- dupliqué sur cette table pour l'affichage client sans jointure.
alter table live_rapid_items
  add column if not exists discount_cents int not null default 0;
