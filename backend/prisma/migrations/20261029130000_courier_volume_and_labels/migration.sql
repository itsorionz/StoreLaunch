-- CreateEnum (§5.4 per-courier label formats)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LabelFormat') THEN
    CREATE TYPE "LabelFormat" AS ENUM ('A4', 'Thermal');
  END IF;
END
$$;

-- AlterTable (§5.3 volume discounts, §5.4 default label format)
ALTER TABLE "DeliveryCompany" ADD COLUMN IF NOT EXISTS "volumeDiscountBps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeliveryCompany" ADD COLUMN IF NOT EXISTS "volumeMinParcels" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeliveryCompany" ADD COLUMN IF NOT EXISTS "labelFormat" "LabelFormat" NOT NULL DEFAULT 'A4';
