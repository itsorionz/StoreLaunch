import "server-only";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "./db";
import { Roles, EmploymentTypes, EmployeeStatuses } from "./enums.mjs";
import { bdStartOfDay, bdDayKey } from "./admin-dashboard-periods";
export { bdStartOfDay, bdDayKey };
import {
  recordId,
  personName,
  emailAddress,
  passwordValue,
  shortText,
  optionalContactPhone,
} from "./form-validation";

const DAY = 86400000;

/**
 * HRM data layer (docs/hrm-plan.md).
 *
 * Employees are staff User accounts (one Employee per User, unique both ways);
 * riders and customers are out of scope. Everything here is invoked through the
 * Admin|Manager HRM guard, money is integer cents in the store currency, and
 * calendar days are Bangladesh days — the same day boundary the dashboards use.
 */

/** Roles that make a User employable; Customer and Rider never do. */
export const STAFF_ROLES = [
  Roles.Admin,
  Roles.Support,
  Roles.Warehouse,
  Roles.Sales,
  Roles.Manager,
] as const;

export type HrmResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  id?: string;
};

export const hrmFailure = (error: string, field?: string): HrmResult => ({
  ok: false,
  error: field ? undefined : error,
  fieldErrors: field ? { [field]: [error] } : undefined,
});

// ---------------------------------------------------------------------------
// Date helpers — form keys ("YYYY-MM-DD", "YYYY-MM", "HH:MM") to Bangladesh
// midnight/time instants, mirroring bdStartOfDay's +6h convention.
// ---------------------------------------------------------------------------

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY = /^\d{4}-\d{2}$/;
const TIME_KEY = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "2026-10-31" → the instant of 2026-10-31 00:00 Bangladesh time, or null. */
export function bdDateFromKey(key: string): Date | null {
  if (!DATE_KEY.test(key)) return null;
  const [year, month, day] = key.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day)
    return null;
  return bdStartOfDay(utc);
}

/** "2026-10" → Bangladesh midnight of the 1st, or null. */
export function bdMonthFromKey(key: string): Date | null {
  if (!MONTH_KEY.test(key)) return null;
  return bdDateFromKey(`${key}-01`);
}

/** A "HH:MM" wall-clock time placed on an already-BD-midnight day instant. */
export function bdTimeOn(day: Date, time: string): Date | null {
  const match = TIME_KEY.exec(time);
  if (!match) return null;
  return new Date(day.getTime() + Number(match[1]) * 3600000 + Number(match[2]) * 60000);
}

/** The Bangladesh-day key for today (attendance defaults). */
export function bdTodayKey(now = new Date()): string {
  return bdDayKey(bdStartOfDay(now));
}

export const hrmDate = z
  .string()
  .trim()
  .refine(
    (value) => value !== "" && bdDateFromKey(value) !== null,
    "Enter a valid date (YYYY-MM-DD)",
  );

export const hrmOptionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || bdDateFromKey(value) !== null, "Enter a valid date")
  .optional();

/** Taka decimal ("1500.00") → integer cents. Empty input drops out. */
export const takaAmount = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.coerce
    .number({ error: "Enter a valid amount" })
    .min(0, "Amount cannot be negative")
    .max(10000000, "Amount is too large")
    .transform((value) => Math.round(value * 100))
    .optional(),
);

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const employmentFields = {
  designation: z.string().trim().min(2, "Enter a designation").max(100),
  department: z.string().trim().min(1, "Enter a department").max(100),
  employmentType: z.enum(EmploymentTypes),
  joinDate: hrmDate,
  probationEndDate: hrmOptionalDate,
  monthlySalaryCents: takaAmount,
  emergencyContactName: z.union([shortText, z.literal("")]).optional(),
  emergencyContactPhone: optionalContactPhone,
  notes: z.string().trim().max(1000, "Use at most 1000 characters").optional(),
};

export const createEmployeeSchema = z
  .object({
    userId: z.string().trim().max(100).optional(),
    name: personName.optional(),
    email: emailAddress.optional(),
    password: passwordValue.optional(),
    role: z.enum(STAFF_ROLES).optional(),
    applicationId: z.string().trim().max(100).optional(),
    status: z.enum([EmployeeStatuses.Active, EmployeeStatuses.Probation]),
    ...employmentFields,
  })
  .refine(
    (value) =>
      Boolean(value.userId) || Boolean(value.name && value.email && value.password && value.role),
    {
      path: ["userId"],
      message: "Select an existing staff account, or create one with name, email and password",
    },
  );

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  id: recordId,
  status: z.enum(EmployeeStatuses),
  exitDate: hrmOptionalDate,
  ...employmentFields,
});

export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

// ---------------------------------------------------------------------------
// Employee registry
// ---------------------------------------------------------------------------

async function nextEmployeeCode(): Promise<string> {
  const count = await db.employee.count();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `EMP-${String(count + 1 + attempt).padStart(4, "0")}`;
    const clash = await db.employee.findFirst({
      where: { employeeCode: code },
      select: { id: true },
    });
    if (!clash) return code;
  }
  // Extremely unlikely fallback keeps the code unique even under races.
  return `EMP-${Date.now().toString(36).toUpperCase()}`;
}

export async function createEmployee(input: CreateEmployeeInput): Promise<HrmResult> {
  // Resolve (or create) the staff account this employee will own.
  let userId = input.userId ?? "";
  if (userId) {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return hrmFailure("Selected account no longer exists", "userId");
    if (!user.roles.some((role) => (STAFF_ROLES as readonly string[]).includes(role)))
      return hrmFailure(
        "That account has no staff role. Create a new staff account instead.",
        "userId",
      );
    const onboarded = await db.employee.findUnique({ where: { userId }, select: { id: true } });
    if (onboarded) return hrmFailure("That account is already an employee", "userId");
  } else {
    if (!input.role || !input.email || !input.password || !input.name)
      return hrmFailure("Name, email, password and role are required to create an account");
    const email = input.email.toLowerCase();
    const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) return hrmFailure("An account with this email already exists", "email");
    const passwordHash = await bcrypt.hash(input.password, 10);
    const account = await db.user.create({
      data: {
        email,
        name: input.name,
        passwordHash,
        roles: [Roles.Customer, input.role],
      },
    });
    userId = account.id;
  }

  if (input.applicationId) {
    const application = await db.careerApplication.findUnique({
      where: { id: input.applicationId },
      select: { id: true, status: true },
    });
    if (!application) return hrmFailure("Hiring application not found", "applicationId");
    if (application.status !== "Hired")
      return hrmFailure("Only applications marked Hired can be onboarded", "applicationId");
    const linked = await db.employee.findUnique({
      where: { applicationId: input.applicationId },
      select: { id: true },
    });
    if (linked) return hrmFailure("That application was already onboarded", "applicationId");
  }

  const employee = await db.employee.create({
    data: {
      employeeCode: await nextEmployeeCode(),
      userId,
      applicationId: input.applicationId || null,
      designation: input.designation,
      department: input.department,
      employmentType: input.employmentType,
      status: input.status,
      joinDate: bdDateFromKey(input.joinDate)!,
      probationEndDate: input.probationEndDate ? bdDateFromKey(input.probationEndDate) : null,
      monthlySalaryCents: input.monthlySalaryCents ?? null,
      emergencyContactName: input.emergencyContactName || null,
      emergencyContactPhone: input.emergencyContactPhone || null,
      notes: input.notes || null,
    },
  });
  return { ok: true, id: employee.id };
}

export async function updateEmployee(input: UpdateEmployeeInput): Promise<HrmResult> {
  const employee = await db.employee.findUnique({
    where: { id: input.id },
    select: { id: true, joinDate: true, exitDate: true },
  });
  if (!employee) return hrmFailure("Employee not found");

  const joinDate = bdDateFromKey(input.joinDate)!;
  const exitDate = input.exitDate ? bdDateFromKey(input.exitDate) : null;
  if (input.status === EmployeeStatuses.Exited && !exitDate && !employee.exitDate)
    return hrmFailure("Set an exit date when marking an employee exited", "exitDate");
  if (exitDate && exitDate.getTime() < joinDate.getTime())
    return hrmFailure("Exit date cannot be before the join date", "exitDate");
  const probationEnd = input.probationEndDate ? bdDateFromKey(input.probationEndDate) : null;
  if (probationEnd && probationEnd.getTime() < joinDate.getTime())
    return hrmFailure("Probation end cannot be before the join date", "probationEndDate");

  await db.employee.update({
    where: { id: input.id },
    data: {
      designation: input.designation,
      department: input.department,
      employmentType: input.employmentType,
      status: input.status,
      joinDate,
      probationEndDate: probationEnd,
      // Leaving the company is stamped once and kept through later edits.
      exitDate: input.status === EmployeeStatuses.Exited ? (exitDate ?? employee.exitDate) : null,
      monthlySalaryCents: input.monthlySalaryCents ?? null,
      emergencyContactName: input.emergencyContactName || null,
      emergencyContactPhone: input.emergencyContactPhone || null,
      notes: input.notes || null,
    },
  });
  return { ok: true, id: input.id };
}

export type EmployeeFilters = {
  q?: string;
  department?: string;
  employmentType?: string;
  status?: string;
};

export async function listEmployees(filters: EmployeeFilters) {
  const where = {
    ...(filters.status
      ? { status: filters.status as (typeof EmployeeStatuses)[keyof typeof EmployeeStatuses] }
      : {}),
    ...(filters.employmentType
      ? {
          employmentType:
            filters.employmentType as (typeof EmploymentTypes)[keyof typeof EmploymentTypes],
        }
      : {}),
    ...(filters.department ? { department: filters.department } : {}),
    ...(filters.q
      ? {
          OR: [
            { designation: { contains: filters.q, mode: "insensitive" as const } },
            { department: { contains: filters.q, mode: "insensitive" as const } },
            { employeeCode: { contains: filters.q, mode: "insensitive" as const } },
            { user: { name: { contains: filters.q, mode: "insensitive" as const } } },
            { user: { email: { contains: filters.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [employees, count, departments, pendingStaff] = await Promise.all([
    db.employee.findMany({
      where,
      orderBy: [{ employeeCode: "asc" }],
      take: 200,
      include: {
        user: { select: { id: true, name: true, email: true, roles: true, active: true } },
      },
    }),
    db.employee.count({ where }),
    db.employee.findMany({
      distinct: ["department"],
      select: { department: true },
      orderBy: { department: "asc" },
    }),
    // Staff accounts that exist but have no employee record yet.
    db.user.findMany({
      where: { roles: { hasSome: [...STAFF_ROLES] }, employee: null },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, name: true, email: true, roles: true, createdAt: true },
    }),
  ]);

  return {
    employees,
    count,
    departments: departments.map((row) => row.department),
    pendingStaff,
  };
}

export async function getEmployeeProfile(id: string, now = new Date()) {
  const employee = await db.employee.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, name: true, email: true, phone: true, roles: true, active: true },
      },
      application: { select: { id: true, name: true, jobId: true, status: true } },
    },
  });
  if (!employee) return null;

  const attendanceSince = bdStartOfDay(new Date(now.getTime() - 29 * DAY));
  const yearStart = bdStartOfDay(new Date(Date.UTC(now.getUTCFullYear(), 0, 1)));

  const [attendance, leaveRequests, takenThisYear, payslips, reviews, documents] =
    await Promise.all([
      db.attendanceRecord.findMany({
        where: { employeeId: id, date: { gte: attendanceSince } },
        orderBy: { date: "desc" },
      }),
      db.leaveRequest.findMany({
        where: { employeeId: id },
        orderBy: { startDate: "desc" },
        take: 20,
        include: { decidedBy: { select: { name: true } } },
      }),
      db.leaveRequest.groupBy({
        by: ["type"],
        where: {
          employeeId: id,
          status: "Approved",
          startDate: { gte: yearStart },
        },
        _count: true,
      }),
      db.payslip.findMany({
        where: { employeeId: id },
        orderBy: { run: { month: "desc" } },
        take: 12,
        include: { run: { select: { month: true, currencyCode: true } } },
      }),
      db.performanceReview.findMany({
        where: { employeeId: id },
        orderBy: { periodStart: "desc" },
        take: 10,
        include: { reviewer: { select: { name: true } } },
      }),
      db.employeeDocument.findMany({
        where: { employeeId: id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          kind: true,
          title: true,
          fileName: true,
          mimeType: true,
          url: true,
          createdAt: true,
        },
      }),
    ]);

  const attendanceSummary = attendance.reduce(
    (acc, record) => {
      acc[record.status] = (acc[record.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return {
    ...employee,
    attendance,
    attendanceSummary,
    leaveRequests,
    takenThisYear: takenThisYear.map((row) => ({
      type: row.type,
      days: row._count,
    })),
    payslips,
    reviews,
    documents,
  };
}

// ---------------------------------------------------------------------------
// Page query functions (extracted verbatim from src/app/hrm pages)
// ---------------------------------------------------------------------------

/** Staff User accounts for /hrm/employees, filtered by q / role / status. */
export async function searchStaffAccounts(
  q: string | string[] | undefined,
  role: string | string[] | undefined,
  status: string | string[] | undefined,
) {
  const filters = q ? { q, role, status } : { q: "", role: "", status: "" };

  const where = {
    ...(filters.role
      ? {
          roles: {
            has: filters.role as
              "Customer" | "Admin" | "Rider" | "Support" | "Warehouse" | "Sales" | "Manager",
          },
        }
      : {}),
    ...(filters.status ? { active: filters.status === "Active" } : {}),
    ...(filters.q
      ? {
          OR: ["name", "email", "phone"].map((field) => ({
            [field]: { contains: filters.q, mode: "insensitive" as const },
          })),
        }
      : {}),
  };

  const [users, count] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 200,
      select: { id: true, name: true, email: true, phone: true, roles: true, active: true },
    }),
    db.user.count({ where }),
  ]);

  return { users, count };
}

/** Hiring application shown on /hrm/employees/new (hiring handoff prefill). */
export async function getHiringApplication(applicationId: string) {
  return db.careerApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      employee: { select: { id: true } },
    },
  });
}

/** Employee record plus attendance, leave, payslips, reviews and documents. */
export async function getEmployeeDetail(id: string, now = new Date()) {
  const employee = await db.employee.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, name: true, email: true, phone: true, roles: true, active: true },
      },
      application: { select: { id: true, name: true, jobId: true, status: true } },
    },
  });
  if (!employee) return null;

  // Pre-computed date ranges (evaluated once on mount, not during render)
  const attendanceSince = new Date(now.getTime() - 29 * 86400000);
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  const [attendance, leaveRequests, takenThisYear, payslips, reviews, documents] =
    await Promise.all([
      db.attendanceRecord.findMany({
        where: { employeeId: id, date: { gte: attendanceSince } },
        orderBy: { date: "desc" },
      }),
      db.leaveRequest.findMany({
        where: { employeeId: id },
        orderBy: { startDate: "desc" },
        take: 20,
        include: { decidedBy: { select: { name: true } } },
      }),
      db.leaveRequest.groupBy({
        by: ["type"],
        where: {
          employeeId: id,
          status: "Approved",
          startDate: { gte: yearStart },
        },
        _count: true,
      }),
      db.payslip.findMany({
        where: { employeeId: id },
        orderBy: { run: { month: "desc" } },
        take: 12,
        include: { run: { select: { month: true, currencyCode: true } } },
      }),
      db.performanceReview.findMany({
        where: { employeeId: id },
        orderBy: { periodStart: "desc" },
        take: 10,
        include: { reviewer: { select: { name: true } } },
      }),
      db.employeeDocument.findMany({
        where: { employeeId: id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          kind: true,
          title: true,
          fileName: true,
          mimeType: true,
          url: true,
          createdAt: true,
        },
      }),
    ]);

  return {
    employee,
    attendance,
    leaveRequests,
    takenThisYear,
    payslips,
    reviews,
    documents,
  };
}
