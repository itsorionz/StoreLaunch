import "server-only";
import { z } from "zod";
import { db } from "./db";
import { bdDateFromKey, hrmFailure, hrmDate, type HrmResult } from "./hrm";
import { recordId } from "./form-validation";

/**
 * Performance reviews: admin-authored, bounded 1–5 rating over an explicit
 * period. No calibration workflow — the owner writes what they observed.
 */

export const reviewSchema = z.object({
  employeeId: recordId,
  periodStart: hrmDate,
  periodEnd: hrmDate,
  rating: z.coerce
    .number({ error: "Choose a rating" })
    .int("Choose a whole number")
    .min(1, "Rating is 1 to 5")
    .max(5, "Rating is 1 to 5"),
  summary: z.string().trim().max(2000, "Use at most 2000 characters").optional(),
  strengths: z.string().trim().max(2000, "Use at most 2000 characters").optional(),
  improvements: z.string().trim().max(2000, "Use at most 2000 characters").optional(),
  goals: z.string().trim().max(2000, "Use at most 2000 characters").optional(),
});

export type ReviewInput = z.infer<typeof reviewSchema>;

export async function savePerformanceReview(
  actorId: string,
  input: ReviewInput,
): Promise<HrmResult> {
  const employee = await db.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, joinDate: true },
  });
  if (!employee) return hrmFailure("Employee not found");

  const periodStart = bdDateFromKey(input.periodStart)!;
  const periodEnd = bdDateFromKey(input.periodEnd)!;
  if (periodEnd.getTime() < periodStart.getTime())
    return hrmFailure("Period end must be on or after the period start", "periodEnd");
  if (periodStart.getTime() < employee.joinDate.getTime())
    return hrmFailure("Review period cannot start before the join date", "periodStart");

  const review = await db.performanceReview.create({
    data: {
      employeeId: input.employeeId,
      reviewerId: actorId,
      periodStart,
      periodEnd,
      rating: input.rating,
      summary: input.summary || null,
      strengths: input.strengths || null,
      improvements: input.improvements || null,
      goals: input.goals || null,
    },
  });
  return { ok: true, id: review.id };
}

export async function deletePerformanceReview(reviewId: string): Promise<HrmResult> {
  const review = await db.performanceReview.findUnique({
    where: { id: reviewId },
    select: { id: true },
  });
  if (!review) return hrmFailure("Review not found");
  await db.performanceReview.delete({ where: { id: reviewId } });
  return { ok: true, id: reviewId };
}

export async function getPerformanceReviews(take = 50) {
  return db.performanceReview.findMany({
    orderBy: { periodStart: "desc" },
    take,
    include: {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          designation: true,
          user: { select: { name: true } },
        },
      },
      reviewer: { select: { name: true } },
    },
  });
}
