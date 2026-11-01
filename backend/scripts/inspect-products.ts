import "dotenv/config";
import { db } from "../lib/db";

async function main() {
  const products = await db.product.findMany({
    where: { active: true },
    select: { id: true, name: true, priceCents: true, salePriceCents: true },
    orderBy: { name: "asc" },
  });
  console.log("ACTIVE PRODUCTS:");
  for (const p of products)
    console.log(` ${p.id} | ${p.name} | price=${p.priceCents} sale=${p.salePriceCents ?? "-"}`);

  const links = await db.campaignProduct.findMany({
    select: { campaignId: true, productId: true },
  });
  console.log("EXISTING CAMPAIGN LINKS:");
  for (const l of links) console.log(` ${l.campaignId} -> ${l.productId}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
