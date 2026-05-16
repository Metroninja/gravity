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
# Edit .env: fill in AUTH0_DOMAIN / AUTH0_CLIENT_ID / AUTH0_CLIENT_SECRET.

docker compose up --build      # boots web, db, gcs
docker compose exec web npm run db:migrate
docker compose exec web npm run db:seed
```

Open <http://localhost:8090>. Click **Inloggen** to start the Auth0 dance.
After the seed script runs, the demo student (`student@janneke.local`) is
already enrolled in the **Welkom programma** course — sign in with the same
email through Auth0 and you'll see it.

The web container watches the host filesystem, so edits in `app/` hot-reload
in the browser.

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

1. Create a tenant at <https://auth0.com>.
2. Add a new **Regular Web Application** named e.g. _Janneke local_.
3. Under **Settings**:
   - Allowed Callback URLs: `http://localhost:8090/auth/callback,
     https://YOUR_CLOUD_RUN_URL/auth/callback`
   - Allowed Logout URLs: `http://localhost:8090, https://YOUR_CLOUD_RUN_URL`
4. Under **Authentication → Database**: keep the default Username-Password
   connection.
5. Under **Authentication → Social**: enable **Google**. Auth0 ships a dev
   key for local testing; for production add a real Google OAuth client.
6. Copy **Domain**, **Client ID** and **Client Secret** into `.env`.

Users you want as students must exist in the **Users** tab (or be self-registered
if you enable sign-ups in the database connection). After they log in once, a
row is upserted in the local `users` table; create an `enrollments` row to
grant access to a course (manually via pgAdmin until the admin UI is built).

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
echo -n "<auth0-client-secret>"     | gcloud secrets create janneke-auth0-secret --data-file=-
echo -n "<full DATABASE_URL>"        | gcloud secrets create janneke-db-url --data-file=-
```

The Cloud Run runtime service account needs:

- `roles/storage.objectAdmin` on `gs://janneke-media`
- `roles/cloudsql.client`
- `roles/secretmanager.secretAccessor` on the three secrets above
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
GCS_BUCKET=janneke-media \
  --set-secrets=SESSION_SECRET=janneke-session:latest,\
AUTH0_CLIENT_SECRET=janneke-auth0-secret:latest,\
DATABASE_URL=janneke-db-url:latest \
  --allow-unauthenticated
```

Apply migrations against Cloud SQL (one-off):

```bash
DATABASE_URL="postgres://..." npx tsx scripts/migrate.ts
```

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

- **Admin UI**: managing courses, modules, videos and PDFs is currently
  done via the seed script and pgAdmin. The next feature increment is an
  instructor-facing UI that uses `getUploadUrl()` from
  `app/lib/storage.server.ts` to push files directly to GCS from a phone.
- **Subtitles**: VTT files are uploaded alongside each video (one per
  language, `subtitlesKey` on the `videos` row). Auto-transcription is out
  of scope for the MVP.
- **Enrollment management**: insert rows in the `enrollments` table manually
  (pgAdmin → `localhost:5442`) to grant course access to a user after their
  first login.
