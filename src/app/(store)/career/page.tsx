import { db } from "@backend/lib/db";
import { CareerJobStatuses } from "@backend/lib/enums.mjs";
import { CareerApplicationForm } from "@frontend/components/career/career-application-form";
import { CareerApplyButton } from "@frontend/components/career/career-apply-button";
import { getCurrentUser } from "@backend/lib/session";
import { Suspense } from "react";
import { connection } from "next/server";

export const metadata = {
  title: "Careers | StoreLaunch",
  description: "Explore open roles and apply to join the StoreLaunch team.",
};

const displayValue = (value: string) => value.replace(/([a-z])([A-Z])/g, "$1 $2");

async function CareerContent() {
  // Open-role filtering depends on the current time — request-only.
  await connection();
  const [jobs, currentUser] = await Promise.all([
    db.careerJob.findMany({
      where: {
        status: CareerJobStatuses.Published,
        OR: [{ closesAt: null }, { closesAt: { gte: new Date() } }],
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        department: true,
        location: true,
        employmentType: true,
        workplaceMode: true,
        summary: true,
        description: true,
        requirements: true,
        closesAt: true,
      },
    }),
    getCurrentUser(),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <section className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-primary-dark to-primary p-7 text-white shadow-xl sm:p-12 lg:p-16">
        <div
          className="absolute -right-12 -top-24 -z-10 h-80 w-80 rounded-full bg-white/10 blur-3xl"
          aria-hidden
        />
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-100">
          Careers at StoreLaunch
        </p>
        <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-5xl">
          Help make everyday shopping work better.
        </h1>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-emerald-50 sm:text-lg">
          We bring together commerce, technology and dependable delivery to serve customers across
          Bangladesh. Find a role where your work can make a practical difference.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 text-xs font-semibold sm:text-sm">
          <span className="rounded-full border border-white/20 bg-white/10 px-4 py-2">
            Customer first
          </span>
          <span className="rounded-full border border-white/20 bg-white/10 px-4 py-2">
            Learn as a team
          </span>
          <span className="rounded-full border border-white/20 bg-white/10 px-4 py-2">
            Build with care
          </span>
        </div>
        <a
          href="#open-roles"
          className="mt-9 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-primary-dark transition hover:bg-emerald-50"
        >
          View open roles <span aria-hidden>↓</span>
        </a>
      </section>

      <section className="mt-12 sm:mt-16" id="open-roles">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              Join our team
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Open positions</h2>
          </div>
          <p className="text-sm text-muted">
            {jobs.length} {jobs.length === 1 ? "role" : "roles"} accepting applications
          </p>
        </div>

        {jobs.length ? (
          <div className="mt-6 space-y-5">
            {jobs.map((job) => (
              <article
                key={job.id}
                id={job.slug}
                className="scroll-mt-28 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
              >
                <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-10">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        job.department,
                        displayValue(job.employmentType),
                        displayValue(job.workplaceMode),
                      ].map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <h3 className="mt-4 text-xl font-bold sm:text-2xl">{job.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted">{job.summary}</p>
                    <div className="mt-5 grid gap-5 sm:grid-cols-2">
                      <div>
                        <h4 className="text-sm font-bold">About the role</h4>
                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted">
                          {job.description}
                        </p>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold">What we are looking for</h4>
                        <ul className="mt-2 space-y-2 text-sm leading-6 text-muted">
                          {job.requirements.map((requirement, index) => (
                            <li key={`${index}-${requirement}`} className="flex gap-2">
                              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                              <span>{requirement}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                  <aside className="flex flex-row flex-wrap items-center justify-between gap-4 border-t border-border pt-5 lg:flex-col lg:items-stretch lg:justify-start lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Location
                      </p>
                      <p className="mt-1 text-sm font-semibold">{job.location}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Apply by
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {job.closesAt
                          ? job.closesAt.toLocaleDateString("en-GB", {
                              timeZone: "Asia/Dhaka",
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "Open until filled"}
                      </p>
                    </div>
                    <CareerApplyButton targetId={`apply-${job.id}`} />
                  </aside>
                </div>
                <details
                  id={`apply-${job.id}`}
                  className="group border-t border-border bg-surface-2/60"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-bold sm:px-7">
                    <span>Application form · {job.title}</span>
                    <span
                      className="text-primary transition-transform group-open:rotate-180"
                      aria-hidden
                    >
                      ↓
                    </span>
                  </summary>
                  <div className="px-4 pb-5 sm:px-7 sm:pb-7">
                    <CareerApplicationForm
                      jobId={job.id}
                      jobTitle={job.title}
                      initialValues={{
                        name: currentUser?.name ?? "",
                        email: currentUser?.email ?? "",
                        phone: currentUser?.phone ?? "",
                      }}
                    />
                  </div>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-8 text-center sm:p-12">
            <span
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-xl text-primary"
              aria-hidden
            >
              ✦
            </span>
            <h3 className="mt-4 text-lg font-bold">No open roles right now</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">
              We do not have any positions accepting applications at the moment. Please check back
              soon for new opportunities.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

export default function CareerPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          <div className="skeleton h-64 w-full rounded-3xl" />
          <div className="skeleton h-48 w-full rounded-2xl" />
        </div>
      }
    >
      <CareerContent />
    </Suspense>
  );
}
