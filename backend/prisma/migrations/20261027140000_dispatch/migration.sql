CREATE TYPE "DispatchManifestKind" AS ENUM ('Rider', 'Courier');
CREATE TYPE "DispatchManifestStatus" AS ENUM ('Open', 'HandedOver');

CREATE TABLE "DispatchManifest" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "kind" "DispatchManifestKind" NOT NULL,
  "riderId" TEXT,
  "deliveryCompanyId" TEXT,
  "status" "DispatchManifestStatus" NOT NULL DEFAULT 'Open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  "handedOverAt" TIMESTAMP(3),
  CONSTRAINT "DispatchManifest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DispatchManifest_number_key" ON "DispatchManifest"("number");

CREATE TABLE "DispatchManifestLine" (
  "id" TEXT NOT NULL,
  "manifestId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  CONSTRAINT "DispatchManifestLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DispatchManifestLine_manifestId_orderId_key" ON "DispatchManifestLine"("manifestId","orderId");

ALTER TABLE "DispatchManifest" ADD CONSTRAINT "DispatchManifest_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DispatchManifest" ADD CONSTRAINT "DispatchManifest_deliveryCompanyId_fkey" FOREIGN KEY ("deliveryCompanyId") REFERENCES "DeliveryCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DispatchManifestLine" ADD CONSTRAINT "DispatchManifestLine_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "DispatchManifest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DispatchManifestLine" ADD CONSTRAINT "DispatchManifestLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
