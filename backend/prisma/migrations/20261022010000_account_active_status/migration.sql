ALTER TABLE "User" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "AccountStatusEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT,
  "riderId" TEXT,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "previousActive" BOOLEAN NOT NULL,
  "active" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  CONSTRAINT "AccountStatusEvent_target" CHECK (("userId" IS NOT NULL) <> ("riderId" IS NOT NULL))
);
CREATE INDEX "AccountStatusEvent_userId_createdAt_idx" ON "AccountStatusEvent"("userId", "createdAt");
CREATE INDEX "AccountStatusEvent_riderId_createdAt_idx" ON "AccountStatusEvent"("riderId", "createdAt");
