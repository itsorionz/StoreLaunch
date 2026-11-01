const DAY = 86400000;
const OFFSET = 6 * 3600000;

export function adminDashboardPeriods(range: string | undefined, now = new Date()) {
  const days = range === "7" ? 7 : range === "90" ? 90 : 30;
  const local = new Date(now.getTime() + OFFSET);
  const localMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const start = new Date(localMidnight - OFFSET - (days - 1) * DAY);
  const previousStart = new Date(start.getTime() - (now.getTime() - start.getTime()));
  const dates = Array.from({ length: days }, (_, i) => {
    const value = new Date(localMidnight - (days - 1 - i) * DAY);
    return {
      key: value.toISOString().slice(0, 10),
      label: value.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }),
    };
  });
  return { days, start, end: now, previousStart, dates };
}

export function dashboardChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? "No change" : "New activity";
  const percent = Math.round(((current - previous) / previous) * 100);
  return `${percent > 0 ? "+" : ""}${percent}% vs previous period`;
}

// Start of "today" in Bangladesh time — the shared day boundary for every
// dashboard's daily metrics (admin, rider and support alike).
export function bdStartOfDay(now = new Date()): Date {
  const local = new Date(now.getTime() + OFFSET);
  const localMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(localMidnight - OFFSET);
}

// Bangladesh-time YYYY-MM-DD key for bucketing a timestamp into a day.
export function bdDayKey(value: Date): string {
  return new Date(value.getTime() + OFFSET).toISOString().slice(0, 10);
}
