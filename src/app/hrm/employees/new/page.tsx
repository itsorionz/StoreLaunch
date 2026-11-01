import Link from "next/link";
import { z } from "zod";
import { db } from "@backend/lib/db";
import { requireHrmPage } from "@backend/lib/session";
import { listEmployees, bdDayKey } from "@backend/lib/hrm";
import { PageHeader } from "@frontend/components/admin/admin-ui";
import { EmployeeForm } from "@frontend/components/hrm/employee-form";

export const metadata = { title: "Onboard employee | HRM" };

const paramsSchema = z.object({
  userId: z.string().trim().max(100).optional(),
  applicationId: z.string().trim().max(100).optional(),
});

export default async function Hrm({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireHrmPage();
  const raw = await searchParams;
  const parsed = paramsSchema.safeParse({
    userId: typeof raw.userId === "string" ? raw.userId : undefined,
    applicationId: typeof raw.applicationId === "string" ? raw.applicationId : undefined,
  });
  const params = parsed.success ? parsed.data : {};

  const { pendingStaff } = await listEmployees({});

  // Hiring handoff: a Hired application prefills name/email and gets linked.
  const application = params.applicationId
    ? await db.careerApplication.findUnique({
        where: { id: params.applicationId },
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          employee: { select: { id: true } },
        },
      })
    : null;
  const hireable = application && application.status === "Hired" && !application.employee;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboard employee"
        subtitle={
          hireable
            ? `From hiring: ${application!.name} (${application!.email}) — this record will link back to the application.`
            : "Create the employment record, linking an existing staff account or creating a new one."
        }
        action={
          <Link href="/hrm/employees" className="btn-outline">
            ← Back to employees
          </Link>
        }
      />

      {application && !hireable && (
        <p className="card border border-accent/40 bg-accent/5 p-4 text-sm text-accent">
          {application.employee
            ? "That application has already been onboarded."
            : application.status !== "Hired"
              ? `That application is ${application.status.toLowerCase()} — only Hired applications can be onboarded.`
              : "Application not found."}
        </p>
      )}

      <EmployeeForm
        staffOptions={pendingStaff.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
        }))}
        presetUserId={params.userId ?? ""}
        presetName={hireable ? application!.name : ""}
        presetEmail={hireable ? application!.email : ""}
        presetApplicationId={hireable ? application!.id : ""}
      />

      <p className="text-xs text-muted">
        Today is {bdDayKey(new Date())} (Bangladesh). New accounts receive the Customer role plus
        the login role you choose; passwords are hashed with bcrypt. Employment dates are calendar
        days.
      </p>
    </div>
  );
}
