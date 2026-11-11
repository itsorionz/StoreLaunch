"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AttendanceStatuses } from "@backend/lib/enums.mjs";
import { saveAttendance, markAllPresent, type HrmActionResult } from "@backend/actions/hrm";
import { useToast } from "@frontend/components/ui/toast";
import { ActionResultToast } from "@frontend/components/ui/validated-form";

type Row = {
  employee: {
    id: string;
    employeeCode: string;
    designation: string;
    status: string;
    user: { name: string };
  };
  record: {
    status: string;
    checkInAt: Date | null;
    checkOutAt: Date | null;
    note: string | null;
  } | null;
};

const STATUS_OPTIONS = Object.values(AttendanceStatuses);

function timeKey(instant: Date | null): string {
  if (!instant) return "";
  // Records are stored as BD-midnight + wall clock; recover HH:MM from UTC
  // after shifting back into Bangladesh time.
  const bd = new Date(instant.getTime() + 6 * 3600000);
  return `${String(bd.getUTCHours()).padStart(2, "0")}:${String(bd.getUTCMinutes()).padStart(2, "0")}`;
}

function AttendanceRow({ row, dateKey }: { row: Row; dateKey: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<HrmActionResult, FormData>(saveAttendance, null);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <tr>
      <td className="px-4 py-3">
        <p className="font-semibold">{row.employee.user.name}</p>
        <p className="text-xs text-muted">
          {row.employee.employeeCode} · {row.employee.designation}
        </p>
      </td>
      <td className="px-4 py-3">
        <ActionResultToast
          result={state}
          successMessage={row.record ? "Attendance updated." : "Attendance marked."}
        />
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="employeeId" value={row.employee.id} />
          <input type="hidden" name="date" value={dateKey} />
          <select
            name="status"
            defaultValue={row.record?.status ?? "Present"}
            className="input w-auto"
          >
            {STATUS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <input
            type="time"
            name="checkIn"
            defaultValue={timeKey(row.record?.checkInAt ?? null)}
            className="input w-auto"
            aria-label="Check-in time"
          />
          <input
            type="time"
            name="checkOut"
            defaultValue={timeKey(row.record?.checkOutAt ?? null)}
            className="input w-auto"
            aria-label="Check-out time"
          />
          <button
            type="submit"
            disabled={pending}
            className="btn-outline btn-sm disabled:opacity-50"
          >
            {pending ? "Saving…" : row.record ? "Update" : "Mark"}
          </button>
        </form>
      </td>
    </tr>
  );
}

export function AttendanceBoard({ rows, dateKey }: { rows: Row[]; dateKey: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {rows.filter((row) => row.record).length} of {rows.length} marked for {dateKey}
        </p>
        <button
          type="button"
          disabled={pending}
          className="btn-outline btn-sm disabled:opacity-50"
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await markAllPresent(dateKey);
              if (result?.ok) {
                toast("Unmarked employees set to Present.");
                router.refresh();
              } else {
                const message = result?.error ?? "Could not mark attendance.";
                setError(message);
                toast(message, "error");
              }
            });
          }}
        >
          {pending ? "Marking…" : "Mark all unmarked Present"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-accent">
          {error}
        </p>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Status & times</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length ? (
              rows.map((row) => <AttendanceRow key={row.employee.id} row={row} dateKey={dateKey} />)
            ) : (
              <tr>
                <td colSpan={2} className="p-10 text-center text-muted">
                  No active employees yet. Onboard staff from the Employees page first.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
