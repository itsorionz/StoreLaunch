ALTER TYPE "WalletTxType" ADD VALUE 'ReferralReward';
ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
ALTER TABLE "StoreSettings" ADD COLUMN "referralEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "referralRewardCents" INTEGER NOT NULL DEFAULT 4000;
ALTER TABLE "StoreSettings" ADD CONSTRAINT "StoreSettings_referralRewardCents_check" CHECK ("referralRewardCents" BETWEEN 0 AND 10000000);
CREATE TABLE "Referral" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "referrerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "refereeId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "rewardCents" INTEGER NOT NULL CHECK ("rewardCents" > 0),
  "currencyCode" TEXT NOT NULL,
  "rewardedAt" TIMESTAMP(3),
  "qualifyingOrderId" TEXT REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  CONSTRAINT "Referral_distinct_users" CHECK ("referrerId" <> "refereeId"),
  CONSTRAINT "Referral_reward_consistency" CHECK (("rewardedAt" IS NULL) = ("qualifyingOrderId" IS NULL))
);
CREATE UNIQUE INDEX "Referral_refereeId_key" ON "Referral"("refereeId");
CREATE UNIQUE INDEX "Referral_qualifyingOrderId_key" ON "Referral"("qualifyingOrderId");
CREATE INDEX "Referral_referrerId_createdAt_idx" ON "Referral"("referrerId", "createdAt");
CREATE TRIGGER "Referral_currency_activity" BEFORE INSERT ON "Referral"
FOR EACH ROW EXECUTE FUNCTION "lock_store_currency_on_activity"();
