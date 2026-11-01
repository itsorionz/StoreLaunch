CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX "Order_paidAt_idx" ON "Order"("paidAt");
CREATE INDEX "Order_status_shippedAt_idx" ON "Order"("status", "shippedAt");
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
