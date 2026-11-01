CREATE TYPE "OrderCurrencySource" AS ENUM (
  'SNAPSHOT',
  'INFERRED_FROM_SETTINGS',
  'ADMIN_CONFIRMED',
  'UNRECORDED'
);

ALTER TABLE "Order"
  ADD COLUMN "currencySource" "OrderCurrencySource" NOT NULL DEFAULT 'SNAPSHOT';

UPDATE "Order" o
SET "currencySource" = CASE
  WHEN o."currencyCode" IS NULL THEN 'UNRECORDED'::"OrderCurrencySource"
  WHEN EXISTS (
    SELECT 1 FROM "OrderEvent" e
    WHERE e."orderId" = o."id"
      AND e."type" = 'CURRENCY_CONFIRMED'
      AND e."actorRole" = 'SYSTEM'
      AND e."message" LIKE 'Previously unrecorded currency assigned from store settings:%'
  ) THEN 'INFERRED_FROM_SETTINGS'::"OrderCurrencySource"
  WHEN EXISTS (
    SELECT 1 FROM "OrderEvent" e
    WHERE e."orderId" = o."id"
      AND e."type" = 'CURRENCY_CONFIRMED'
      AND e."actorRole" = 'Admin'
      AND e."message" LIKE 'Historical currency confirmed as % Evidence:%'
  ) THEN 'ADMIN_CONFIRMED'::"OrderCurrencySource"
  ELSE 'SNAPSHOT'::"OrderCurrencySource"
END;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_currency_source_consistent"
  CHECK (
    ("currencySource" = 'UNRECORDED' AND "currencyCode" IS NULL AND "currencySymbol" IS NULL)
    OR
    ("currencySource" <> 'UNRECORDED' AND "currencyCode" IS NOT NULL AND "currencySymbol" IS NOT NULL)
  );

CREATE FUNCTION "protect_order_currency_source"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."currencySource" IS DISTINCT FROM NEW."currencySource"
     AND NOT (
       OLD."currencySource" = 'UNRECORDED'
       AND NEW."currencySource" = 'ADMIN_CONFIRMED'
       AND OLD."currencyCode" IS NULL
       AND NEW."currencyCode" IS NOT NULL
       AND NEW."currencySymbol" IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'Order currency provenance cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Order_currency_source_guard"
BEFORE UPDATE OF "currencySource" ON "Order"
FOR EACH ROW EXECUTE FUNCTION "protect_order_currency_source"();
