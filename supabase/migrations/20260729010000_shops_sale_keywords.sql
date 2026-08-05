-- Mots-clés de vente réglés une seule fois par boutique, réutilisés pour
-- tous les lives (au lieu de lives.sale_keywords, saisi live par live via
-- LiveConnectionForm) — un commentaire doit contenir l'un de ces mots pour
-- être reconnu comme une intention d'achat en mode rapid.
alter table shops
  add column if not exists sale_keywords text[] not null default array['jp'];
