-- Match PascalCase application event names without resetting inbox read state.
UPDATE "InboxMessage" m SET "sourceKey" = left(m."sourceKey", length(m."sourceKey") - length(v.old)) || v.new
FROM (VALUES
  ('placed', 'Placed'),
  ('processing', 'Processing'),
  ('confirmed', 'Confirmed'),
  ('packing', 'Packing'),
  ('packed', 'Packed'),
  ('currencyConfirmed', 'CurrencyConfirmed'),
  ('paymentConfirmed', 'PaymentConfirmed'),
  ('paymentReviewRequired', 'PaymentReviewRequired'),
  ('deliveryAssigned', 'DeliveryAssigned'),
  ('shipped', 'Shipped'),
  ('delivered', 'Delivered'),
  ('cancelled', 'Cancelled'),
  ('walletRefunded', 'WalletRefunded'),
  ('codCollected', 'CodCollected'),
  ('codRemitted', 'CodRemitted'),
  ('deliveryAttempted', 'DeliveryAttempted'),
  ('deliveryProofRecorded', 'DeliveryProofRecorded')
) AS v(old, new)
WHERE m."sourceKey" LIKE 'order:%' AND right(m."sourceKey", length(v.old) + 1) = ':' || v.old;
