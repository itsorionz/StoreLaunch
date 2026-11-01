CREATE TYPE "AfterSalesKind" AS ENUM ('Cancellation', 'Return', 'Replacement');
CREATE TYPE "AfterSalesStatus" AS ENUM ('Requested', 'Approved', 'Rejected', 'Received', 'Inspected', 'Resolved');
CREATE TYPE "ReturnDisposition" AS ENUM ('Resellable', 'Damaged', 'WriteOff');
CREATE TYPE "RefundTender" AS ENUM ('Wallet', 'Gateway', 'Cash');
CREATE TYPE "RefundStatus" AS ENUM ('Completed', 'AwaitingExternal');

ALTER TYPE "OrderEventType" ADD VALUE 'RETURN_REQUESTED';
ALTER TYPE "OrderEventType" ADD VALUE 'RETURN_APPROVED';
ALTER TYPE "OrderEventType" ADD VALUE 'RETURN_REJECTED';
ALTER TYPE "OrderEventType" ADD VALUE 'RETURN_RECEIVED';
ALTER TYPE "OrderEventType" ADD VALUE 'RETURN_INSPECTED';
ALTER TYPE "OrderEventType" ADD VALUE 'RETURN_RESOLVED';

ALTER TABLE "StoreSettings" ADD COLUMN "returnWindowDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "StoreSettings" ADD CONSTRAINT "StoreSettings_returnWindowDays_check" CHECK ("returnWindowDays" BETWEEN 0 AND 90);
ALTER TABLE "Order" ADD COLUMN "replacementForOrderId" TEXT REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AfterSalesRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "kind" "AfterSalesKind" NOT NULL,
  "status" "AfterSalesStatus" NOT NULL DEFAULT 'Requested',
  "reason" TEXT NOT NULL,
  "customerNote" TEXT,
  "adminNote" TEXT,
  "externalRefundReference" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  "reviewedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "inspectedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3)
);
CREATE INDEX "AfterSalesRequest_orderId_status_requestedAt_idx" ON "AfterSalesRequest"("orderId", "status", "requestedAt");
CREATE INDEX "AfterSalesRequest_userId_requestedAt_idx" ON "AfterSalesRequest"("userId", "requestedAt");

CREATE TABLE "AfterSalesItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestId" TEXT NOT NULL REFERENCES "AfterSalesRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "orderItemId" TEXT NOT NULL REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestedQuantity" INTEGER NOT NULL CHECK ("requestedQuantity" BETWEEN 1 AND 99),
  "approvedQuantity" INTEGER CHECK ("approvedQuantity" BETWEEN 0 AND 99),
  "receivedQuantity" INTEGER CHECK ("receivedQuantity" BETWEEN 0 AND 99),
  "disposition" "ReturnDisposition",
  "conditionNote" TEXT,
  CONSTRAINT "AfterSalesItem_requestId_orderItemId_key" UNIQUE ("requestId", "orderItemId"),
  CONSTRAINT "AfterSalesItem_received_lte_approved" CHECK ("receivedQuantity" IS NULL OR "approvedQuantity" IS NOT NULL AND "receivedQuantity" <= "approvedQuantity")
);
CREATE INDEX "AfterSalesItem_orderItemId_idx" ON "AfterSalesItem"("orderItemId");

CREATE TABLE "RefundRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestId" TEXT NOT NULL REFERENCES "AfterSalesRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "tender" "RefundTender" NOT NULL,
  "status" "RefundStatus" NOT NULL,
  "amountCents" INTEGER NOT NULL CHECK ("amountCents" > 0),
  "currencyCode" TEXT NOT NULL CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  "externalReference" TEXT,
  "completedById" TEXT NOT NULL,
  "completedByName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  CONSTRAINT "RefundRecord_requestId_tender_key" UNIQUE ("requestId", "tender")
);
CREATE INDEX "RefundRecord_status_createdAt_idx" ON "RefundRecord"("status", "createdAt");
ALTER TABLE "Order" ADD COLUMN "replacementRequestId" TEXT UNIQUE REFERENCES "AfterSalesRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
