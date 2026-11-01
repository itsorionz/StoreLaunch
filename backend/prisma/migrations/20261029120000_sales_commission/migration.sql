-- Sales commission tracking (§6.1): rep rate on the account, per-order attribution
-- and an immutable commission snapshot computed at order time.
ALTER TABLE "User" ADD COLUMN "commissionBps" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Order" ADD COLUMN "salesRepId" TEXT;
ALTER TABLE "Order" ADD COLUMN "commissionCents" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Order_salesRepId_idx" ON "Order"("salesRepId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
