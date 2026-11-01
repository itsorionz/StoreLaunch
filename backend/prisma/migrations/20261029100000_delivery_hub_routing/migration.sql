-- Delivery hub routing: zone -> warehouse -> hub mapping and order assignment.
ALTER TABLE "DeliveryZone" ADD COLUMN "warehouseId" TEXT,
  ADD COLUMN "deliveryHubId" TEXT;
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_deliveryHubId_fkey"
  FOREIGN KEY ("deliveryHubId") REFERENCES "DeliveryHub"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "DeliveryZone_warehouseId_idx" ON "DeliveryZone"("warehouseId");
CREATE INDEX "DeliveryZone_deliveryHubId_idx" ON "DeliveryZone"("deliveryHubId");

ALTER TABLE "Order" ADD COLUMN "deliveryHubId" TEXT;
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryHubId_fkey"
  FOREIGN KEY ("deliveryHubId") REFERENCES "DeliveryHub"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Order_deliveryHubId_idx" ON "Order"("deliveryHubId");

CREATE INDEX "DeliveryHub_city_idx" ON "DeliveryHub"("city");
