# Plan — Department-style roles + `Manager` role + HRM portal (`/hrm`)

Status: **APPROVED — implementation in progress.** (Original working copy: `.opencode/plan/role-hrm-manager-plan.md`.)
Repo baseline: initial-commit; all HRM/seed work is uncommitted (staged/untracked).

## 1. Goal

1. **Add a `Manager` role** that can access the full HRM suite.
2. **Refine role names to department-style names**, persisted in the database:

   | Old value (DB + code) | New value                | Portal / purpose           |
   | --------------------- | ------------------------ | -------------------------- |
   | `Customer`            | `Customer` _(unchanged)_ | Storefront account         |
   | `Admin`               | `Admin` _(unchanged)_    | `/admin` full back-office  |
   | `Rider`               | `Rider` _(unchanged)_    | `/rider`                   |
   | `CustomerService`     | **`Support`**            | `/support`                 |
   | `WarehouseKeeper`     | **`Warehouse`**          | `/warehouse`               |
   | `SalesRep`            | **`Sales`**              | `/sales`                   |
   | _(new)_               | **`Manager`**            | `/hrm` (shared with Admin) |

3. **Move HRM out of `/admin/hrm` into a new `/hrm` portal** accessible to `Admin` and `Manager`
   only, following the existing per-portal pattern (`/support`, `/sales`, `/warehouse` each have a
   layout + `requireXPage` guard + login redirect).

## 2. Decisions (confirmed with user)

- **Manager access:** new `/hrm` portal for `Admin | Manager`; `/admin` stays strictly `Admin`.
- **DB rename strategy:** **recreate-enum migration with data preserved** (no `@map` aliases, no
  wipe). Old rows in `User.roles`, `SupportTicketNote.authorRole`, `ChatMessage.senderRole` and the
  string columns `AuditLog.actorRole`, `CodCollection.collectedByRole` are remapped via `CASE`.
- **Scope note:** `Manager` gets full HRM powers (employees, attendance, leave, payroll,
  performance, documents) but **no** `/admin` access. Managers are not role-locked to `/hrm`
  (consistent with `Sales`/`Warehouse` staff who also browse the storefront).

## 3. Why recreate-enum (not `ALTER TYPE ... RENAME VALUE`)

`ALTER TYPE ... RENAME VALUE` **cannot run inside a transaction block** in PostgreSQL, and Prisma
applies migrations transactionally. The robust path is: create new type → swap columns with a
`CASE` copy → drop old type → rename new type. (Dev DB, small row counts — safe.)

---

## 4. Work phases

### P1 — Schema + migration + client regeneration

1. `backend/prisma/schema.prisma` `enum Role` (line 10) →
   `{ Customer, Admin, Rider, Support, Warehouse, Sales, Manager }` (drop the three old names).
2. Create the migration by hand so data is preserved:
   - `npx prisma migrate dev --create-only --name role_department_names` (Prisma 7, config in
     `prisma.config.ts`), then **replace the generated SQL body** with a script that:
     1. `CREATE TYPE "Role_new" AS ENUM ('Customer','Admin','Rider','Support','Warehouse','Sales','Manager');`
     2. **`User.roles` (array):** `ADD COLUMN roles_new "Role_new"[]` →
        `UPDATE … SET roles_new = ARRAY(SELECT (CASE r::text WHEN 'CustomerService' THEN 'Support'
WHEN 'WarehouseKeeper' THEN 'Warehouse' WHEN 'SalesRep' THEN 'Sales' ELSE r::text
END)::"Role_new" FROM unnest(roles) r)` → drop old col → rename →
        `ALTER COLUMN roles SET DEFAULT '{Customer}'` (default is lost with the dropped column).
     3. **Scalar enum cols:** `SupportTicketNote.authorRole` (schema:288), `ChatMessage.senderRole`
        (schema:300, has `@@index([conversationId, senderRole, readAt])`) — same add/copy/drop/
        rename dance; **recreate the `senderRole` index** (dropping the column drops its index).
     4. **String cols holding role names:** `UPDATE "AuditLog" SET "actorRole" = CASE …` and
        `UPDATE "CodCollection" SET "collectedByRole" = CASE …` (same three-way mapping).
     5. `DROP TYPE "Role"; ALTER TYPE "Role_new" RENAME TO "Role";`
   - Apply: `npm run db:migrate` (script = `prisma migrate dev && prisma generate`); if the
     create-only flow is used, still run **`npm run db:generate`** afterwards (migrate does not
     auto-generate in this repo).
3. `backend/lib/enums.mjs` — extend `legacyRoleNames` (line 84) with
   `CustomerService → Roles.Support`, `WarehouseKeeper → Roles.Warehouse`, `SalesRep → Roles.Sales`
   so JWT sessions issued **before** the migration still normalize (otherwise every logged-in user
   is force-logged-out by `getCurrentUser`'s `account.roles.includes(session.user.role)` check).

### P2 — Guards & shared types (`backend/lib/session.ts`)

1. `CurrentUser.role` union (lines 10–16): rename the three members, add
   `| typeof Roles.Manager`.
2. New guards:
   ```ts
   export async function requireHrm(): Promise<CurrentUser>; // action guard: Admin|Manager else throw "Unauthorized"
   export async function requireHrmPage(): Promise<CurrentUser>; // page guard: → /login?callbackUrl=/hrm, else → "/"
   ```
   Place next to `requireAdmin` / `requireAdminPage`; keep `requireAdmin*` untouched for `/admin`.
3. `backend/lib/hrm.ts` `STAFF_ROLES` (line 29) → `[Admin, Support, Warehouse, Sales, Manager]`
   (Manager must be employable). Update the doc comment if it names roles.

### P3 — Portal move: `/admin/hrm` → `/hrm`

1. **Move route tree** `src/app/admin/hrm/**` (9 pages) → `src/app/hrm/**`.
2. **New `src/app/hrm/layout.tsx`** — model on `src/app/support/layout.tsx` (sidebar + mobile bar +
   logout + theme), guard = `requireHrmPage()`, header badge/title "HRM", sub-label by role
   ("Admin" / "Manager"). Search: render `AppSearch` with `SearchContexts.admin` **only for Admin**;
   Manager gets no search box (admin search results deep-link to `/admin` pages they can't open).
3. **New `frontend/components/hrm/hrm-nav.tsx`** — the 6 HRM links (Overview, Employees,
   Attendance, Leave, Payroll, Performance), mirroring `admin-nav.tsx` lines 82–87; add a mobile
   bottom nav like `ServiceBottomNav`. (Reuse icons from `admin-nav`.)
4. **Page guards:** in all 9 moved pages replace `requireAdminPage` → `requireHrmPage`; update
   `metadata.title` strings that say "Admin" → "HRM".
5. **Hrefs / revalidation sweep** (`/admin/hrm` → `/hrm`, 87 grep hits):
   - `backend/actions/hrm.ts`: 18 `revalidatePath`/`revalidateHrm` paths (lines 42–47, 71–228) +
     swap **all 15 `requireAdmin()` → `requireHrm()`** (import from session).
   - Page-internal links: `src/app/hrm/**` (overview, employees, attendance, leave, payroll,
     performance — see grep hits in old `admin/hrm` pages).
   - `frontend/components/admin/hrm/employee-form.tsx` (lines 60–61), `payroll-controls.tsx`
     (line 119) → `router.push("/hrm/…")`.
   - `src/app/admin/careers/[id]/page.tsx` (lines 139, 146) → `/hrm/employees/…` (Admin-only
     page linking into the shared portal).
   - `frontend/components/admin/admin-nav.tsx` HRM group (lines 82–87): keep the group, repoint
     hrefs to `/hrm/…` (Admin keeps one-click access; clicking leaves the admin shell).
   - `backend/lib/hrm-insights.ts` comment (line 12), `backend/lib/seed-hrm.ts` error text
     (line 174): `/admin/hrm` → `/hrm`.
6. **Legacy path redirect:** add `redirects()` in `next.config.ts`
   `{ source: '/admin/hrm/:path*', destination: '/hrm/:path*', permanent: false }`
   (if no `redirects()` exists yet, add one; fallback = a single stub page under
   `src/app/admin/hrm/[[...rest]]/page.tsx` that calls `redirect("/hrm")`).

### P4 — Login, routing, i18n

1. `backend/actions/auth.ts`:
   - `landingFor` (line 50): `if (role === Roles.Manager) return "/hrm";`
   - `loginDestination` (line 64): add `/hrm` to the guarded-area test —
     `… || (inArea("/hrm") && role !== Roles.Admin && role !== Roles.Manager)`.
   - `selectLoginRoleAction` whitelist (lines 120–127): today it only accepts
     `Customer/Admin/Rider/CustomerService` — **`Warehouse`/`Sales` are already rejected here (existing bug)**.
     Replace with the full role set: `Customer, Admin, Rider, Support, Warehouse, Sales, Manager`.
2. `backend/lib/login.ts` `consumeLoginProof` whitelist (lines 83–91): rename three, add `Manager`.
   (`availableRoles` derives from `user.roles` — no change.)
3. `backend/lib/auth.ts` line 21: `Roles.CustomerService` → `Roles.Support`.
4. `frontend/components/auth/auth-forms.tsx`:
   - `LoginRole` union (lines 22–28): rename + add `Roles.Manager`.
   - Role-choice label ternary (lines 277–283) — currently **falls through to "Admin" for
     Warehouse/Sales (existing bug)**; replace with a `Record<LoginRole, string>` lookup covering
     all 7 roles.
5. i18n dicts `frontend/i18n/en.ts` (~219) + `frontend/i18n/bn.ts` (~222): rename
   `roleCustomerService` → `roleSupport` ("Customer Service" / "কাস্টমার সার্ভিস"), add
   `roleWarehouse`, `roleSales`, `roleManager`.
6. `src/proxy.ts`:
   - Auth-gate path list (lines 95–100): add `pathname.startsWith("/hrm")`.
   - `roleLockedTo` (line 112): **no Manager lock** — only rename the `Roles.CustomerService`
     comparison to `Roles.Support`.
7. `src/app/(store)/layout.tsx` `ServiceLock` (line 20): `Roles.CustomerService` → `Roles.Support`.
   No Manager lock (Manager browses the store like Sales/Warehouse staff).

### P5 — Repo-wide rename sweep

Mechanical replace of the three identifiers (verify with grep until **0 hits** outside
`generated/`, `docs/` historical plans, and this plan):

- `Roles.CustomerService` → `Roles.Support` · `Roles.WarehouseKeeper` → `Roles.Warehouse` ·
  `Roles.SalesRep` → `Roles.Sales`
- Known files (from the 98-hit grep; do not trust this list alone — re-grep):
  `backend/lib/{chat, support-tickets, support-dashboard, order-events, login, sales-commission,
sales-orders, seed-data, seed-hrm, seed-demo-data, session, hrm}.ts`,
  `backend/actions/*.ts`, `src/proxy.ts`, `src/app/(store)/layout.tsx`,
  `frontend/components/admin/**` (incl. `add-support-agent-modal.tsx`),
  `src/app/admin/**` (users page, dashboards), `backend/tests/*.ts` + `screens-browser.mjs`.
- **Keep as-is:** identifiers that merely contain the words (`getService`, `ServiceNav`,
  `requireServicePage`, support-portal file names) — renaming them is out of scope.
- `order-events.ts` actor union (lines 10–14): rename members only (Manager never writes order
  events; add it only if typecheck demands).
- `src/app/admin/users/page.tsx`: `roleLabel()` camel-splits — "Support"/"Sales"/"Manager"
  display cleanly with **no change**; `z.enum(Roles)` and the role-filter dropdown update via
  regeneration. Double-check any hardcoded label text ("Customer Service" in the Add-agent modal).

### P6 — Seeds

1. `backend/lib/seed-data.ts` (lines 450, 469, 489, 509): rename role arrays; **add a demo
   Manager account** — `manager@store.local` / `manager1234`, `roles: [Customer, Manager]`
   (matches existing seed style; password hashing + activation identical to the other staff).
2. `backend/lib/seed-hrm.ts`:
   - Employee `role:` fields (lines 75, 89, 102, 116, 132) + line 240 → new names.
   - Onboard the Manager as a 6th employee (e.g. `employeeCode EMP-0006`, designation
     "Operations Manager", department "Management", `Active`, a join date + salary in taka) so
     `/hrm` has content when logged in as the Manager. Attendance/leave/payroll rows are **not**
     required for the Manager.
   - Error message line 174 → `/hrm`.
3. `backend/lib/seed-demo-data.ts` (lines 127, 133): rename.
4. Idempotency: `npm run db:seed` twice → identical counts (existing property of these seeds).

### P7 — Tests

1. Rename roles in every test referencing them: `hrm`, `support-tickets`, `support-dashboard`,
   `chat`, `login-sms` (auth whitelist!), `order-*`, `admin-dashboard`, `screens-browser.mjs`,
   and any others found by the final grep.
2. `backend/tests/hrm.test.ts`: update session mocks for `requireHrm`; **add cases**:
   - Manager can invoke an HRM action (create/update path) — allowed.
   - `Customer` / `Rider` / `Support` invoking the same action → Unauthorized.
   - Manager attempting `requireAdmin()`-guarded action (e.g. account deactivation) → Unauthorized.
3. `backend/tests/login-sms.test.ts`: cover `consumeLoginProof` accepting `Manager` and the
   updated `selectLoginRoleAction` whitelist (incl. the previously-broken `Warehouse`/`Sales`).

### P8 — Docs

1. `docs/hrm-plan.md`: global path replace `/admin/hrm` → `/hrm`; append a §8 note:
   "Role refinement (Support/Warehouse/Sales) + `Manager` role + `/hrm` portal move — see
   `docs/role-hrm-manager-plan.md`."
2. Historical plan docs (`docs/sales-representative-plan.md` permission matrix etc.): **leave
   old names** (they describe the state at the time) — optionally add a one-line footnote.

### P9 — Verification (run in order)

```text
npm run typecheck
npm run lint
npx prettier --check <all touched files>        # --write if needed
npm run db:migrate                              # applies role_department_names + regenerates client
npm run db:seed                                 # twice → identical counts
npm run test:hrm
npm run test:auth
npm run test:ci                                 # full suite before calling it done
```

Manual smoke (dev server):

- `admin@store.local` → `/admin`, HRM group navigates to `/hrm/…` and back.
- `manager@store.local` → lands on `/hrm`; **cannot** open `/admin` (redirects to `/`); can run
  payroll/leave decisions.
- `support@store.local` → `/support`; `keeper@store.local` → `/warehouse`;
  `sales@store.local` → `/sales`; customer → storefront.
- Multi-role login choice screen shows correct labels for every role (no "Admin" fallthrough).
- `/admin/hrm/anything` → redirects to `/hrm/...`.
- Old sessions (issued pre-migration) still resolve via `normalizeRole` legacy map.

## 5. Risks & edge cases

| Risk                                                                 | Mitigation                                                                                                        |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Enum swap drops defaults/indexes                                     | Script re-sets `roles` default `{Customer}` and recreates the `senderRole` index (P1)                             |
| Pre-migration JWTs carry old role names                              | `normalizeRole` legacy map extended (P1.3)                                                                        |
| `selectLoginRoleAction`/label bugs already exist for Warehouse/Sales | Fixed as part of P4 (whitelist + label map)                                                                       |
| Manager reaching admin-only search results                           | Search box rendered for Admin only in `/hrm` layout (P3.2)                                                        |
| Forgetting a rename site                                             | Final `grep -E "CustomerService\|WarehouseKeeper\|SalesRep"` must return 0 outside `generated/` + historical docs |
| Migration + code drift                                               | Land schema, migration, and code in the same change; `db:migrate` = `migrate dev && generate`                     |

## 6. Out of scope

- Renaming portal-internal identifiers (`ServiceNav`, `requireServicePage`, support file names).
- Giving Manager any non-HRM permission (`/admin`, ops editing, careers approval).
- Role-permission matrix refactor (stays hardcoded in guards).
- Committing (repo baseline is uncommitted; implementation agent commits only if the user asks).

## 7. Completion record

_(Appended during implementation — see bottom of file.)_
