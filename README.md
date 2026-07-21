# Flassh buy

App web permettant aux vendeurs faisant du live sur TikTok d'encaisser les ventes des
produits présentés, sans passer par TikTok Shop. Les acheteurs commentent leur achat
pendant le live (`sold <produit> <taille> <quantité>`), l'app capte ces commentaires,
remplit un panier par acheteur, et l'acheteur consulte son panier via un lien unique.

Partage la même base Supabase que l'app mobile **Flassh** (déstockeurs) : réutilise
les vendeurs (`shops`/`profiles`), produits, acheteurs et l'Auth existants.

**Phase 1 (ce dépôt) :** flux complet jusqu'à la commande `validated` (prête à payer).
**Phase 2 (plus tard) :** paiement (Stripe Connect), pas codé pour l'instant.

## Stack

- Next.js 16 (App Router, Server Components + Server Actions), TypeScript strict, Tailwind v4
- Supabase (Postgres, Auth, Realtime, Storage) — **pas d'ORM** : `@supabase/supabase-js` +
  types générés depuis le schéma réel (migrations SQL versionnées)
- Worker Node séparé (`/worker`) pour la connexion TikTok LIVE (Euler Stream), déployé sur Railway
- Magic UI + Tailwind pour l'UI

## Setup

### 1. Variables d'environnement

Copier `.env.example` vers `.env.local` et remplir :

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` : déjà partagés avec
  l'app mobile Flassh (même projet Supabase).
- `SUPABASE_SERVICE_ROLE_KEY` : à récupérer sur app.supabase.com → Project Settings → API
  → `service_role`. **Jamais exposée au client**, réservée aux Server Actions/routes serveur
  qui doivent bypasser la RLS (ex. `adjust_stock`, lecture cross-vendeur en admin).
- `EULER_API_KEY` : clé Euler Stream (WebSocket TikTok LIVE).

### 2. Installer les dépendances

```bash
pnpm install
```

### 3. CLI Supabase

Le CLI est utilisé en local via `npx supabase` (pas d'installation globale requise).
Le projet est déjà lié (`supabase link`) au projet Supabase distant partagé avec l'app mobile.

### 4. Lancer le dev server

```bash
pnpm run dev
```

## Migrations & types

Le schéma vit dans `supabase/migrations/` (SQL versionné, rejouable). Les 45 premières
migrations du dossier sont des **placeholders vides** représentant le schéma déjà appliqué
par l'app mobile Flassh (profiles, shops, products, orders, etc.) — ne pas les modifier ni
les supprimer, elles servent uniquement à garder l'historique de migration synchronisé
entre ce dépôt et le projet Supabase distant. Les vraies migrations Flassh buy commencent à
`20260721020937_flassh_buy_auth_and_access.sql`.

**Après chaque nouvelle migration, deux étapes obligatoires :**

```bash
# 1. Appliquer la migration au projet Supabase distant
npx supabase db push

# 2. Régénérer les types TypeScript (sinon désynchronisation silencieuse)
pnpm run types:gen
```

`types:gen` régénère `lib/database.types.ts` depuis le schéma réel du projet distant.

## Architecture des données

- **Tables existantes (app mobile, ne pas recréer)** : `profiles`, `shops`, `products`,
  `product_variants`, `product_images`, `product_designs`, `design_size_stock`, `orders`,
  `order_items`, etc. Le vendeur = `shops` (pas `profiles` directement) ; `profiles.role`
  vaut `'client'` ou `'pro'`.
- **Ajouts Flassh buy** : `profiles.flassh_buy_enabled` (autorisation d'accès web),
  `profiles.is_admin`, `shops.tiktok_username`, `shops.cart_slug`, `product_variants.shop_id`
  (dénormalisé pour le filtrage Realtime du worker).
- **Nouvelles tables dédiées au live** (séparées du flux marketplace mobile/Sendcloud) :
  `lives`, `live_orders`, `live_order_items`, `worker_health`, `railway_events`.
- **RPC `security definer`** : `get_live_cart` et `get_live_shop_by_slug` — seules routes
  d'accès au panier depuis la page acheteur publique (jamais de RLS anon directe sur
  `live_orders`/`live_order_items`, pour éviter toute fuite du panier d'un autre acheteur).

## Auth

Réutilise l'Auth Supabase existante (email/password, `signInWithPassword`, partagée avec
l'app mobile). Aucun second système d'auth. L'accès web est conditionné par
`profiles.flassh_buy_enabled = true` (ou `profiles.is_admin = true`), à activer/désactiver
depuis `/admin/comptes`. Les acheteurs ne se connectent jamais : identification par pseudo
(cookie) sur `/live/[cartSlug]`.

## Le worker (`/worker`)

Service Node **séparé** du Next.js (Vercel ne peut pas tenir un WebSocket permanent).
Se connecte au WebSocket TikTok LIVE via Euler Stream, parse les commentaires `sold …`,
écrit dans Supabase via la clé service role.

**Conçu pour tourner en plusieurs instances identiques et sans état** : chaque instance
réclame des lives libres par un `UPDATE ... WHERE worker_id IS NULL` atomique (claim),
sans coordinateur central. Le scaling = ajouter/retirer des replicas Railway, sans
changement de code.

### Développement local

```bash
cd worker
npm install
npm run dev   # tsx watch
```

Variables d'env requises (voir `.env.example` à la racine, section Worker) :
`MAX_LIVES_PER_WORKER`, `LAG_SOFT_LIMIT_MS`, `HEARTBEAT_INTERVAL_MS`, `HEARTBEAT_STALE_MS`,
`CLAIM_STAGGER_MS`, `PORT`.

### Build & déploiement (Railway)

```bash
cd worker
npm run build   # tsc -> dist/
npm start       # node dist/index.js
```

Le worker est dockerisé (`worker/Dockerfile`) pour rester portable (migration possible vers
Fly.io au-delà de 500-1000 lives sans réécriture). `worker/railway.toml` configure le build,
le healthcheck (`GET /health`), et la politique de redémarrage. Le nombre de replicas et
`MAX_LIVES_PER_WORKER` se règlent **dans le dashboard Railway**, pas dans le code — l'app
web ne fait qu'observer l'état des workers via la table `worker_health` (page `/admin/workers`).

### NOTE D'INTÉGRATION Euler Stream (à vérifier avec un compte actif)

`worker/src/euler.ts` utilise le package officiel `@eulerstream/euler-websocket-sdk`
(confirmé : `createWebSocketUrl`, `ClientCloseCode`, types `WebcastChatMessage` avec
schéma v2 — `.comment`, `.user.uniqueId`, `.common.msgId`). Ce qui reste à valider avec un
premier live réel : la forme exacte des messages reçus sur le WebSocket (JSON déjà décodé
côté serveur Euler vs. frames protobuf brutes). Si le test réel diffère, seule la fonction
`parseIncomingMessage()` dans ce fichier doit changer.

### Tester sans live TikTok réel (mode simulation)

Le worker expose un endpoint d'injection de commentaires factices, pour tester tout le
pipeline parsing/matching/écriture sans live réel ni crédit Euler :

```bash
curl -X POST http://localhost:8081/simulate/comment \
  -H "Content-Type: application/json" \
  -d '{"liveId": "<uuid-du-live>", "username": "test_buyer", "text": "sold tshirt noir M 2"}'
```

Il faut d'abord créer un live (`status = 'live'`) pour un shop existant, via
`/dashboard/lives` → « Démarrer un live » (ajoute manuellement un live sans passer par
Euler). Le port du serveur de simulation est `PORT + 1` (ex. `8081` si `PORT=8080`).

## Paiement (Phase 2 — pas codé)

La page acheteur affiche le total et un bouton « Payer » désactivé (« paiement bientôt
disponible »). Le statut `paid` existe déjà dans l'enum `live_order_status`, et
`live_orders.stripe_payment_intent` est prévu, mais aucun appel Stripe n'est fait. À
brancher : Stripe Connect (comptes Express), Checkout, webhook `/api/webhooks/stripe`.

## Webhooks

- `POST /api/webhooks/euler-alert` : LIVE Alert Euler Stream (signature HMAC-SHA256,
  header `x-webhook-signature`) — marque un live comme actif.
- `POST /api/webhooks/railway` : événements Railway (déploiement, alertes volume),
  enregistrés dans `railway_events` pour `/admin/railway`.
