-- Settings may be provisioned around an existing imported catalog. Preserve the lock in that case too.
CREATE FUNCTION "initialize_store_currency_lock"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('store-currency'));
  IF EXISTS (SELECT 1 FROM "Product") OR EXISTS (SELECT 1 FROM "Order")
     OR EXISTS (SELECT 1 FROM "WalletTransaction") OR EXISTS (SELECT 1 FROM "Wallet" WHERE "balanceCents" <> 0) THEN
    NEW."currencyLockedAt" := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "StoreSettings_initial_currency_lock" BEFORE INSERT ON "StoreSettings"
FOR EACH ROW EXECUTE FUNCTION "initialize_store_currency_lock"();
CREATE FUNCTION "prevent_active_store_settings_delete"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."currencyLockedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Store settings with currency activity cannot be deleted';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER "StoreSettings_preserve_currency_lock" BEFORE DELETE ON "StoreSettings"
FOR EACH ROW EXECUTE FUNCTION "prevent_active_store_settings_delete"();
