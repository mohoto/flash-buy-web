-- Mots-clés de vente configurables par live (ex. "sold", "vendu", "jprends"),
-- au lieu du tableau en dur côté worker (parsing.ts). Un live peut avoir un
-- public/contexte différent d'un autre, d'où la config par live plutôt que
-- par shop.
alter table lives
  add column if not exists sale_keywords text[] not null default array['sold', 'vendu'];
