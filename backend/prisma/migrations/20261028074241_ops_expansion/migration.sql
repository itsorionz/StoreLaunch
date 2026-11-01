-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('Draft', 'Sent', 'Partial', 'Received', 'Cancelled');

-- CreateEnum
CREATE TYPE "PickListStatus" AS ENUM ('Picking', 'Picked', 'Packed');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'WarehouseKeeper';
ALTER TYPE "Role" ADD VALUE 'SalesRep';

-- AlterEnum
ALTER TYPE "ShipmentStatus" ADD VALUE 'Shipped';

-- DropIndex
DROP INDEX "DeliveryZone_active_idx";

-- AlterTable
ALTER TABLE "AccountStatusEvent" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Address" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "AfterSalesRequest" ALTER COLUMN "requestedAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "AuthRecoveryRequest" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Brand" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Campaign" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "CareerApplication" ALTER COLUMN "consentAcceptedAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "CareerJob" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "CarouselSlide" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "ChatConversation" ALTER COLUMN "lastMessageAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "ChatMessage" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "CodCollection" ALTER COLUMN "collectedAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "CodSettlement" ALTER COLUMN "receivedAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "ContactVerificationOtp" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "DeliveryAttempt" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "DeliveryCompany" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "DeliveryProof" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "DeliveryZone" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "DispatchManifest" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Feedback" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "InboxMessage" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "InventoryAdjustment" ADD COLUMN     "warehouseId" TEXT,
ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "License" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "LoginChallenge" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "OrderEvent" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "PasswordResetChallenge" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "PaymentAttempt" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "PhoneOtp" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "reorderPoint" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Promotion" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Referral" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "RefundRecord" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Review" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Rider" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "RiderReview" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Shipment" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "StockNotification" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "StoreSettings" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "SupportTicket" ALTER COLUMN "lastActivityAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "SupportTicketNote" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Wallet" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "WalletTransaction" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Wishlist" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLevel" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "binCode" TEXT,

    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'Draft',
    "expectedAt" TIMESTAMP(3),
    "orderedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qtyOrdered" INTEGER NOT NULL,
    "qtyReceived" INTEGER NOT NULL DEFAULT 0,
    "unitCostCents" INTEGER,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "supplierId" TEXT,
    "warehouseId" TEXT NOT NULL,
    "receivedById" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "note" TEXT,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptLine" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qtyAccepted" INTEGER NOT NULL,
    "qtyRejected" INTEGER NOT NULL DEFAULT 0,
    "condition" TEXT NOT NULL DEFAULT 'Good',
    "unitCostCents" INTEGER,

    CONSTRAINT "ReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickList" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "PickListStatus" NOT NULL DEFAULT 'Picking',
    "pickedById" TEXT,
    "packedById" TEXT,
    "pickedAt" TIMESTAMP(3),
    "packedAt" TIMESTAMP(3),
    "station" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickListLine" (
    "id" TEXT NOT NULL,
    "pickListId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "qtyOrdered" INTEGER NOT NULL,
    "qtyPicked" INTEGER NOT NULL DEFAULT 0,
    "shortPickQty" INTEGER NOT NULL DEFAULT 0,
    "shortPickReason" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickListLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_warehouseId_productId_key" ON "StockLevel"("warehouseId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_number_key" ON "PurchaseOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "PickList_orderId_key" ON "PickList"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PickListLine_pickListId_orderItemId_key" ON "PickListLine"("pickListId", "orderItemId");

-- CreateIndex
CREATE INDEX "DispatchManifest_status_idx" ON "DispatchManifest"("status");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_warehouseId_createdAt_idx" ON "InventoryAdjustment"("warehouseId", "createdAt");

-- AddForeignKey
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickList" ADD CONSTRAINT "PickList_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickList" ADD CONSTRAINT "PickList_pickedById_fkey" FOREIGN KEY ("pickedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickList" ADD CONSTRAINT "PickList_packedById_fkey" FOREIGN KEY ("packedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickListLine" ADD CONSTRAINT "PickListLine_pickListId_fkey" FOREIGN KEY ("pickListId") REFERENCES "PickList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickListLine" ADD CONSTRAINT "PickListLine_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
