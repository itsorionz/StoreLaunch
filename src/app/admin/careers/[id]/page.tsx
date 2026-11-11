import Link from "next/link";
import { notFound } from "next/navigation";
import { getCareerJob } from "@backend/lib/admin-people-queries";
import { CareerApplicationStatuses } from "@backend/lib/enums.mjs";
import { CareerJobForm } from "@frontend/components/admin/career-job-form";
import { CareerApplicationStatusForm } from "@frontend/components/admin/career-application-status-form";

export const metadata = { title: "Manage job | Admin" };

export default async function ManageCareerJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getCareerJob(id);
  if (!job) notFound();

  const newApplications = job.applications.filter(
    (application) => application.status === CareerApplicationStatuses.New,
  ).length;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/careers" className="text-sm font-medium text-primary hover:underline">
          ← Careers
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Manage position</h1>
            <p className="mt-1 text-sm text-muted">
              {job.applications.length} recent applications · {newApplications} new
            </p>
          </div>
          <Link href={`/career#${job.slug}`} target="_blank" className="btn-outline">
            View public listing
          </Link>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-bold">Job details</h2>
        <CareerJobForm
          job={{
            id: job.id,
            slug: job.slug,
            title: job.title,
            department: job.department,
            location: job.location,
            employmentType: job.employmentType,
            workplaceMode: job.workplaceMode,
            summary: job.summary,
            description: job.description,
            requirements: job.requirements,
            status: job.status,
            closesAt: job.closesAt,
          }}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold">Applications</h2>
          <p className="mt-1 text-sm text-muted">
            Candidate contact information is only available in the admin area.
          </p>
        </div>
        {job.applications.length ? (
          <div className="space-y-4">
            {job.applications.map((application) => (
              <article key={application.id} className="card space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="font-bold">{application.name}</h3>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                      <a href={`mailto:${application.email}`} className="hover:text-primary">
                        {application.email}
                      </a>
                      <a href={`tel:${application.phone}`} className="hover:text-primary">
                        {application.phone}
                      </a>
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      Received{" "}
                      {application.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}
                    </p>
                  </div>
                  {application.resumeUrl && (
                    <a
                      href={application.resumeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-outline btn-sm"
                    >
                      Resume / portfolio ↗
                    </a>
                  )}
                  {application.resumeFileName && (
                    <a
                      href={`/api/admin/career-applications/${application.id}/resume`}
                      className="btn-outline btn-sm"
                    >
                      Download CV ({application.resumeFileName})
                    </a>
                  )}
                </div>
                <div className="rounded-xl bg-surface-2 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Cover letter
                  </p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6">
                    {application.coverLetter}
                  </p>
                </div>
                <CareerApplicationStatusForm
                  applicationId={application.id}
                  status={application.status}
                />
                {application.status === CareerApplicationStatuses.Hired &&
                  (application.employee ? (
                    <Link
                      href={`/hrm/employees/${application.employee.id}`}
                      className="inline-block text-sm font-medium text-primary hover:underline"
                    >
                      View employee record in HRM →
                    </Link>
                  ) : (
                    <Link
                      href={`/hrm/employees/new?applicationId=${application.id}`}
                      className="inline-block text-sm font-medium text-primary hover:underline"
                    >
                      Onboard to HRM →
                    </Link>
                  ))}
              </article>
            ))}
          </div>
        ) : (
          <div className="card p-8 text-center text-sm text-muted">
            No applications yet. They will appear here when candidates apply.
          </div>
        )}
      </section>
    </div>
  );
}
