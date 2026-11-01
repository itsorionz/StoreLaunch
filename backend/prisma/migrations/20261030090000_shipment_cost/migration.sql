-- §10 cost/parcel per carrier: persist the effective carrier quote on dispatch.
ALTER TABLE "Shipment" ADD COLUMN "costCents" INTEGER;
