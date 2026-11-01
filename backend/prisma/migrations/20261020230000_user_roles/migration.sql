-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "roles" "Role"[] NOT NULL DEFAULT ARRAY['CUSTOMER']::"Role"[];

-- Backfill from legacy single role
UPDATE "User" SET roles = CASE
  WHEN "role" = 'ADMIN' THEN ARRAY['CUSTOMER', 'ADMIN']::"Role"[]
  WHEN "role" = 'RIDER' THEN ARRAY['CUSTOMER', 'RIDER']::"Role"[]
  ELSE ARRAY['CUSTOMER']::"Role"[]
END
WHERE "role" IS NOT NULL;

-- DropColumn
ALTER TABLE "User" DROP COLUMN IF EXISTS "role";
