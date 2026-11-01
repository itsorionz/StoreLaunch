-- In-transit stock transfers with approval workflow.
CREATE TYPE "StockTransferStatus" AS ENUM ('Pending', 'InTransit', 'Received', 'Cancelled');

CREATE TABLE "StockTransfer" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "fromWarehouseId" TEXT NOT NULL,
  "toWarehouseId" TEXT NOT NULL,
  "qty" INTEGER NOT NULL,
  "status" "StockTransferStatus" NOT NULL DEFAULT 'Pending',
  "note" TEXT,
  "requestedById" TEXT,
  "requestedByName" TEXT,
  "dispatchedById" TEXT,
  "dispatchedByName" TEXT,
  "receivedById" TEXT,
  "receivedByName" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  "dispatchedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "StockTransfer_status_idx" ON "StockTransfer"("status");
CREATE INDEX "StockTransfer_fromWarehouseId_idx" ON "StockTransfer"("fromWarehouseId");
CREATE INDEX "StockTransfer_toWarehouseId_idx" ON "StockTransfer"("toWarehouseId");
