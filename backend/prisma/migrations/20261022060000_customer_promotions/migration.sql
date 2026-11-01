CREATE TYPE "PromotionStatus" AS ENUM ('Draft', 'Sent');
CREATE TYPE "PromotionAudience" AS ENUM ('AllCustomers', 'SelectedCustomers');
ALTER TABLE "Campaign" ADD COLUMN "showOnHome" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "Promotion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "href" TEXT,
  "campaignId" TEXT REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "audience" "PromotionAudience" NOT NULL DEFAULT 'AllCustomers',
  "selectedUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "PromotionStatus" NOT NULL DEFAULT 'Draft',
  "createdById" TEXT NOT NULL,
  "createdByName" TEXT NOT NULL,
  "sentById" TEXT,
  "sentByName" TEXT,
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Promotion_status_createdAt_idx" ON "Promotion"("status", "createdAt");
ALTER TABLE "InboxMessage" ADD COLUMN "promotionId" TEXT REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "InboxMessage_promotionId_readAt_idx" ON "InboxMessage"("promotionId", "readAt");
