-- Preserve read status and deduplication when application event names become camelCase.
UPDATE "InboxMessage" m SET "sourceKey" = left(m."sourceKey", length(m."sourceKey") - length(v.old)) || v.new
FROM (VALUES
  ('PLACED', 'placed'),
  ('PROCESSING', 'processing'),
  ('CONFIRMED', 'confirmed'),
  ('PACKING', 'packing'),
  ('PACKED', 'packed'),
  ('CURRENCY_CONFIRMED', 'currencyConfirmed'),
  ('PAYMENT_CONFIRMED', 'paymentConfirmed'),
  ('PAYMENT_REVIEW_REQUIRED', 'paymentReviewRequired'),
  ('DELIVERY_ASSIGNED', 'deliveryAssigned'),
  ('SHIPPED', 'shipped'),
  ('DELIVERED', 'delivered'),
  ('CANCELLED', 'cancelled'),
  ('WALLET_REFUNDED', 'walletRefunded'),
  ('COD_COLLECTED', 'codCollected'),
  ('COD_REMITTED', 'codRemitted'),
  ('DELIVERY_ATTEMPTED', 'deliveryAttempted'),
  ('DELIVERY_PROOF_RECORDED', 'deliveryProofRecorded')
) AS v(old, new)
WHERE m."sourceKey" LIKE 'order:%' AND right(m."sourceKey", length(v.old) + 1) = ':' || v.old;
