import "server-only";
import { z } from "zod";
import { db } from "./db";
import { AttendanceStatuses } from "./enums.mjs";
import { bdStartOfDay, bdDayKey } from "./admin-dashboard-periods";
import { bdDateFromKey, bdMonthFromKey, bdTimeOn, hrmFailure, type HrmResult } from "./hrm";
import { recordId } from "./form-validation";

const TIME_KEY = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Attendance is recorded, not inferred: the admin marks each employee's day
 * (status + optional check-in/out) and the library computes worked minutes,
 * month grids and rates. Days are Bangladesh days, upserted per employee/day.
 */

export const markAttendanceSchema = z.object({
  employeeId: recordId,
  date: z
    .string()
    .trim()
    .refine((value) => bdDateFromKey(value) !== null, "Enter a valid date"),
  status: z.enum(AttendanceStatuses),
  checkIn: z
    .string()
    .trim()
    .optional()
    .refine((value) => value === undefined || value === "" || TIME_KEY.test(value), "Use HH:MM"),
  checkOut: z
    .string()
    .trim()
    .optional()
    .refine((value) => value === undefined || value === "" || TIME_KEY.test(value), "Use HH:MM"),
  note: z.string().trim().max(200, "Use at most 200 characters").optional(),
});

export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;

export async function markAttendance(
  actorId: string,
  input: MarkAttendanceInput,
  now = new Date(),
): Promise<HrmResult> {
  const employee = await db.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true },
  });
  if (!employee) return hrmFailure("Employee not found");

  const day = bdDateFromKey(input.date)!;
  const today = bdStartOfDay(now);
  if (day.getTime() > today.getTime())
    return hrmFailure("Attendance can only be marked for today or the past", "date");

  const checkInAt = input.checkIn ? bdTimeOn(day, input.checkIn) : null;
  const checkOutAt = input.checkOut ? bdTimeOn(day, input.checkOut) : null;
  if (checkInAt && checkOutAt && checkOutAt.getTime() < checkInAt.getTime())
    return hrmFailure("Check-out cannot be before check-in", "checkOut");
  const workedMinutes =
    checkInAt && checkOutAt
      ? Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000)
      : null;

  const data = {
    status: input.status,
    checkInAt,
    checkOutAt,
    workedMinutes,
    note: input.note?.trim() || null,
    markedById: actorId,
  };
  await db.attendanceRecord.upsert({
    where: { employeeId_date: { employeeId: input.employeeId, date: day } },
    create: { employeeId: input.employeeId, date: day, ...data },
    update: data,
  });
  return { ok: true };
}

/** Stamp every unmarked Active/Probation employee Present for the day. */
export async function bulkMarkPresent(
  actorId: string,
  dateKey: string,
  now = new Date(),
): Promise<HrmResult> {
  const day = bdDateFromKey(dateKey);
  if (!day) return hrmFailure("Enter a valid date", "date");
  if (day.getTime() > bdStartOfDay(now).getTime())
    return hrmFailure("Attendance can only be marked for today or the past", "date");

  const [employees, marked] = await Promise.all([
    db.employee.findMany({
      where: { status: { in: ["Active", "Probation"] } },
      select: { id: true },
    }),
    db.attendanceRecord.findMany({ where: { date: day }, select: { employeeId: true } }),
  ]);
  const already = new Set(marked.map((row) => row.employeeId));
  const missing = employees.filter((row) => !already.has(row.id));
  if (missing.length)
    await db.attendanceRecord.createMany({
      data: missing.map((row) => ({
        employeeId: row.id,
        date: day,
        status: "Present" as const,
        markedById: actorId,
      })),
      skipDuplicates: true,
    });
  return { ok: true, id: String(missing.length) };
}

export async function getAttendanceBoard(dateKey: string, now = new Date()) {
  const day = bdDateFromKey(dateKey) ?? bdStartOfDay(now);
  const [employees, records] = await Promise.all([
    db.employee.findMany({
      where: { status: { in: ["Active", "Probation"] } },
      orderBy: { employeeCode: "asc" },
      include: { user: { select: { name: true } } },
    }),
    db.attendanceRecord.findMany({
      where: { date: day },
      select: { employeeId: true, status: true, checkInAt: true, checkOutAt: true, note: true },
    }),
  ]);
  const byEmployee = new Map(records.map((row) => [row.employeeId, row]));
  // Exited employees keep appearing while they still hold a record that day.
  const exitedIds = records
    .filter((row) => !byEmployee.has(row.employeeId))
    .map((row) => row.employeeId);
  const extras = exitedIds.length
    ? await db.employee.findMany({
        where: { id: { in: exitedIds } },
        include: { user: { select: { name: true } } },
      })
    : [];

  const rows = [...employees, ...extras].map((employee) => ({
    employee,
    record: byEmployee.get(employee.id) ?? null,
  }));
  const summary = records.reduce(
    (acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  return { day, dateKey: bdDayKey(day), rows, summary, marked: records.length };
}

export type AttendanceMonthGrid = Awaited<ReturnType<typeof getAttendanceMonthGrid>>;

export async function getAttendanceMonthGrid(monthKey: string, now = new Date()) {
  const month = bdMonthFromKey(monthKey) ?? bdStartOfDay(now);
  const [year, monthIndex] = [
    Number(bdDayKey(month).slice(0, 4)),
    Number(bdDayKey(month).slice(5, 7)),
  ];
  const nextMonth = bdMonthFromKey(
    monthIndex === 12 ? `${year + 1}-01` : `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
  )!;
  const dayCount = Math.round((nextMonth.getTime() - month.getTime()) / 86400000);
  const todayKey = bdDayKey(bdStartOfDay(now));
  const monthPrefix = bdDayKey(month).slice(0, 7);

  const [employees, records] = await Promise.all([
    db.employee.findMany({
      where: { status: { in: ["Active", "Probation"] } },
      orderBy: { employeeCode: "asc" },
      include: { user: { select: { name: true } } },
    }),
    db.attendanceRecord.findMany({
      where: { date: { gte: month, lt: nextMonth } },
      orderBy: { date: "asc" },
    }),
  ]);

  const perEmployee = new Map<string, Map<number, (typeof records)[number]>>();
  for (const record of records) {
    const dayOfMonth = Number(bdDayKey(record.date).slice(8, 10));
    const bucket = perEmployee.get(record.employeeId) ?? new Map();
    bucket.set(dayOfMonth, record);
    perEmployee.set(record.employeeId, bucket);
  }

  const rows = employees.map((employee) => {
    const days = perEmployee.get(employee.id);
    return {
      employee,
      days: Array.from({ length: dayCount }, (_, index) => days?.get(index + 1) ?? null),
    };
  });

  const totals = records.reduce(
    (acc, record) => {
      acc[record.status] = (acc[record.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  // Rate over marked days, excluding leave (leave is time off, not attendance);
  // half days count as 0.5. Unmarked days are invisible to the rate by design.
  const denominator = records.filter((record) => record.status !== "Leave").length;
  const credited =
    (totals[AttendanceStatuses.Present] ?? 0) + (totals[AttendanceStatuses.HalfDay] ?? 0) * 0.5;
  const ratePercent = denominator > 0 ? (credited / denominator) * 100 : 0;

  return {
    monthKey: monthPrefix,
    dayCount,
    todayKey,
    rows,
    totals,
    marked: records.length,
    ratePercent,
  };
}
