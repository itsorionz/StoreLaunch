-- Phase 0 — shared product foundation: SKU / barcode / cost / dimensions
-- plus a controlled reason code on the append-only inventory ledger (A5).

-- CreateEnum
CREATE TYPE "InventoryAdjustmentReason" AS ENUM ('Manual', 'Receiving', 'Stocktake', 'Restock', 'Dispatch');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "barcode" TEXT,
ADD COLUMN "costCents" INTEGER,
ADD COLUMN "heightMm" INTEGER,
ADD COLUMN "lengthMm" INTEGER,
ADD COLUMN "sku" TEXT,
ADD COLUMN "weightGrams" INTEGER,
ADD COLUMN "widthMm" INTEGER;

-- CreateIndex
CREATE INDEX "Product_barcode_idx" ON "Product"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- Backfill: every existing product gets its unique slug as SKU (A4, slug-based).
UPDATE "Product" SET "sku" = "slug" WHERE "sku" IS NULL;

-- AlterTable
ALTER TABLE "InventoryAdjustment" ADD COLUMN "reasonCode" "InventoryAdjustmentReason" NOT NULL DEFAULT 'Manual';
