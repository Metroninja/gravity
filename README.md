# Janneke Platform

A private, branded learning environment for clients of Janneke van der Wouw.
Built as a small Kajabi alternative: students log in, see the courses they're
enrolled in, and work through modules of videos and PDFs at their own pace.

## Stack

- **React Router v7** (framework mode, SSR) on Node 22
- **Tailwind CSS v4** with brand tokens (`seashell`, `magenta`, `burnt-sienna`,
  `harvest-gold`, `off-black`, …)
- **PostgreSQL 16** + **Drizzle ORM**
- **Auth0** (Universal Login: email/password + Google) via `openid-client`
  and signed session cookies
- **Google Cloud Storage** for video, subtitle and PDF assets — signed URLs
  in production, `fake-gcs-server` locally
- **Stripe Checkout** (iDEAL + card, EUR) for one-time course purchases on the
  public landing pages, with auto-enrollment on payment success
- **PWA**: installable on iOS/Android with offline app shell (videos and PDFs
  are intentionally never cached)
- **Docker Compose** for local dev, **Cloud Run** for production

## Local development

### Prerequisites

- Docker Desktop
- Node 22 (only needed if you want to run scripts on the host; otherwise
  everything runs inside the `web` container)
- An Auth0 tenant (see below)

### First-time setup

```bash
cp .env.example .env
# Edit .env:
#   - AUTH0_DOMAIN / AUTH0_CLIENT_ID / AUTH0_CLIENT_SECRET (see Auth0 setup)
#   - STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET           (see Stripe setup)

docker compose up --build      # boots web, db, gcs; runs db:migrate on boot
docker compose exec web npm run db:seed
```

Open <http://localhost:8090>. Click **Inloggen** to start the Auth0 dance.
After the seed script runs, the demo student (`student@janneke.local`) is
already enrolled in the **Welkom programma** course — sign in with the same
email through Auth0 and you'll see it.

The web container watches the host filesystem, so edits in `app/` hot-reload
in the browser. The `web` service runs `npm run db:migrate` on every container
start, so newly generated migrations are applied automatically.

### Stripe webhook in development

To test the full checkout flow locally, Stripe needs a way to deliver webhook
events to the web container. Pick whichever option matches your setup —
**Option A is preferred** because it mirrors production exactly and the
secret stays stable across restarts.

#### Option A — public HTTPS tunnel (ngrok / Cloudflare Tunnel / similar)

If you already have a public HTTPS hostname forwarding to `localhost:8090`
(e.g. `https://YOUR_TUNNEL.ngrok.app`), register it as a real Stripe webhook
endpoint and skip the CLI entirely:

1. **Open the Stripe Workbench → Webhooks tab → Create event destination.**
   The fastest path is the direct URL
   <https://dashboard.stripe.com/test/workbench/webhooks>; from the UI,
   click the **Developers** button in the top-right of the Dashboard
   (which opens the Workbench side drawer) and pick the **Webhooks** tab.
   Stripe renamed "Webhooks" to "Event destinations" but it's the same
   feature.
   - **Endpoint URL:** `https://YOUR_TUNNEL/api/stripe/webhook`
   - **Events to send:**
     - `checkout.session.completed`
     - `checkout.session.async_payment_succeeded`
     - `checkout.session.async_payment_failed`
2. Click into the new endpoint → **Reveal** under "Signing secret" → copy
   the `whsec_...` value.
3. Paste it into `.env` as `STRIPE_WEBHOOK_SECRET=whsec_...` and restart the
   web container (`docker compose restart web`).

This is the same path production uses; the only difference is the hostname.

If you want to complete the full buy flow over the tunnel from another
device (or share a demo), also point `APP_BASE_URL` at the public hostname
in `.env`, and add the same hostname to Auth0's **Allowed Callback URLs**
plus `AUTH0_CALLBACK_URL` so the post-payment redirect and Auth0 round-trip
land back where the buyer started:

```env
APP_BASE_URL=https://YOUR_TUNNEL
AUTH0_CALLBACK_URL=https://YOUR_TUNNEL/auth/callback
AUTH0_LOGOUT_RETURN_URL=https://YOUR_TUNNEL
```

If you only buy from your own machine, leaving these as `localhost:8090` is
fine — the webhook hostname (Dashboard config) is independent of
`APP_BASE_URL`.

#### Option B — Stripe CLI (no public tunnel)

If you don't have a tunnel handy, the Stripe CLI tunnels test-mode events
into your container for you:

```bash
brew install stripe/stripe-cli/stripe   # one-time
stripe login
stripe listen --forward-to localhost:8090/api/stripe/webhook
```

The `listen` command prints `whsec_...` on its first line — paste that into
`STRIPE_WEBHOOK_SECRET` in `.env` and restart the web container. Keep
`stripe listen` running while you click through Checkout. The secret is
stable per CLI device + Stripe account, so you don't need to update `.env`
every restart.

See the [Stripe setup](#stripe-setup) section below for the rest of the
dashboard side (activating iDEAL, branding, etc.).

### Port map

Multiple containers live on this dev box. We map to non-default host ports
to avoid collisions:

| Service                 | Host           | Container | Notes                                         |
| ----------------------- | -------------- | --------- | --------------------------------------------- |
| `web` (React Router)    | `8090`         | `3000`    | The app                                       |
| `db` (Postgres)         | `5442`         | `5432`    | Connect pgAdmin to `localhost:5442`           |
| `gcs` (fake-gcs-server) | `4443`         | `4443`    | Local-only emulator for GCS                   |

**pgAdmin** connection details:

- Host: `localhost`
- Port: `5442`
- Database: `janneke`
- Username: `janneke`
- Password: `janneke_dev`

### Useful commands

```bash
# Run a one-off Drizzle migration after schema changes
docker compose exec web npm run db:generate
docker compose exec web npm run db:migrate

# Re-seed (idempotent)
docker compose exec web npm run db:seed

# Drizzle Studio (DB browser at http://localhost:4983)
docker compose exec web npm run db:studio

# TypeScript check + RR7 type generation
docker compose exec web npm run typecheck

# Regenerate PWA icons after the brand mark changes
docker compose exec web npm run icons:generate

# Tail logs
docker compose logs -f web
```

If you want to run scripts directly on the host (without compose), point
`DATABASE_URL` at `localhost:5442` in `.env` and run `npx tsx scripts/...`
locally.

## Auth0 setup

### One-time tenant setup

1. Create a tenant at <https://auth0.com>. Pick the **EU** region for GDPR
   alignment if your customers are EU-based.
2. **Applications → Create Application → Regular Web Application** named e.g.
   _Janneke_.
3. Under **Settings**:
   - **Allowed Callback URLs:**
     `http://localhost:8090/auth/callback, https://YOUR_PROD_HOST/auth/callback`
   - **Allowed Logout URLs:**
     `http://localhost:8090, https://YOUR_PROD_HOST`
   - **Allowed Web Origins:**
     `http://localhost:8090, https://YOUR_PROD_HOST`
   - Leave **Token Endpoint Authentication Method** at `Post`.
   - Save.
4. **Authentication → Database → Username-Password-Authentication:**
   - Keep the default connection.
   - Toggle **Disable Sign Ups** **off** — buyers redirected from Stripe
     checkout success need to be able to self-register an account using the
     email Stripe collected. Without sign-ups enabled, the
     `screen_hint=signup` deep-link won't show a signup form.
   - Under **Password Policy**, pick at minimum _Good_ (length ≥ 8 + mixed).
5. **Authentication → Social → Google:**
   - In test/dev you can use Auth0's dev keys.
   - For production, create a real Google OAuth client at
     <https://console.cloud.google.com/apis/credentials> and paste its
     client ID + secret into Auth0. Auth0's dev keys are rate-limited and
     unsuitable for production.
6. **Branding → Universal Login:** upload the brand logo, set the primary
   color to magenta `#b62f73`. The signup screen surfaced from
   `?screen_hint=signup` inherits this branding.
7. Copy **Domain**, **Client ID** and **Client Secret** from
   _Applications → Settings_ into `.env` (or Secret Manager for prod).

### How buyers become students

The platform supports two enrollment paths, both feeding into the same
`enrollments` table:

1. **Admin pre-enrolls by email** (existing flow):
   `/admin/courses/:slug/students` → add an email. A placeholder `users` row
   is created with `auth0_sub = 'pending|<uuid>'`. When that person logs in
   for the first time, [`app/lib/auth.server.ts`](app/lib/auth.server.ts)
   promotes the placeholder by matching email and replacing the `pending|`
   sub with their real Auth0 subject.
2. **Stripe checkout** (new flow): the webhook handler at
   [`app/routes/api.stripe.webhook.tsx`](app/routes/api.stripe.webhook.tsx)
   creates the same kind of `pending|stripe|<uuid>` placeholder using the
   email Stripe collected, and the buyer gets the same auto-promote on first
   login. Read the [Stripe setup](#stripe-setup) section for the rest.

Existing logged-in customers buying additional courses skip the placeholder
flow entirely — `userId` rides through Stripe `metadata` and the enrollment
attaches to their real account directly.

### Admin promotion

Edit [`app/lib/admins.server.ts`](app/lib/admins.server.ts) to hard-code an
admin allow-list, **or** set the `ADMIN_EMAILS` env var (comma-separated)
to the same effect without redeploying. Listed emails get role `admin`
automatically every login.

## Stripe setup

The platform uses **Stripe Checkout** in `mode: payment` (one-time) with
**iDEAL + card** payment methods. No Stripe Products/Prices are created
ahead of time — pricing comes from the `courses.price_cents` column at
checkout time, sent to Stripe via `price_data` in
[`app/lib/stripe.server.ts`](app/lib/stripe.server.ts).

### One-time Stripe account setup

1. **Sign up at <https://stripe.com>**, business country **Netherlands** (or
   another EU/EEA country — iDEAL is restricted to EU/EEA, US, CA, NZ, SG,
   HK, JP, AU, MX). Settlement currency must be **EUR** for iDEAL.
2. **Activate iDEAL**: _Settings → Payments → Payment methods_ → enable
   **iDEAL** under "Bank redirects". Cards are on by default; leave them
   on so non-Dutch buyers can still pay. iDEAL works in test mode without
   activation paperwork; live mode requires an extra T&C accept.
3. **Branding**: _Settings → Branding_. Upload the magenta logo, set the
   brand color to `#b62f73`, set the public business name (it shows up on
   receipts).
4. **Receipts**: _Settings → Emails → Customer emails → Successful payments_
   on. Stripe will email each buyer a branded receipt automatically; no
   app-side code required.
5. **API keys**: open the **Developers** button (top-right of the Dashboard)
   to reveal the Workbench, then go to the **API keys** tab. Copy the
   **Secret key** and **Publishable key**. Use the **test mode** keys
   (`sk_test_...`, `pk_test_...`) for local development and the
   **live mode** keys (`sk_live_...`) for production.

### Webhook: production

This is the critical piece — without the webhook, paid customers don't get
enrolled.

1. **Open the Workbench → Webhooks tab → Create event destination.** Direct
   URL: <https://dashboard.stripe.com/workbench/webhooks> (live mode) or
   <https://dashboard.stripe.com/test/workbench/webhooks> (sandbox/test).
   In the UI, click the **Developers** button in the top-right of the
   Dashboard, then pick the **Webhooks** tab. ("Event destination" is
   Stripe's new name for "Webhook endpoint".)
2. **Endpoint URL:** `https://YOUR_PROD_HOST/api/stripe/webhook`
3. **Events to send** (don't subscribe to "all events" — costs more, noisier):
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
4. After creation, click into the endpoint, click **Reveal** under "Signing
   secret", copy the `whsec_...` value into `STRIPE_WEBHOOK_SECRET` in
   Secret Manager (see [Production deployment](#production-deployment-cloud-run)).
   Live-mode and sandbox endpoints have **different** signing secrets —
   double-check which one you copied.

The async events are necessary because iDEAL is technically asynchronous —
typically `checkout.session.completed` already arrives with
`payment_status: "paid"`, but if a buyer's bank takes longer to confirm
you'll get an `async_payment_succeeded` follow-up. Our handler is
idempotent on `stripe_session_id`, so duplicate deliveries are safe.

### Webhook: development

See [Stripe webhook in development](#stripe-webhook-in-development) above
for the two supported options: register a real webhook through a public
HTTPS tunnel (preferred — production-like, stable secret), or use the
Stripe CLI as a fallback when no tunnel is available.

### Configuring a course for sale

In `/admin/courses/:slug/edit`:

- Set **Prijs** (in euros). Leave empty to hide the buy button (course is
  visible but not for sale; the landing page falls back to "Inschrijven" →
  login link, so manually-enrolled buyers can still authenticate).
- Tick **Toon publieke landingspagina**. This flag is independent of
  **Zichtbaar voor cursisten** (`published`):
  - `published` = enrolled students can access this course at all
    (existing meaning, unchanged).
  - `publicLanding` = anonymous visitors can hit `/courses/:slug` and see
    the marketing landing.

### What you do **not** need to set up in Stripe

- **Don't** pre-create Products or Prices — checkout uses inline
  `price_data` driven from the DB.
- **Don't** enable **Connect** — that's for marketplaces.
- **Don't** configure subscriptions — we only use `mode: "payment"`.
- The Customer Portal can stay off — there's nothing for buyers to
  self-manage on a one-time purchase.

### Optional: VAT via Stripe Tax

For Dutch B2C sales you must collect VAT. Easiest path is **Stripe Tax**
(_Settings → Tax_), which auto-calculates and remits VAT across the EU for
~€0.50/transaction. To enable, add `automatic_tax: { enabled: true }` and
`billing_address_collection: "required"` to `createCheckoutSession` in
[`app/lib/stripe.server.ts`](app/lib/stripe.server.ts) — this is
**not wired in** today; do it deliberately once your tax registration is in
place.

### Test cards / banks

- Card: `4242 4242 4242 4242`, any future expiry, any CVC.
- iDEAL: pick any of the test banks Stripe shows on the redirect screen.

After completing a test purchase you should see new rows in `payments` and
`enrollments` and the `stripe listen` terminal printing the matching
event(s). The success page will deep-link the buyer into Auth0 signup with
their email pre-filled (`screen_hint=signup&login_hint=...`).

## Production deployment (Cloud Run)

### One-time GCP setup

```bash
# Storage
gcloud storage buckets create gs://janneke-media --location=EU
gcloud storage buckets update gs://janneke-media \
  --cors-file=- <<EOF
[
  {
    "origin": ["https://YOUR_PROD_HOST"],
    "method": ["GET", "PUT"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
EOF

# Database (Cloud SQL Postgres 16)
gcloud sql instances create janneke-db --database-version=POSTGRES_16 \
  --tier=db-custom-1-3840 --region=europe-west4
gcloud sql databases create janneke --instance=janneke-db
gcloud sql users set-password postgres --instance=janneke-db --password=...

# Secret Manager
echo -n "$(openssl rand -base64 48)" | gcloud secrets create janneke-session --data-file=-
echo -n "<auth0-client-secret>"      | gcloud secrets create janneke-auth0-secret --data-file=-
echo -n "<full DATABASE_URL>"        | gcloud secrets create janneke-db-url --data-file=-
echo -n "sk_live_..."                 | gcloud secrets create janneke-stripe-secret --data-file=-
echo -n "whsec_..."                   | gcloud secrets create janneke-stripe-webhook --data-file=-
```

The Cloud Run runtime service account needs:

- `roles/storage.objectAdmin` on `gs://janneke-media`
- `roles/cloudsql.client`
- `roles/secretmanager.secretAccessor` on the secrets above
- The dedicated **signer** role for V4 signed URLs is granted via
  `iam.serviceAccounts.signBlob`. Add `roles/iam.serviceAccountTokenCreator`
  on the runtime SA so it can sign URLs without a key file.

### Build & deploy

```bash
gcloud builds submit --tag=europe-west4-docker.pkg.dev/PROJECT/janneke/web:latest

gcloud run deploy janneke-web \
  --image=europe-west4-docker.pkg.dev/PROJECT/janneke/web:latest \
  --region=europe-west4 \
  --add-cloudsql-instances=PROJECT:europe-west4:janneke-db \
  --service-account=janneke-web@PROJECT.iam.gserviceaccount.com \
  --set-env-vars=APP_BASE_URL=https://janneke.example,\
NODE_ENV=production,\
AUTH0_DOMAIN=your-tenant.eu.auth0.com,\
AUTH0_CLIENT_ID=...,\
AUTH0_CALLBACK_URL=https://janneke.example/auth/callback,\
AUTH0_LOGOUT_RETURN_URL=https://janneke.example,\
GCS_BUCKET=janneke-media,\
STRIPE_PUBLISHABLE_KEY=pk_live_... \
  --set-secrets=SESSION_SECRET=janneke-session:latest,\
AUTH0_CLIENT_SECRET=janneke-auth0-secret:latest,\
DATABASE_URL=janneke-db-url:latest,\
STRIPE_SECRET_KEY=janneke-stripe-secret:latest,\
STRIPE_WEBHOOK_SECRET=janneke-stripe-webhook:latest \
  --allow-unauthenticated
```

Apply migrations against Cloud SQL (one-off after each schema change):

```bash
DATABASE_URL="postgres://..." npx tsx scripts/migrate.ts
```

### Production go-live checklist

Before flipping live keys + DNS, walk through:

1. **Auth0** — Allowed Callback / Logout / Web Origin URLs all include the
   production hostname; sign-ups enabled on the database connection;
   real Google OAuth client (not the dev key); branding applied.
2. **Stripe** — account is **fully activated** (KYC + bank account passed);
   iDEAL is enabled; live webhook endpoint
   (`https://YOUR_PROD_HOST/api/stripe/webhook`) created and subscribed to
   the three events above; `STRIPE_WEBHOOK_SECRET` in Secret Manager
   matches the live endpoint's signing secret (different from the test one).
3. **Database** — `npx tsx scripts/migrate.ts` ran cleanly against Cloud SQL.
4. **Smoke test** — buy a real course at the lowest price (e.g. €1.00) in
   live mode, verify a `payments` row + `enrollments` row + Stripe
   dashboard payment + receipt email all line up; refund yourself from the
   Stripe dashboard.

## Project layout

See [`app/routes.ts`](app/routes.ts) for the route table. Key files:

- [`app/lib/auth.server.ts`](app/lib/auth.server.ts) — Auth0 / session helpers
- [`app/lib/storage.server.ts`](app/lib/storage.server.ts) — GCS signed URLs
- [`app/lib/progress.server.ts`](app/lib/progress.server.ts) — completion / resume
- [`app/db/schema.ts`](app/db/schema.ts) — Drizzle schema
- [`app/components/VideoPlayer.tsx`](app/components/VideoPlayer.tsx) — player
  (speed menu, VTT subtitles, throttled progress reporting)

## Brand typography

Two custom families, shipped as WOFF2 under `public/fonts/`:

- **Denton** — high-contrast serif, used for display copy (`h1`–`h3`,
  feature text). Weights ~200–400 (`denton-300*.woff2`) and ~600–900
  (`denton-800*.woff2`), each with an italic file.
- **Nexa** — geometric sans-serif, used for body copy and UI. Weights 300
  (`nexa-300.woff2`), 400–500 (`nexa-400.woff2`), and 600–800
  (`nexa-700.woff2`).

The `@font-face` declarations and the `--font-display` / `--font-body`
tokens live in [`app/styles/tailwind.css`](app/styles/tailwind.css).

The source `.otf` files were converted to WOFF2 with `fonttools`:

```bash
pip3 install --user fonttools brotli
python3 -c "from fontTools.ttLib import TTFont; \
  f = TTFont('Nexa Regular.otf'); f.flavor='woff2'; \
  f.save('public/fonts/nexa-400.woff2')"
```

To add a new weight: drop another WOFF2 in `public/fonts/` and append a
matching `@font-face` block in `tailwind.css`. Do not put a README or any
notes inside `public/` — everything there is served as a static asset.

## Open items / next steps

- **Subtitles**: VTT files are uploaded alongside each video (one per
  language, `subtitlesKey` on the `videos` row). Auto-transcription is out
  of scope for the MVP.
- **VAT / Stripe Tax**: not enabled — see [Optional: VAT via Stripe Tax](#optional-vat-via-stripe-tax).
  Wire this in deliberately once the business is VAT-registered.
- **Refund UX**: refunds happen in the Stripe dashboard today; the app does
  **not** auto-process them. To revoke access on refund, delete the matching
  `enrollments` row manually (and update the `payments.status` to
  `refunded`). A future improvement is subscribing the webhook to
  `charge.refunded` and doing this automatically.
- **Coupon / discount codes**: not implemented. Stripe Checkout supports
  Promotion Codes natively if/when this is needed (one parameter on the
  session).
