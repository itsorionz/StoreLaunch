-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AddressType') THEN
    CREATE TYPE "AddressType" AS ENUM ('HOME', 'OFFICE', 'OTHER');
  END IF;
END
$$;

-- AlterTable
ALTER TABLE "Address" ADD COLUMN IF NOT EXISTS "type" "AddressType" NOT NULL DEFAULT 'HOME';
