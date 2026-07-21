# Spec technique — Flassh buy

Deux parties : (1) le schéma SQL des tables live-selling, (2) la logique de parsing/matching du commentaire `sold …`.
Les tables `sellers`/`profiles`, `products`, `buyers` sont supposées **déjà exister** (app mobile). Adapte les noms à ton schéma réel.

---

## 1. Schéma SQL (migrations Supabase / Postgres)

```sql
-- Extensions utiles
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";    -- matching flou des noms de produits

-- ── Colonnes additives sur l'existant ────────────────────────────────
-- (adapte 'profiles' au nom de ta table vendeur)
alter table profiles
  add column if not exists tiktok_username text,
  add column if not exists stripe_account_id text,
  add column if not exists cart_slug text unique;      -- ex: "boutique-julie"

-- Variantes/tailles de produits (si pas déjà géré)
create table if not exists product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  size        text,                     -- "M", "38", "unique"...
  stock       int  not null default 0,
  created_at  timestamptz not null default now()
);

-- ── Enums ────────────────────────────────────────────────────────────
create type live_status  as enum ('scheduled', 'live', 'ended');
create type order_status as enum ('pending', 'validated', 'paid', 'cancelled');

-- ── Lives ────────────────────────────────────────────────────────────
create table lives (
  id             uuid primary key default gen_random_uuid(),
  seller_id      uuid not null references profiles(id) on delete cascade,
  tiktok_room_id text,
  euler_alert_id text,
  status         live_status not null default 'scheduled',
  started_at     timestamptz,
  ended_at       timestamptz,
  created_at     timestamptz not null default now()
);
create index on lives (seller_id, status);

-- ── Commandes (un panier = une commande "ouverte" par acheteur & live) ─
create table orders (
  id                    uuid primary key default gen_random_uuid(),
  live_id               uuid references lives(id) on delete set null,
  seller_id             uuid not null references profiles(id) on delete cascade,
  buyer_id              uuid references buyers(id) on delete set null,
  buyer_tiktok_username text not null,          -- source de vérité pendant le live
  status                order_status not null default 'pending',
  total_cents           int not null default 0,
  stripe_payment_intent text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on orders (seller_id, status);
create index on orders (live_id);
-- un seul panier "ouvert" par acheteur et par live :
create unique index orders_open_per_buyer
  on orders (live_id, buyer_tiktok_username)
  where status in ('pending', 'validated');

-- ── Lignes de commande ───────────────────────────────────────────────
create table order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references orders(id) on delete cascade,
  product_id       uuid references products(id) on delete set null,
  variant_id       uuid references product_variants(id) on delete set null,
  size             text,
  quantity         int  not null default 1,
  unit_price_cents int  not null default 0,
  source_comment   text,           -- texte brut du commentaire TikTok
  raw_product_text text,           -- ce que l'acheteur a écrit comme produit
  raw_size_text    text,
  matched          boolean not null default false,  -- false => à corriger à la main
  match_score      real,           -- score de similarité (0..1)
  created_at       timestamptz not null default now()
);
create index on order_items (order_id);

-- ── updated_at auto sur orders ───────────────────────────────────────
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
create trigger orders_touch before update on orders
  for each row execute function touch_updated_at();

-- ── Realtime : pousser les changements vers la console live & la page acheteur ─
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_items;
alter publication supabase_realtime add table lives;
```

### Row Level Security (principes)

```sql
alter table lives       enable row level security;
alter table orders      enable row level security;
alter table order_items enable row level security;

-- Helper : l'utilisateur courant est-il admin ?
create or replace function is_admin() returns boolean as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin');
$$ language sql stable security definer;

-- Un vendeur ne voit/écrit que SES lives & commandes ; l'admin voit tout.
create policy seller_lives on lives
  for all using (seller_id = auth.uid() or is_admin())
  with check (seller_id = auth.uid() or is_admin());

create policy seller_orders on orders
  for all using (seller_id = auth.uid() or is_admin())
  with check (seller_id = auth.uid() or is_admin());

create policy seller_order_items on order_items
  for all using (
    exists (select 1 from orders o
            where o.id = order_items.order_id
              and (o.seller_id = auth.uid() or is_admin()))
  );
```

> ⚠️ **Page acheteur** : ne l'expose PAS via RLS anon (risque de fuite d'autres paniers).
> Sers le panier de l'acheteur par une **route serveur** (service role) ou une **fonction RPC `security definer`**
> qui prend `cart_slug` + `buyer_tiktok_username` (+ idéalement un code de vérification) et ne renvoie que ce panier-là.
> Le worker écrit avec la **service role key**, côté serveur uniquement (jamais exposée au client).

### Auth & accès web (l'Auth Supabase existe déjà — app mobile **Flassh**)

L'authentification Supabase est **partagée avec l'app mobile Flassh** : les comptes
vendeurs/acheteurs existent déjà. Flassh buy **ne recrée aucune auth** et ne duplique
aucune table utilisateur — elle réutilise l'Auth existante.

En revanche, **tout vendeur mobile n'a pas automatiquement accès à l'app web** : il
faut une **autorisation explicite**, accordée/révoquée depuis le dashboard admin.

```sql
-- Autorisation d'accès à Flassh buy (web). L'Auth existe déjà côté mobile.
alter table profiles
  add column if not exists flassh_buy_enabled boolean not null default false;
-- Règle de connexion web : un vendeur n'accède à Flassh buy que si
-- flassh_buy_enabled = true. L'admin (role='admin') accède toujours.
-- Les acheteurs NE se connectent PAS sur le web : ils s'identifient par pseudo
-- sur la page /live/[cartSlug].
```

### Observabilité : santé des workers + alertes Railway

```sql
-- Santé des workers (upsert par le worker toutes les ~10 s, via service role)
create table if not exists worker_health (
  worker_id          text primary key,
  lives_count        int  not null default 0,
  event_loop_p99_ms  real,
  ws_open_failures   int  not null default 0,
  updated_at         timestamptz not null default now()
);

-- Alertes Railway reçues par webhook (POST /api/webhooks/railway), affichées dans /admin
create table if not exists railway_events (
  id           uuid primary key default gen_random_uuid(),
  event_type   text not null,   -- ex: DEPLOY_FAILED, DEPLOY_SUCCESS, VOLUME_ALERT
  status       text,
  service_name text,
  environment  text,
  payload      jsonb not null,
  received_at  timestamptz not null default now()
);
create index if not exists railway_events_received_idx on railway_events (received_at desc);

-- Lecture réservée à l'admin ; écriture par service role (bypass RLS)
alter table worker_health  enable row level security;
alter table railway_events enable row level security;
create policy admin_reads_worker_health on worker_health
  for select using (is_admin());
create policy admin_reads_railway_events on railway_events
  for select using (is_admin());

-- Temps réel pour rafraîchir le panneau admin sans polling
alter publication supabase_realtime add table worker_health;
alter publication supabase_realtime add table railway_events;
```

### Dénormalisation pour le Realtime catalogue (voir section 5)

```sql
-- Permet de filtrer les abonnements Realtime des variantes par vendeur
alter table product_variants
  add column if not exists seller_id uuid references profiles(id) on delete cascade;
-- Backfill (adapte 'products.seller_id' au vrai nom de la colonne propriétaire) :
update product_variants v
  set seller_id = p.seller_id
  from products p
  where p.id = v.product_id and v.seller_id is null;
create index if not exists product_variants_seller_idx on product_variants (seller_id);
-- Maintenir seller_id à jour si un produit change de propriétaire (rare) : trigger ou applicatif.
```

---

## 2. Parsing & matching du commentaire `sold …`

### Le problème
Format visé : `sold <nom_produit> <taille> <quantité>`, ex. `SOLD tshirt noir M 2`.
Mais dans la vraie vie : noms de produits **à plusieurs mots**, quantité **optionnelle**, tailles variées
(`S/M/L/XL`, numériques `38`, ou absente), fautes de frappe, emojis, espaces multiples, `sold`/`vendu`.

### La bonne stratégie : parser **par la droite**
On ne peut pas découper de gauche à droite (le produit est multi-mots). On lit donc la fin en premier :
1. le **dernier** token, s'il est un entier → **quantité** (sinon quantité = 1) ;
2. le token **suivant en remontant**, s'il ressemble à une **taille connue** → **taille** ;
3. **tout le reste** = le **nom du produit** → matching flou contre le catalogue du vendeur.

Puis on **valide la taille** contre les variantes réelles du produit trouvé, et on calcule un **score de confiance**.
Sous un seuil → `matched = false` → la ligne s'affiche en « à vérifier » dans la console live (correction manuelle).

### Implémentation de référence (TypeScript, côté worker)

```ts
import Fuse from "fuse.js"; // matching flou en mémoire (le worker a déjà le catalogue du live en cache)

type Product = { id: string; name: string; sizes: string[]; priceCents: number };

const KEYWORDS = ["sold", "vendu"];
const SIZE_VOCAB = new Set(["xs","s","m","l","xl","xxl","xxxl","unique","u"]);

const norm = (s: string) =>
  s.toLowerCase()
   .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // enlève les accents
   .replace(/[^\p{L}\p{N}\s]/gu, " ")                // vire ponctuation/emojis
   .replace(/\s+/g, " ").trim();

const isInt = (t: string) => /^\d+$/.test(t);
// une taille = vocabulaire connu OU nombre "petit" (pointures/tailles type 34-48)
const looksLikeSize = (t: string) =>
  SIZE_VOCAB.has(t) || (isInt(t) && +t >= 30 && +t <= 50);

export type ParsedSale = {
  isSale: boolean;
  rawProductText?: string;
  size?: string | null;
  quantity: number;
  product?: Product;
  matchScore?: number;   // 0..1
  matched: boolean;      // false => correction manuelle
};

export function parseSaleComment(comment: string, catalog: Product[]): ParsedSale {
  const text = norm(comment);
  const kw = KEYWORDS.find(k => text.startsWith(k + " "));
  if (!kw) return { isSale: false, quantity: 1, matched: false };

  let tokens = text.slice(kw.length).trim().split(" ").filter(Boolean);

  // 1) quantité = dernier token entier
  let quantity = 1;
  if (tokens.length && isInt(tokens[tokens.length - 1])) {
    quantity = Math.max(1, parseInt(tokens.pop()!, 10));
  }
  // 2) taille = token suivant s'il ressemble à une taille
  let size: string | null = null;
  if (tokens.length && looksLikeSize(tokens[tokens.length - 1])) {
    size = tokens.pop()!;
  }
  // 3) reste = nom du produit
  const rawProductText = tokens.join(" ").trim();
  if (!rawProductText) return { isSale: true, quantity, size, matched: false };

  // matching flou contre le catalogue du vendeur
  const fuse = new Fuse(catalog, { keys: ["name"], includeScore: true, threshold: 0.4 });
  const hit = fuse.search(rawProductText)[0];
  const product = hit?.item;
  const matchScore = hit ? 1 - (hit.score ?? 1) : 0; // Fuse: 0 = parfait

  // valider la taille contre les variantes réelles du produit
  let validSize = size;
  if (product && size) {
    const known = product.sizes.map(norm);
    if (!known.includes(norm(size))) validSize = size; // gardée mais signalée si absente
  }
  const sizeOk = !size || (product?.sizes.map(norm).includes(norm(size!)) ?? false);

  const matched = !!product && matchScore >= 0.6 && sizeOk;

  return {
    isSale: true, rawProductText, size: validSize, quantity,
    product, matchScore, matched,
  };
}
```

### Alternative 100 % base de données (au lieu de Fuse.js)
Avec `pg_trgm`, tu peux matcher côté Postgres :

```sql
select id, name, similarity(name, :q) as score
from products
where seller_id = :seller_id
order by name <-> :q            -- distance trigram (opérateur <->)
limit 1;
-- garder si score >= 0.3 (à calibrer), sinon "à vérifier"
```

Fuse.js est pratique dans le worker (catalogue déjà en cache pour le live) ; `pg_trgm` évite de charger le catalogue.

### Règles de gestion à implémenter
- **Quantité absente** → 1.
- **Taille absente** mais produit à taille unique → OK ; sinon → `matched=false` (demander la taille).
- **Produit non reconnu** (score sous le seuil) → ligne créée avec `matched=false`, affichée en rouge dans la console live, le vendeur corrige d'un clic (dropdown catalogue).
- **Doublons** (même acheteur re-commente le même article) → à toi de choisir : incrémenter la quantité ou créer une 2ᵉ ligne. Recommandé : demander confirmation côté vendeur.
- **Stock** : décrémenter seulement à la **validation** de la commande, pas à la capture (le commentaire n'est pas une vente ferme).
- **Idempotence** : stocke l'`id` du commentaire TikTok (fourni par Euler) pour ne pas traiter deux fois le même message en cas de reconnexion du WebSocket.
```

---

## 3. Console live (côté vendeur) — temps réel

Écran ouvert par le vendeur pendant son live (`/dashboard/live/[liveId]`). Objectif : voir les achats tomber et les valider d'un clic.

### Source des données : Supabase Realtime
S'abonner aux changements des commandes de CE live (pas de polling) :

```ts
const channel = supabase
  .channel(`live-${liveId}`)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'order_items' },
      payload => appliquerMAJ(payload))
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'orders', filter: `live_id=eq.${liveId}` },
      payload => appliquerMAJ(payload))
  .subscribe();
```

### Affichage
- **Groupé par acheteur** : un bloc par acheteur (pseudo + avatar via le CDN Euler), listant ses lignes (produit, taille, quantité, prix) et son total.
- Chaque ligne montre le **score de matching**. Les lignes `matched = false` s'affichent **en rouge/alerte** avec un `<select>` du catalogue pour corriger produit/variante à la main.
- Un flux « dernières entrées » en haut pour suivre le rythme du live.

### Actions
- **Valider** (par acheteur ou par ligne) → `orders.status = 'validated'`, **décrémente le stock** à ce moment (pas avant).
- **Corriger** une ligne non reconnue → réassigne `product_id`/`variant_id`, passe `matched = true`.
- **Annuler / supprimer** une ligne.
- **Ajout manuel** d'un article au panier d'un acheteur (fallback si le worker rate un commentaire).
- **Terminer le live** → `lives.status = 'ended'` (bouton manuel, en plus de la détection auto par le worker).

### Règles
- La validation est le point où l'on **engage le stock** ; tant qu'une commande est `pending`, le stock n'est pas réservé.
- Tout passe par le client public (RLS) : le vendeur ne voit que SES lives/commandes.

---

## 4. Page acheteur — identification + panier live

Route publique `/live/[cartSlug]` (le seul lien, celui de la bio). Objectif : l'acheteur retrouve SON panier, rempli par ses commentaires.

### Étapes
1. **Résoudre le vendeur** depuis `cart_slug` (→ `seller_id`).
2. **Identifier l'acheteur** : formulaire « ton pseudo TikTok ? » (MVP). Stocker le pseudo dans un **cookie** (par vendeur) pour ne pas le redemander.
3. **Charger son panier** via une **route serveur** ou une **RPC `security definer`** — jamais via RLS anon (sinon fuite d'autres paniers) :

```sql
create or replace function get_cart(p_cart_slug text, p_buyer text)
returns table (item_id uuid, product text, size text, quantity int, unit_price_cents int)
language sql security definer as $$
  select oi.id, p.name, oi.size, oi.quantity, oi.unit_price_cents
  from orders o
  join profiles s on s.id = o.seller_id and s.cart_slug = p_cart_slug
  join order_items oi on oi.order_id = o.id
  left join products p on p.id = oi.product_id
  where o.buyer_tiktok_username = p_buyer
    and o.status in ('pending','validated');
$$;
```

4. **Temps réel** : s'abonner aux `order_items` de son panier → il voit les articles s'ajouter en direct pendant qu'il regarde le live.
5. **Paiement : PHASE 2.** Afficher le total + un bouton « Payer » **inactif** (« paiement bientôt disponible »). Aucun code Stripe pour l'instant.

### Deux moments d'ouverture (les deux doivent marcher)
- **Pendant le live** : page ouverte → Realtime remplit le panier en direct.
- **Après le live** : page ouverte plus tard → au chargement, la RPC renvoie le panier déjà constitué. Le temps réel n'est alors qu'un confort.

### Identification — MVP vs V2
- **MVP** : saisie du pseudo (risque faible d'usurpation, car chacun paie son propre panier).
- **V2** : **code de vérification** — la page affiche un code, l'acheteur le tape dans le chat du live, le worker voit « pseudo + code » et lie de façon certaine ce navigateur au pseudo. Élimine l'usurpation.

---

## 5. Rafraîchissement du catalogue en mémoire (Realtime + filet de sécurité)

Chaque live réclamé garde son catalogue vendeur en mémoire (index Fuse.js) pour
le matching. Ce catalogue doit rester à jour si le vendeur modifie ses produits
pendant le live, SANS re-requêter Supabase à chaque commentaire.

Règles à implémenter dans le worker :

1. **Au claim d'un live** : appeler `loadCatalog(sellerId)`, construire l'index
   Fuse.js, le stocker dans une map en mémoire `catalogs[liveId] = { fuse, catalog }`.
2. **UNE seule connexion Realtime par replica** (jamais une par live). Sur cette
   connexion, ajouter au claim un abonnement `postgres_changes` filtré par vendeur :
   - table `products`, filtre `seller_id=eq.<sellerId>`, events INSERT/UPDATE/DELETE ;
   - table `product_variants` (voir note ci-dessous sur le filtrage).
   Tous les `.channel()` partagent le même WebSocket → coût = 1 connexion.
3. **À chaque événement Realtime** reçu pour un vendeur suivi : recharger le
   catalogue complet de CE vendeur (`loadCatalog`) et reconstruire son index Fuse.
   (Rechargement complet plutôt que patch en place : plus simple, coût négligeable
   car un catalogue tient en quelques Mo.)
4. **Filet de sécurité (indispensable — Realtime ne garantit pas la livraison)** :
   - recharger le catalogue à CHAQUE (re)connexion Realtime (statut `SUBSCRIBED`) ;
   - + recharger périodiquement en fond (ex. toutes les 5 min) tous les catalogues
     des lives actifs de cette replica.
   Un événement perdu est ainsi rattrapé au prochain rechargement.
5. **À la fin du live / SIGTERM** : se désabonner du/des channel(s) du vendeur et
   supprimer `catalogs[liveId]` de la mémoire.

Note sur le filtrage des variantes : `product_variants` n'a pas de `seller_id`
direct (lié via `product_id`), donc le filtre Realtime par vendeur n'est pas
immédiat. Deux options :
- (recommandé) dénormaliser en ajoutant `seller_id` à `product_variants` pour
  pouvoir filtrer `seller_id=eq.<sellerId>` directement ;
- sinon, s'abonner aux changements de variantes sans filtre vendeur et ignorer
  ceux dont le produit n'appartient pas à un vendeur suivi — le filet de sécurité
  périodique couvre de toute façon les tailles.

Surveiller les limites Realtime du plan Supabase (connexions concurrentes, débit
de messages) quand le nombre de replicas monte ; vérifier la valeur du plan actuel.
