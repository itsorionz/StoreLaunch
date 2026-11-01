ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "PasswordResetChallenge" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PasswordResetChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PasswordResetChallenge_tokenHash_key" ON "PasswordResetChallenge"("tokenHash");
CREATE INDEX "PasswordResetChallenge_userId_createdAt_idx" ON "PasswordResetChallenge"("userId", "createdAt");
CREATE INDEX "PasswordResetChallenge_expiresAt_idx" ON "PasswordResetChallenge"("expiresAt");

CREATE TABLE "AuthRecoveryRequest" (
  "id" TEXT NOT NULL,
  "identifierHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthRecoveryRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuthRecoveryRequest_identifierHash_createdAt_idx" ON "AuthRecoveryRequest"("identifierHash", "createdAt");
