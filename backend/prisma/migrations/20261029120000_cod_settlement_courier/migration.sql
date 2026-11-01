-- Per-courier settlement batches (§9.1): courier snapshot on the immutable batch header.
-- Existing mixed-courier batches keep NULL. ALTER only — the append-only triggers are untouched.
ALTER TABLE "CodSettlement" ADD COLUMN "courierName" TEXT;
CREATE INDEX "CodSettlement_courierName_receivedAt_idx" ON "CodSettlement"("courierName", "receivedAt");
