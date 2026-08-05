-- Délai de vie d'une commande "pending" avant d'être signalée "Délai
-- dépassé" côté vendeur (purement visuel, calculé à l'affichage — aucun
-- nouvel état en base). null = pas de limite ("toujours"). Valeur en
-- minutes pour les délais fixes ; -1 = "jusqu'à minuit" (cas spécial).
alter table shops
  add column if not exists pending_order_expiry_minutes int;

-- Mode de restriction du glisser-déposer quand l'acheteur a une commande
-- impayée sur ce live : 'none' (aucune restriction), 'block' (bloque tout
-- nouvel ajout), 'ceiling' (autorise jusqu'à unpaid_order_ceiling_cents).
alter table shops
  add column if not exists unpaid_order_restriction text not null default 'none'
  check (unpaid_order_restriction in ('none', 'block', 'ceiling'));

-- Plafond en centimes utilisé uniquement quand unpaid_order_restriction =
-- 'ceiling' — montant total (commande impayée + nouveaux ajouts) autorisé
-- avant blocage.
alter table shops
  add column if not exists unpaid_order_ceiling_cents int;
