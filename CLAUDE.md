# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Always respond in French.

@AGENTS.md

## What this is

Flassh buy lets sellers doing TikTok LIVE selling take orders without TikTok Shop. Buyers
comment `sold <product> <size> <quantity>` during the live; a worker parses those comments,
fills a per-buyer cart, and the buyer checks out via a unique link. This is **Phase 1**:
flow up to a `validated` order (payment-ready). Phase 2 (Stripe Connect payment) is not
implemented yet — see "Payment" below.

This repo shares its Supabase project with the **Flassh** mobile app (destockers): sellers
(`shops`/`profiles`), products, buyers and Auth are all reused, not reimplemented.

## Commands

```bash
pnpm run dev          # Next.js dev server
pnpm run build
pnpm run lint
pnpm run types:gen    # regenerate lib/database.types.ts from the remote Supabase schema
```

There is no test suite in this repo currently.

Worker (`/worker`, separate Node service — see below):

```bash
cd worker
npm run dev     # tsx watch
npm run build   # tsc -> dist/
npm start       # node dist/index.js
```

### Migrations

Schema lives in `supabase/migrations/` (versioned SQL, replayable). The first ~45 migrations
are **empty placeholders** representing schema already applied by the mobile app — never
edit or delete them; they only keep migration history in sync with the shared remote project.
Real Flassh buy migrations start at `20260721020937_flassh_buy_auth_and_access.sql`.

After writing a new migration, both steps are required:

```bash
npx supabase db push   # apply to the remote Supabase project
pnpm run types:gen      # regenerate lib/database.types.ts — otherwise silent type drift
```

## Architecture

- **Next.js 16 App Router**, Server Components + Server Actions, TypeScript strict, Tailwind v4.
  No ORM — `@supabase/supabase-js` directly, typed from `lib/database.types.ts` (generated,
  don't hand-edit; use `lib/database.aliases.ts` for the `Tables<"...">` shorthand types).
- **UI components**: `app/(dashboard)/dashboard/*` and `app/(dashboard)/admin/*` must always
  use coss-ui (`@/components/ui/*`, registry `@coss` in `components.json`, style `base-nova`)
  instead of raw HTML or ad-hoc styling — check `components/ui/` for an existing primitive
  (`Frame`/`FramePanel`, `Empty`, `Field`, `Avatar`, `Badge`, etc.) before reaching for a plain
  `<div>`/`<input>`. Exception: `Input` and `Select` wrap Base UI client primitives — inside a
  Server Component form (Server Action, no `"use client"`), pass `nativeInput` to `Input` (or
  use a styled native `<select>`) or the page crashes on interaction; only Client Components
  can use the unstyled Base UI variants directly.
- **Route groups**: `app/(dashboard)/dashboard/*` is the seller-facing area (catalogue, lives,
  settings); `app/(dashboard)/admin/*` is the internal admin area (accounts, stats, worker
  health, Railway alerts, live monitoring). `app/live/[cartSlug]` is the public buyer cart page
  (no login — see Auth). `app/login` is shared by sellers and admins.
- **Auth**: reuses existing Supabase Auth (email/password), shared with the mobile app — no
  second auth system. `lib/auth/require-access.ts` has the two guards used at the top of
  server pages/actions:
  - `requireSellerAccess()` — requires `profiles.flassh_buy_enabled = true`; redirects admins
    to `/admin` and everyone else to `/login`.
  - `requireAdminAccess()` — requires `profiles.is_admin = true`; redirects non-admins to
    `/dashboard`.
  A seller is a `shops` row (not `profiles` directly); `profiles.role` is `'client'` or `'pro'`.
  Buyers on `/live/[cartSlug]` never log in — identified by a username cookie only.
- **Data model**:
  - Existing tables (owned by the mobile app, never recreate): `profiles`, `shops`, `products`,
    `product_variants`, `product_images`, `product_designs`, `design_size_stock`, `orders`,
    `order_items`, etc.
  - Flassh buy additions to existing tables: `profiles.flassh_buy_enabled`, `profiles.is_admin`,
    `shops.tiktok_username`, `shops.cart_slug`, `product_variants.shop_id` (denormalized for
    the worker's Realtime filtering).
  - New tables dedicated to live-selling (separate from the mobile marketplace flow):
    `lives`, `live_orders`, `live_order_items`, `worker_health`, `railway_events`.
  - Buyer cart access goes only through `security definer` RPCs — `get_live_cart` and
    `get_live_shop_by_slug`. There is intentionally no anon RLS policy on
    `live_orders`/`live_order_items`; any new buyer-facing read must go through an RPC like
    these, never direct table access, to avoid leaking another buyer's cart.
  - Use `createClient()` (`lib/supabase/server.ts`) for RLS-scoped reads in normal pages/actions;
    use `createServiceRoleClient()` (`lib/supabase/service-role.ts`) only where RLS must be
    bypassed intentionally (e.g. admin cross-seller reads, `adjust_stock`).
- **The worker (`/worker`)** is a standalone Node service, not part of the Next.js app (Vercel
  can't hold a permanent WebSocket). It connects to TikTok LIVE via Euler Stream, parses `sold …`
  comments, and writes to Supabase using the service-role key.
  - Designed to run as multiple identical, stateless instances: each instance claims free lives
    via an atomic `UPDATE ... WHERE worker_id IS NULL`, no central coordinator. Scaling = adding/
    removing Railway replicas, no code change.
  - Deployed on Railway, dockerized (`worker/Dockerfile`) to stay portable (e.g. to Fly.io past
    500-1000 lives without a rewrite). `worker/railway.toml` configures build, healthcheck
    (`GET /health`), restart policy. Replica count and `MAX_LIVES_PER_WORKER` are set in the
    Railway dashboard, not in code — the web app only observes worker state via the
    `worker_health` table (`/admin/workers` page).
  - `worker/src/euler.ts` uses `@eulerstream/euler-websocket-sdk`. The exact shape of messages
    received on a real live (JSON vs. protobuf) is unverified until tested against a real
    account — if it differs, only `parseIncomingMessage()` in that file should need to change.
  - Simulation mode for testing without a real TikTok live or Euler credit: create a live via
    `/dashboard/lives` → "Démarrer un live" (sets `status = 'live'` without going through Euler),
    then POST to the simulation server (`PORT + 1`, e.g. `8081` if `PORT=8080`):
    ```bash
    curl -X POST http://localhost:8081/simulate/comment \
      -H "Content-Type: application/json" \
      -d '{"liveId": "<uuid>", "username": "test_buyer", "text": "sold tshirt noir M 2"}'
    ```
- **Webhooks**:
  - `POST /api/webhooks/euler-alert` — Euler Stream LIVE Alert (HMAC-SHA256 signed,
    `x-webhook-signature` header); marks a live as active.
  - `POST /api/webhooks/railway` — Railway deploy/volume events, stored in `railway_events`
    for `/admin/railway`.
- **Payment (Phase 2, not implemented)**: the buyer page shows a disabled "Payer" button.
  `live_order_status` already has a `paid` value and `live_orders.stripe_payment_intent` exists
  in the schema, but no Stripe call is made anywhere yet. Future work: Stripe Connect (Express
  accounts), Checkout, `/api/webhooks/stripe`.

## Déploiement du worker

Le worker Railway ne se met à jour que sur push vers `main` (déploiement
automatique). **Tout changement dans `/worker` doit être commité ET poussé
vers `main` systématiquement, sans attendre que l'utilisateur le demande**
— dès qu'une modification dans `/worker` est faite et validée (typecheck OK),
commit + push directement, comme pour tout autre commit explicitement
demandé. Sans ça, le worker en production continue de tourner sur l'ancien
code indéfiniment, silencieusement (aucune erreur visible tant qu'un vendeur
ne teste pas la fonctionnalité changée — c'est exactement ce qui a causé la
régression du 2026-07-28 où `live_rapid_items` recevait encore
`live_product_id`/`quantity`, des colonnes supprimées par une migration DB
déjà appliquée mais jamais répercutées dans le code déployé). Si le
changement ajoute une nouvelle variable d'environnement requise, elle doit
être configurée sur Railway (service `flassh-buy-worker-v2`) **avant** le
push, sinon le worker crashe au démarrage (`assertConfig()`) et les modes
existants (catalog/freeform) sont aussi coupés.

## Environment variables

See `.env.example` at the repo root (web) and its Worker section (worker env vars:
`MAX_LIVES_PER_WORKER`, `LAG_SOFT_LIMIT_MS`, `HEARTBEAT_INTERVAL_MS`, `HEARTBEAT_STALE_MS`,
`CLAIM_STAGGER_MS`, `PORT`). `SUPABASE_SERVICE_ROLE_KEY` must never be exposed to the client —
server-only, for Server Actions/routes that intentionally bypass RLS.
