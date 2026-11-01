CREATE TYPE "ContactChannel" AS ENUM ('EMAIL', 'PHONE');

ALTER TABLE "StoreSettings"
  ADD COLUMN "emailVerificationSubject" TEXT NOT NULL DEFAULT 'Verify your email address',
  ADD COLUMN "emailVerificationBody" TEXT NOT NULL DEFAULT 'Your verification code is {{code}}. It expires in {{minutes}} minutes.',
  ADD COLUMN "smsVerificationBody" TEXT NOT NULL DEFAULT 'Your verification code is {{code}}. It expires in {{minutes}} minutes.';

CREATE TABLE "ContactVerificationOtp" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "channel" "ContactChannel" NOT NULL,
  "target" TEXT NOT NULL,
  "previousValue" TEXT,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  CONSTRAINT "ContactVerificationOtp_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContactVerificationOtp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ContactVerificationOtp_userId_channel_target_createdAt_idx" ON "ContactVerificationOtp"("userId", "channel", "target", "createdAt");
CREATE INDEX "ContactVerificationOtp_channel_target_createdAt_idx" ON "ContactVerificationOtp"("channel", "target", "createdAt");
CREATE INDEX "ContactVerificationOtp_expiresAt_idx" ON "ContactVerificationOtp"("expiresAt");
