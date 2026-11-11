-- CreateTable
CREATE TABLE "IssuedLicense" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "storeSlug" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),

    CONSTRAINT "IssuedLicense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IssuedLicense_key_key" ON "IssuedLicense"("key");

-- CreateIndex
CREATE INDEX "IssuedLicense_createdAt_idx" ON "IssuedLicense"("createdAt");
