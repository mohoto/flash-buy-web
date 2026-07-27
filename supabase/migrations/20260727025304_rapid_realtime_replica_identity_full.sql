-- Realtime postgres_changes filtre côté serveur sur live_id=eq.<id>, une
-- colonne qui N'EST PAS la clé primaire de live_products/live_rapid_items.
-- Avec REPLICA IDENTITY DEFAULT (juste la clé primaire), un UPDATE ne porte
-- pas la valeur de live_id dans son enregistrement WAL — le filtre ne peut
-- alors jamais matcher, et l'événement n'est simplement jamais diffusé aux
-- clients abonnés, sans aucune erreur ni log. C'est ce qui empêchait le
-- rafraîchissement automatique de la console rapid après un glisser-déposer
-- (l'update de assign_rapid_item_order_number/assignRapidItemToProduct
-- avait bien lieu en base, mais Realtime ne le voyait jamais).
alter table live_products replica identity full;
alter table live_rapid_items replica identity full;
