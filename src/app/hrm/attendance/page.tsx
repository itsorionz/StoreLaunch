import { connection } from "next/server";
import { unstable_noStore } from "next/cache";
import { getAttendanceBoard } from "@backend/lib/hrm-attendance";
import { bdDayKey } from "@backend/lib/admin-dashboard-periods";
import { AttendanceBoard } from "@frontend/components/hrm/attendance-board";

export default async function AttendancePage() {
  // The board covers "today"; render per request so the date is stable.
  unstable_noStore();
  await connection();
  const dateKey = bdDayKey(new Date());
  const { rows } = await getAttendanceBoard(dateKey);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Attendance</h1>
        <p className="text-sm text-muted">Date: {dateKey}</p>
      </div>
      <AttendanceBoard rows={rows} dateKey={dateKey} />
    </div>
  );
}
