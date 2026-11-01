CREATE TYPE "CareerJobStatus" AS ENUM ('Draft', 'Published', 'Closed');
CREATE TYPE "CareerEmploymentType" AS ENUM ('FullTime', 'PartTime', 'Contract', 'Internship');
CREATE TYPE "CareerWorkplaceMode" AS ENUM ('OnSite', 'Hybrid', 'Remote');
CREATE TYPE "CareerApplicationStatus" AS ENUM ('New', 'Reviewing', 'Shortlisted', 'Rejected', 'Hired');

CREATE TABLE "CareerJob" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "employmentType" "CareerEmploymentType" NOT NULL,
  "workplaceMode" "CareerWorkplaceMode" NOT NULL,
  "summary" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "requirements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "CareerJobStatus" NOT NULL DEFAULT 'Draft',
  "closesAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdByName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CareerJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CareerApplication" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "resumeUrl" TEXT,
  "coverLetter" TEXT NOT NULL,
  "consentAcceptedAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  "status" "CareerApplicationStatus" NOT NULL DEFAULT 'New',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CareerApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CareerApplication_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "CareerJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CareerJob_slug_key" ON "CareerJob"("slug");
CREATE INDEX "CareerJob_status_publishedAt_idx" ON "CareerJob"("status", "publishedAt");
CREATE INDEX "CareerJob_closesAt_idx" ON "CareerJob"("closesAt");
CREATE UNIQUE INDEX "CareerApplication_jobId_email_key" ON "CareerApplication"("jobId", "email");
CREATE INDEX "CareerApplication_jobId_status_createdAt_idx" ON "CareerApplication"("jobId", "status", "createdAt");
CREATE INDEX "CareerApplication_email_createdAt_idx" ON "CareerApplication"("email", "createdAt");
