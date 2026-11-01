import "server-only";
import { z } from "zod";
import { db } from "./db";
import { LeaveTypes, LeaveStatuses } from "./enums.mjs";
import { bdDayKey } from "./admin-dashboard-periods";
import { bdDateFromKey, hrmFailure, type HrmResult } from "./hrm";
import { recordId } from "./form-validation";

const DAY = 86400000;

/**
 * Leave requests: inclusive Bangladesh calendar-day ranges, validated against
 * overlap with existing Pending/Approved leave, decided by an admin who is
 * recorded on the decision. No accrual policy — history, not balances.
 */

export const requestLeaveSchema = z.object({
  employeeId: recordId,
  type: z.enum(LeaveTypes),
  startDate: z
    .string()
    .trim()
    .refine((value) => bdDateFromKey(value) !== null, "Enter a valid date"),
  endDate: z
    .string()
    .trim()
    .refine((value) => bdDateFromKey(value) !== null, "Enter a valid date"),
  reason: z.string().trim().min(3, "State the reason").max(500, "Use at most 500 characters"),
});

export type RequestLeaveInput = z.infer<typeof requestLeaveSchema>;

export const LEAVE_DECISIONS = [LeaveStatuses.Approved, LeaveStatuses.Rejected] as const;

export function leaveDays(startDate: Date, endDate: Date): number {
  return Math.round((endDate.getTime() - startDate.getTime()) / DAY) + 1;
}

export async function requestLeave(input: RequestLeaveInput): Promise<HrmResult> {
  const employee = await db.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true },
  });
  if (!employee) return hrmFailure("Employee not found");

  const startDate = bdDateFromKey(input.startDate)!;
  const endDate = bdDateFromKey(input.endDate)!;
  if (endDate.getTime() < startDate.getTime())
    return hrmFailure("End date must be on or after the start date", "endDate");
  if (leaveDays(startDate, endDate) > 365)
    return hrmFailure("Leave cannot span more than a year", "endDate");

  const overlap = await db.leaveRequest.findFirst({
    where: {
      employeeId: input.employeeId,
      status: { in: [LeaveStatuses.Pending, LeaveStatuses.Approved] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { status: true, startDate: true, endDate: true },
  });
  if (overlap)
    return hrmFailure(
      `Overlaps ${overlap.status.toLowerCase()} leave ${bdDayKey(overlap.startDate)} – ${bdDayKey(overlap.endDate)}`,
      "startDate",
    );

  const request = await db.leaveRequest.create({
    data: {
      employeeId: input.employeeId,
      type: input.type,
      startDate,
      endDate,
      reason: input.reason,
    },
  });
  return { ok: true, id: request.id };
}

export async function decideLeave(
  requestId: string,
  decision: (typeof LEAVE_DECISIONS)[number],
  actorId: string,
): Promise<HrmResult> {
  const request = await db.leaveRequest.findUnique({
    where: { id: requestId },
    select: { id: true, status: true },
  });
  if (!request) return hrmFailure("Leave request not found");
  if (request.status !== LeaveStatuses.Pending)
    return hrmFailure(`This request is already ${request.status.toLowerCase()}`);

  await db.leaveRequest.update({
    where: { id: requestId },
    data: { status: decision, decidedById: actorId, decidedAt: new Date() },
  });
  return { ok: true, id: requestId };
}

export async function getLeaveRequests(filters: { status?: string; take?: number } = {}) {
  const status = (Object.values(LeaveStatuses) as string[]).includes(filters.status ?? "")
    ? (filters.status as (typeof LeaveStatuses)[keyof typeof LeaveStatuses])
    : undefined;
  return db.leaveRequest.findMany({
    where: status ? { status } : {},
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
    take: Math.min(filters.take ?? 50, 100),
    include: {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          designation: true,
          user: { select: { name: true } },
        },
      },
      decidedBy: { select: { name: true } },
    },
  });
}
