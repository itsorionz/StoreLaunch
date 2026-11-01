-- CreateTable
CREATE TABLE IF NOT EXISTS "DeliveryCompany" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "trackingUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryCompany_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryCompanyId" TEXT;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_deliveryCompanyId_fkey'
  ) THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryCompanyId_fkey" FOREIGN KEY ("deliveryCompanyId") REFERENCES "DeliveryCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
