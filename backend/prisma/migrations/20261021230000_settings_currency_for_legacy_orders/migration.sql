-- Assign the configured store currency only to orders without a snapshot.
-- Existing recorded currencies remain immutable, including after settings change.
WITH settings AS (
  SELECT "currencyCode", "currencySymbol" FROM "StoreSettings"
  WHERE "currencyCode" ~ '^[A-Z]{3}$' AND length(trim("currencySymbol")) > 0
  ORDER BY "createdAt", "id" LIMIT 1
), assigned AS (
  UPDATE "Order" o SET "currencyCode" = s."currencyCode", "currencySymbol" = s."currencySymbol"
  FROM settings s WHERE o."currencyCode" IS NULL
  RETURNING o."id", o."currencyCode"
)
INSERT INTO "OrderEvent" ("id", "orderId", "type", "actorName", "actorRole", "message", "dedupeKey")
SELECT 'settings_currency_' || md5("id"), "id", 'CURRENCY_CONFIRMED', 'System', 'SYSTEM',
  'Previously unrecorded currency assigned from store settings: ' || "currencyCode" || '.',
  'settings_currency:' || "id"
FROM assigned;
