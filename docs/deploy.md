# Local Windows deployment

StoreLaunch runs as a Node.js application backed by a locally installed PostgreSQL service. Each store has its own application configuration and database. This guide targets the initial Bangladesh release on one dedicated Windows host; it does not establish high availability or disaster recovery by itself.

## 1. Install and provision

Install the pinned Node.js version in `.nvmrc` (24.22.1) and a supported PostgreSQL 18 release. Keep PostgreSQL listening on localhost unless a separate, secured database host is intentionally used. Configure Windows Firewall to expose only the TLS reverse proxy; do not expose PostgreSQL or port 3000 to the public internet.

Create separate PostgreSQL migration and runtime users. Connect as a PostgreSQL administrator and run the following after replacing both passwords with unique strong values:

```sql
CREATE ROLE storelaunch_migrator LOGIN PASSWORD 'replace-with-a-unique-migration-password';
CREATE ROLE storelaunch_app LOGIN PASSWORD 'replace-with-a-unique-runtime-password';
CREATE DATABASE storelaunch OWNER storelaunch_migrator;
\connect storelaunch
GRANT CONNECT ON DATABASE storelaunch TO storelaunch_app;
GRANT USAGE ON SCHEMA public TO storelaunch_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO storelaunch_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO storelaunch_app;
ALTER DEFAULT PRIVILEGES FOR ROLE storelaunch_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO storelaunch_app;
ALTER DEFAULT PRIVILEGES FOR ROLE storelaunch_migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO storelaunch_app;
```

Store the runtime connection string in an ignored `.env` file. URL-encode special characters in passwords:

```dotenv
DATABASE_URL="postgresql://storelaunch_app:ENCODED_PASSWORD@127.0.0.1:5432/storelaunch?schema=public"
AUTH_SECRET="a-unique-random-secret-at-least-32-bytes"
LICENSE_SECRET="a-different-unique-random-secret-at-least-32-bytes"
AUTH_TRUST_HOST="true"
NEXT_PUBLIC_BASE_URL="https://shop.example.com"
SSLCOMMERZ_STORE_ID="your-merchant-store-id"
SSLCOMMERZ_STORE_PASSWORD="your-merchant-store-password"
SSLCOMMERZ_SANDBOX="false"
```

Configure the remaining production values in `.env.example`: SMTP, SMS provider credentials, Cloudinary uploads, `PAYMENT_RECOVERY_SECRET`, and `SHIPMENT_SYNC_SECRET` (enables the scheduled shipment status sync; without it statuses only refresh through the admin Sync now button). Keep `.env` out of source control and restrict its Windows ACL to the deployment and service accounts. Do not use the sample sandbox gateway credentials for a live store.

## 2. Install, migrate and build

From an elevated or deployment PowerShell session in the repository directory:

```powershell
npm ci
npm run db:generate
$env:MIGRATION_DATABASE_URL = "postgresql://storelaunch_migrator:ENCODED_PASSWORD@127.0.0.1:5432/storelaunch?schema=public"
npm run db:deploy
Remove-Item Env:MIGRATION_DATABASE_URL
node --env-file-if-exists=.env scripts/validate-runtime-env.mjs --production
npm run build
```

The migration credential is supplied only for the migration command. The app uses the restricted `DATABASE_URL` runtime user. Keep release backups and migration output. Do not reset an existing store database to apply updates. Rehearse each release migration and rollback procedure against a recent, scrubbed backup before production.

## 3. Run the application locally

Run `npm start` from the application directory. Its `prestart` check validates required production settings before the server listens. Put the process under a dedicated low-privilege Windows service account and a process supervisor configured to restart on failure. Store the working directory and environment securely; do not run the app as a domain administrator.

Use a TLS-terminating reverse proxy with the store's domain and forward requests to the local Node server on port 3000. Set `NEXT_PUBLIC_BASE_URL` to the public HTTPS origin. The app provides `/api/health/live` and `/api/health/ready`; monitor readiness from the host and an independent external uptime checker. The readiness endpoint checks configuration and database connectivity, not live gateway, SMS, SMTP, Cloudinary or worker delivery.

Run the payment-recovery job on a one-minute schedule using the authenticated endpoint described in [payment recovery](payment-recovery.md), or run a separately supervised worker. Do not start multiple workers until their deployment and concurrency behavior are intentionally managed.

## 4. Backups and restore

Schedule encrypted PostgreSQL custom-format backups to a separate machine or access-controlled off-host storage. Apply a documented retention policy and alert when a backup is missing. A backup on the same disk as PostgreSQL is not sufficient.

Before launch, restore a backup into a separate local database with `pg_restore`, run `npm run db:deploy` against that restored copy, and verify representative customer, order, inventory, payment, COD and delivery-proof records. Record restore duration and test the owner-approved recovery point and recovery time objectives. Repeat after PostgreSQL major upgrades and periodically thereafter.

## 5. Go-live checks

- Complete `/setup` with the store license and owner account; keep setup and seed credentials private.
- Use live SSLCommerz credentials and verify the IPN callback with the merchant before accepting customer orders.
- Confirm an SMS sender ID, SMTP delivery, Cloudinary upload and payment-recovery schedule with provider-side evidence.
- Confirm delivery coverage, 12–24-hour promise, return policy, rider cash handover and refund responsibilities with the owner.
- Test customer, admin and rider workflows on the public HTTPS domain. Review logs, database growth and backup alerts daily during the pilot.

The app does not provide built-in metrics export, centralized error tracking, database failover, encrypted backup automation or restore automation. A single local host is a single point of failure; production launch requires an accountable operator and an independently stored, successfully tested backup.
