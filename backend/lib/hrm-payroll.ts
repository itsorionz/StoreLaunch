import "server-only";
import { z } from "zod";
import { db } from "./db";
import { bdDayKey } from "./admin-dashboard-periods";
import { bdMonthFromKey, hrmFailure, takaAmount, type HrmResult } from "./hrm";
import { recordId } from "./form-validation";

/**
 * Payroll: one run per salary month, generated from Active/Probation employees
 * with a stored salary. Run status is derived (every line paid → Paid, else
 * Draft) so nothing can drift. Money is integer cents in the store currency,
 * stamped on the run at generation time.
 */

export const RUN_STATUS = { Draft: "Draft", Paid: "Paid" } as const;
export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS];

export const generatePayrollSchema = z.object({
  month: z
    .string()
    .trim()
    .refine((value) => bdMonthFromKey(value) !== null, "Enter a valid month (YYYY-MM)"),
});

export type GeneratePayrollInput = z.infer<typeof generatePayrollSchema>;

function runStatus(paidCount: number, total: number): RunStatus {
  return total > 0 && paidCount === total ? RUN_STATUS.Paid : RUN_STATUS.Draft;
}

export async function generatePayrollRun(
  actorId: string,
  input: GeneratePayrollInput,
): Promise<HrmResult> {
  const month = bdMonthFromKey(input.month)!;

  const existing = await db.payrollRun.findUnique({
    where: { month },
    select: { id: true },
  });
  if (existing) return hrmFailure("A payroll run for this month already exists", "month");

  const store = await db.storeSettings.findUnique({
    where: { singletonKey: 1 },
    select: { currencyCode: true },
  });

  const employees = await db.employee.findMany({
    where: { status: { in: ["Active", "Probation"] }, monthlySalaryCents: { not: null } },
    orderBy: { employeeCode: "asc" },
    select: { id: true, monthlySalaryCents: true },
  });
  if (!employees.length) return hrmFailure("No salaried employees to pay this month", "month");

  const run = await db.payrollRun.create({
    data: {
      month,
      currencyCode: store?.currencyCode ?? "BDT",
      createdByById: actorId,
      payslips: {
        create: employees.map((employee) => {
          const base = employee.monthlySalaryCents ?? 0;
          return { employeeId: employee.id, baseSalaryCents: base, netCents: base };
        }),
      },
    },
  });
  return { ok: true, id: run.id };
}

export const payslipAdjustmentsSchema = z.object({
  id: recordId,
  allowances: takaAmount,
  deductions: takaAmount,
  note: z.string().trim().max(500, "Use at most 500 characters").optional(),
});

export type PayslipAdjustmentsInput = z.infer<typeof payslipAdjustmentsSchema>;

export async function savePayslipAdjustments(input: PayslipAdjustmentsInput): Promise<HrmResult> {
  const payslip = await db.payslip.findUnique({
    where: { id: input.id },
    select: { id: true, baseSalaryCents: true, paidAt: true },
  });
  if (!payslip) return hrmFailure("Payslip not found");
  if (payslip.paidAt) return hrmFailure("A paid payslip cannot be edited");

  const allowances = input.allowances ?? 0;
  const deductions = input.deductions ?? 0;
  const net = payslip.baseSalaryCents + allowances - deductions;
  if (net < 0) return hrmFailure("Deductions exceed salary + allowances", "deductions");

  await db.payslip.update({
    where: { id: input.id },
    data: {
      allowancesCents: allowances,
      deductionsCents: deductions,
      netCents: net,
      note: input.note || null,
    },
  });
  return { ok: true, id: input.id };
}

export async function markPayslipPaid(payslipId: string, now = new Date()): Promise<HrmResult> {
  const payslip = await db.payslip.findUnique({
    where: { id: payslipId },
    select: { id: true, paidAt: true },
  });
  if (!payslip) return hrmFailure("Payslip not found");
  if (payslip.paidAt) return hrmFailure("This payslip is already paid");

  await db.payslip.update({ where: { id: payslipId }, data: { paidAt: now } });
  return { ok: true, id: payslipId };
}

export async function markRunPaid(runId: string, now = new Date()): Promise<HrmResult> {
  const run = await db.payrollRun.findUnique({
    where: { id: runId },
    select: { id: true, payslips: { select: { id: true, paidAt: true } } },
  });
  if (!run) return hrmFailure("Payroll run not found");
  const unpaid = run.payslips.filter((line) => !line.paidAt);
  if (!unpaid.length) return hrmFailure("Every payslip in this run is already paid");

  await db.payslip.updateMany({
    where: { id: { in: unpaid.map((line) => line.id) }, paidAt: null },
    data: { paidAt: now },
  });
  return { ok: true, id: runId };
}

/** Delete a run only while nothing in it has been paid. */
export async function deleteDraftRun(runId: string): Promise<HrmResult> {
  const run = await db.payrollRun.findUnique({
    where: { id: runId },
    select: { id: true, payslips: { select: { paidAt: true } } },
  });
  if (!run) return hrmFailure("Payroll run not found");
  if (run.payslips.some((line) => line.paidAt))
    return hrmFailure("A run with paid payslips cannot be deleted");

  await db.payrollRun.delete({ where: { id: runId } });
  return { ok: true, id: runId };
}

export async function getPayrollRuns(take = 24) {
  const runs = await db.payrollRun.findMany({
    orderBy: { month: "desc" },
    take,
    include: {
      payslips: { select: { netCents: true, paidAt: true } },
      createdBy: { select: { name: true } },
    },
  });
  return runs.map((run) => {
    const totalCents = run.payslips.reduce((sum, line) => sum + line.netCents, 0);
    const paidCents = run.payslips
      .filter((line) => line.paidAt)
      .reduce((sum, line) => sum + line.netCents, 0);
    return {
      ...run,
      payslips: undefined,
      headcount: run.payslips.length,
      totalCents,
      paidCents,
      dueCents: totalCents - paidCents,
      status: runStatus(run.payslips.filter((line) => line.paidAt).length, run.payslips.length),
    };
  });
}

export async function getPayrollRun(runId: string) {
  const run = await db.payrollRun.findUnique({
    where: { id: runId },
    include: {
      createdBy: { select: { name: true } },
      payslips: {
        orderBy: { employee: { employeeCode: "asc" } },
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              designation: true,
              user: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!run) return null;

  const paidCount = run.payslips.filter((line) => line.paidAt).length;
  const totalCents = run.payslips.reduce((sum, line) => sum + line.netCents, 0);
  const paidCents = run.payslips
    .filter((line) => line.paidAt)
    .reduce((sum, line) => sum + line.netCents, 0);
  return {
    ...run,
    monthKey: bdDayKey(run.month).slice(0, 7),
    headcount: run.payslips.length,
    totalCents,
    paidCents,
    dueCents: totalCents - paidCents,
    status: runStatus(paidCount, run.payslips.length),
  };
}

/** Paid payroll cost for the month containing `now` (people cost MTD). */
export async function monthPayrollCents(
  now = new Date(),
): Promise<{ total: number; paid: number }> {
  const monthKey = bdDayKey(now).slice(0, 7);
  const month = bdMonthFromKey(monthKey)!;
  const nextMonthKey =
    monthKey.slice(0, 4) === "9999"
      ? null
      : `${monthKey.slice(0, 4)}-${String(Number(monthKey.slice(5, 7)) + 1).padStart(2, "0")}`;
  const run = await db.payrollRun.findFirst({
    where: nextMonthKey ? { month: { gte: month, lt: bdMonthFromKey(nextMonthKey)! } } : { month },
    include: { payslips: { select: { netCents: true, paidAt: true } } },
  });
  if (!run) return { total: 0, paid: 0 };
  return {
    total: run.payslips.reduce((sum, line) => sum + line.netCents, 0),
    paid: run.payslips.filter((line) => line.paidAt).reduce((sum, line) => sum + line.netCents, 0),
  };
}
