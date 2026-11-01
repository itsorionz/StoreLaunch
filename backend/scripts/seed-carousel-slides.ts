import "dotenv/config";
import { db } from "../lib/db";

const slides = [
  {
    imageUrl: "/banners/photo-spices.webp",
    title: "Fresh spices at market prices",
    linkUrl: "/products?onSale=1",
    order: 0,
  },
  {
    imageUrl: "/banners/photo-honey.webp",
    title: "Pure honey — harvest picks",
    linkUrl: "/products?sort=rating",
    order: 1,
  },
  {
    imageUrl: "/banners/photo-nuts-dry-fruits.webp",
    title: "Nuts & dry fruits",
    linkUrl: "/products?flashSale=1",
    order: 2,
  },
  {
    imageUrl: "/banners/honey-harvest.svg",
    title: "Honey harvest deals",
    linkUrl: "/products?onSale=1",
    order: 3,
  },
  {
    imageUrl: "/banners/spice-market.svg",
    title: "New arrivals in store",
    linkUrl: "/products?sort=newest",
    order: 4,
  },
];

async function main() {
  const existing = await db.carouselSlide.count();
  if (existing > 0) {
    console.log(`Carousel already has ${existing} slide(s); leaving them untouched.`);
    return;
  }
  for (const slide of slides) {
    await db.carouselSlide.create({ data: { ...slide, active: true } });
  }
  console.log(`Seeded ${slides.length} homepage carousel slides.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
