CREATE INDEX "Order_riderId_status_deliveredAt_idx" ON "Order"("riderId", "status", "deliveredAt");
CREATE INDEX "CodCollection_collectedById_collectedByRole_collectedAt_idx" ON "CodCollection"("collectedById", "collectedByRole", "collectedAt");
