# HRM (Human Resource Management) Plan

> Perspective: the admin user **is the business owner** managing the team that runs
> the store. HRM answers five questions on one screen depth away: **who works here,
> who is here today, who is off, what do I owe them this month, and how are they
> doing?** It closes the gap between "accounts that can log in" and "employees I
> manage" — hiring already exists (`/admin/careers`) but "Hired" is currently a
> dead-end status with nowhere to go.

> **Implementation status — see §7 Completion record** (appended when this plan
> ships).

## 1. Current state (audit findings)

Staff reality today, spread across unrelated surfaces:

1. **Staff = `User` with a role** (`Admin`, `CustomerService`, `WarehouseKeeper`,
   `SalesRep` — since renamed to `Admin`, `Support`, `Warehouse`, `Sales`, plus
   the later `Manager`, see §8) managed ad hoc at `/admin/users` — list, filter,
   activate/suspend.
   Nothing records that a person _works here_: no designation, department, join
   date, salary, or emergency contact.
2. **No attendance.** Who showed up is untracked; no source of truth for the
   month, no rate, no history.
3. **No leave.** Time off exists only as a conversation; approved/declined leave is
   unrecorded, so attendance and payroll have nothing to reconcile against.
4. **No payroll.** The only money attached to staff is `User.commissionBps` (sales
   commission rate); base salary, allowances, deductions and monthly pay runs do
   not exist. The owner cannot see monthly people cost.
5. **No performance history.** Reviews, if they happen, live in the owner's head.
6. **No employee documents.** Contracts and ID papers live outside the system.
7. **Hiring is an island.** `CareerApplication` status `Hired` leads nowhere —
   there is no handoff from candidate to employee.
8. **Riders are separate by design.** `Rider` is a delivery-partner record with its
   own console (`/admin/riders`) and availability; they are contractors, not staff.

Scope decision: **HRM covers internal staff only** (users with staff roles). Riders
stay under Delivery.

## 2. Design principles

- **One person, one record.** An `Employee` links to exactly one staff `User`
  (unique); no parallel identities, no account-less employees. Onboarding can
  create the staff account when one does not exist yet.
- **Admin-only, by construction.** Every HRM page and action runs behind
  `requireAdminPage` / `requireAdmin` — payroll and salaries never reach other
  portals.
- **Money in integer cents, store currency** — same convention as everywhere;
  payroll runs are stamped with the store currency of their month.
- **Days are Bangladesh calendar days** — leave and attendance use date-only
  records consistent with the existing `bdStartOfDay` conventions.
- **Attendance is recorded, not inferred.** The owner (or a delegate at the
  keyboard) marks the day; the system computes rates, summaries and payroll-ready
  months. No biometric/portal clock-in fiction.
- **Hiring → employment continuity.** A `Hired` application can seed an employee
  (prefill + link), so the recruiting pipeline ends in the HRM registry.
- **Same design system.** `PageHeader`, `card`, `StatusBadge`, `input`, tokens;
  English-only admin chrome (consistent with the rest of `/admin`).

## 3. Data model (new Prisma schema)

Enums:

| Enum               | Values                                                              |
| ------------------ | ------------------------------------------------------------------- |
| `EmploymentType`   | `FullTime`, `PartTime`, `Contract`, `Intern`                        |
| `EmployeeStatus`   | `Active`, `Probation`, `Exited`                                     |
| `AttendanceStatus` | `Present`, `HalfDay`, `Absent`, `Leave`                             |
| `LeaveType`        | `Annual`, `Sick`, `Casual`, `Unpaid`, `Other`                       |
| `LeaveStatus`      | `Pending`, `Approved`, `Rejected`, `Cancelled`                      |
| `DocumentKind`     | `Contract`, `NationalId`, `Passport`, `Tax`, `Certificate`, `Other` |

Models (relations abbreviated):

- **`Employee`** — `employeeCode` (unique, `EMP-0001`…), `userId` (unique →
  `User`), `designation`, `department`, `employmentType`, `status`, `joinDate`,
  `probationEndDate?`, `exitDate?`, `monthlySalaryCents?`,
  `emergencyContactName?`, `emergencyContactPhone?`, `notes?`,
  `applicationId?` (unique → `CareerApplication`, SetNull). Children:
  attendance, leaves, payslips, reviews, documents.
- **`AttendanceRecord`** — `employeeId`, `date`, `status`, `checkInAt?`,
  `checkOutAt?`, `workedMinutes?`, `note?`, `markedById?`;
  `@@unique([employeeId, date])`, index on `date`.
- **`LeaveRequest`** — `employeeId`, `type`, `startDate`, `endDate`, `reason`,
  `status`, `decidedById?`, `decidedAt?`; indexes on `[status, startDate]`.
- **`PayrollRun`** — `month` (first of month, unique), `currencyCode`, `note?`,
  `createdByById?`. Children: payslips. Run status is **derived** (all payslips
  paid → Paid, else Draft) — no stored status to drift.
- **`Payslip`** — `runId`, `employeeId`, `baseSalaryCents`, `allowancesCents`,
  `deductionsCents`, `netCents` (= base + allowances − deductions, computed
  server-side), `note?`, `paidAt?`; `@@unique([runId, employeeId])`.
- **`PerformanceReview`** — `employeeId`, `reviewerId` (admin), `periodStart`,
  `periodEnd`, `rating` (1–5), `summary?`, `strengths?`, `improvements?`,
  `goals?`.
- **`EmployeeDocument`** — `employeeId`, `kind`, `title`, `fileName?`,
  `mimeType?`, `bytes?`, `url?` (either a stored PDF/image or an external link).

## 4. Backend surface

| Function / action                                                       | Returns / does                                                                                                | Sources                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `createEmployee(input)`                                                 | employee + optional new staff `User` (role chosen, bcrypt password); assigns `employeeCode`                   | `User`, `Employee`      |
| `updateEmployee(id, input)`                                             | profile edits, status/exit transitions (revoke nothing — account stays at `/admin/users`)                     | `Employee`              |
| `getEmployeeProfile(id)`                                                | employee + user + 30-day attendance summary, leave history, payslips, reviews, documents                      | all HRM tables          |
| `listEmployees(filters)`                                                | rows + counts; also surfaces staff users not yet onboarded                                                    | `Employee`, `User`      |
| `markAttendance(input)` / `bulkMark(date, rows)`                        | upsert per employee/day, computes `workedMinutes` from check-in/out                                           | `AttendanceRecord`      |
| `getAttendanceBoard(date)` / `getMonthGrid(ym)`                         | per-employee day status; month grid with per-type counts and rate                                             | `AttendanceRecord`      |
| `requestLeave(input)`                                                   | validates range + rejects overlap with Pending/Approved leave                                                 | `LeaveRequest`          |
| `decideLeave(id, status)`                                               | Approved/Rejected by admin, records decider + timestamp                                                       | `LeaveRequest`          |
| `generatePayrollRun(month)`                                             | one run per month; payslips for Active/Probation employees with a salary; refuses regen                       | `PayrollRun`, `Payslip` |
| `savePayslipAdjustments(id, …)`                                         | allowances/deductions/note before payment; recomputes `netCents`                                              | `Payslip`               |
| `markPayslipPaid(id)` / `markRunPaid(runId)`                            | sets `paidAt`; `markRunPaid` pays every unpaid line                                                           | `Payslip`               |
| `deleteDraftRun(id)`                                                    | only while no line is paid                                                                                    | `PayrollRun`            |
| `savePerformanceReview(input)`                                          | rating bounded 1–5, reviewer = acting admin                                                                   | `PerformanceReview`     |
| `addEmployeeDocument` / `deleteEmployeeDocument` / `streamDocument(id)` | PDF/image ≤ 5 MB stored as bytes, or external URL; admin-streamed download                                    | `EmployeeDocument`      |
| `getHrmOverview()`                                                      | headcount, present/absent/on-leave today, pending leave, month attendance rate, people cost MTD, recent joins | aggregates              |
| `onboardFromApplication(applicationId, input)`                          | seeds employee (prefill) from a `Hired` application and links it                                              | `CareerApplication`     |

Server actions live in `backend/actions/hrm.ts` (all `requireAdmin`, zod-validated,
`validationFailure` on bad input, `revalidatePath` on success) — same shape as
`backend/actions/account-status.ts`.

## 5. Work packages

### WP1 — Schema, enums, migration

New models/enums above; `backend/prisma` migration (`npm run db:migrate`);
re-export the new enums from `backend/lib/enums.mjs` (house pattern).

### WP2 — Employee registry (`/hrm/employees`)

List with filters (q / department / employment type / status), "Add employee"
(onboard existing staff user **or** create a staff account), profile page
`/hrm/employees/[id]` with inline edit, status transitions and all child
sections. Staff users not yet onboarded appear with a one-click onboard link.

### WP3 — Attendance (`/hrm/attendance`)

Date board: one row per active employee with status select + optional
check-in/check-out times, per-row save; "mark all present" shortcut; month grid
(`?month=YYYY-MM`) with per-status counts and the month's attendance rate.

### WP4 — Leave (`/hrm/leave`)

Request form (employee, type, range, reason), list with status filter,
approve/reject actions, overlap + range validation, per-year taken counts by type
on the employee profile.

### WP5 — Payroll (`/hrm/payroll`)

Generate the month's run from salaries, payslip lines with editable
allowances/deductions, totals, mark line/run paid, delete a fully-draft run,
currency stamped from store settings. `/hrm/payroll/[id]` run detail.

### WP6 — Performance & documents

Review form (period, 1–5 rating, summary/strengths/improvements/goals) + list;
document upload (PDF/image ≤ 5 MB or URL), admin-only download stream, delete.
Both embedded on the employee profile; reviews also have `/hrm/performance`.

### WP7 — Overview & hiring handoff

`/hrm` KPI page (headcount, today's attendance, pending leave, month rate,
people cost MTD, recent joins) and the Careers → HRM bridge: `Hired` applications
link to `/hrm/employees/new?applicationId=…` (prefill + link). New nav
group **HRM**: Overview · Employees · Attendance · Leave · Payroll · Performance.

### WP8 — Tests

`backend/tests/hrm.test.ts` (same harness as other report tests) covering:
employee uniqueness/linking rules and code assignment; attendance upsert +
month rate math; leave range/overlap validation and decision transitions;
payroll generation (eligible employees only, one run per month), net math and
payment states; review rating bounds; overview aggregates.
`npm run test:hrm` added to scripts and to `test:ci`.

## 6. Out of scope (candidates for a later pass)

- **Commission-in-payroll** — `commissionBps` exists, but no commission _policy_
  (which order statuses pay, on subtotal or total) is defined yet; payslips stay
  salary-only until the owner defines the rule.
- Rider employment (contractors stay under Delivery), shift scheduling, overtime,
  leave accrual balances (policy-driven), bonuses/tax structures, HR documents
  e-sign, self-service employee portal (HRM is admin-entered), HRM for
  non-admin roles (support/warehouse consoles), i18n of admin chrome.

## 7. Completion record

**Shipped 2026-10-31 — all 8 work packages implemented and verified.**

### What landed

- **WP1 — schema/migration**: 6 enums (`EmploymentType`, `EmployeeStatus`,
  `AttendanceStatus`, `LeaveType`, `LeaveStatus`, `EmployeeDocumentKind`), 7 models
  (`Employee`, `AttendanceRecord`, `LeaveRequest`, `PayrollRun`, `Payslip`,
  `PerformanceReview`, `EmployeeDocument`), back-relations on `User` and
  `CareerApplication`; migration `20261031052031_hrm` applied; enums re-exported
  from `backend/lib/enums.mjs` (`EmploymentTypes`, `EmployeeStatuses`,
  `AttendanceStatuses`, `LeaveTypes`, `LeaveStatuses`, `EmployeeDocumentKinds`).
  Note: `prisma migrate dev` did **not** regenerate the client here — always run
  `npm run db:generate` after schema changes.
- **WP2 — registry** (`backend/lib/hrm.ts`): `createEmployee` links an existing
  staff account **or** creates one (`roles: [Customer, role]`, bcrypt cost 10);
  `updateEmployee` (exit requires an exit date); `listEmployees` (filters +
  `pendingStaff` = staff users not yet on roll); `getEmployeeProfile`;
  `EMP-0001…` codes with clash-retry assignment; unique both ways (`userId`,
  `applicationId` SetNull).
- **WP3 — attendance** (`backend/lib/hrm-attendance.ts`): per employee-day
  upsert, `workedMinutes` derived, future dates and inverted times refused,
  mark-all-present fills only unmarked rows, month grid with rate =
  (Present + 0.5×HalfDay) ÷ non-leave records.
- **WP4 — leave** (`backend/lib/hrm-leave.ts`): inclusive BD-day ranges, overlap
  check against Pending/Approved only (rejected leave stops blocking),
  decide-once transitions recording decider + timestamp.
- **WP5 — payroll** (`backend/lib/hrm-payroll.ts`): one run per month (unique
  month instant), lines for Active/Probation employees with a stored salary,
  net = base + allowances − deductions (≥ 0 enforced), paid lines lock against
  edits and re-payment, run status **derived** from lines (all paid → Paid),
  draft-only deletion, currency stamped from store settings at generation.
- **WP6 — performance + documents** (`hrm-performance.ts`, `hrm-documents.ts`):
  rating bounded 1–5, period cannot predate the join date; PDF/JPEG/PNG/WebP
  ≤ 5 MB stored as bytes or a `safeLink` URL; admin-only download stream at
  `/api/admin/employee-documents/[id]`.
- **WP7 — overview & handoff** (`hrm-insights.ts`): `getHrmOverview` powers
  `/hrm` (headcount, today, pending leave, month rate, people cost MTD,
  recent joiners, not-onboarded staff count); `Hired` applications on
  `/admin/careers/[id]` link to `/hrm/employees/new?applicationId=…`
  (name/email prefilled, employee linked back — and “View employee record in
  HRM” once linked); nav group **HRM** (Overview · Employees · Attendance ·
  Leave · Payroll · Performance) added before Store.
- **WP8 — tests**: `backend/tests/hrm.test.ts` (14 tests), `test:hrm` script,
  appended to `test:ci`.

### Pages

`/hrm` · `/hrm/employees` (filters + pending-staff onboarding) ·
`/hrm/employees/new` (`?userId=` / `?applicationId=` presets, link-or-create) ·
`/hrm/employees/[id]` (edit + 30-day attendance + leave + payslips +
reviews + documents) · `/hrm/attendance` (`?date=` board, `?month=` grid) ·
`/hrm/leave` · `/hrm/payroll` · `/hrm/payroll/[id]` ·
`/hrm/performance`.

### Bugs found & fixed during implementation/verification

1. **`bdTimeOn` hour math** — hours were multiplied by 60 000 instead of
   3 600 000, so "09:30" landed 39 minutes after midnight, which also inverted
   check-in/check-out ordering and failed every timed attendance save. Caught by
   the first `test:hrm` run; fixed and pinned by the worked-minutes assertion
   (510 min for 09:30→18:00).
2. **Exited edits unreachable** — `saveEmployee` parsed the create schema
   (Active/Probation only) before checking for the edit `id`, so marking an
   employee Exited never reached `updateEmployee`. Fixed by branching on `id`
   first.
3. **Month label off by one** — the payroll list used
   `run.month.toISOString().slice(0, 7)`; BD-midnight instants fall on the
   previous UTC day, rendering the October run as "2026-09". Switched to
   `bdDayKey(run.month)`.
4. **`hrmOptionalDate` wasn't optional** — its refine accepted "" but the
   inferred type required the key; `.optional()` added.
5. **Render-time side effect** — leave-request-form called `router.refresh()`
   during render; moved into `useEffect`.
6. **Ref write during render** — the attendance board's `dateRef` pattern was
   flagged by `react-hooks/refs` and was unnecessary; removed.
7. **Export mismatches** — `bdDayKey` re-exported from `hrm.ts` (pages import
   it there); the leave page now takes `LeaveStatuses` from `enums.mjs`.

### Verification (2026-10-31)

- `npm run typecheck` — clean · `npm run lint` — clean ·
  `npx prettier --check` over all HRM files — clean
- `npm run test:hrm` — **14/14** · `npm run test:owner-insights` — 6/6
  (no regression from the `enums.mjs` additions)

### Small deviations from §3–§4

- `PayrollRun` stores no status column (as planned) — `getPayrollRun(s)` derive
  Draft/Paid from paid lines.
- The create path allows only Active/Probation; `Exited` is reachable solely
  through the update path (which requires the exit date then).
- `onboardFromApplication` is folded into `createEmployee(applicationId)` —
  same rules (Hired-only, exclusive link), one entry point.

### §8 — Role refinement, Manager role and the /hrm portal move (2026-10-31)

Department-style role names replaced the old ones in the database:
`CustomerService` → **Support**, `WarehouseKeeper` → **Warehouse**,
`SalesRep` → **Sales** (enum migration with existing rows, signed sessions and
stored evidence remapped). A new **Manager** role was added: Admin and Manager
share the `/hrm` portal (every route in this document moved out of the admin
shell), while `/admin` stays strictly Admin. See
`docs/role-hrm-manager-plan.md` for the full plan.
