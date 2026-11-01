ALTER TABLE "Campaign" ADD COLUMN "flashSale" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "CampaignProduct" (
  "campaignId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "offerPriceCents" INTEGER NOT NULL,
  CONSTRAINT "CampaignProduct_pkey" PRIMARY KEY ("campaignId", "productId"),
  CONSTRAINT "CampaignProduct_positive_price" CHECK ("offerPriceCents" > 0),
  CONSTRAINT "CampaignProduct_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CampaignProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CampaignProduct_productId_idx" ON "CampaignProduct"("productId");
