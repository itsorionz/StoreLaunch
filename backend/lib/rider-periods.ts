const BD_OFFSET = 6 * 60 * 60 * 1000;

/** Bangladesh uses UTC+06:00; boundaries are returned as UTC database timestamps. */
export function riderPeriods(now = new Date()) {
  const local = new Date(now.getTime() + BD_OFFSET);
  const year = local.getUTCFullYear(),
    month = local.getUTCMonth(),
    day = local.getUTCDate();
  const midnight = Date.UTC(year, month, day);
  const dayStart = new Date(midnight - BD_OFFSET);
  const weekStart = new Date(midnight - ((local.getUTCDay() + 6) % 7) * 86400000 - BD_OFFSET);
  const monthStart = new Date(Date.UTC(year, month, 1) - BD_OFFSET);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(midnight - (6 - index) * 86400000);
    return {
      key: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString("en-GB", {
        timeZone: "UTC",
        weekday: "short",
        day: "numeric",
      }),
    };
  });
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 5 + index, 1));
    return {
      key: date.toISOString().slice(0, 7),
      label: date.toLocaleDateString("en-GB", { timeZone: "UTC", month: "short", year: "numeric" }),
    };
  });
  return {
    now,
    dayStart,
    weekStart,
    monthStart,
    days,
    months,
    daysStart: new Date(midnight - 6 * 86400000 - BD_OFFSET),
    monthsStart: new Date(Date.UTC(year, month - 5, 1) - BD_OFFSET),
    monthLabel: local.toLocaleDateString("en-GB", {
      timeZone: "UTC",
      month: "long",
      year: "numeric",
    }),
    dateLabel: local.toLocaleDateString("en-GB", {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  };
}
