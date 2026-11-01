import { Roles } from "@backend/lib/enums.mjs";
import type { Prisma, PrismaClient } from "@backend/generated/prisma/client";
import bcrypt from "bcryptjs";

type Db = PrismaClient | Prisma.TransactionClient;

const categories = [
  {
    name: "Spices & Masala",
    nameBn: "মসলা ও মশলা গুঁড়া",
    slug: "spices-masala",
    imageUrl: "/categories/photo-spices.webp",
    order: 1,
  },
  {
    name: "Honey",
    nameBn: "মধু",
    slug: "honey",
    imageUrl: "/categories/photo-honey.webp",
    order: 2,
  },
  {
    name: "Nuts",
    nameBn: "বাদাম",
    slug: "nuts",
    imageUrl: "/categories/photo-nuts.webp",
    order: 3,
  },
  {
    name: "Dates & Dry Fruits",
    nameBn: "খেজুর ও শুকনো ফল",
    slug: "dates-dry-fruits",
    imageUrl: "/categories/photo-dry-fruits.webp",
    order: 4,
  },
];

const brands = [
  { name: "Deshi Shad", nameBn: "দেশি স্বাদ", slug: "deshi-shad" },
  { name: "Madhur Bangla", nameBn: "মধুর বাংলা", slug: "madhur-bangla" },
  { name: "Paharika", nameBn: "পাহাড়িকা", slug: "paharika" },
  { name: "Nutri Harvest", nameBn: "নিউট্রি হারভেস্ট", slug: "nutri-harvest" },
  { name: "Shuddho Naturals", nameBn: "শুদ্ধ ন্যাচারালস", slug: "shuddho-naturals" },
];

type SeedProduct = {
  name: string;
  nameBn: string;
  slug: string;
  description: string;
  descriptionBn: string;
  priceCents: number;
  salePriceCents?: number;
  stock: number;
  image: string;
  flashSale?: boolean;
  featured?: boolean;
  category: string;
  brand?: string;
};

const products: SeedProduct[] = [
  {
    name: "Kashmiri Red Chili Powder 200g",
    nameBn: "কাশ্মীরি লাল মরিচ গুঁড়া ২০০ গ্রাম",
    slug: "kashmiri-red-chili-powder-200g",
    description:
      "Vibrant, mildly smoky chili powder for curries, marinades and a rich natural colour. Packed fresh in a resealable pouch.",
    descriptionBn:
      "তরকারি, মেরিনেড ও খাবারে প্রাকৃতিক রং আনতে ঝাঁঝালো ও হালকা ধোঁয়াটে স্বাদের মরিচ গুঁড়া। পুনরায় বন্ধ করা যায় এমন প্যাকে সতেজভাবে মোড়কজাত।",
    priceCents: 32000,
    salePriceCents: 27900,
    stock: 120,
    image: "/products/photo-spice-spoons.webp",
    flashSale: true,
    featured: true,
    category: "spices-masala",
    brand: "deshi-shad",
  },
  {
    name: "Premium Turmeric Powder 250g",
    nameBn: "প্রিমিয়াম হলুদ গুঁড়া ২৫০ গ্রাম",
    slug: "premium-turmeric-powder-250g",
    description:
      "Fine-ground turmeric with a warm aroma and golden colour, ideal for everyday Bengali cooking.",
    descriptionBn:
      "মিহি করে গুঁড়া করা সুগন্ধি হলুদ, প্রতিদিনের বাঙালি রান্নায় উজ্জ্বল সোনালি রং ও স্বাদ যোগ করে।",
    priceCents: 22000,
    salePriceCents: 19000,
    stock: 150,
    image: "/products/photo-spices.webp",
    featured: true,
    category: "spices-masala",
    brand: "deshi-shad",
  },
  {
    name: "Whole Cumin Seeds 200g",
    nameBn: "আস্ত জিরা ২০০ গ্রাম",
    slug: "whole-cumin-seeds-200g",
    description: "Aromatic whole cumin for tempering, roasting and freshly ground spice blends.",
    descriptionBn: "ফোড়ন, ভাজা ও ঘরে মসলা গুঁড়া করার জন্য সুগন্ধি আস্ত জিরা।",
    priceCents: 30000,
    salePriceCents: 26500,
    stock: 85,
    image: "/products/photo-spice-spoons.webp",
    category: "spices-masala",
    brand: "paharika",
  },
  {
    name: "Coriander Powder 250g",
    nameBn: "ধনিয়া গুঁড়া ২৫০ গ্রাম",
    slug: "coriander-powder-250g",
    description: "Freshly milled coriander with a citrusy, mellow aroma for daily meals.",
    descriptionBn: "প্রতিদিনের রান্নার জন্য সতেজভাবে গুঁড়া করা মৃদু সুগন্ধি ধনিয়া।",
    priceCents: 18000,
    salePriceCents: 15500,
    stock: 110,
    image: "/products/photo-spice-spoons.webp",
    flashSale: true,
    category: "spices-masala",
    brand: "deshi-shad",
  },
  {
    name: "House Garam Masala Blend 100g",
    nameBn: "ঘরোয়া গরম মসলা মিশ্রণ ১০০ গ্রাম",
    slug: "house-garam-masala-blend-100g",
    description:
      "A balanced house blend of whole spices, ground in small batches for a deep finishing aroma.",
    descriptionBn:
      "বাছাই করা আস্ত মসলার সুষম ঘরোয়া মিশ্রণ, ছোট ব্যাচে গুঁড়া করা—রান্নার শেষে যোগ করুন।",
    priceCents: 28000,
    salePriceCents: 24500,
    stock: 70,
    image: "/products/photo-spices.webp",
    featured: true,
    category: "spices-masala",
    brand: "shuddho-naturals",
  },
  {
    name: "Bengali Panch Phoron 100g",
    nameBn: "বাংলা পাঁচফোড়ন ১০০ গ্রাম",
    slug: "bengali-panch-phoron-100g",
    description:
      "The classic five-spice seed blend for dals, vegetables, pickles and fish curries.",
    descriptionBn: "ডাল, সবজি, আচার ও মাছের তরকারির জন্য পাঁচ ধরনের বীজের ঐতিহ্যবাহী মিশ্রণ।",
    priceCents: 14000,
    stock: 95,
    image: "/products/photo-spices.webp",
    category: "spices-masala",
    brand: "deshi-shad",
  },
  {
    name: "Sundarbans Wildflower Honey 500g",
    nameBn: "সুন্দরবনের প্রাকৃতিক মধু ৫০০ গ্রাম",
    slug: "sundarbans-wildflower-honey-500g",
    description:
      "Rich raw honey collected from wildflower sources around the Sundarbans. No added sugar or flavouring.",
    descriptionBn:
      "সুন্দরবন অঞ্চলের বুনো ফুল থেকে সংগৃহীত ঘন প্রাকৃতিক মধু। বাড়তি চিনি বা ফ্লেভার মেশানো হয় না।",
    priceCents: 95000,
    salePriceCents: 85000,
    stock: 55,
    image: "/products/photo-honey.webp",
    flashSale: true,
    featured: true,
    category: "honey",
    brand: "madhur-bangla",
  },
  {
    name: "Mustard Flower Honey 500g",
    nameBn: "সরিষা ফুলের মধু ৫০০ গ্রাম",
    slug: "mustard-flower-honey-500g",
    description: "Golden mustard blossom honey with a gentle floral aroma and smooth finish.",
    descriptionBn: "সোনালি রঙের সরিষা ফুলের মধু, হালকা ফুলেল ঘ্রাণ ও মসৃণ স্বাদের।",
    priceCents: 78000,
    salePriceCents: 69000,
    stock: 68,
    image: "/products/photo-honey.webp",
    category: "honey",
    brand: "madhur-bangla",
  },
  {
    name: "Black Seed Honey 250g",
    nameBn: "কালোজিরা ফুলের মধু ২৫০ গ্রাম",
    slug: "black-seed-honey-250g",
    description: "Small-batch honey with a distinct floral taste, carefully jarred for freshness.",
    descriptionBn: "বিশেষ ফুলেল স্বাদের মধু ছোট ব্যাচে সংগ্রহ ও সতেজতা বজায় রেখে বোতলজাত করা।",
    priceCents: 62000,
    salePriceCents: 56000,
    stock: 42,
    image: "/products/photo-honey.webp",
    featured: true,
    category: "honey",
    brand: "shuddho-naturals",
  },
  {
    name: "Litchi Blossom Honey 500g",
    nameBn: "লিচু ফুলের মধু ৫০০ গ্রাম",
    slug: "litchi-blossom-honey-500g",
    description: "Light, fragrant honey harvested during the litchi blossom season.",
    descriptionBn: "লিচু ফুলের মৌসুমে সংগ্রহ করা হালকা ও সুগন্ধি মধু।",
    priceCents: 82000,
    stock: 35,
    image: "/products/photo-honey.webp",
    category: "honey",
    brand: "madhur-bangla",
  },
  {
    name: "California Almonds 250g",
    nameBn: "ক্যালিফোর্নিয়ার কাঠবাদাম ২৫০ গ্রাম",
    slug: "california-almonds-250g",
    description: "Whole crunchy almonds, packed in a resealable pouch for everyday snacking.",
    descriptionBn: "প্রতিদিনের নাশতার জন্য আস্ত মচমচে কাঠবাদাম, পুনরায় বন্ধ করা যায় এমন প্যাকে।",
    priceCents: 52000,
    salePriceCents: 46500,
    stock: 80,
    image: "/products/photo-almonds.webp",
    flashSale: true,
    featured: true,
    category: "nuts",
    brand: "nutri-harvest",
  },
  {
    name: "Premium Cashew Nuts 250g",
    nameBn: "প্রিমিয়াম কাজুবাদাম ২৫০ গ্রাম",
    slug: "premium-cashew-nuts-250g",
    description: "Creamy whole cashews selected for a satisfying snack or rich desserts.",
    descriptionBn: "নাশতা ও মজাদার মিষ্টান্নের জন্য বাছাই করা আস্ত মাখনস্বাদী কাজুবাদাম।",
    priceCents: 68000,
    salePriceCents: 61000,
    stock: 58,
    image: "/products/photo-cashews.webp",
    featured: true,
    category: "nuts",
    brand: "nutri-harvest",
  },
  {
    name: "Roasted Pistachios 200g",
    nameBn: "ভাজা পেস্তাবাদাম ২০০ গ্রাম",
    slug: "roasted-pistachios-200g",
    description: "Lightly roasted pistachios with a delicate crunch, ready to serve.",
    descriptionBn: "হালকা ভাজা মচমচে পেস্তাবাদাম, পরিবেশনের জন্য প্রস্তুত।",
    priceCents: 76000,
    salePriceCents: 69000,
    stock: 33,
    image: "/products/photo-pistachios.webp",
    category: "nuts",
    brand: "nutri-harvest",
  },
  {
    name: "Walnut Kernels 200g",
    nameBn: "আখরোটের শাঁস ২০০ গ্রাম",
    slug: "walnut-kernels-200g",
    description: "Carefully packed walnut halves with a rich, earthy flavour.",
    descriptionBn: "সমৃদ্ধ মাটির ঘ্রাণ ও স্বাদের বাছাই করা আখরোটের শাঁস যত্নে প্যাক করা।",
    priceCents: 65000,
    stock: 46,
    image: "/products/photo-walnuts.webp",
    category: "nuts",
    brand: "shuddho-naturals",
  },
  {
    name: "Ajwa Dates 500g",
    nameBn: "আজওয়া খেজুর ৫০০ গ্রাম",
    slug: "ajwa-dates-500g",
    description: "Soft, naturally sweet Ajwa dates, hand selected and packed by weight.",
    descriptionBn: "নরম ও প্রাকৃতিক মিষ্টি আজওয়া খেজুর হাতে বাছাই করে ওজন অনুযায়ী প্যাক করা।",
    priceCents: 98000,
    salePriceCents: 89000,
    stock: 62,
    image: "/products/photo-dates.webp",
    flashSale: true,
    featured: true,
    category: "dates-dry-fruits",
    brand: "nutri-harvest",
  },
  {
    name: "Medjool Dates 500g",
    nameBn: "মেডজুল খেজুর ৫০০ গ্রাম",
    slug: "medjool-dates-500g",
    description: "Large, tender Medjool dates with a caramel-like natural sweetness.",
    descriptionBn: "বড় ও কোমল মেডজুল খেজুরের প্রাকৃতিক মিষ্টি স্বাদে ক্যারামেলের আভাস রয়েছে।",
    priceCents: 138000,
    salePriceCents: 125000,
    stock: 28,
    image: "/products/photo-dates.webp",
    category: "dates-dry-fruits",
    brand: "nutri-harvest",
  },
  {
    name: "Golden Raisins 250g",
    nameBn: "সোনালি কিশমিশ ২৫০ গ্রাম",
    slug: "golden-raisins-250g",
    description: "Plump golden raisins for snacks, baking, pulao and desserts.",
    descriptionBn: "নাশতা, বেকিং, পোলাও ও মিষ্টান্নে ব্যবহারের জন্য রসালো সোনালি কিশমিশ।",
    priceCents: 28000,
    salePriceCents: 24500,
    stock: 90,
    image: "/products/photo-raisins.webp",
    category: "dates-dry-fruits",
    brand: "nutri-harvest",
  },
  {
    name: "Dried Figs 250g",
    nameBn: "শুকনো ডুমুর ২৫০ গ্রাম",
    slug: "dried-figs-250g",
    description: "Naturally sweet dried figs with a tender centre and seed-speckled texture.",
    descriptionBn: "প্রাকৃতিক মিষ্টি স্বাদের শুকনো ডুমুর, নরম শাঁস ও বীজের সুন্দর টেক্সচার।",
    priceCents: 72000,
    stock: 24,
    image: "/products/photo-dates.webp",
    category: "dates-dry-fruits",
    brand: "paharika",
  },
  {
    name: "Roasted Mixed Nuts 300g",
    nameBn: "ভাজা মিক্সড বাদাম ৩০০ গ্রাম",
    slug: "roasted-mixed-nuts-300g",
    description: "A shareable mix of almonds, cashews, peanuts and raisins, lightly roasted.",
    descriptionBn: "কাঠবাদাম, কাজুবাদাম, চিনাবাদাম ও কিশমিশের হালকা ভাজা ভাগ করে খাওয়ার মিশ্রণ।",
    priceCents: 72000,
    salePriceCents: 65000,
    stock: 41,
    image: "/products/photo-honey.webp",
    featured: true,
    category: "nuts",
    brand: "nutri-harvest",
  },
  {
    name: "Spice & Honey Gift Box",
    nameBn: "মসলা ও মধুর উপহার বাক্স",
    slug: "spice-honey-gift-box",
    description:
      "A gift-ready box with signature masala blends and a jar of local honey. Contents are listed on the package.",
    descriptionBn:
      "বিশেষ মসলা মিশ্রণ ও দেশি মধুর বয়ামসহ উপহার দেওয়ার উপযোগী বাক্স। প্যাকেটে উপকরণের তালিকা দেওয়া আছে।",
    priceCents: 185000,
    salePriceCents: 169000,
    stock: 18,
    image: "/products/photo-honey.webp",
    featured: true,
    category: "spices-masala",
    brand: "deshi-shad",
  },
];

const campaigns = [
  {
    title: "Spice Cabinet Refresh",
    imageUrl: "/banners/photo-spices.webp",
    linkUrl: "/categories/spices-masala",
    order: 1,
  },
  {
    title: "Honey Harvest",
    imageUrl: "/banners/photo-honey.webp",
    linkUrl: "/categories/honey",
    order: 2,
  },
  {
    title: "Nuts, Dates & Dry Fruits",
    imageUrl: "/banners/photo-nuts-dry-fruits.webp",
    linkUrl: "/categories/dates-dry-fruits",
    order: 3,
  },
];

/**
 * Gallery photos grouped by subject so a product's companion shots look
 * plausible (spices with spices, honey with dates/nuts…). The primary image
 * leads, family members follow, then the pool tops the gallery up to three.
 */
const galleryFamilies = [
  ["/products/photo-spice-spoons.webp", "/products/photo-spices.webp"],
  ["/products/photo-honey.webp", "/products/photo-dates.webp", "/products/photo-almonds.webp"],
  [
    "/products/photo-almonds.webp",
    "/products/photo-cashews.webp",
    "/products/photo-pistachios.webp",
    "/products/photo-walnuts.webp",
    "/products/photo-raisins.webp",
  ],
  ["/products/photo-dates.webp", "/products/photo-raisins.webp", "/products/photo-walnuts.webp"],
];
const galleryPool = [...new Set(galleryFamilies.flat())];

export function galleryFor(primary: string): string[] {
  const family = galleryFamilies.find((photos) => photos.includes(primary)) ?? [];
  const companions = family.filter((photo) => photo !== primary);
  const rest = galleryPool.filter((photo) => photo !== primary && !companions.includes(photo));
  return [primary, ...companions, ...rest].slice(0, 3);
}

export async function seedCatalog(prisma: Db) {
  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: category,
      create: category,
    });
  }
  for (const brand of brands) {
    await prisma.brand.upsert({
      where: { slug: brand.slug },
      update: brand,
      create: brand,
    });
  }
  for (const product of products) {
    const { category, brand, image, ...data } = product;
    const images = galleryFor(image);
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        ...data,
        images,
        category: { connect: { slug: category } },
        brand: brand ? { connect: { slug: brand } } : { disconnect: true },
      },
      create: {
        ...data,
        images,
        category: { connect: { slug: category } },
        ...(brand ? { brand: { connect: { slug: brand } } } : {}),
      },
    });
  }
  for (const campaign of campaigns) {
    const existing = await prisma.campaign.findFirst({ where: { title: campaign.title } });
    if (existing)
      await prisma.campaign.update({
        where: { id: existing.id },
        data: { ...campaign, active: true },
      });
    else await prisma.campaign.create({ data: campaign });
  }
}

export async function seedAdmin(prisma: PrismaClient) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Demo administrator seeding is disabled in production. Create the store owner through setup.",
    );
  }
  const email = "admin@store.local";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const passwordHash = await bcrypt.hash("admin1234", 10);
  return prisma.user.create({
    data: { email, name: "Store Admin", passwordHash, roles: [Roles.Customer, Roles.Admin] },
  });
}

export async function seedWarehouseKeeper(prisma: PrismaClient) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Demo warehouse keeper seeding is disabled in production. Create warehouse staff through admin.",
    );
  }
  const email = "keeper@store.local";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const passwordHash = await bcrypt.hash("keeper1234", 10);
  return prisma.user.create({
    data: {
      email,
      name: "Warehouse Keeper",
      passwordHash,
      roles: [Roles.Customer, Roles.Warehouse],
    },
  });
}

export async function seedSalesRep(prisma: PrismaClient) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Demo sales rep seeding is disabled in production. Create sales staff through admin.",
    );
  }
  const email = "sales@store.local";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const passwordHash = await bcrypt.hash("sales1234", 10);
  return prisma.user.create({
    data: {
      email,
      name: "Sales Representative",
      passwordHash,
      roles: [Roles.Customer, Roles.Sales],
    },
  });
}

export async function seedCustomerService(prisma: PrismaClient) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Demo customer service seeding is disabled in production. Create support staff through admin.",
    );
  }
  const email = "support@store.local";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const passwordHash = await bcrypt.hash("support1234", 10);
  return prisma.user.create({
    data: {
      email,
      name: "Customer Service",
      passwordHash,
      roles: [Roles.Customer, Roles.Support],
    },
  });
}

/** Runs the HRM portal (/hrm) without getting the full /admin back-office. */
export async function seedManager(prisma: PrismaClient) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Demo manager seeding is disabled in production. Create managers through admin.",
    );
  }
  const email = "manager@store.local";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const passwordHash = await bcrypt.hash("manager1234", 10);
  return prisma.user.create({
    data: {
      email,
      name: "Operations Manager",
      passwordHash,
      roles: [Roles.Customer, Roles.Manager],
    },
  });
}
