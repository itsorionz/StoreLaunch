import "dotenv/config";
import { db } from "../lib/db";

const campaignImages: Record<string, string> = {
  "Spice Cabinet Refresh": "/products/photo-spice-spoons.webp",
  "Honey Harvest": "/products/photo-honey.webp",
  "Nuts, Dates & Dry Fruits": "/categories/photo-dry-fruits.webp",
};

const campaignProducts: Record<string, string[]> = {
  "Spice Cabinet Refresh": [
    "Whole Cumin Seeds 200g",
    "Coriander Powder 250g",
    "Premium Turmeric Powder 250g",
    "House Garam Masala Blend 100g",
    "Bengali Panch Phoron 100g",
  ],
  "Honey Harvest": [
    "Black Seed Honey 250g",
    "Litchi Blossom Honey 500g",
    "Mustard Flower Honey 500g",
    "Sundarbans Wildflower Honey 500g",
  ],
  "Nuts, Dates & Dry Fruits": [
    "Ajwa Dates 500g",
    "Medjool Dates 500g",
    "California Almonds 250g",
    "Premium Cashew Nuts 250g",
    "Roasted Mixed Nuts 300g",
    "Roasted Pistachios 200g",
    "Golden Raisins 250g",
    "Walnut Kernels 200g",
    "Dried Figs 250g",
  ],
};

function offerPrice(base: number): number {
  return Math.max(100, Math.round((base * 0.9) / 1000) * 1000);
}

async function main() {
  const deleted = await db.carouselSlide.deleteMany({
    where: { title: { in: ["Honey harvest deals", "New arrivals in store"] } },
  });
  console.log(`Deleted ${deleted.count} carousel slide(s).`);

  const campaigns = await db.campaign.findMany({
    include: { products: true },
  });

  for (const campaign of campaigns) {
    const imageUrl = campaignImages[campaign.title];
    if (imageUrl) {
      await db.campaign.update({
        where: { id: campaign.id },
        data: { imageUrl, showOnHome: true },
      });
      console.log(`Campaign "${campaign.title}": new image ${imageUrl}, showOnHome=true`);
    }

    const wantedNames = campaignProducts[campaign.title];
    if (!wantedNames) continue;
    const products = await db.product.findMany({
      where: { active: true, name: { in: wantedNames } },
      select: { id: true, name: true, priceCents: true, salePriceCents: true },
    });
    let attached = 0;
    for (const product of products) {
      const already = campaign.products.some((link) => link.productId === product.id);
      if (already) continue;
      await db.campaignProduct.create({
        data: {
          campaignId: campaign.id,
          productId: product.id,
          offerPriceCents: offerPrice(product.salePriceCents ?? product.priceCents),
        },
      });
      attached += 1;
    }
    console.log(`Campaign "${campaign.title}": attached ${attached} product(s) with 10% offer`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
