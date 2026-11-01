import "dotenv/config";
import { db } from "../lib/db";

async function main() {
  const slides = await db.carouselSlide.findMany({ orderBy: { order: "asc" } });
  console.log("CAROUSEL SLIDES:");
  for (const s of slides) console.log(` ${s.id} | ${s.title} | ${s.imageUrl} | active=${s.active}`);

  const campaigns = await db.campaign.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { products: true } } },
  });
  console.log("CAMPAIGNS:");
  for (const c of campaigns)
    console.log(
      ` ${c.id} | ${c.title} | img=${c.imageUrl} | active=${c.active} showOnHome=${c.showOnHome} flashSale=${c.flashSale} showInCart=${c.showInCart} products=${c._count.products}`,
    );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
