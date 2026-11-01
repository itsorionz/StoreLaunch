CREATE TYPE "ShipmentProviderMode" AS ENUM ('Manual', 'Api');
CREATE TYPE "ShipmentStatus" AS ENUM ('Pending', 'Created', 'InTransit', 'OutForDelivery', 'Delivered', 'Failed', 'Returned');

CREATE TABLE "Shipment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "deliveryCompanyId" TEXT,
  "trackingNumber" TEXT,
  "status" "ShipmentStatus" NOT NULL DEFAULT 'Pending',
  "statusHistory" JSONB,
  "labelUrl" TEXT,
  "handedOverAt" TIMESTAMP(3),
  "lastSyncedAt" TIMESTAMP(3),
  "providerMode" "ShipmentProviderMode" NOT NULL DEFAULT 'Manual',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Shipment_orderId_key" ON "Shipment"("orderId");
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_deliveryCompanyId_fkey" FOREIGN KEY ("deliveryCompanyId") REFERENCES "DeliveryCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");
