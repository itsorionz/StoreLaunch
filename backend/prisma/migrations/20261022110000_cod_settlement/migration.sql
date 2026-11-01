CREATE TYPE "CodSettlementMethod" AS ENUM ('Cash', 'BankTransfer', 'MobileFinancialService', 'Other');
ALTER TYPE "OrderEventType" ADD VALUE 'COD_SETTLEMENT_RECORDED';

CREATE TABLE "CodSettlement" (
  "id" TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "method" "CodSettlementMethod" NOT NULL,
  "reference" TEXT NOT NULL,
  "expectedCents" INTEGER NOT NULL,
  "receivedCents" INTEGER NOT NULL,
  "varianceCents" INTEGER NOT NULL,
  "varianceReason" TEXT,
  "note" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  "receivedById" TEXT NOT NULL,
  "receivedByName" TEXT NOT NULL,
  CONSTRAINT "CodSettlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CodSettlement_amounts_check" CHECK ("expectedCents" > 0 AND "receivedCents" >= 0 AND "varianceCents" = "receivedCents" - "expectedCents"),
  CONSTRAINT "CodSettlement_variance_reason_check" CHECK ("varianceCents" = 0 OR COALESCE(length(trim("varianceReason")), 0) > 0)
);
CREATE UNIQUE INDEX "CodSettlement_reference_key" ON "CodSettlement"("reference");
CREATE INDEX "CodSettlement_receivedAt_currencyCode_idx" ON "CodSettlement"("receivedAt", "currencyCode");

CREATE TABLE "CodSettlementLine" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "codCollectionId" TEXT NOT NULL,
  "outstandingCents" INTEGER NOT NULL,
  "expectedCents" INTEGER NOT NULL,
  "receivedCents" INTEGER NOT NULL,
  "appliedCents" INTEGER NOT NULL,
  "varianceCents" INTEGER NOT NULL,
  "varianceReason" TEXT,
  CONSTRAINT "CodSettlementLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CodSettlementLine_amounts_check" CHECK ("outstandingCents" > 0 AND "expectedCents" > 0 AND "expectedCents" <= "outstandingCents" AND "receivedCents" >= 0 AND "appliedCents" = LEAST("receivedCents", "outstandingCents") AND "varianceCents" = "receivedCents" - "expectedCents"),
  CONSTRAINT "CodSettlementLine_variance_reason_check" CHECK ("varianceCents" = 0 OR COALESCE(length(trim("varianceReason")), 0) > 0),
  CONSTRAINT "CodSettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "CodSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CodSettlementLine_codCollectionId_fkey" FOREIGN KEY ("codCollectionId") REFERENCES "CodCollection"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CodSettlementLine_settlementId_codCollectionId_key" ON "CodSettlementLine"("settlementId", "codCollectionId");
CREATE INDEX "CodSettlementLine_codCollectionId_idx" ON "CodSettlementLine"("codCollectionId");

