BEGIN;
-- Department-style role names retain user IDs, all role assignments and defaults.
ALTER TYPE "Role" RENAME VALUE 'CustomerService' TO 'Support';
ALTER TYPE "Role" RENAME VALUE 'WarehouseKeeper' TO 'Warehouse';
ALTER TYPE "Role" RENAME VALUE 'SalesRep' TO 'Sales';

-- New role for managers with HRM access; guarded so re-runs stay idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = '"Role"'::regtype AND enumlabel = 'Manager') THEN
    ALTER TYPE "Role" ADD VALUE 'Manager';
  END IF;
END
$$;

-- Normalize only role-name encodings in existing evidence; no actor IDs, money,
-- timestamps, messages or order states change. Exclusive locks prevent writes
-- while the append-only protections are suspended for this migration only.
LOCK TABLE "OrderEvent", "CodCollection" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "OrderEvent" DISABLE TRIGGER "OrderEvent_append_only";
ALTER TABLE "CodCollection" DISABLE TRIGGER "CodCollection_evidence";
UPDATE "OrderEvent" e SET "actorRole" = v.new
FROM (VALUES ('CustomerService', 'Support'), ('WarehouseKeeper', 'Warehouse'), ('SalesRep', 'Sales')) v(old, new)
WHERE e."actorRole" = v.old;
UPDATE "CodCollection" c SET "collectedByRole" = v.new
FROM (VALUES ('CustomerService', 'Support'), ('WarehouseKeeper', 'Warehouse'), ('SalesRep', 'Sales')) v(old, new)
WHERE c."collectedByRole" = v.old;
ALTER TABLE "OrderEvent" ENABLE TRIGGER "OrderEvent_append_only";
ALTER TABLE "CodCollection" ENABLE TRIGGER "CodCollection_evidence";
COMMIT;
