import Link from "next/link";
import { db } from "@backend/lib/db";
import { CareerApplicationStatuses, CareerJobStatuses } from "@backend/lib/enums.mjs";
import { connection } from "next/server";

export const metadata = { title: "Careers | Admin" };

export default async function AdminCareersPage() {
  // Open-role filtering depends on the current time — request-only.
  await connection();
  const [jobs, openRoles, totalApplications, newApplications] = await Promise.all([
    db.careerJob.findMany({
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: { _count: { select: { applications: true } } },
    }),
    db.careerJob.count({
      where: {
        status: CareerJobStatuses.Published,
        OR: [{ closesAt: null }, { closesAt: { gte: new Date() } }],
      },
    }),
    db.careerApplication.count(),
    db.careerApplication.count({ where: { status: CareerApplicationStatuses.New } }),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Hiring</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Careers</h1>
          <p className="mt-2 text-sm text-muted">
            Publish job openings and review candidate applications.
          </p>
        </div>
        <Link href="/admin/careers/new" className="btn-primary">
          + Post a job
        </Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Hiring summary">
        {[
          ["Open roles", openRoles],
          ["Applications", totalApplications],
          ["New applications", newApplications],
        ].map(([label, count]) => (
          <div key={label} className="card p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-2xl font-bold">{count}</p>
          </div>
        ))}
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Position</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Applications</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {jobs.length ? (
              jobs.map((job) => {
                const expired = job.closesAt !== null && job.closesAt < new Date();
                const displayStatus = expired ? "Closed" : job.status;
                return (
                  <tr key={job.id}>
                    <td className="px-4 py-4">
                      <p className="font-semibold">{job.title}</p>
                      <p className="mt-1 text-xs text-muted">/{job.slug}</p>
                    </td>
                    <td className="px-4 py-4">{job.department}</td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${displayStatus === CareerJobStatuses.Published ? "bg-primary/10 text-primary" : "bg-surface-2 text-muted"}`}
                      >
                        {displayStatus}
                      </span>
                    </td>
                    <td className="px-4 py-4">{job._count.applications}</td>
                    <td className="px-4 py-4 text-xs text-muted">
                      {job.updatedAt.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}
                    </td>
                    <td className="px-4 py-4">
                      <Link href={`/admin/careers/${job.id}`} className="btn-outline btn-sm">
                        Manage
                      </Link>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="p-10 text-center text-muted">
                  No positions yet. Create a draft and publish it when you are ready.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
