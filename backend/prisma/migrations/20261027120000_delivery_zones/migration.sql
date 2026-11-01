-- Phase 1 Delivery zones
CREATE TYPE "DeliveryZoneMode" AS ENUM ('OwnRider', 'Courier');

CREATE TABLE "DeliveryZone" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "areas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "mode" "DeliveryZoneMode" NOT NULL DEFAULT 'OwnRider',
  "deliveryCompanyId" TEXT,
  "rateCents" INTEGER NOT NULL DEFAULT 0,
  "codFeeCents" INTEGER NOT NULL DEFAULT 0,
  "freeOverCents" INTEGER,
  "etaDaysFrom" INTEGER NOT NULL DEFAULT 1,
  "etaDaysTo" INTEGER NOT NULL DEFAULT 3,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_deliveryCompanyId_fkey" FOREIGN KEY ("deliveryCompanyId") REFERENCES "DeliveryCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order" ADD COLUMN "zoneId" TEXT,
ADD COLUMN "zoneRateCents" INTEGER,
ADD COLUMN "zoneCodFeeCents" INTEGER;
ALTER TABLE "Order" ADD CONSTRAINT "Order_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "DeliveryZone_active_idx" ON "DeliveryZone"("active");
