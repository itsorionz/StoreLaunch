ALTER TYPE "OrderStatus" ADD VALUE 'RETURNING_TO_ORIGIN';
ALTER TYPE "OrderEventType" ADD VALUE 'RETURN_TO_ORIGIN_STARTED';
ALTER TYPE "OrderEventType" ADD VALUE 'RETURN_TO_ORIGIN_RECEIVED';

ALTER TABLE "RefundRecord" ALTER COLUMN "requestId" DROP NOT NULL;
ALTER TABLE "RefundRecord" ADD COLUMN "orderId" TEXT;
ALTER TABLE "RefundRecord" ADD CONSTRAINT "RefundRecord_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundRecord" ADD CONSTRAINT "RefundRecord_request_or_order_check"
  CHECK ("requestId" IS NOT NULL OR "orderId" IS NOT NULL);
CREATE INDEX "RefundRecord_orderId_tender_status_idx" ON "RefundRecord"("orderId", "tender", "status");
CREATE UNIQUE INDEX "RefundRecord_orderId_tender_key" ON "RefundRecord"("orderId", "tender");
