CREATE TYPE "PaymentAttemptStatus" AS ENUM ('Created', 'Initiating', 'Ready', 'Unknown', 'Failed', 'Succeeded', 'ReviewRequired', 'Expired');
CREATE TABLE "PaymentAttempt" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "orderId" TEXT NOT NULL UNIQUE REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'Created',
 "sessionKey" TEXT,
 "gatewayUrl" TEXT,
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "nextCheckAt" TIMESTAMP(3) NOT NULL,
 "lastCheckedAt" TIMESTAMP(3),
 "lastError" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "PaymentAttempt_nextCheckAt_status_idx" ON "PaymentAttempt"("nextCheckAt", "status");
-- Existing pending orders may already have a provider session. Never classify them as never started.
INSERT INTO "PaymentAttempt" ("id", "orderId", "status", "expiresAt", "nextCheckAt", "updatedAt", "lastError")
SELECT 'legacy_' || "id", "id", 'Unknown', "createdAt" + INTERVAL '30 minutes',
 (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), 'Imported pending payment; provider verification required'
FROM "Order" WHERE "status" = 'PENDING' AND "paymentMethod" = 'GATEWAY' AND "totalCents" > "walletPaidCents";
