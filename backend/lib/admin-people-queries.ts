import "server-only";
import { db } from "./db";
import { CareerApplicationStatuses, CareerJobStatuses, Roles } from "./enums.mjs";

/** /admin/customers - customer accounts with order counts and wallet balance */
export async function getCustomers(limit = 200) {
  return db.user.findMany({
    where: { roles: { has: Roles.Customer } },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { orders: true } }, wallet: { select: { balanceCents: true } } },
    take: limit,
  });
}

/** /admin/careers - job list with application counts plus headline counters */
export async function getCareersOverview() {
  return Promise.all([
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
}

/** /admin/careers/[id] - job with its 100 most recent applications */
export async function getCareerJob(id: string) {
  return db.careerJob.findUnique({
    where: { id },
    include: {
      applications: {
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          resumeUrl: true,
          resumeFileName: true,
          coverLetter: true,
          status: true,
          createdAt: true,
          employee: { select: { id: true } },
        },
      },
    },
  });
}

/** /admin/feedback - newest submissions (page renders them) */
export async function getFeedbackSubmissions() {
  return db.feedback.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { name: true, email: true } } },
  });
}

/** /admin/reviews - newest reviews, optionally narrowed to a status tab */
export async function listReviews(status?: string) {
  return db.review.findMany({
    where: status ? { status: status as never } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      product: { select: { name: true, slug: true } },
      user: { select: { name: true, email: true } },
    },
  });
}

/** /admin/wallets - customers and their wallet balance, optionally searched by name/email */
export async function listWalletCustomers(query: string) {
  return db.user.findMany({
    where: {
      roles: { has: Roles.Customer },
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      wallet: { select: { balanceCents: true } },
    },
    take: 200,
  });
}
