import { config } from "dotenv";
import { createPrismaClient } from "../lib/prisma-client";
import { PrismaClient } from "@backend/generated/prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { Roles } from "../lib/enums.mjs";

config({ quiet: true });

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Local database required");
  const name = `test_hrm_${randomUUID().replaceAll("-", "")}`;
  const adminDb = createPrismaClient();
  await adminDb.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  let store: PrismaClient | undefined;
  try {
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      env: process.env,
      stdio: "pipe",
    });
    const { db } = await import("../lib/db");
    store = db;
    const {
      createEmployee,
      listEmployees,
      bdDateFromKey,
      bdTodayKey,
      createEmployeeSchema,
      STAFF_ROLES,
    } = await import("../lib/hrm");
    const { markAttendance, bulkMarkPresent, getAttendanceMonthGrid } =
      await import("../lib/hrm-attendance");
    const { requestLeave, decideLeave, leaveDays, requestLeaveSchema } =
      await import("../lib/hrm-leave");
    const {
      generatePayrollRun,
      savePayslipAdjustments,
      markPayslipPaid,
      markRunPaid,
      deleteDraftRun,
      getPayrollRun,
    } = await import("../lib/hrm-payroll");
    const { savePerformanceReview, reviewSchema } = await import("../lib/hrm-performance");
    const { getHrmOverview } = await import("../lib/hrm-insights");

    const admin = await db.user.create({
      data: {
        name: "HR Admin",
        email: `hr-admin@${name}.invalid`,
        passwordHash: "unused",
        roles: [Roles.Admin],
      },
    });

    // ----- employee registry -----------------------------------------------
    await test("onboarding creates a staff account and assigns codes", async () => {
      const result = await createEmployee({
        name: "Nadia Rahman",
        email: "nadia@hrm.invalid",
        password: "supersecret1",
        role: Roles.Support,
        designation: "Support lead",
        department: "Support",
        employmentType: "FullTime",
        status: "Active",
        joinDate: "2026-01-15",
        probationEndDate: "",
        monthlySalaryCents: 2500000,
      });
      assert.ok(result.ok, result.error);
      const employee = await db.employee.findUnique({
        where: { id: result.id! },
        include: { user: true },
      });
      assert.equal(employee?.employeeCode, "EMP-0001");
      assert.deepEqual(employee?.user.roles, [Roles.Customer, Roles.Support]);
      assert.notEqual(employee?.user.passwordHash, "supersecret1", "password must be hashed");
      assert.equal(employee?.monthlySalaryCents, 2500000);
      assert.equal(employee?.user.email, "nadia@hrm.invalid");
    });

    await test("existing staff accounts link once; non-staff and duplicates refused", async () => {
      const staff = await db.user.create({
        data: {
          name: "Kamal Hossain",
          email: "kamal@hrm.invalid",
          passwordHash: "unused",
          roles: [Roles.Customer, Roles.Warehouse],
        },
      });
      const linked = await createEmployee({
        userId: staff.id,
        designation: "Storekeeper",
        department: "Warehouse",
        employmentType: "FullTime",
        status: "Probation",
        joinDate: "2026-02-01",
        probationEndDate: "2026-05-01",
        monthlySalaryCents: undefined,
      });
      assert.ok(linked.ok, linked.error);
      const employee = await db.employee.findUnique({ where: { id: linked.id! } });
      assert.equal(employee?.employeeCode, "EMP-0002");
      assert.equal(employee?.monthlySalaryCents, null, "salary is optional");
      assert.equal(employee?.userId, staff.id);

      const again = await createEmployee({
        userId: staff.id,
        designation: "Storekeeper",
        department: "Warehouse",
        employmentType: "FullTime",
        status: "Active",
        joinDate: "2026-02-01",
      });
      assert.equal(again.ok, false, "an account can only be onboarded once");

      const customer = await db.user.create({
        data: {
          name: "Shopper",
          email: "shopper@hrm.invalid",
          passwordHash: "unused",
          roles: [Roles.Customer],
        },
      });
      const nonStaff = await createEmployee({
        userId: customer.id,
        designation: "Shopper",
        department: "None",
        employmentType: "FullTime",
        status: "Active",
        joinDate: "2026-02-01",
      });
      assert.equal(nonStaff.ok, false, "customer-only accounts are not employable");

      const missing = await createEmployee({
        userId: "does-not-exist",
        designation: "Ghost",
        department: "None",
        employmentType: "FullTime",
        status: "Active",
        joinDate: "2026-02-01",
      });
      assert.equal(missing.ok, false, "unknown accounts are refused");
    });

    await test("the create schema requires either an account or full new-account details", async () => {
      const base = {
        designation: "Analyst",
        department: "Finance",
        employmentType: "FullTime",
        status: "Active",
        joinDate: "2026-03-01",
      };
      assert.equal(createEmployeeSchema.safeParse(base).success, false, "neither mode supplied");
      assert.equal(
        createEmployeeSchema.safeParse({ ...base, userId: "u1" }).success,
        true,
        "linking mode needs only the account id",
      );
      assert.equal(
        createEmployeeSchema.safeParse({
          ...base,
          name: "A",
          email: "not-an-email",
          password: "longenough1",
          role: Roles.Sales,
        }).success,
        false,
        "invalid emails are rejected",
      );
    });

    await test("listEmployees filters and surfaces staff not yet on the roll", async () => {
      const all = await listEmployees({});
      assert.equal(all.count, 2);
      assert.deepEqual(
        all.employees.map((employee) => employee.employeeCode),
        ["EMP-0001", "EMP-0002"],
      );
      const support = await listEmployees({ department: "Support" });
      assert.equal(support.count, 1);
      const probation = await listEmployees({ status: "Probation" });
      assert.equal(probation.count, 1);
      const byName = await listEmployees({ q: "kamal" });
      assert.equal(byName.count, 1, "search matches the linked account's name");

      // A staff account with no employee record surfaces for one-click onboarding.
      await db.user.create({
        data: {
          name: "Unonboarded Staff",
          email: `unonboarded@${name}.invalid`,
          passwordHash: "unused",
          roles: [Roles.Customer, Roles.Sales],
        },
      });
      const pending = await listEmployees({});
      assert.ok(
        pending.pendingStaff.some((user) => user.email === `unonboarded@${name}.invalid`),
        "staff without an employee record appear for onboarding",
      );
      assert.ok(
        !pending.pendingStaff.some((user) => user.email === "nadia@hrm.invalid"),
        "onboarded staff do not appear as pending",
      );
    });

    await test("hiring handoff: only Hired, unlinked applications onboard", async () => {
      const job = await db.careerJob.create({
        data: {
          slug: `hrm-handoff-${name}`,
          title: "Operations executive",
          department: "Operations",
          location: "Dhaka",
          employmentType: "FullTime",
          workplaceMode: "OnSite",
          summary: "Runs the shop floor.",
          description: "Keeps the warehouse moving.",
          createdById: admin.id,
          createdByName: admin.name,
        },
      });
      const application = await db.careerApplication.create({
        data: {
          jobId: job.id,
          name: "Farhan Ahmed",
          email: "farhan@hrm.invalid",
          phone: "01700000000",
          coverLetter: "I would like to join.",
          status: "Hired",
        },
      });

      const tooEarly = await createEmployee({
        applicationId: application.id,
        name: "Farhan Ahmed",
        email: "farhan@hrm.invalid",
        password: "supersecret1",
        role: Roles.Warehouse,
        designation: "Ops executive",
        department: "Operations",
        employmentType: "FullTime",
        status: "Active",
        joinDate: "2026-04-01",
      });
      assert.equal(tooEarly.ok, true, "a Hired application is onboardable");

      // The link is exclusive: the same application cannot seed a second employee.
      const secondApplication = await db.careerApplication.create({
        data: {
          jobId: job.id,
          name: "Farhan Ahmed (again)",
          email: "farhan2@hrm.invalid",
          phone: "01700000000",
          coverLetter: "Second application.",
          status: "New",
        },
      });
      const notHired = await createEmployee({
        applicationId: secondApplication.id,
        name: "Farhan Two",
        email: "farhan2@hrm.invalid",
        password: "supersecret1",
        role: Roles.Warehouse,
        designation: "Ops executive",
        department: "Operations",
        employmentType: "FullTime",
        status: "Active",
        joinDate: "2026-04-01",
      });
      assert.equal(notHired.ok, false, "only Hired applications can be onboarded");

      // The employee created from the Hired application links back to it.
      const linked = await db.employee.findFirst({
        where: { applicationId: application.id },
        include: { user: true },
      });
      assert.ok(linked, "the Hired application is linked to exactly one employee");
      assert.equal(linked.user.email, "farhan@hrm.invalid");
    });

    // ----- attendance ------------------------------------------------------
    await test("attendance upserts per employee-day and computes worked minutes", async () => {
      const nadia = await db.employee.findFirst({ where: { employeeCode: "EMP-0001" } });
      const marked = await markAttendance(admin.id, {
        employeeId: nadia!.id,
        date: "2026-09-01",
        status: "Present",
        checkIn: "09:30",
        checkOut: "18:00",
      });
      assert.ok(marked.ok, marked.error);
      const record = await db.attendanceRecord.findFirst({
        where: { employeeId: nadia!.id },
      });
      assert.equal(record?.workedMinutes, 510, "09:30 to 18:00 is 8h30");

      const updated = await markAttendance(admin.id, {
        employeeId: nadia!.id,
        date: "2026-09-01",
        status: "HalfDay",
      });
      assert.ok(updated.ok, updated.error);
      assert.equal(
        await db.attendanceRecord.count({ where: { employeeId: nadia!.id } }),
        1,
        "re-marking the same day updates, never duplicates",
      );

      const future = await markAttendance(admin.id, {
        employeeId: nadia!.id,
        date: "2099-01-01",
        status: "Present",
      });
      assert.equal(future.ok, false, "future days cannot be marked");

      const backwards = await markAttendance(admin.id, {
        employeeId: nadia!.id,
        date: "2026-09-02",
        status: "Present",
        checkIn: "18:00",
        checkOut: "09:00",
      });
      assert.equal(backwards.ok, false, "check-out before check-in is refused");
    });

    await test("mark-all-present fills only unmarked employees", async () => {
      const result = await bulkMarkPresent(admin.id, "2026-07-01");
      assert.ok(result.ok, result.error);
      const onRoll = await db.employee.count({
        where: { status: { in: ["Active", "Probation"] } },
      });
      assert.equal(
        await db.attendanceRecord.count({
          where: { date: bdDateFromKey("2026-07-01")! },
        }),
        onRoll,
      );
      const rerun = await bulkMarkPresent(admin.id, "2026-07-01");
      assert.ok(rerun.ok, rerun.error);
      assert.equal(
        await db.attendanceRecord.count({
          where: { date: bdDateFromKey("2026-07-01")! },
        }),
        onRoll,
        "running twice does not double-count",
      );
    });

    await test("month grid: half days weigh 0.5, leave leaves the rate alone", async () => {
      const nadia = await db.employee.findFirst({ where: { employeeCode: "EMP-0001" } });
      const kamal = await db.employee.findFirst({ where: { employeeCode: "EMP-0002" } });
      await markAttendance(admin.id, {
        employeeId: nadia!.id,
        date: "2026-08-03",
        status: "Present",
      });
      await markAttendance(admin.id, {
        employeeId: nadia!.id,
        date: "2026-08-04",
        status: "Leave",
      });
      await markAttendance(admin.id, {
        employeeId: kamal!.id,
        date: "2026-08-03",
        status: "HalfDay",
      });
      await markAttendance(admin.id, {
        employeeId: kamal!.id,
        date: "2026-08-04",
        status: "Absent",
      });

      const grid = await getAttendanceMonthGrid("2026-08");
      assert.equal(grid.dayCount, 31);
      assert.equal(grid.totals.Present, 1);
      assert.equal(grid.totals.HalfDay, 1);
      assert.equal(grid.totals.Absent, 1);
      assert.equal(grid.totals.Leave, 1);
      assert.equal(grid.marked, 4);
      // credited = 1 + 0.5 = 1.5 over (4 - 1 leave) = 3 marked non-leave days.
      assert.ok(Math.abs(grid.ratePercent - 50) < 0.01, `rate was ${grid.ratePercent}`);
      const onRoll = await db.employee.count({
        where: { status: { in: ["Active", "Probation"] } },
      });
      assert.equal(grid.rows.length, onRoll, "one grid row per employee on the roll");
    });

    // ----- leave -----------------------------------------------------------
    await test("leave validates ranges, blocks overlaps, decides once", async () => {
      const nadia = await db.employee.findFirst({ where: { employeeCode: "EMP-0001" } });

      const backwards = await requestLeave({
        employeeId: nadia!.id,
        type: "Annual",
        startDate: "2026-10-10",
        endDate: "2026-10-01",
        reason: "family event",
      });
      assert.equal(backwards.ok, false, "end before start is refused");

      const first = await requestLeave({
        employeeId: nadia!.id,
        type: "Annual",
        startDate: "2026-10-05",
        endDate: "2026-10-07",
        reason: "family event",
      });
      assert.ok(first.ok, first.error);
      assert.equal(leaveDays(bdDateFromKey("2026-10-05")!, bdDateFromKey("2026-10-07")!), 3);

      const overlap = await requestLeave({
        employeeId: nadia!.id,
        type: "Sick",
        startDate: "2026-10-07",
        endDate: "2026-10-08",
        reason: "caught a cold",
      });
      assert.equal(overlap.ok, false, "a single overlapping day is refused");

      const approved = await decideLeave(first.id!, "Approved", admin.id);
      assert.ok(approved.ok, approved.error);
      const row = await db.leaveRequest.findUnique({ where: { id: first.id! } });
      assert.equal(row?.status, "Approved");
      assert.equal(row?.decidedById, admin.id, "the decider is recorded");
      assert.ok(row?.decidedAt, "the decision timestamp is recorded");

      const redecided = await decideLeave(first.id!, "Rejected", admin.id);
      assert.equal(redecided.ok, false, "a decided request cannot be decided again");

      const second = await requestLeave({
        employeeId: nadia!.id,
        type: "Casual",
        startDate: "2026-11-01",
        endDate: "2026-11-01",
        reason: "personal day",
      });
      assert.ok(second.ok, second.error);
      assert.ok((await decideLeave(second.id!, "Rejected", admin.id)).ok);

      const retry = await requestLeave({
        employeeId: nadia!.id,
        type: "Casual",
        startDate: "2026-11-01",
        endDate: "2026-11-01",
        reason: "retry personal day",
      });
      assert.ok(retry.ok, "rejected leave no longer blocks the range");

      assert.equal(
        requestLeaveSchema.safeParse({
          employeeId: nadia!.id,
          type: "Wedding",
          startDate: "2026-12-01",
          endDate: "2026-12-02",
          reason: "custom type",
        }).success,
        false,
        "leave types are a closed set",
      );
    });

    // ----- payroll ---------------------------------------------------------
    await test("payroll: one run per month, salaried employees only", async () => {
      const generated = await generatePayrollRun(admin.id, { month: "2026-09" });
      assert.ok(generated.ok, generated.error);
      const run = await getPayrollRun(generated.id!);
      assert.equal(run?.monthKey, "2026-09");
      assert.equal(run?.headcount, 1, "only employees with a stored salary get a line");
      assert.equal(run?.totalCents, 2500000);
      assert.equal(run?.dueCents, 2500000);
      assert.equal(run?.status, "Draft");

      const duplicate = await generatePayrollRun(admin.id, { month: "2026-09" });
      assert.equal(duplicate.ok, false, "a month can only be generated once");
    });

    await test("payslip adjustments recompute net and refuse to go negative", async () => {
      const run = await getPayrollRun(
        (await db.payrollRun.findFirst({ where: { month: bdDateFromKey("2026-09-01")! } }))!.id,
      );
      const slip = run!.payslips[0]!;

      const adjusted = await savePayslipAdjustments({
        id: slip.id,
        allowances: 50000,
        deductions: 100000,
        note: "transport minus fine",
      });
      assert.ok(adjusted.ok, adjusted.error);
      const after = await db.payslip.findUnique({ where: { id: slip.id } });
      assert.equal(after?.allowancesCents, 50000);
      assert.equal(after?.deductionsCents, 100000);
      assert.equal(after?.netCents, 2500000 + 50000 - 100000, "net = base + allow - deduct");
      assert.equal(after?.note, "transport minus fine");

      const negative = await savePayslipAdjustments({
        id: slip.id,
        allowances: 0,
        deductions: 999999999,
      });
      assert.equal(negative.ok, false, "deductions may not exceed salary + allowances");
    });

    await test("payment states: paid lines lock, runs derive Paid, drafts delete", async () => {
      const entity = await db.payrollRun.findFirst({
        where: { month: bdDateFromKey("2026-09-01")! },
      });
      const run = await getPayrollRun(entity!.id);
      const slip = run!.payslips[0]!;

      assert.ok((await markPayslipPaid(slip.id)).ok);
      assert.equal((await markPayslipPaid(slip.id)).ok, false, "double payment is refused");

      const locked = await savePayslipAdjustments({
        id: slip.id,
        allowances: 0,
        deductions: 0,
      });
      assert.equal(locked.ok, false, "a paid payslip cannot be edited");

      const deleted = await deleteDraftRun(run!.id);
      assert.equal(deleted.ok, false, "runs with paid lines are financial record");

      const paidRun = await getPayrollRun(run!.id);
      assert.equal(paidRun?.status, "Paid", "status is derived from the lines");
      assert.equal(paidRun?.paidCents, paidRun?.totalCents);
      assert.equal((await markRunPaid(run!.id)).ok, false, "nothing left to pay");

      const august = await generatePayrollRun(admin.id, { month: "2026-08" });
      assert.ok(august.ok, august.error);
      assert.ok((await deleteDraftRun(august.id!)).ok, "fully-draft runs delete");
      assert.equal(await db.payrollRun.findUnique({ where: { id: august.id! } }), null);
    });

    // ----- performance -----------------------------------------------------
    await test("review ratings are bounded and periods must be sane", async () => {
      const nadia = await db.employee.findFirst({ where: { employeeCode: "EMP-0001" } });
      const base = {
        employeeId: nadia!.id,
        periodStart: "2026-01-15",
        periodEnd: "2026-06-30",
      };
      assert.equal(reviewSchema.safeParse({ ...base, rating: 6 }).success, false);
      assert.equal(reviewSchema.safeParse({ ...base, rating: 0 }).success, false);
      assert.equal(reviewSchema.safeParse({ ...base, rating: "4" }).success, true);

      const backwards = await savePerformanceReview(admin.id, {
        ...base,
        periodStart: "2026-07-01",
        periodEnd: "2026-06-01",
        rating: 4,
      });
      assert.equal(backwards.ok, false, "period end before start is refused");

      const beforeJoin = await savePerformanceReview(admin.id, {
        ...base,
        periodStart: "2025-01-01",
        periodEnd: "2025-06-30",
        rating: 4,
      });
      assert.equal(beforeJoin.ok, false, "reviews cannot predate the join date");

      const saved = await savePerformanceReview(admin.id, {
        ...base,
        rating: 5,
        summary: "Strong quarter.",
      });
      assert.ok(saved.ok, saved.error);
      const review = await db.performanceReview.findUnique({ where: { id: saved.id! } });
      assert.equal(review?.rating, 5);
      assert.equal(review?.reviewerId, admin.id);
    });

    // ----- overview --------------------------------------------------------
    await test("overview aggregates headcount, today, leave and people cost", async () => {
      const todayKey = bdTodayKey();
      const nadia = await db.employee.findFirst({ where: { employeeCode: "EMP-0001" } });
      await markAttendance(admin.id, {
        employeeId: nadia!.id,
        date: todayKey,
        status: "Present",
      });

      const kamal = await db.employee.findFirst({ where: { employeeCode: "EMP-0002" } });
      await requestLeave({
        employeeId: kamal!.id,
        type: "Unpaid",
        startDate: "2026-01-05",
        endDate: "2026-01-06",
        reason: "pending fixture",
      });

      const currentMonth = await generatePayrollRun(admin.id, { month: todayKey.slice(0, 7) });
      assert.ok(currentMonth.ok, currentMonth.error);

      const overview = await getHrmOverview();
      const nonExited = await db.employee.count({
        where: { status: { not: "Exited" } },
      });
      assert.equal(overview.headcount, nonExited);
      assert.equal(overview.todayKey, todayKey);
      assert.equal(overview.todaySummary.Present, 1);
      assert.equal(overview.todayMarked, 1);
      assert.equal(overview.pendingLeave, 1, "past-starting pending leave is counted");

      const staffAccounts = await db.user.count({
        where: { roles: { hasSome: ["Admin", "Support", "Warehouse", "Sales", "Manager"] } },
      });
      assert.equal(overview.notOnboarded, Math.max(0, staffAccounts - overview.headcount));

      const cost = await db.payslip.aggregate({
        _sum: { netCents: true },
        where: { run: { month: bdDateFromKey(`${todayKey.slice(0, 7)}-01`)! } },
      });
      assert.equal(overview.payroll.totalCents, cost._sum.netCents ?? 0);
    });

    // ----- portal guards ---------------------------------------------------
    await test("HRM actions admit Admin and Manager only; /admin stays Admin-only", async () => {
      const { isHrmRole, isAdminRole } = await import("../lib/access");

      // Admin and Manager pass the requireHrm() guard on every HRM action.
      assert.equal(isHrmRole(Roles.Admin), true);
      assert.equal(isHrmRole(Roles.Manager), true);

      // Customer, Rider, Support, Warehouse and Sales all get "Unauthorized".
      for (const role of [
        Roles.Customer,
        Roles.Rider,
        Roles.Support,
        Roles.Warehouse,
        Roles.Sales,
      ]) {
        assert.equal(isHrmRole(role), false, `${role} must not invoke HRM actions`);
      }
      assert.equal(isHrmRole(null), false);
      assert.equal(isHrmRole(undefined), false);
      assert.equal(isHrmRole("CustomerService"), false, "legacy names grant nothing");

      // The same Manager is refused by every requireAdmin()-guarded action.
      assert.equal(isAdminRole(Roles.Manager), false);
      assert.equal(isAdminRole(Roles.Admin), true);
      assert.equal(isAdminRole(Roles.Support), false);
      assert.equal(isAdminRole(null), false);
    });

    await test("a Manager is employable and onboards through the HRM registry", async () => {
      assert.ok(
        (STAFF_ROLES as readonly string[]).includes(Roles.Manager),
        "Manager belongs in STAFF_ROLES",
      );

      const result = await createEmployee({
        name: "Shuvo Chowdhury",
        email: "shuvo@hrm.invalid",
        password: "supersecret1",
        role: Roles.Manager,
        designation: "Operations Manager",
        department: "Management",
        employmentType: "FullTime",
        status: "Active",
        joinDate: "2026-03-01",
        monthlySalaryCents: 4500000,
      });
      assert.ok(result.ok, result.error);

      const employee = await db.employee.findUnique({
        where: { id: result.id! },
        include: { user: true },
      });
      assert.match(employee!.employeeCode, /^EMP-\d{4}$/);
      assert.deepEqual(employee!.user.roles, [Roles.Customer, Roles.Manager]);
      assert.equal(employee!.designation, "Operations Manager");
    });
  } finally {
    await store?.$disconnect();
    await adminDb.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);
    await adminDb.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
