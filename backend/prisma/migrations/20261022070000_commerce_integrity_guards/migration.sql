-- Refuse ambiguous store configuration rather than silently deleting a store row.
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM "StoreSettings") > 1 THEN
    RAISE EXCEPTION 'Multiple StoreSettings rows exist. Reconcile them before applying the singleton migration.';
  END IF;
END $$;

ALTER TABLE "StoreSettings" ADD COLUMN "singletonKey" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "StoreSettings" ADD COLUMN "currencyLockedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "StoreSettings_singletonKey_key" ON "StoreSettings"("singletonKey");
ALTER TABLE "StoreSettings" ADD CONSTRAINT "StoreSettings_singleton" CHECK ("singletonKey" = 1);

UPDATE "StoreSettings" SET "currencyLockedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
WHERE EXISTS (SELECT 1 FROM "Product") OR EXISTS (SELECT 1 FROM "Order")
   OR EXISTS (SELECT 1 FROM "WalletTransaction") OR EXISTS (SELECT 1 FROM "Wallet" WHERE "balanceCents" <> 0);

CREATE FUNCTION "protect_store_currency"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."currencyLockedAt" IS NOT NULL AND NEW."currencyLockedAt" IS DISTINCT FROM OLD."currencyLockedAt" THEN
    RAISE EXCEPTION 'Recorded store currency lock cannot be changed';
  END IF;
  IF NEW."currencyCode" IS DISTINCT FROM OLD."currencyCode" THEN
    PERFORM pg_advisory_xact_lock(hashtext('store-currency'));
    IF OLD."currencyLockedAt" IS NOT NULL
       OR EXISTS (SELECT 1 FROM "Product") OR EXISTS (SELECT 1 FROM "Order")
       OR EXISTS (SELECT 1 FROM "WalletTransaction") OR EXISTS (SELECT 1 FROM "Wallet" WHERE "balanceCents" <> 0) THEN
      RAISE EXCEPTION 'Store currency cannot change after catalog or monetary activity';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "StoreSettings_currency_guard" BEFORE UPDATE ON "StoreSettings"
FOR EACH ROW EXECUTE FUNCTION "protect_store_currency"();

CREATE FUNCTION "lock_store_currency_on_activity"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock_shared(hashtext('store-currency'));
  UPDATE "StoreSettings" SET "currencyLockedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    WHERE "singletonKey" = 1 AND "currencyLockedAt" IS NULL;
  RETURN NEW;
END $$;
CREATE TRIGGER "Product_currency_activity" BEFORE INSERT ON "Product"
FOR EACH ROW EXECUTE FUNCTION "lock_store_currency_on_activity"();
CREATE TRIGGER "Order_currency_activity" BEFORE INSERT ON "Order"
FOR EACH ROW EXECUTE FUNCTION "lock_store_currency_on_activity"();
CREATE TRIGGER "WalletTransaction_currency_activity" BEFORE INSERT ON "WalletTransaction"
FOR EACH ROW EXECUTE FUNCTION "lock_store_currency_on_activity"();
CREATE TRIGGER "Wallet_currency_activity" BEFORE INSERT OR UPDATE OF "balanceCents" ON "Wallet"
FOR EACH ROW WHEN (NEW."balanceCents" <> 0) EXECUTE FUNCTION "lock_store_currency_on_activity"();

CREATE TABLE "InventoryAdjustment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestKey" TEXT NOT NULL,
  "productId" TEXT NOT NULL REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "delta" INTEGER NOT NULL CHECK ("delta" <> 0),
  "previousStock" INTEGER NOT NULL CHECK ("previousStock" BETWEEN 0 AND 1000000),
  "newStock" INTEGER NOT NULL CHECK ("newStock" BETWEEN 0 AND 1000000),
  "expectedUpdatedAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  CONSTRAINT "InventoryAdjustment_arithmetic" CHECK ("newStock"::bigint = "previousStock"::bigint + "delta"::bigint)
);
CREATE UNIQUE INDEX "InventoryAdjustment_requestKey_key" ON "InventoryAdjustment"("requestKey");
CREATE INDEX "InventoryAdjustment_productId_createdAt_idx" ON "InventoryAdjustment"("productId", "createdAt");
CREATE FUNCTION "protect_inventory_adjustment"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Inventory adjustment evidence is append-only';
END $$;
CREATE TRIGGER "InventoryAdjustment_append_only" BEFORE UPDATE OR DELETE ON "InventoryAdjustment"
FOR EACH ROW EXECUTE FUNCTION "protect_inventory_adjustment"();
