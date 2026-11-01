"use server";

import { revalidatePath } from "next/cache";
import { requireHrm } from "../lib/session";
import { validationFailure } from "../lib/form-validation";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  createEmployee,
  updateEmployee,
} from "../lib/hrm";
import { markAttendanceSchema, markAttendance, bulkMarkPresent } from "../lib/hrm-attendance";
import { requestLeaveSchema, requestLeave, decideLeave, LEAVE_DECISIONS } from "../lib/hrm-leave";
import {
  generatePayrollSchema,
  generatePayrollRun,
  payslipAdjustmentsSchema,
  savePayslipAdjustments,
  markPayslipPaid,
  markRunPaid,
  deleteDraftRun,
} from "../lib/hrm-payroll";
import {
  reviewSchema,
  savePerformanceReview,
  deletePerformanceReview,
} from "../lib/hrm-performance";
import {
  employeeDocumentSchema,
  addEmployeeDocument,
  deleteEmployeeDocument,
} from "../lib/hrm-documents";

export type HrmActionResult = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  id?: string;
} | null;

function revalidateHrm(detail?: string) {
  revalidatePath("/hrm");
  revalidatePath("/hrm/employees");
  revalidatePath("/hrm/attendance");
  revalidatePath("/hrm/leave");
  revalidatePath("/hrm/payroll");
  revalidatePath("/hrm/performance");
  if (detail) revalidatePath(detail);
}

// ---------------------------------------------------------------------------
// Employee registry
// ---------------------------------------------------------------------------

export async function saveEmployee(
  _previous: HrmActionResult,
  formData: FormData,
): Promise<HrmActionResult> {
  await requireHrm();

  // Edit mode carries the employee id and routes through the update path
  // first — the create schema only allows Active/Probation.
  const id = formData.get("id");
  if (typeof id === "string" && id) {
    const update = updateEmployeeSchema.safeParse({
      ...Object.fromEntries(formData.entries()),
      id,
    });
    if (!update.success) return { ok: false, ...validationFailure(update.error) };
    const result = await updateEmployee(update.data);
    if (result.ok) revalidateHrm(`/hrm/employees/${id}`);
    return result;
  }

  const parsed = createEmployeeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const result = await createEmployee(parsed.data);
  if (result.ok) revalidateHrm(result.id ? `/hrm/employees/${result.id}` : undefined);
  return result;
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export async function saveAttendance(
  _previous: HrmActionResult,
  formData: FormData,
): Promise<HrmActionResult> {
  const admin = await requireHrm();
  const parsed = markAttendanceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const result = await markAttendance(admin.id, parsed.data);
  if (result.ok) revalidateHrm("/hrm/attendance");
  return result;
}

export async function markAllPresent(dateKey: string): Promise<HrmActionResult> {
  const admin = await requireHrm();
  const result = await bulkMarkPresent(admin.id, dateKey);
  if (result.ok) revalidateHrm("/hrm/attendance");
  return result;
}

// ---------------------------------------------------------------------------
// Leave
// ---------------------------------------------------------------------------

export async function saveLeaveRequest(
  _previous: HrmActionResult,
  formData: FormData,
): Promise<HrmActionResult> {
  await requireHrm();
  const parsed = requestLeaveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const result = await requestLeave(parsed.data);
  if (result.ok) revalidateHrm("/hrm/leave");
  return result;
}

export async function saveLeaveDecision(
  requestId: string,
  decision: string,
): Promise<HrmActionResult> {
  const admin = await requireHrm();
  if (!(LEAVE_DECISIONS as readonly string[]).includes(decision))
    return { ok: false, error: "Invalid decision" };
  const result = await decideLeave(
    requestId,
    decision as (typeof LEAVE_DECISIONS)[number],
    admin.id,
  );
  if (result.ok) revalidateHrm("/hrm/leave");
  return result;
}

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

export async function savePayrollRun(
  _previous: HrmActionResult,
  formData: FormData,
): Promise<HrmActionResult> {
  const admin = await requireHrm();
  const parsed = generatePayrollSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const result = await generatePayrollRun(admin.id, parsed.data);
  if (result.ok) revalidateHrm(`/hrm/payroll/${result.id}`);
  return result;
}

export async function savePayslip(
  _previous: HrmActionResult,
  formData: FormData,
): Promise<HrmActionResult> {
  await requireHrm();
  const parsed = payslipAdjustmentsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const result = await savePayslipAdjustments(parsed.data);
  if (result.ok) revalidateHrm("/hrm/payroll");
  return result;
}

export async function payPayslip(payslipId: string): Promise<HrmActionResult> {
  await requireHrm();
  const result = await markPayslipPaid(payslipId);
  if (result.ok) revalidateHrm("/hrm/payroll");
  return result;
}

export async function payRun(runId: string): Promise<HrmActionResult> {
  await requireHrm();
  const result = await markRunPaid(runId);
  if (result.ok) revalidateHrm(`/hrm/payroll/${runId}`);
  return result;
}

export async function discardPayrollRun(runId: string): Promise<HrmActionResult> {
  await requireHrm();
  const result = await deleteDraftRun(runId);
  if (result.ok) revalidateHrm("/hrm/payroll");
  return result;
}

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

export async function saveReview(
  _previous: HrmActionResult,
  formData: FormData,
): Promise<HrmActionResult> {
  const admin = await requireHrm();
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const result = await savePerformanceReview(admin.id, parsed.data);
  if (result.ok) revalidateHrm("/hrm/performance");
  return result;
}

export async function removeReview(reviewId: string): Promise<HrmActionResult> {
  await requireHrm();
  const result = await deletePerformanceReview(reviewId);
  if (result.ok) revalidateHrm("/hrm/performance");
  return result;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function saveEmployeeDocument(
  _previous: HrmActionResult,
  formData: FormData,
): Promise<HrmActionResult> {
  await requireHrm();
  const parsed = employeeDocumentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const result = await addEmployeeDocument(parsed.data, formData.get("file"));
  if (result.ok) revalidateHrm(`/hrm/employees/${parsed.data.employeeId}`);
  return result;
}

export async function removeEmployeeDocument(documentId: string): Promise<HrmActionResult> {
  await requireHrm();
  const result = await deleteEmployeeDocument(documentId);
  if (result.ok) revalidateHrm("/hrm/employees");
  return result;
}
