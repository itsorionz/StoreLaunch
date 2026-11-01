ALTER TYPE "OrderEventType" ADD VALUE 'DELIVERY_ATTEMPTED';
ALTER TYPE "OrderEventType" ADD VALUE 'DELIVERY_PROOF_RECORDED';
CREATE TABLE "DeliveryAttempt" (
  "id" TEXT PRIMARY KEY, "orderId" TEXT NOT NULL REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "riderId" TEXT NOT NULL REFERENCES "Rider"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "reason" TEXT NOT NULL CHECK ("reason" IN ('NO_ANSWER','UNAVAILABLE','ADDRESS_ISSUE','REFUSED','RESCHEDULED','OTHER')),
  "note" TEXT NOT NULL, "nextAttemptAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "DeliveryAttempt_orderId_createdAt_idx" ON "DeliveryAttempt"("orderId", "createdAt");
CREATE INDEX "DeliveryAttempt_riderId_createdAt_idx" ON "DeliveryAttempt"("riderId", "createdAt");
CREATE TABLE "DeliveryProof" (
  "id" TEXT PRIMARY KEY, "orderId" TEXT NOT NULL UNIQUE REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "riderId" TEXT NOT NULL REFERENCES "Rider"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "receivedBy" TEXT NOT NULL, "relationship" TEXT NOT NULL, "note" TEXT NOT NULL,
  "photoKey" TEXT, "photoMime" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "DeliveryProof_riderId_createdAt_idx" ON "DeliveryProof"("riderId", "createdAt");
CREATE FUNCTION "protect_delivery_evidence"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Delivery evidence cannot be changed or deleted'; END;
$$;
CREATE TRIGGER "DeliveryAttempt_evidence" BEFORE UPDATE OR DELETE ON "DeliveryAttempt" FOR EACH ROW EXECUTE FUNCTION "protect_delivery_evidence"();
CREATE TRIGGER "DeliveryProof_evidence" BEFORE UPDATE OR DELETE ON "DeliveryProof" FOR EACH ROW EXECUTE FUNCTION "protect_delivery_evidence"();
