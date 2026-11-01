BEGIN;
-- PostgreSQL enum value renames retain user IDs, all role assignments and defaults.
ALTER TYPE "Role" RENAME VALUE 'CUSTOMER' TO 'Customer';
ALTER TYPE "Role" RENAME VALUE 'ADMIN' TO 'Admin';
ALTER TYPE "Role" RENAME VALUE 'RIDER' TO 'Rider';

-- Normalize only role-name encodings in existing evidence; no actor IDs, money,
-- timestamps, messages or order states change. Exclusive locks prevent writes
-- while the append-only protections are suspended for this migration only.
LOCK TABLE "OrderEvent", "CodCollection" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "OrderEvent" DISABLE TRIGGER "OrderEvent_append_only";
ALTER TABLE "CodCollection" DISABLE TRIGGER "CodCollection_evidence";
UPDATE "OrderEvent" e SET "actorRole" = v.new
FROM (VALUES ('CUSTOMER', 'Customer'), ('ADMIN', 'Admin'), ('RIDER', 'Rider')) v(old, new)
WHERE e."actorRole" = v.old;
UPDATE "CodCollection" c SET "collectedByRole" = v.new
FROM (VALUES ('CUSTOMER', 'Customer'), ('ADMIN', 'Admin'), ('RIDER', 'Rider')) v(old, new)
WHERE c."collectedByRole" = v.old;
ALTER TABLE "OrderEvent" ENABLE TRIGGER "OrderEvent_append_only";
ALTER TABLE "CodCollection" ENABLE TRIGGER "CodCollection_evidence";
COMMIT;
