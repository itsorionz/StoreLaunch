CREATE TYPE "InboxCategory" AS ENUM ('PROMOTION', 'NOTIFICATION');
CREATE TABLE "InboxMessage" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "category" "InboxCategory" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "href" TEXT,
  "sourceKey" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  CONSTRAINT "InboxMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InboxMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InboxMessage_userId_sourceKey_key" ON "InboxMessage"("userId", "sourceKey");
CREATE INDEX "InboxMessage_userId_category_createdAt_idx" ON "InboxMessage"("userId", "category", "createdAt");
CREATE INDEX "InboxMessage_userId_readAt_idx" ON "InboxMessage"("userId", "readAt");

-- One current-status summary for each existing order; future events are recorded atomically.
INSERT INTO "InboxMessage" ("id", "userId", "category", "title", "body", "href", "sourceKey", "createdAt")
SELECT 'legacy_order_' || md5("id"), "userId", 'NOTIFICATION', 'Order ' || "number",
  'Your order status is ' || lower("status"::text) || '.', '/account/orders/' || "number",
  'order:' || "id" || ':' || CASE "status"::text WHEN 'PENDING' THEN 'PLACED' WHEN 'PAID' THEN 'PAYMENT_CONFIRMED' ELSE "status"::text END,
  COALESCE("deliveredAt", "shippedAt", "paidAt", "createdAt") FROM "Order";

INSERT INTO "InboxMessage" ("id", "userId", "category", "title", "body", "href", "sourceKey", "createdAt")
SELECT 'legacy_stock_' || md5(s."id"), s."userId", 'NOTIFICATION', 'Back in stock',
  p."name" || ' is available again.', '/products/' || p."slug", 'stock:' || s."id", s."notifiedAt"
FROM "StockNotification" s JOIN "Product" p ON p."id" = s."productId" WHERE s."notifiedAt" IS NOT NULL;
