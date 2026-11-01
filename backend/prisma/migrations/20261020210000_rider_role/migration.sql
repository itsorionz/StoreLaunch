-- AlterEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = '"Role"'::regtype AND enumlabel = 'RIDER') THEN
    ALTER TYPE "Role" ADD VALUE 'RIDER';
  END IF;
END
$$;

-- AlterTable
ALTER TABLE "Rider" ADD COLUMN IF NOT EXISTS "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Rider_userId_key" ON "Rider"("userId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Rider_userId_fkey'
  ) THEN
    ALTER TABLE "Rider" ADD CONSTRAINT "Rider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
