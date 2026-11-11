import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHrmPage } from "@backend/lib/session";
import { getEmployeeDetail } from "@backend/lib/hrm";
import { getDict } from "@frontend/i18n/dict";
import { StatusBadge } from "@frontend/components/admin/admin-ui";

export const metadata = { title: "Employee — HRM" };

export default async function HrmEmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireHrmPage();
  const dict = await getDict();
  const detail = await getEmployeeDetail(id);
  if (!detail) notFound();
  const { employee, attendance, leaveRequests, payslips, reviews, documents } = detail;

  const attendanceSummary = attendance.reduce(
    (acc, record) => {
      acc[record.status] = (acc[record.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">HRM</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{employee.user.name}</h1>
          <p className="mt-1 text-sm text-muted">{employee.user.email}</p>
          <p className="mt-1 text-sm text-muted">
            Roles:{" "}
            {employee.user.roles.map((r) => r.replace(/([a-z])([A-Z])/g, "$1 $2")).join(", ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/hrm/employees" className="btn-outline">
            {dict.common.back}
          </Link>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card p-5 sm:p-6">
          <h2 className="font-bold">User account</h2>
          <div className="mt-3 p-3 border rounded-lg bg-surface-2">
            <p className="text-sm font-medium">Name</p>
            <p className="mt-1 truncate">{employee.user.name}</p>
            <p className="text-sm text-muted">Email</p>
            <p className="mt-1 truncate">{employee.user.email}</p>
            <p className="text-sm text-muted">Phone</p>
            <p className="mt-1 truncate">{employee.user.phone ?? "No phone"}</p>
            <p className="text-sm font-medium">Roles</p>
            <p className="mt-1">
              {employee.user.roles.map((r) => r.replace(/([a-z])([A-Z])/g, "$1 $2")).join(", ")}
            </p>
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="font-bold">Employment details</h2>
          <div className="mt-3 p-3 border rounded-lg bg-surface-2">
            <p className="text-sm font-medium">Designation</p>
            <p className="mt-1">{employee.designation || "—"}</p>
            <p className="text-sm font-medium">Department</p>
            <p className="mt-1">{employee.department || "—"}</p>
            <p className="text-sm font-medium">Employment type</p>
            <p className="mt-1">{employee.employmentType || "—"}</p>
            <p className="text-sm font-medium">Status</p>
            <p className="mt-1">
              <StatusBadge status={employee.status ?? "Active"} />
            </p>
            <p className="text-sm font-medium">Join date</p>
            <p className="mt-1">{employee.joinDate?.toString().substring(0, 10) ?? "—"}</p>
          </div>
        </section>
      </div>

      <section className="grid gap-5 xl:grid-cols-2">
        <section className="card p-5 sm:p-6">
          <h2 className="font-bold">Attendance</h2>
          <p className="mt-1 text-sm text-muted">
            {attendanceSummary.Approved ?? 0} approved · {attendanceSummary.Pending ?? 0} pending
          </p>
          <div className="mt-3">
            {attendance.length > 0 ? (
              <ul className="divide-y divide-border">
                {attendance.map((record) => (
                  <li key={record.id} className="py-2">
                    <p className="font-medium">{record.date.toLocaleDateString()}</p>
                    <p className="text-xs text-muted">
                      {record.status}:{" "}
                      {record.checkInAt ? record.checkInAt.toLocaleTimeString() : "—"} —{" "}
                      {record.checkOutAt ? record.checkOutAt.toLocaleTimeString() : "—"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">No attendance records yet.</p>
            )}
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="font-bold">Leave requests</h2>
          <p className="mt-1 text-sm text-muted">{leaveRequests.length} request(s)</p>
          <ul className="mt-3 divide-y divide-border">
            {leaveRequests.map((request) => (
              <li key={request.id} className="py-2">
                <p className="font-medium">{request.type}</p>
                <p className="text-xs text-muted">
                  {request.startDate.toLocaleDateString()} – {request.endDate.toLocaleDateString()}{" "}
                  ({request.status})
                </p>
              </li>
            ))}
          </ul>
        </section>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <section className="card p-5 sm:p-6">
          <h2 className="font-bold">Payslips</h2>
          <p className="mt-1 text-sm text-muted">{payslips.length} slip(s)</p>
          <ul className="mt-3 divide-y divide-border">
            {payslips.map((payslip) => (
              <li key={payslip.id} className="py-2">
                <p className="font-medium">
                  {payslip.run.month.toLocaleDateString()} {payslip.run.currencyCode}
                </p>
                <p className="text-xs text-muted">¥ {payslip.baseSalaryCents / 100}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="font-bold">Performance reviews</h2>
          <p className="mt-1 text-sm text-muted">{reviews.length} review(s)</p>
          <ul className="mt-3 divide-y divide-border">
            {reviews.map((review) => (
              <li key={review.id} className="py-2">
                <p className="font-medium">
                  Period {review.periodStart.toLocaleDateString()} –{" "}
                  {review.periodEnd.toLocaleDateString()}
                </p>
                <p className="text-xs text-muted">Rating: {review.rating}/5</p>
              </li>
            ))}
          </ul>
        </section>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="font-bold">Documents</h2>
        <p className="mt-1 text-sm text-muted">{documents.length} document(s)</p>
        <ul className="mt-3 divide-y divide-border">
          {documents.map((doc) => (
            <li key={doc.id} className="py-2">
              <p className="font-medium">{doc.title}</p>
              <p className="text-xs text-muted">{doc.kind}</p>
              {doc.url && (
                <a href={doc.url} className="text-primary underline">
                  Open
                </a>
              )}
            </li>
          ))}
        </ul>
        <Link
          href="/hrm/employees/${employee.id}/documents"
          className="mt-3 text-primary underline"
        >
          + Add document
        </Link>
      </section>
    </div>
  );
}
