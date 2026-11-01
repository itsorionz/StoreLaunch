-- Unknown historical currency and cash collection are deliberately not backfilled.
BEGIN;
ALTER TABLE "Order" ADD COLUMN "currencyCode" TEXT,
                    ADD COLUMN "currencySymbol" TEXT;

CREATE TYPE "OrderEventType" AS ENUM ('PLACED', 'CURRENCY_CONFIRMED', 'PAYMENT_CONFIRMED', 'PAYMENT_REVIEW_REQUIRED', 'DELIVERY_ASSIGNED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'WALLET_REFUNDED', 'COD_COLLECTED', 'COD_REMITTED');

CREATE TABLE "OrderEvent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "type" "OrderEventType" NOT NULL,
  "actorId" TEXT,
  "actorName" TEXT NOT NULL,
  "actorRole" TEXT NOT NULL,
  "fromStatus" "OrderStatus",
  "toStatus" "OrderStatus",
  "message" TEXT NOT NULL,
  "amountCents" INTEGER,
  "dedupeKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OrderEvent_dedupeKey_key" ON "OrderEvent"("dedupeKey");
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

CREATE TABLE "CodCollection" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL CHECK ("amountCents" > 0),
  "currencyCode" TEXT NOT NULL,
  "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "collectedById" TEXT NOT NULL,
  "collectedByName" TEXT NOT NULL,
  "collectedByRole" TEXT NOT NULL,
  "courierName" TEXT NOT NULL,
  "remittedAt" TIMESTAMP(3),
  "remittedById" TEXT,
  "remittedByName" TEXT,
  "remittanceReference" TEXT,
  CONSTRAINT "CodCollection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CodCollection_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CodCollection_remittance_complete" CHECK (
    ("remittedAt" IS NULL AND "remittedById" IS NULL AND "remittedByName" IS NULL AND "remittanceReference" IS NULL)
    OR ("remittedAt" IS NOT NULL AND "remittedById" IS NOT NULL AND "remittedByName" IS NOT NULL AND length(trim("remittanceReference")) > 0 AND "remittanceReference" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "CodCollection_orderId_key" ON "CodCollection"("orderId");
CREATE INDEX "CodCollection_remittedAt_currencyCode_idx" ON "CodCollection"("remittedAt", "currencyCode");

-- Protect the audit trail even if a future application path attempts to edit it.
CREATE FUNCTION "reject_order_event_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Order events are append-only';
END;
$$;
CREATE TRIGGER "OrderEvent_append_only" BEFORE UPDATE OR DELETE ON "OrderEvent"
FOR EACH ROW EXECUTE FUNCTION "reject_order_event_mutation"();

-- Only the first remittance may be added; collection evidence cannot be rewritten.
CREATE FUNCTION "protect_cod_collection"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'COD collection evidence cannot be deleted'; END IF;
  IF OLD."remittedAt" IS NOT NULL OR
     (to_jsonb(NEW) - ARRAY['remittedAt', 'remittedById', 'remittedByName', 'remittanceReference']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['remittedAt', 'remittedById', 'remittedByName', 'remittanceReference']) THEN
    RAISE EXCEPTION 'COD collection evidence cannot be rewritten';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "CodCollection_evidence" BEFORE UPDATE OR DELETE ON "CodCollection"
FOR EACH ROW EXECUTE FUNCTION "protect_cod_collection"();

ALTER TABLE "Order" ADD CONSTRAINT "Order_currency_code" CHECK ("currencyCode" IS NULL OR "currencyCode" ~ '^[A-Z]{3}$');
CREATE FUNCTION "protect_order_currency"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."currencyCode" IS NOT NULL AND
     (NEW."currencyCode" IS DISTINCT FROM OLD."currencyCode" OR NEW."currencySymbol" IS DISTINCT FROM OLD."currencySymbol") THEN
    RAISE EXCEPTION 'Order currency cannot be changed after it is recorded';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Order_currency_snapshot" BEFORE UPDATE OF "currencyCode", "currencySymbol" ON "Order"
FOR EACH ROW EXECUTE FUNCTION "protect_order_currency"();
COMMIT;
