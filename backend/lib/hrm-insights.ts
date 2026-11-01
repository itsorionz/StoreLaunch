import "server-only";
import { db } from "./db";
import { bdDayKey, bdStartOfDay } from "./admin-dashboard-periods";
import { bdMonthFromKey } from "./hrm";
import { monthPayrollCents } from "./hrm-payroll";
import { formatPrice } from "./money";

const DAY = 86400000;

/**
 * HRM overview (docs/hrm-plan.md §5 WP7): one aggregate call powering
 * /hrm — headcount, today's attendance, pending leave, the month's
 * attendance rate, people cost for the month, and the latest joiners.
 */

export async function getHrmOverview(now = new Date()) {
  const today = bdStartOfDay(now);
  const todayKey = bdDayKey(today);
  const monthKey = todayKey.slice(0, 7);
  const monthStart = bdMonthFromKey(monthKey)!;
  const nextMonthKey = `${monthKey.slice(0, 4)}-${String(Number(monthKey.slice(5, 7)) + 1).padStart(2, "0")}`;
  const monthEnd = bdMonthFromKey(nextMonthKey)!;

  const [
    byStatus,
    todayRecords,
    pendingLeave,
    monthRecords,
    payroll,
    recentJoins,
    totalStaffAccounts,
  ] = await Promise.all([
    db.employee.groupBy({ by: ["status"], _count: true }),
    db.attendanceRecord.findMany({
      where: { date: today },
      select: { status: true },
    }),
    db.leaveRequest.count({
      where: { status: "Pending", startDate: { lte: today } },
    }),
    db.attendanceRecord.findMany({
      where: { date: { gte: monthStart, lt: monthEnd } },
      select: { status: true },
    }),
    monthPayrollCents(today),
    db.employee.findMany({
      orderBy: { joinDate: "desc" },
      take: 5,
      select: {
        id: true,
        employeeCode: true,
        designation: true,
        joinDate: true,
        status: true,
        user: { select: { name: true } },
      },
    }),
    db.user.count({
      where: { roles: { hasSome: ["Admin", "Support", "Warehouse", "Sales", "Manager"] } },
    }),
  ]);

  const headcount = byStatus.reduce(
    (sum, row) => (row.status === "Exited" ? sum : sum + row._count),
    0,
  );

  const todaySummary = todayRecords.reduce(
    (acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const monthSummary = monthRecords.reduce(
    (acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const denominator = monthRecords.filter((row) => row.status !== "Leave").length;
  const credited = (monthSummary.Present ?? 0) + (monthSummary.HalfDay ?? 0) * 0.5;
  const monthRatePercent = denominator > 0 ? (credited / denominator) * 100 : 0;

  return {
    monthKey,
    headcount,
    onRollsStaffAccounts: totalStaffAccounts,
    notOnboarded: Math.max(0, totalStaffAccounts - headcount),
    todayKey,
    todaySummary,
    todayMarked: todayRecords.length,
    pendingLeave,
    monthSummary,
    monthMarked: monthRecords.length,
    monthRatePercent,
    payroll: {
      totalCents: payroll.total,
      paidCents: payroll.paid,
      dueCents: payroll.total - payroll.paid,
      totalLabel: formatPrice(payroll.total),
      paidLabel: formatPrice(payroll.paid),
      dueLabel: formatPrice(payroll.total - payroll.paid),
    },
    recentJoins: recentJoins.map((employee) => ({
      ...employee,
      joinKey: bdDayKey(employee.joinDate),
    })),
    todayDistance: Math.round(today.getTime() / DAY),
  };
}
