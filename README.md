# StoreLaunch

StoreLaunch is a single-vendor, white-label e-commerce application. Each store runs as its own deployment with its own database, products, customers, orders, administrators, riders, settings, and branding.

This repository contains a full-stack web application, not a separate ASP.NET API. Its current implementation uses Next.js server actions and route handlers as the application/API layer.

## Contents

- [Capabilities](#capabilities)
- [Technology and architecture](#technology-and-architecture)
- [Requirements](#requirements)
- [Run locally on Windows](#run-locally-on-windows)
- [Run with Docker](#run-with-docker)
- [Environment variables](#environment-variables)
- [Database and first-time store setup](#database-and-first-time-store-setup)
- [Application scripts](#application-scripts)
- [Tests and checks](#tests-and-checks)
- [Operations and production deployment](#operations-and-production-deployment)
- [Project structure](#project-structure)
- [Product and operational documentation](#product-and-operational-documentation)
- [Troubleshooting](#troubleshooting)

## Capabilities

- **Storefront:** product/category/brand browsing, search, cart, checkout, customer accounts, addresses, wishlists, referrals, promotions, inbox, reviews, and order history.
- **Admin:** products, catalog, campaigns, customer promotions, orders, inventory, customers, riders, payments, reconciliation, returns, wallets, reports/dashboard, and store settings.
- **Rider:** assigned deliveries, route/map links, delivery attempts and proof, delivery history, COD cash tracking, and profile.
- **Commerce operations:** inventory reservation, order status history, payment recovery, Cash on Delivery settlement records, after-sales requests, and referral rewards.
- **Account and messaging:** email/password and phone OTP login, role selection for accounts with multiple roles, contact verification, email/SMS templates, and in-app notifications.
- **Localization and store configuration:** currency, delivery estimate, support contact, theme, language, and store branding settings.

Available screens do not imply that every external integration is configured. Payment, SMS, SMTP, Cloudinary, maps, and scheduled jobs require the corresponding provider setup described below and in the linked guides.

## Technology and architecture

| Area                       | Current implementation                                                      |
| -------------------------- | --------------------------------------------------------------------------- |
| Web application and server | Next.js 16.4.2 App Router, React 19.3, TypeScript                           |
| Styling                    | Tailwind CSS 4                                                              |
| Database                   | PostgreSQL 18 (initial deployment target)                                   |
| ORM                        | Prisma 7.10 with PostgreSQL driver adapter                                  |
| Authentication             | Auth.js v5 credentials provider, email/password and phone OTP, JWT sessions |
| Payments                   | SSLCommerz / SSL Wireless hosted checkout and callbacks                     |
| Email and SMS              | Nodemailer SMTP and configurable SMS provider adapters                      |
| Product images             | Cloudinary in production; local development fallback                        |
| Runtime                    | Node.js 24.22.1; npm 10 or newer                                            |
| Deployment options         | Local Node.js process or Docker Compose                                     |

The `src/app` tree contains the routes and server-rendered screens. `backend/actions` holds server actions; `backend/lib` contains business logic, query modules, and provider adapters; `backend/prisma` contains the schema, migrations, and development seed. API route handlers are under `src/app/api`.

The codebase follows a **clean architecture** (hexagonal / ports-and-adapters) layout: dependencies point inward only, and the Prisma ORM is an adapter that only the backend application layer may touch.

| Layer              | Location                                                                 | May depend on                                                       |
| ------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Interface adapters | `src/app/**`, `frontend/**`                                              | `backend/actions`, `backend/lib` query functions and session guards |
| Application layer  | `backend/actions/**` (commands), `backend/lib/**` (queries, policies)    | Prisma client, provider adapters                                    |
| Persistence        | `backend/lib/db.ts`, `backend/lib/prisma-client.ts`, `backend/prisma/**` | nothing upward                                                      |

Pages and components read data through exported query functions in `backend/lib` (for example `account-queries.ts`, `admin-orders-queries.ts`, `warehouse-queries.ts`) and write through server actions; they never import `@backend/lib/db` or the generated Prisma client. These boundaries are enforced as ESLint errors in `eslint.config.mjs` (rules R1–R4 in the [clean architecture plan](docs/clean-architecture-plan.md)), so `npm run lint` fails on any new direct ORM import from UI code or any backend import that reaches up into UI or route code.

## Requirements

### Local Node.js setup

- Windows 10/11 with PowerShell, or another Node.js-compatible development host.
- Node.js **24.22.1** (pinned in `.nvmrc`) and npm **10+**.
- PostgreSQL **18** running locally or on a reachable private host.
- Git and network access for installing npm packages.
- Optional provider accounts/credentials for live payments, email, SMS, image storage, and Google Maps Embed.

### Docker setup

- Docker Desktop with Docker Compose v2, or Docker Engine plus the Compose plugin.
- At least 4 GB of memory available to Docker for a production build.
- Network access to pull the Node.js and PostgreSQL images and install npm dependencies.

## Run locally on Windows

### 1. Install Node dependencies

```powershell
npm ci
```

The Node version must meet `package.json`'s engine requirement. With a Node version manager, select the version in `.nvmrc` before installing dependencies.

### 2. Create a PostgreSQL database and role

Create a local development database. For example, connect to PostgreSQL as an administrator and run (replace the password):

```sql
CREATE ROLE storelaunch_app LOGIN PASSWORD 'use-a-local-development-password';
ALTER ROLE storelaunch_app CREATEDB;
CREATE DATABASE storelaunch OWNER storelaunch_app;
```

For local development, the role needs `CREATEDB` because `prisma migrate dev` creates a shadow database. Production deployments should use separate migration and runtime roles; see [docs/deploy.md](docs/deploy.md).

### 3. Configure `.env`

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set `DATABASE_URL` to the database above. URL-encode any special characters in the database username/password. Generate separate local secrets (32 bytes or more):

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Use the output for `AUTH_SECRET` and another independently generated value for `LICENSE_SECRET`. The sample SSLCommerz settings in `.env.example` are sandbox-only. Keep `.env` private; it is excluded from Git.

For development, `NEXT_PUBLIC_BASE_URL=http://localhost:3000` is appropriate. Keep `SMS_PROVIDER=disabled` unless you intentionally configure a provider; `console` is development-only and prints test SMS messages to the terminal.

### 4. Generate Prisma Client and apply migrations

```powershell
npm run db:generate
npm run db:migrate
```

`db:migrate` applies pending migrations to the configured local database and regenerates Prisma Client. To apply already-created migrations in a deployment/release environment, use `npm run db:deploy` instead. Never use a database reset against a store containing business data.

### 5. Start the application

```powershell
npm run dev
```

Open <http://localhost:3000>. A new database redirects to `/setup`. Enter a valid license key and create the store owner's account; the first setup seeds the catalog. Generate a development license after setting `LICENSE_SECRET`:

```powershell
npm run license:generate
```

For a populated development store, complete the one-time `/setup` first, then run `npm run db:seed`. It adds demo catalog operations, an out-of-stock product, active/inactive customer and rider records, orders across every order status, complete order timelines, rider delivery evidence, pending payment recovery, open and reconciled COD, a return/refund request, campaigns, draft/sent promotions and inbox messages, cart/wishlist, reviews, feedback, wallet/referral activity, and inventory history. It creates these local-only accounts: `admin@store.local` / `admin1234`, `customer@store.local` / `customer1234`, and `rider@store.local` / `rider1234`. It also adds `customer2@store.local` and `customer3@store.local`, each with password `customer1234`. Existing demo customer/rider passwords are reset by the seeder; it preserves an existing admin password. Do not use this data in production; the command is disabled when `NODE_ENV=production`.

For a production-mode local run, set all required production environment values and an HTTPS `NEXT_PUBLIC_BASE_URL`, then run:

```powershell
npm run build
npm start
```

`npm start` runs the production environment validation automatically before starting Next.js.

## Run with Docker

Docker Compose provides a PostgreSQL database and two app profiles: a local development server and a production standalone image. Both profiles share the named `postgres_data` volume. Back up this volume/database before removing or replacing it.

### 1. Create Docker environment file

```powershell
Copy-Item docker.env.example .env.docker
```

Edit `.env.docker`. For local Docker development, set `NEXT_PUBLIC_BASE_URL=http://localhost:3000`, replace the database password and both application secrets, and keep sandbox payment credentials and `SMS_PROVIDER=disabled`. The file is ignored by Git.

### 2. Start the development database and apply migrations

```powershell
docker compose --env-file .env.docker up -d db
docker compose --env-file .env.docker --profile development run --rm app-dev npm run db:migrate
```

The database is reachable from your host on `127.0.0.1:5433` and from the app container as `db:5432`.

### 3. Start the development app

```powershell
docker compose --env-file .env.docker --profile development up --build app-dev
```

Open <http://localhost:3000>. Stop the foreground app with Ctrl+C. To stop the database too, run `docker compose --env-file .env.docker down`. This preserves the database volume. `down --volumes` deletes the database and all its data; use it only when you intentionally want to discard the local Docker database.

### Production Docker deployment

Use a production domain and HTTPS for `NEXT_PUBLIC_BASE_URL`; Next.js inlines `NEXT_PUBLIC_*` values at build time, so rebuild the image if this public origin changes. Replace every sample secret and configure the live providers before launch. Do not publish PostgreSQL or the Node port directly to the public internet; put a TLS reverse proxy/load balancer in front of the app and restrict host firewall access.

1. Set `.env.docker` with the production domain, unique database password, independent `AUTH_SECRET` and `LICENSE_SECRET` (32+ bytes), real payment credentials, and configured provider settings.
2. Start PostgreSQL and apply migrations using a release environment with migration privileges. For a single-host evaluation only, the Compose database role owns its database and can apply migrations:

   ```powershell
   docker compose --env-file .env.docker up -d db
   docker compose --env-file .env.docker --profile development run --rm app-dev npm run db:deploy
   ```

   For production, do not use the app's restricted runtime database role for schema changes. Use a separate migration role and run `npm run db:deploy` from a controlled release runner with `MIGRATION_DATABASE_URL` set to that role's connection string.

3. Build and run the standalone app image:

   ```powershell
   docker compose --env-file .env.docker --profile production up --build -d app
   docker compose --env-file .env.docker logs -f app
   ```

4. Verify `https://your-domain.example/api/health/live` and `/api/health/ready`, then complete the one-time store setup at `/setup`.

The Compose port bindings listen on loopback only (`127.0.0.1`), ready for a host reverse proxy. Change those bindings only when the network boundary and TLS termination are configured. Docker Compose is a single-host deployment; it does not provide high availability, off-host backups, secret management, or monitoring by itself. Follow [docs/deploy.md](docs/deploy.md) for production operations and recovery requirements.

## Environment variables

`.env.example` is the local Node.js template. `docker.env.example` is the Docker Compose template. Copy the relevant file, fill it locally, and never commit real credentials.

| Variable                                                                        | Required when                                          | Purpose                                                                                                                                                                 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                  | Always                                                 | PostgreSQL connection string used by the app/Prisma. In Compose it uses the internal host `db`; migrations use `MIGRATION_DATABASE_URL` when provided.                  |
| `MIGRATION_DATABASE_URL`                                                        | Deploying schema changes with a separate database user | Temporary privileged connection for `prisma migrate deploy`; do not put this credential in the app runtime environment.                                                 |
| `AUTH_SECRET`                                                                   | Always                                                 | Secret for signing/encrypting authentication/session data; use a unique value of at least 32 bytes.                                                                     |
| `AUTH_TRUST_HOST`                                                               | Behind proxy / Compose                                 | Allows Auth.js to trust the configured host headers. Keep the reverse proxy trusted and correctly configured.                                                           |
| `LICENSE_SECRET`                                                                | Always                                                 | Separate HMAC key for store license activation; at least 32 bytes.                                                                                                      |
| `NEXT_PUBLIC_BASE_URL`                                                          | Always in production                                   | Public absolute store origin used for callbacks, links, robots, and sitemap. Production validation requires HTTPS. Public-prefixed values are embedded at build time.   |
| `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`                              | Payment checkout                                       | SSLCommerz merchant credentials. Use provider sandbox credentials for development; use live credentials only for a verified merchant integration.                       |
| `SSLCOMMERZ_SANDBOX`                                                            | Payment checkout                                       | Set `true` for sandbox, `false` for live. Live mode also requires a strong `PAYMENT_RECOVERY_SECRET`.                                                                   |
| `PAYMENT_RECOVERY_SECRET`                                                       | Live payment recovery job                              | Bearer secret for the scheduled payment recovery endpoint; at least 32 bytes in live mode.                                                                              |
| `SHIPMENT_SYNC_SECRET`                                                          | Automated shipment status sync                         | Bearer secret for the scheduled `/api/jobs/shipment-sync` endpoint; at least 32 bytes. When unset the endpoint refuses to run (503) and statuses only refresh manually. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`          | Production image uploads                               | Configure all three together to enable Cloudinary uploads.                                                                                                              |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Email delivery                                         | SMTP connection and sender. `EMAIL_FROM` is required when an SMTP host is configured.                                                                                   |
| `SMS_PROVIDER`                                                                  | If using SMS                                           | `smsq`, `bulksmsbd`, `generic`, `disabled`, or development-only `console`.                                                                                              |
| `SMS_API_KEY`, `SMS_SENDER_ID`, `SMS_CLIENT_ID`                                 | SMS provider setup                                     | Provider credentials; SMSQ additionally requires `SMS_CLIENT_ID`.                                                                                                       |
| `SMS_API_URL`                                                                   | `SMS_PROVIDER=generic`                                 | HTTPS endpoint for the generic JSON SMS adapter.                                                                                                                        |
| `GOOGLE_MAPS_EMBED_KEY`                                                         | Embedded rider map                                     | Browser-visible Maps Embed API key; restrict it to the required API and allowed website origin. Directions links work without it.                                       |

Additional email/SMS requirements and provider setup are in [docs/sms-setup.md](docs/sms-setup.md). Production validation can be run before deploying:

```powershell
npm run config:check
node --env-file-if-exists=.env scripts/validate-runtime-env.mjs --production
```

The second command enforces production HTTPS and required secrets even when called from a development shell. Do not paste `.env` contents into issue trackers or logs.

## Database and first-time store setup

- Prisma schema: `backend/prisma/schema.prisma`.
- Versioned SQL migrations: `backend/prisma/migrations/`.
- Prisma config: `prisma.config.ts`.
- Development catalog/demo seed: `backend/prisma/seed.ts` and `backend/lib/seed-data.ts`.
- First store owner/catalog setup: `/setup` and `backend/lib/setup.ts`.
- The store setup flow is single-use. It validates the license, creates the first owner account, stores initial store settings, and seeds a starter catalog.
- The setup-created owner account includes both Customer and Admin roles. Admin access should be protected with strong owner credentials.
- Development seeds contain demo credentials/data. Do not run them against a live database.
- Production upgrades use `npm run db:deploy`. Take a database backup first and rehearse migrations against a restored copy. Never run `prisma migrate reset` against a production store.

Use Prisma Studio only against an intended database:

```powershell
npm run db:studio
```

## Application scripts

| Command                                   | Purpose                                                                                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                             | Start local Next.js development server.                                                                                                        |
| `npm run build`                           | Generate Prisma Client and create the production Next.js build.                                                                                |
| `npm start`                               | Validate production configuration and start the app.                                                                                           |
| `npm run db:generate`                     | Generate Prisma Client from the schema.                                                                                                        |
| `npm run db:migrate`                      | Create/apply development migrations and regenerate Prisma Client.                                                                              |
| `npm run db:deploy`                       | Apply committed migrations in deployment environments.                                                                                         |
| `npm run db:seed`                         | Add demo catalog and demo admin account; development only.                                                                                     |
| `npm run db:studio`                       | Open Prisma Studio for the configured database.                                                                                                |
| `npm run license:generate`                | Generate a signed license key; accepts `--days`, `--count`, `--slug`.                                                                          |
| `npm run config:check`                    | Check local runtime configuration when configured for production.                                                                              |
| `npm run lint` / `npm run lint:fix`       | Run ESLint / apply supported autofixes.                                                                                                        |
| `npm run typecheck`                       | Run TypeScript without emitting files.                                                                                                         |
| `npm run format` / `npm run format:check` | Format files / check Prettier formatting.                                                                                                      |
| `npm run test:ci`                         | Run Prisma generation and the configured integration/unit test suites. Requires a test PostgreSQL role allowed to create disposable databases. |
| `npm run test:screens`                    | Run isolated browser checks; requires PostgreSQL database-creation permission, Chrome, and free ports 3109/9224.                               |
| `npm run payments:recover`                | Run one payment-recovery batch.                                                                                                                |
| `npm run payments:worker`                 | Run the payment-recovery worker in watch mode.                                                                                                 |
| `npm run shipments:sync`                  | Run one shipment status-sync batch over API shipments.                                                                                         |
| `npm run shipments:worker`                | Run the shipment status-sync worker in watch mode (5-minute cadence).                                                                          |

Use `npm run` to list any additional focused test scripts defined in `package.json`.

## Tests and checks

Before submitting a change, the usual code-quality checks are:

```powershell
npm run format:check
npm run lint
npm run typecheck
```

Run `npm run test:ci` when PostgreSQL is available. Integration tests create and clean up separate disposable databases, so the PostgreSQL test role needs `CREATEDB`; do not point them at production. Browser checks use a separate build directory and ports and should run outside the normal development server session. See [screen check notes and limitations](docs/screen-data-check-report.md).

## Operations and production deployment

- **HTTPS and proxy:** terminate TLS at a reverse proxy, forward only to the local app port, and set `NEXT_PUBLIC_BASE_URL` to the public HTTPS origin. Do not expose PostgreSQL publicly. See [deployment guide](docs/deploy.md).
- **Health checks:** `/api/health/live` checks process liveness; `/api/health/ready` checks app configuration and database readiness. Readiness does not verify delivery of SMS/email, payment provider callbacks, Cloudinary, or scheduled tasks.
- **Payment recovery:** schedule an authenticated POST to `/api/jobs/payment-recovery` every minute, or supervise a single worker. See [payment recovery operations](docs/payment-recovery.md).
- **Database safety:** use a restricted runtime database identity and a separate migration identity; make encrypted off-host backups and test restores. Preserve migration history and never reset a live store.
- **SMS and email:** verify delivery at the provider, including sender ID approval, before depending on OTP/recovery workflows. See [SMS setup](docs/sms-setup.md).
- **Media:** configure Cloudinary for durable production product images. Delivery evidence photos are stored with delivery records in PostgreSQL; include those records in database backup/retention planning.
- **Rider maps:** restrict Google Maps keys to Maps Embed API and the production website origin. See [rider delivery workflow](docs/rider-delivery-workflow.md).
- **Licensing:** issue unique keys with the same `LICENSE_SECRET` used by the corresponding store deployment. Protect the secret and maintain an owner-controlled license issuance record.
- **Logging and monitoring:** supervise the Node/Docker process, collect application and reverse-proxy logs without logging secrets or OTPs, alert on readiness failures, disk/DB growth, failed backups, and job failures.
- **Scaling:** current guidance targets one app instance per store. Multi-instance deployments need shared cache coordination, consistent deployment artifacts/secrets, and a deliberately operated worker; do not scale replicas without addressing Next.js cache behavior and background-job concurrency.

This repository's production audit records known controls and remaining operational risks in [the production-readiness audit](docs/production-readiness-audit-2026-10-22.md) and [the evidence snapshot](docs/production-readiness-evidence-2026-10-22.json). A successful build or health endpoint is not proof that payment, SMS, SMTP, backup recovery, or end-to-end business operations are ready for launch.

## Project structure

```text
src/app/                  Next.js routes, pages, and API route handlers
frontend/components/      Storefront, account, admin, rider, and shared UI
frontend/i18n/            English/Bengali dictionaries and localization helpers
frontend/lib/             Frontend form and UI helpers
backend/actions/          Server actions for customer/admin/rider operations
backend/lib/              Commerce, identity, delivery, notification, and provider logic
backend/prisma/           Prisma schema, SQL migrations, and seed
backend/tests/             Integration and business-rule test suites
scripts/                  Environment validation and development tooling
docs/                     Business, operations, feature, and deployment documents
public/                   Static assets
Dockerfile                Development and standalone production image targets
compose.yaml              PostgreSQL plus development/production app profiles
```

## Product and operational documentation

- [Business improvement plan](docs/business-improvement-plan.md)
- [Requirements](docs/requirement.md)
- [Deployment and host operations](docs/deploy.md)
- [Production readiness audit](docs/production-readiness-audit-2026-10-22.md)
- [Campaigns and discounts](docs/campaigns.md)
- [Customer promotions](docs/customer-promotions.md)
- [Referral rewards](docs/referrals.md)
- [Order status timeline](docs/order-preparation-timeline.md)
- [Order notes and reorder](docs/order-notes-and-reordering.md)
- [Rider delivery workflow](docs/rider-delivery-workflow.md)
- [Account inbox](docs/account-inbox.md)
- [Profile and contact management](docs/profile-management.md)
- [Cash on Delivery and payment recovery](docs/payment-recovery.md)
- [Screen verification coverage](docs/screen-data-check-report.md)

## Troubleshooting

### Database connection refused

Confirm PostgreSQL is running, the database exists, `DATABASE_URL` has the right host/port/user/password, and the password is URL-encoded. For Docker Compose, use `db:5432` inside a container and `127.0.0.1:5433` from the host.

### Prisma reports missing tables or unapplied migrations

Run `npm run db:migrate` in local development or `npm run db:deploy` during deployment against the intended database. Do not fix this by resetting a database containing real data.

### Production start rejects environment configuration

Run `node --env-file-if-exists=.env scripts/validate-runtime-env.mjs --production` and correct each reported item. Production requires `DATABASE_URL`, strong `AUTH_SECRET` and `LICENSE_SECRET`, and an HTTPS `NEXT_PUBLIC_BASE_URL`; live SSLCommerz additionally requires merchant credentials and `PAYMENT_RECOVERY_SECRET`.

### Email or SMS is not received

Check the configured SMTP/SMS provider, sender approval, credentials, network access, and provider-side message status. In development, delivery may be disabled; an HTTP acceptance response is not proof that a message reached a handset. Use [SMS setup](docs/sms-setup.md) for provider-specific configuration.

### Docker app cannot reach PostgreSQL

Use the service DNS name `db` in the app's connection string, wait for the Compose health check, and ensure the database name/user/password match the `.env.docker` values. Do not use `localhost` from inside the app container to connect to the database container.
