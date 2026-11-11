# Clean Architecture Migration Overview

## Project: StoreLaunch

### Workspace: D:\Projects\StoreLaunch

### Message Time: 2026-11-01T10:40:09Z (updated at migration close-out)

---

## 1. Original Architecture: Informal N-Tier (Layered)

The repository started from an **informal N-tier (layered) architecture** built on Next.js 16 App Router.

### Layer Structure (as documented in `README.md`):

| Layer (as documented)    | Location             | Responsibility                          |
| ------------------------ | -------------------- | --------------------------------------- |
| Presentation / transport | `src/app/**`         | Routes, pages, layouts, API handlers    |
| UI components            | `frontend/**`        | Storefront/admin/rider components, i18n |
| Application layer        | `backend/actions/**` | Server actions (commands)               |
| Domain + infrastructure  | `backend/lib/**`     | Business logic, queries, adapters       |
| Persistence              | `backend/prisma/**`  | Schema, migrations, Prisma client       |

### Dependency Rule (was broken in practice):

The presentation layer used to import the persistence layer directly: **99 files under `src/app` and 1 file under `frontend` imported `@backend/lib/db`** (the Prisma client) and built queries inline, so data access, filtering, and some business derivations lived in UI code.

**This is now fixed.** A repo-wide search finds zero `@backend/lib/db`, `@backend/lib/prisma-client`, or `new PrismaClient` references under `src/` or `frontend/`, and the ESLint boundary rules below fail the build if any regress.

---

## 2. Target Architecture: Clean Architecture (Hexagonal / Ports-and-Adapters)

The **target architecture** is Clean Architecture (Robert C. Martin), implemented as a **Hexagonal / Ports-and-Adapters layout** inside Next.js App Router conventions.

The name matters less than the **dependency rule**: **dependencies point inward only**, and the ORM is an adapter that only the backend application layer may touch.

### Architecture Diagram:

```text
┌────────────────────────────────────────────────────────────┐
│ Interface adapters / delivery mechanisms                   │
│   src/app/**        pages, layouts, route handlers         │
│   frontend/**       components, i18n (pure UI + app calls) │
│        │  may call only: backend/actions + backend/lib     │
│        ▼                                                   │
│ Application layer (use cases / query services)             │
│   backend/actions/**   server actions (commands)           │
│   backend/lib/**       query modules, policies, ports      │
│        │  may call only: Prisma + provider adapters        │
│        ▼                                                   │
│ Infrastructure adapters                                    │
│   backend/lib/db.ts, prisma-client.ts, sslcommerz, sms,    │
│   mail, pathao/redx/steadfast courier adapters, cloudinary │
│        ▼                                                   │
│ Persistence                                                │
│   backend/prisma/**    schema + migrations                 │
└────────────────────────────────────────────────────────────┘
```

### Dependency Rules (R1-R7):

| Rule   | Description                                                                                                                                                                     | Enforced by          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **R1** | `frontend/` and `src/app/` must never import `@backend/lib/db`, `@backend/lib/prisma-client`, `@backend/prisma/**`, or instantiate an ORM client.                               | ESLint error         |
| **R2** | `@backend/generated/**` may be imported **type-only** from the UI. Runtime use is banned outside `backend/lib` (tests are exempt as harnesses).                                 | ESLint error         |
| **R3** | `backend/lib/**` must never import `backend/actions/**`, `frontend/`, or `src/` (`@/**`). No upward or sideways dependencies.                                                   | ESLint error         |
| **R4** | `backend/**` must never import `frontend/` or `src/` (`@/**`).                                                                                                                  | ESLint error         |
| **R5** | UI code may call application-layer query functions and session guards (`@backend/lib/session`, `@backend/lib/*-queries`, domain libs). This is the sanctioned way to read data. | Convention + review  |
| **R6** | ORM row types must not leak into `frontend/` components; components consume view types exported by `backend/lib`.                                                               | ESLint + code review |
| **R7** | Server actions (`backend/actions/**`) own commands (writes); read models live in `backend/lib/` query modules.                                                                  | Convention + review  |

Enforcement lives in `eslint.config.mjs`: a UI block (R1/R2/R3 widened to `@/**`), a `backend/lib` block (R3 + R4), a `backend/tests` block (R4 only, tests may import generated types as harnesses), and a remaining-`backend/**` block (R2 + R4).

---

## 2.1 Key Architecture Conventions

These rules bind every contributor and every automated agent working on this plan:

1. **Extraction, not rewriting.** Move each page's `db.*` call into a named exported function in `backend/lib` verbatim: identical `where`, `include`, `select`, `orderBy`, `take`. No behavior, query-shape, JSX, or styling changes.

2. **Module placement.** Prefer the existing domain module when one clearly owns the feature (`catalog.ts`, `cart.ts`, `chat.ts`, `inbox.ts`, `wallet.ts`, `rider-dashboard.ts`, `sales-orders.ts`, `support-dashboard.ts`, `hrm*.ts`, `dispatch-manifests.ts`, `stock-transfers.ts`, `admin-dashboard.ts`, `ops-intelligence.ts`, ...). Otherwise create a new module named `backend/lib/<feature>-queries.ts` (read models) or `backend/lib/<feature>.ts`.

3. **Naming.** Query functions use `getX` / `listX` / `searchX` verbs and take explicit parameters (ids, filters, paging). No implicit cookie/params reads inside query modules unless the function already exists in a settings/session lib.

4. **Serialization stays put.** Query modules return the same row shapes pages receive today (Prisma payloads). Mapping to view models is a later, separate concern (R6 applies only to `frontend/**` components).

5. **`server-only`.** New query modules start with `import "server-only";`. Modules also imported from client components (enums, money, constants) must not.

6. **Pages keep their guards.** `getCurrentUser()`, `requireAdminPage()` etc. stay in pages/layouts — they are application-layer calls, not persistence.

7. **Derived display logic stays in the page** (e.g. "Paid / Part paid / Unpaid" labels) unless the same rule is already exported by a policy module.

---

## 3. Migration Status: Complete (Phases 0-6 done)

All 99 `src/app` files (plus the 1 `frontend` file) that imported `@backend/lib/db` have been migrated. `scripts/boundary-worklist.mjs` reports **0 remaining boundary violations**; the evidence artifact is `.phase4-worklist.json`.

### Clusters:

| Cluster | Scope                                                                                        | Lib module(s)                                                                                |
| ------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| A       | `src/app/(store)/account/**`                                                                 | `account-queries.ts` (extended)                                                              |
| B       | admin people: customers, users, wallets, feedback, reviews, careers                          | `admin-people-queries.ts`, `users-queries.ts`                                                |
| C       | admin merch: products, promotions, campaigns, purchase-orders, suppliers, brands, categories | `admin-catalog-queries.ts`, `admin-promotion-queries.ts`, `products-queries.ts`              |
| D       | admin orders/fulfillment: orders, pack, pick, dispatch, shipments, payments, reconciliation  | `admin-orders-queries.ts`                                                                    |
| E       | admin logistics + warehouse pages                                                            | `admin-logistics-queries.ts`, `warehouse-queries.ts`                                         |
| F       | rider (7 pages) + sales (5 pages)                                                            | `rider-queries.ts`, `sales-queries.ts`, `cod-collection-queries.ts`                          |
| G       | support (7) + hrm (5) + storefront (career, products, order result)                          | `support-queries.ts`, `hrm.ts` / `hrm-*.ts` (extended), `store-page-queries.ts`              |
| H       | API route handlers, `sitemap.ts`, layouts (account, support, hrm)                            | existing domain libs (`admin-dashboard.ts`, `ops-intelligence.ts`, `owner-insights.ts`, ...) |

Notes on deltas from the original plan table:

- Cluster C's products page reads moved to `products-queries.ts`; campaigns/promotions to `admin-promotion-queries.ts`; the remaining admin merch surface to `admin-catalog-queries.ts`.
- A provisional `hrm-queries.ts` was created and then deleted: its only consumer was a dead warehouse lookup removed from `hrm/page.tsx`. HRM reads live in the existing `hrm.ts` / `hrm-*.ts` modules.
- There is no `dashboard-data.ts`; the admin overview reads `admin-dashboard.ts`, `ops-intelligence.ts`, `owner-insights.ts`, and `warehouse-queries.ts`.

### Verification Results (at close-out):

| Check                   | Status                                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript**          | ✅ `npm run typecheck` passes (`tsc --noEmit`, exit 0)                                                                                              |
| **ESLint**              | ✅ `npm run lint` passes (exit 0) with R1-R4 boundary rules active                                                                                  |
| **Boundary worklist**   | ✅ `scripts/boundary-worklist.mjs` → 0 violations (`.phase4-worklist.json`)                                                                         |
| **ORM reference sweep** | ✅ zero `@backend/lib/db` / `prisma-client` / `new PrismaClient` in `src/` + `frontend/`                                                            |
| **Prettier**            | ⚠️ `npm run format:check` fails only on files already dirty at HEAD (hrm pages, 4 admin `route.ts` handlers) plus untracked `e2e/`/playwright files |
| **Tests**               | ✅ `npm run test:ci` passes — all 33 suites, ~350 tests, 0 failures (PostgreSQL with `CREATEDB`)                                                    |

### Migration Conventions Followed

All migrations follow the plan's exact conventions:

- ✅ **Verbatim `db.*` call extraction** into `backend/lib` query modules
- ✅ **Explicit parameters** (no implicit cookie/params reads inside query modules)
- ✅ **Preserved query shapes** (no behavior, query-shape, JSX, or styling changes)
- ✅ **ESLint boundary enforcement** (R1-R4 rules)
- ✅ **`server-only`** on every new query module
- ✅ **Pages keep their guards** (`getCurrentUser()`, `requireAdminPage()` remain in pages/layouts)
- ✅ **Derived display logic stays in the page** (unless already exported by a policy module)
- ✅ **No cache directives added** — any `"use cache"` introduced during extraction on previously-uncached reads/mutations was reverted

---

## 4. File Structure Overview

### `backend/lib/` - Query modules and infrastructure adapters

**Query modules created or extended by the migration:**

- `account-queries.ts`, `store-page-queries.ts` - storefront/account reads
- `admin-people-queries.ts`, `users-queries.ts` - admin people/users reads
- `admin-catalog-queries.ts`, `admin-promotion-queries.ts`, `products-queries.ts` - admin merch reads
- `admin-orders-queries.ts` - admin orders/fulfillment reads
- `admin-logistics-queries.ts`, `warehouse-queries.ts` - logistics/warehouse reads
- `rider-queries.ts`, `cod-collection-queries.ts` - rider reads
- `sales-queries.ts`, `support-queries.ts` - sales/support reads
- `hrm.ts`, `hrm-*.ts`, `catalog.ts`, `chat.ts`, `setup.ts`, ... - existing domain modules extended in place

**Existing infrastructure adapters:**

- `db.ts` - Prisma client adapter (only importable from `backend/lib/**` and server actions)
- `enums.mjs` - Shared enums (also re-exports `ContactChannel` for R2-compliant UI imports)
- `mail.ts`, `sms.ts`, `sslcommerz.ts`, `pathao-adapter.ts`, `redx-adapter.ts`, `steadfast-adapter.ts` - Infrastructure adapters

### `backend/actions/` - Server actions (commands)

`account.ts`, `admin.ts`, `auth.ts`, `cart.ts`, `checkout.ts`, `hrm.ts`, `inventory.ts`, `notify.ts`, `payments.ts`, `promotions.ts`, `rider.ts`, `sales.ts`, `warehouse.ts`, ... (full list: `backend/actions/`)

### `backend/prisma/` - Schema and migrations

- `schema.prisma`, migration files

### `src/app/` - Presentation / transport (Next.js App Router)

- All pages import from `@backend/lib/*` query modules or server actions
- No direct ORM imports anywhere under `src/`

### `frontend/` - UI components

- Storefront/admin/rider components, i18n — no ORM imports

### `docs/clean-architecture-plan.md` - Plan document

- Full assessment, target architecture, dependency rules, audit findings, conventions, phases, risks, and follow-ups; closed out at completion

---

## 5. Migration Summary

### What Was Done

- **Phases 0-3** (plan, dead-code cleanup, UI-layer fixes, ESLint boundary enforcement) completed in earlier waves.
- **Phase 4**: all 100 ORM-importing UI files migrated across 8 clusters (A-H) via parallel waves; queries extracted verbatim into `backend/lib`.
- **Phase 5**: `npm run typecheck` and `npm run lint` both pass with zero violations; boundary worklist reports 0 remaining violations; test suites run as the final gate.
- **Phase 6**: README architecture section rewritten (layer table, dependency rule, ESLint enforcement); this document and the plan document closed out.

### How the Code Migration Follows the Plan

1. **Verbatim `db.*` call extraction** into `backend/lib` query modules
2. **Explicit parameters** (no implicit cookie/params reads inside query modules)
3. **Preserved query shapes** (no behavior or query-shape changes)
4. **ESLint boundary enforcement** (R1-R4 rules fail the build on any new direct ORM import from UI code)
5. **`server-only`** on all new query modules
6. **Pages keep their guards** (`getCurrentUser()`, `requireAdminPage()` etc. remain in pages/layouts)
7. **Derived display logic stays in the page** (unless already exported by a policy module)

### Remaining Work (recorded, not in scope)

- Split `backend/actions/admin.ts` (58 KB) into per-feature action modules
- Move the one remaining `type { Prisma }` usage in `src/app/support/orders/page.tsx` behind a lib view type (currently a type-only import, permitted by R2)
- Consider view-model mapping (`Prisma.XGetPayload` → explicit DTOs) so R2 can be tightened to a full ban of `@backend/generated/**` in UI code
- Reformat the files that were already Prettier-dirty at HEAD (hrm pages, 4 admin `route.ts` handlers) — deliberately left untouched to keep this refactor's diff reviewable

---

## 6. Commands & Verification

### Verification Commands

```bash
# TypeScript check
npm run typecheck

# ESLint check (includes R1-R4 boundary rules)
npm run lint

# Regenerate the boundary evidence artifact
node scripts/boundary-worklist.mjs

# Test suites (require PostgreSQL with CREATEDB)
npm run test:ci    # business-rule suites exercise backend/lib directly
```

### Key Files

| File                                  | Purpose                                            |
| ------------------------------------- | -------------------------------------------------- |
| `docs/clean-architecture-plan.md`     | Plan document, closed out at completion            |
| `eslint.config.mjs`                   | R1-R4 boundary rules                               |
| `scripts/boundary-worklist.mjs`       | Regenerates `.phase4-worklist.json` (0 violations) |
| `backend/lib/admin-orders-queries.ts` | Cluster D - admin orders reads                     |
| `backend/lib/admin-people-queries.ts` | Cluster B - admin people reads                     |
| `backend/lib/rider-queries.ts`        | Cluster F - rider reads                            |
| `backend/lib/products-queries.ts`     | Cluster C - products list reads                    |
| `backend/lib/users-queries.ts`        | Cluster B - admin users reads                      |

---

**Migration Status: Complete**

All Phase 4 clusters were migrated following the plan's conventions. The project now enforces dependency rules R1-R4 (no direct ORM imports from `src/app/` or `frontend/`, no upward dependencies from `backend/lib`), `npm run typecheck` passes, and `npm run lint` passes with zero violations.
