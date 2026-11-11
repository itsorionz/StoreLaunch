import type { Prisma, PrismaClient } from "@backend/generated/prisma/client";
import {
  Roles,
  EmploymentTypes,
  EmployeeStatuses,
  AttendanceStatuses,
  LeaveTypes,
  LeaveStatuses,
  EmployeeDocumentKinds,
} from "@backend/lib/enums.mjs";
import { bdStartOfDay, bdDayKey } from "./admin-dashboard-periods";
import bcrypt from "bcryptjs";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * HRM demo data (docs/hrm-plan.md). Onboards the seeded staff accounts onto
 * the employee roll, adds a probation and an exited employee plus one staff
 * account left un-onboarded on purpose, and fills the last two weeks with
 * attendance, leave, payroll runs, reviews and documents.
 *
 * Dates follow the same Bangladesh-midnight convention the HRM libs use, and
 * every piece is idempotent: re-running the seed never duplicates records.
 * Never imported from a "server-only" module — `npm run db:seed` runs outside
 * the react-server condition.
 */

const DAY = 86400000;

/** "YYYY-MM-DD" → the BD-midnight instant, mirroring hrm.ts's bdDateFromKey. */
function bdDate(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return bdStartOfDay(new Date(Date.UTC(year, month - 1, day)));
}

/** A "HH:MM" wall-clock time on an already-BD-midnight day instant. */
function at(day: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(day.getTime() + hours * 3600000 + minutes * 60000);
}

const MINIMAL_PDF = new TextEncoder().encode(
  "%PDF-1.4\n" +
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
    "trailer<</Size 4/Root 1 0 R>>\n%%EOF\n",
);

type SeedEmployee = {
  email: string;
  password?: string;
  name: string;
  role: (typeof Roles)[keyof typeof Roles];
  designation: string;
  department: string;
  employmentType: (typeof EmploymentTypes)[keyof typeof EmploymentTypes];
  status: (typeof EmployeeStatuses)[keyof typeof EmployeeStatuses];
  joinDate: string;
  probationEndDate?: string;
  exitDate?: string;
  salaryTaka?: number;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  notes?: string;
};

// The staff accounts seeded by seed-data.ts (support, warehouse, sales and the
// manager) are onboarded as employees; nusrat joins on probation, imran shows
// the exited state, and hasan stays a plain staff account so the "not on the
// roll" onboarding prompt has content.
const employees: SeedEmployee[] = [
  {
    email: "support@store.storelaunch.com",
    name: "Tanvir Hasan",
    role: Roles.Support,
    designation: "Support Lead",
    department: "Support",
    employmentType: "FullTime",
    status: "Active",
    joinDate: "2024-11-10",
    salaryTaka: 28000,
    emergencyContactName: "Sabina Yasmin",
    emergencyContactPhone: "01711111111",
    notes: "Handles escalations and the support portal.",
  },
  {
    email: "warehouse@store.storelaunch.com",
    name: "Rahim Uddin",
    role: Roles.Warehouse,
    designation: "Warehouse Executive",
    department: "Warehouse",
    employmentType: "FullTime",
    status: "Active",
    joinDate: "2025-03-01",
    salaryTaka: 22000,
    emergencyContactName: "Karim Uddin",
    emergencyContactPhone: "01822222222",
  },
  {
    email: "sales@store.storelaunch.com",
    name: "Farhana Akter",
    role: Roles.Sales,
    designation: "Sales Executive",
    department: "Sales",
    employmentType: "FullTime",
    status: "Active",
    joinDate: "2025-06-15",
    salaryTaka: 25000,
    emergencyContactName: "Nasrin Akter",
    emergencyContactPhone: "01933333333",
  },
  {
    email: "nusrat@store.storelaunch.com",
    password: "nusrat1234",
    name: "Nusrat Jahan",
    role: Roles.Support,
    designation: "Operations Manager",
    department: "Operations",
    employmentType: "FullTime",
    status: "Probation",
    joinDate: isoDaysAgo(45),
    probationEndDate: isoDaysAgo(-45),
    salaryTaka: 32000,
    emergencyContactName: "Jahid Jahan",
    emergencyContactPhone: "01544444444",
    notes: "Onboarding buddy: Tanvir Hasan.",
  },
  {
    email: "imran@store.storelaunch.com",
    password: "imran1234",
    name: "Imran Kabir",
    role: Roles.Sales,
    designation: "Sales Executive",
    department: "Sales",
    employmentType: "Contract",
    status: "Exited",
    joinDate: "2025-01-05",
    exitDate: isoDaysAgo(30),
    emergencyContactName: "Ruma Kabir",
    emergencyContactPhone: "01655555555",
    notes: "Contract ended; record kept for payroll history.",
  },
  {
    // The Manager account from seed-data.ts, onboarded so /hrm has content
    // for the manager@store.storelaunch.com login.
    email: "manager@store.storelaunch.com",
    name: "Operations Manager",
    role: Roles.Manager,
    designation: "Operations Manager",
    department: "Management",
    employmentType: "FullTime",
    status: "Active",
    joinDate: "2024-08-01",
    salaryTaka: 45000,
    emergencyContactName: "Sadia Rahman",
    emergencyContactPhone: "01755555555",
    notes: "Runs the HRM portal; no /admin access.",
  },
];

function isoDaysAgo(count: number): string {
  return bdDayKey(new Date(bdStartOfDay().getTime() - count * DAY));
}

function monthKeyOf(value: Date): string {
  return bdDayKey(value).slice(0, 7);
}

function previousMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return `${month === 1 ? year - 1 : year}-${String(month === 1 ? 12 : month - 1).padStart(2, "0")}`;
}

async function nextEmployeeCode(prisma: Db): Promise<string> {
  const count = await prisma.employee.count();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `EMP-${String(count + 1 + attempt).padStart(4, "0")}`;
    const clash = await prisma.employee.findFirst({
      where: { employeeCode: code },
      select: { id: true },
    });
    if (!clash) return code;
  }
  return `EMP-${Date.now().toString(36).toUpperCase()}`;
}

export async function seedHrm(prisma: PrismaClient) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Demo HRM seeding is disabled in production. Onboard real employees through /hrm.",
    );
  }

  const now = new Date();
  const admin = await prisma.user.findUnique({ where: { email: "admin@store.storelaunch.com" } });
  const settings = await prisma.storeSettings.findUnique({ where: { singletonKey: 1 } });
  const currencyCode = settings?.currencyCode ?? "BDT";

  // ----- employees ---------------------------------------------------------
  const seeded: { employee: SeedEmployee; id: string }[] = [];
  for (const plan of employees) {
    let user = await prisma.user.findUnique({ where: { email: plan.email } });
    if (!user && plan.password) {
      const passwordHash = await bcrypt.hash(plan.password, 10);
      user = await prisma.user.create({
        data: {
          email: plan.email,
          name: plan.name,
          passwordHash,
          roles: [Roles.Customer, plan.role],
        },
      });
    }
    if (!user) continue; // seeded staff account absent — nothing to onboard

    const existing = await prisma.employee.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (existing) {
      seeded.push({ employee: plan, id: existing.id });
      continue;
    }

    const created = await prisma.employee.create({
      data: {
        employeeCode: await nextEmployeeCode(prisma),
        userId: user.id,
        designation: plan.designation,
        department: plan.department,
        employmentType: plan.employmentType,
        status: plan.status,
        joinDate: bdDate(plan.joinDate),
        probationEndDate: plan.probationEndDate ? bdDate(plan.probationEndDate) : null,
        exitDate: plan.exitDate ? bdDate(plan.exitDate) : null,
        monthlySalaryCents: plan.salaryTaka ? plan.salaryTaka * 100 : null,
        emergencyContactName: plan.emergencyContactName ?? null,
        emergencyContactPhone: plan.emergencyContactPhone ?? null,
        notes: plan.notes ?? null,
      },
    });
    seeded.push({ employee: plan, id: created.id });
  }

  // A staff account deliberately left un-onboarded so the Employees page and
  // the HRM overview show the "not on the roll" onboarding prompt.
  const pendingEmail = "hasan@store.storelaunch.com";
  const pendingExists = await prisma.user.findUnique({ where: { email: pendingEmail } });
  if (!pendingExists) {
    const passwordHash = await bcrypt.hash("hasan1234", 10);
    await prisma.user.create({
      data: {
        email: pendingEmail,
        name: "Hasan Mridha",
        passwordHash,
        roles: [Roles.Customer, Roles.Warehouse],
      },
    });
  }

  // ----- attendance (last two weeks, working days only) --------------------
  const today = bdStartOfDay(now);
  const onRoll = seeded.filter(
    (row) =>
      row.employee.status === EmployeeStatuses.Active ||
      row.employee.status === EmployeeStatuses.Probation,
  );
  // Approved leave days for Rahim; the attendance board marks them Leave.
  const rahimLeaveDays = new Set([11, 12]);

  for (const row of onRoll) {
    const already = await prisma.attendanceRecord.count({ where: { employeeId: row.id } });
    if (already) continue;

    const records: Prisma.AttendanceRecordCreateManyInput[] = [];
    for (let ago = 13; ago >= 0; ago--) {
      const day = bdStartOfDay(new Date(today.getTime() - ago * DAY));
      const weekday = new Date(day.getTime() + 6 * 3600000).getUTCDay();
      if (weekday === 5) continue; // Friday is the weekend

      const base = { employeeId: row.id, date: day, markedById: admin?.id ?? null };

      if (row.employee.email === "warehouse@store.storelaunch.com" && rahimLeaveDays.has(ago)) {
        records.push({ ...base, status: AttendanceStatuses.Leave });
      } else if (ago % 9 === 4) {
        // A half day every so often, with morning-only hours.
        records.push({
          ...base,
          status: AttendanceStatuses.HalfDay,
          checkInAt: at(day, "09:30"),
          checkOutAt: at(day, "14:00"),
          workedMinutes: 270,
        });
      } else if (ago === 6 && row.employee.email === "sales@store.storelaunch.com") {
        records.push({ ...base, status: AttendanceStatuses.Absent });
      } else {
        const late = ago % 7 === 3;
        records.push({
          ...base,
          status: AttendanceStatuses.Present,
          checkInAt: at(day, late ? "10:15" : "09:30"),
          checkOutAt: at(day, "18:00"),
          workedMinutes: late ? 465 : 510,
          note: late ? "Traffic delay on the way in." : null,
        });
      }
    }
    if (records.length)
      await prisma.attendanceRecord.createMany({ data: records, skipDuplicates: true });
  }

  // ----- leave -------------------------------------------------------------
  for (const row of seeded) {
    const already = await prisma.leaveRequest.count({ where: { employeeId: row.id } });
    if (already) continue;

    if (row.employee.email === "warehouse@store.storelaunch.com") {
      // Approved sick leave matching the Leave-marked attendance days above.
      await prisma.leaveRequest.create({
        data: {
          employeeId: row.id,
          type: LeaveTypes.Sick,
          startDate: bdDate(isoDaysAgo(12)),
          endDate: bdDate(isoDaysAgo(11)),
          reason: "Seasonal fever — resting at home.",
          status: LeaveStatuses.Approved,
          decidedById: admin?.id ?? null,
          decidedAt: new Date(today.getTime() - 13 * DAY),
        },
      });
    } else if (row.employee.email === "sales@store.storelaunch.com") {
      // A pending request starting soon, for the approve/reject demo.
      await prisma.leaveRequest.create({
        data: {
          employeeId: row.id,
          type: LeaveTypes.Annual,
          startDate: bdDate(isoDaysAgo(-5)),
          endDate: bdDate(isoDaysAgo(-7)),
          reason: "Family trip to Sylhet.",
          status: LeaveStatuses.Pending,
        },
      });
    } else if (row.employee.email === "support@store.storelaunch.com") {
      // A rejected request, so all three decision states appear in the list.
      await prisma.leaveRequest.create({
        data: {
          employeeId: row.id,
          type: LeaveTypes.Casual,
          startDate: bdDate(isoDaysAgo(35)),
          endDate: bdDate(isoDaysAgo(35)),
          reason: "Short-notice day off during the sale week.",
          status: LeaveStatuses.Rejected,
          decidedById: admin?.id ?? null,
          decidedAt: new Date(today.getTime() - 36 * DAY),
        },
      });
    }
  }

  // ----- payroll -----------------------------------------------------------
  const salaried = onRoll.filter((row) => row.employee.salaryTaka);
  const monthKey = monthKeyOf(today);
  const previousKey = previousMonthKey(monthKey);

  for (const [key, fullyPaid] of [
    [previousKey, true],
    [monthKey, false],
  ] as const) {
    const month = bdDate(`${key}-01`);
    const exists = await prisma.payrollRun.findUnique({ where: { month }, select: { id: true } });
    if (exists) continue;
    if (!salaried.length) continue;

    const paidAt = new Date(today.getTime() - 2 * DAY);
    await prisma.payrollRun.create({
      data: {
        month,
        currencyCode,
        createdByById: admin?.id ?? null,
        payslips: {
          create: salaried.map((row) => {
            const base = row.employee.salaryTaka! * 100;
            // Demo adjustments on the current month's draft run.
            const allowances =
              !fullyPaid && row.employee.email === "sales@store.storelaunch.com" ? 150000 : 0;
            const deductions =
              !fullyPaid && row.employee.email === "warehouse@store.storelaunch.com" ? 50000 : 0;
            return {
              employeeId: row.id,
              baseSalaryCents: base,
              allowancesCents: allowances,
              deductionsCents: deductions,
              netCents: base + allowances - deductions,
              note: allowances ? "Transport allowance" : deductions ? "Late-arrival fine" : null,
              paidAt: fullyPaid ? paidAt : null,
            };
          }),
        },
      },
    });
  }

  // ----- performance reviews ----------------------------------------------
  const reviewPlan: Record<string, { rating: number; summary: string }> = {
    "support@store.storelaunch.com": {
      rating: 5,
      summary:
        "Ticket response time is the fastest on the team; customers frequently mention her by name.",
    },
    "warehouse@store.storelaunch.com": {
      rating: 4,
      summary: "Pick accuracy is solid. Aim to standardise shelf labelling next quarter.",
    },
    "sales@store.storelaunch.com": {
      rating: 3,
      summary: "Good walker-in conversion; needs more focus on follow-ups for repeat orders.",
    },
    "nusrat@store.storelaunch.com": {
      rating: 4,
      summary: "First-month probation check-in: picked up the ops tooling quickly.",
    },
  };
  for (const row of seeded) {
    const plan = reviewPlan[row.employee.email];
    if (!plan || !admin) continue;
    const already = await prisma.performanceReview.count({ where: { employeeId: row.id } });
    if (already) continue;
    await prisma.performanceReview.create({
      data: {
        employeeId: row.id,
        reviewerId: admin.id,
        periodStart: bdDate(isoDaysAgo(120)),
        periodEnd: bdDate(isoDaysAgo(30)),
        rating: plan.rating,
        summary: plan.summary,
        strengths: "Punctual, communicates blockers early.",
        improvements: "Document repeat processes so backups can cover.",
        goals: "Own one recurring report by next quarter.",
      },
    });
  }

  // ----- documents ---------------------------------------------------------
  for (const row of seeded) {
    const already = await prisma.employeeDocument.count({ where: { employeeId: row.id } });
    if (already) continue;

    await prisma.employeeDocument.create({
      data: {
        employeeId: row.id,
        kind: EmployeeDocumentKinds.Contract,
        title: "Employment contract",
        url: `https://example.com/contracts/${row.employee.email.split("@")[0]}.pdf`,
      },
    });
    if (row.employee.email === "sales@store.storelaunch.com") {
      // A stored file so the admin-only download route has something to stream.
      await prisma.employeeDocument.create({
        data: {
          employeeId: row.id,
          kind: EmployeeDocumentKinds.Tax,
          title: "Tax certificate (placeholder)",
          fileName: "tax-certificate.pdf",
          mimeType: "application/pdf",
          bytes: MINIMAL_PDF,
        },
      });
    }
  }
}
