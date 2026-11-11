import { Roles } from "@backend/lib/enums.mjs";
import type { Prisma, PrismaClient } from "@backend/generated/prisma/client";
import bcrypt from "bcryptjs";
import { generateBarcodeValue } from "@backend/lib/barcode";
import { canonicalPhone } from "@backend/lib/phone";

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
  {
    name: "Cooking Oils",
    nameBn: "রefined তেল",
    slug: "cooking-oils",
    imageUrl: "/categories/cooking-oils.svg",
    order: 5,
  },
  {
    name: "Grains & Rice",
    nameBn: "মুখ ও চাল",
    slug: "grains-rice",
    imageUrl: "/categories/grains-rice.svg",
    order: 6,
  },
  {
    name: "Electronics",
    nameBn: "ইলেকট্রনিক্স",
    slug: "electronics",
    imageUrl: "/categories/electronics.svg",
    order: 7,
  },
  {
    name: "Health & Wellness",
    nameBn: "স্বাস্থ্য ও সুস্থতা",
    slug: "health-wellness",
    imageUrl: "/categories/health.svg",
    order: 8,
  },
  {
    name: "Baby Care",
    nameBn: "শিশু পরিচর্যা",
    slug: "baby-care",
    imageUrl: "/categories/baby.svg",
    order: 9,
  },
  {
    name: "Home & Kitchen",
    nameBn: "হোম ও কিচেন",
    slug: "home-kitchen",
    imageUrl: "/categories/home.svg",
    order: 10,
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
      "তরকারি, মেরিনেড ও খাবারে প্রাকৃতিক রং আনতে ঝাঁঝালো ও halkা ধোঁয়াটে স্বাদের মরিচ গুঁড়া। পুনরায় বন্ধ করা যায় এমন প্য্যাক সতেজভাবে মোড়কজাত।",
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
    descriptionBn: "সোনালি রঙের সরিষা ফুলের মধু, হালকা ফুলেল ঘ্রাণ ও মসৃণ স্বaders।",
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
    descriptionBn: "প্রতিদিনের নাশতার জন্য আস্ত মচমচে কাঠবাদাম, পুনরায় বন্ধ করা যায় এমন প্যakei।",
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
  {
    name: "Ghee 1L",
    nameBn: "ঘিরি ১ লিটার",
    slug: "ghee-1l",
    description: "Pure clarified butter, essential for traditional Bengali cooking and sweets.",
    descriptionBn: "তরকারি ও মিষ্টির জন্য প্রয়োজনীয় শুধু ঘি।",
    priceCents: 25000,
    stock: 45,
    image: "/products/ghee.svg",
    category: "cooking-oils",
    brand: "deshi-shad",
  },
  {
    name: "Soyabean Oil 1L",
    nameBn: "সয়াবিন intervene তেল ১ লিটার",
    slug: "soyabean-oil-1l",
    description: "Pure soybean oil, light and healthy for daily cooking.",
    descriptionBn: "দৈনন্দিন রান্নার জন্য সোয়াব intervene তেল, হালকা ও সুস্থ।",
    priceCents: 18000,
    stock: 60,
    image: "/products/soyabean-oil.svg",
    category: "cooking-oils",
    brand: "madhur-bangla",
  },
  {
    name: "Master Cooking Oil 1L",
    nameBn: "মাস্টার কulinary তেল ১ লিটার",
    slug: "master-cooking-oil-1l",
    description: "Premium cooking oil for all your culinary needs.",
    descriptionBn: "সকল রান্নার জন্য প্রিয়মিয়াম কulinary তেল।",
    priceCents: 22000,
    stock: 38,
    image: "/products/master-oil.svg",
    category: "cooking-oils",
    brand: "paharika",
  },
  {
    name: "Red Rice 1kg",
    nameBn: "লাল চাল ১ কেজি",
    slug: "red-rice-1kg",
    description: "Premium red rice, unpolished and naturally aromatic.",
    descriptionBn: "অনন্য গন্ধী লাল চাল, পরাতলা ও প্রাকৃতিক।",
    priceCents: 8500,
    stock: 100,
    image: "/products/red-rice.svg",
    category: "grains-rice",
    brand: "shuddho-naturals",
  },
  {
    name: "Methi (Fenugreek) 100g",
    nameBn: "মেথি (টুই) ১০০ গ্রাম",
    slug: "methi-100g",
    description: "Fenugreek seeds, commonly used in Bengali curries and pickles.",
    descriptionBn: "মেথি বীজ, Bengali curries এবং আচারতে ব্যবহার করা হয়।",
    priceCents: 1200,
    stock: 75,
    image: "/products/methi.svg",
    category: "spices-masala",
    brand: "deshi-shad",
  },
  {
    name: "Black Seed 50g",
    nameBn: "কলো বীজ ৫০ গ্রাম",
    slug: "black-seed-50g",
    description: "Black cumin seeds, known for their distinct aroma and flavor.",
    descriptionBn: "কলো বীজ, গুঁড়ার জন্য ব্যবহার করা হয়।",
    priceCents: 1500,
    stock: 90,
    image: "/products/black-seed.svg",
    category: "spices-masala",
    brand: "shuddho-naturals",
  },
  {
    name: "Kashmiri Red Chili Powder 400g",
    nameBn: "কাশ্মীরি লাল মরিচ গুঁড়া ৪০০ গ্রাম",
    slug: "kashmiri-red-chili-powder-400g",
    description:
      "Family pack of our signature mildly smoky chili powder for curries, marinades and a rich natural colour.",
    descriptionBn:
      "তরকারি ও মেরিনেডে প্রাকৃতিক রং আনার জন্য আমাদের সিগনেচার হালকা ধোঁয়াটে মরিচ গুঁড়ার পারিবারিক প্যাক।",
    priceCents: 58000,
    salePriceCents: 51000,
    stock: 64,
    image: "/products/chili-powder.svg",
    flashSale: true,
    featured: true,
    category: "spices-masala",
    brand: "deshi-shad",
  },
  {
    name: "Premium Turmeric Powder 500g",
    nameBn: "প্রিমিয়াম হলুদ গুঁড়া ৫০০ গ্রাম",
    slug: "premium-turmeric-powder-500g",
    description:
      "Large pack of fine-ground turmeric with a warm aroma and deep golden colour for everyday cooking.",
    descriptionBn:
      "প্রতিদিনের রান্নার জন্য মিহি করে গুঁড়া করা সুগন্ধি হলুদ, গাঢ় সোনালি রং ও স্বাদের বড় প্যাক।",
    priceCents: 38000,
    salePriceCents: 33000,
    stock: 90,
    image: "/products/turmeric-powder.svg",
    featured: true,
    category: "spices-masala",
    brand: "deshi-shad",
  },
  {
    name: "Roasted Cumin Powder 200g",
    nameBn: "ভাজা জিরা গুঁড়া ২০০ গ্রাম",
    slug: "roasted-cumin-powder-200g",
    description:
      "Slow-roasted and finely ground cumin with a warm, nutty aroma for bhaji, chaat and dal.",
    descriptionBn: "ধীমে ভাজা ও মিহি করা গুঁড়া জিরা — ভাজা, চাট ও ডালে যোগ করুন উষ্ণ খুসমঘ্রাণ।",
    priceCents: 26000,
    salePriceCents: 22500,
    stock: 78,
    image: "/products/cumin-seeds.svg",
    flashSale: true,
    category: "spices-masala",
    brand: "paharika",
  },
  {
    name: "Coriander Powder 500g",
    nameBn: "ধনিয়া গুঁড়া ৫০০ গ্রাম",
    slug: "coriander-powder-500g",
    description:
      "Mellow, citrusy coriander in a resealable 500g pack for daily curries and marinades.",
    descriptionBn:
      "প্রতিদিনের তরকারি ও মেরিনেডের জন্য মৃদু সুগন্ধি ধনিয়া গুঁড়া, ৫০০ গ্রাম পুনরায় বন্ধযোগ্য প্যাক।",
    priceCents: 32000,
    salePriceCents: 27500,
    stock: 85,
    image: "/products/coriander-powder.svg",
    category: "spices-masala",
    brand: "deshi-shad",
  },
  {
    name: "Royal Garam Masala 200g",
    nameBn: "রয়্যাল গরম মসলা ২০০ গ্রাম",
    slug: "royal-garam-masala-200g",
    description:
      "Warming blend of cinnamon, cardamom and cloves, ground fresh in small batches for a finishing aroma.",
    descriptionBn:
      "দারুচিনি, এলাচ ও লবঙ্গের উষ্ণ মিশ্রণ, রান্নার শেষে সুগন্ধ বাড়াতে ছোট ব্যাচে তাজা গুঁড়া করা।",
    priceCents: 44000,
    salePriceCents: 39000,
    stock: 52,
    image: "/products/garam-masala.svg",
    featured: true,
    category: "spices-masala",
    brand: "shuddho-naturals",
  },
  {
    name: "Bengali Panch Phoron 250g",
    nameBn: "বাংলা পাঁচফোড়ন ২৫০ গ্রাম",
    slug: "bengali-panch-phoron-250g",
    description:
      "Larger pack of the classic five-seed blend for pickles, dal, vegetables and fish curries.",
    descriptionBn:
      "আচার, ডাল, সবজি ও মাছের তরকারির জন্য পাঁচ ধরনের বীজের ঐতিহ্যবাহী মিশ্রণের বড় প্যাক।",
    priceCents: 24000,
    salePriceCents: 21000,
    stock: 70,
    image: "/products/panch-phoron.svg",
    category: "spices-masala",
    brand: "deshi-shad",
  },
  {
    name: "Sundarbans Wildflower Honey 1kg",
    nameBn: "সুন্দরবনের প্রাকৃতিক মধু ১ কেজি",
    slug: "sundarbans-wildflower-honey-1kg",
    description:
      "One-kilo jar of raw wildflower honey from the Sundarbans, nothing added, for the whole family.",
    descriptionBn:
      "সুন্দরবনের বুনো ফুল থেকে সংগৃহীত ১ কেজি কাঁচা মধু — কোনো কিছু মেশানো নেই, পুরো পরিবারের জন্য।",
    priceCents: 175000,
    salePriceCents: 158000,
    stock: 30,
    image: "/products/wildflower-honey.svg",
    featured: true,
    category: "honey",
    brand: "madhur-bangla",
  },
  {
    name: "Mustard Flower Honey 1kg",
    nameBn: "সরিষা ফুলের মধু ১ কেজি",
    slug: "mustard-flower-honey-1kg",
    description:
      "Bulk jar of golden mustard blossom honey with a gentle floral aroma and smooth finish.",
    descriptionBn: "সোনালি সরিষা ফুলের মধুর বাল্ক জার — হালকা ফুলেল ঘ্রাণ ও মসৃণ স্বাদ।",
    priceCents: 148000,
    salePriceCents: 135000,
    stock: 26,
    image: "/products/mustard-honey.svg",
    flashSale: true,
    category: "honey",
    brand: "madhur-bangla",
  },
  {
    name: "Litchi Blossom Honey 1kg",
    nameBn: "লিচু ফুলের মধু ১ কেজি",
    slug: "litchi-blossom-honey-1kg",
    description:
      "Light, perfumed litchi honey harvested at peak blossom season, sealed for freshness.",
    descriptionBn:
      "লিচু ফুলের চরম মৌসুমে সংগ্রহ করা হালকা ও সুগন্ধি মধু, সতেজতা বজায় রেখে সিল করা।",
    priceCents: 165000,
    salePriceCents: 149000,
    stock: 22,
    image: "/products/litchi-honey.svg",
    featured: true,
    category: "honey",
    brand: "madhur-bangla",
  },
  {
    name: "Black Seed Honey 500g",
    nameBn: "কালোজিরা ফুলের মধু ৫০০ গ্রাম",
    slug: "black-seed-honey-500g",
    description:
      "Larger jar of small-batch black seed honey with a distinct floral taste, carefully sealed.",
    descriptionBn: "বিশেষ ফুলেল স্বাদের কালোজিরা মধুর বড় জার, ছোট ব্যাচে সংগ্রহ করে সিল করা।",
    priceCents: 115000,
    salePriceCents: 104000,
    stock: 34,
    image: "/products/black-seed-honey.svg",
    category: "honey",
    brand: "shuddho-naturals",
  },
  {
    name: "California Almonds 500g",
    nameBn: "ক্যালিফোর্নিয়ার কাঠবাদাম ৫০০ গ্রাম",
    slug: "california-almonds-500g",
    description: "Crunchy whole almonds in a resealable half-kilo pack for everyday snacking.",
    descriptionBn:
      "প্রতিদিনের নাশতার জন্য মচমচে আস্ত কাঠবাদাম, পুনরায় বন্ধ করা যায় এমন অর্ধ কেজি প্যাক।",
    priceCents: 98000,
    salePriceCents: 89000,
    stock: 48,
    image: "/products/almonds.svg",
    flashSale: true,
    featured: true,
    category: "nuts",
    brand: "nutri-harvest",
  },
  {
    name: "Premium Cashew Nuts 500g",
    nameBn: "প্রিমিয়াম কাজুবাদাম ৫০০ গ্রাম",
    slug: "premium-cashew-nuts-500g",
    description:
      "Whole creamy cashews in a family-size resealable pouch for snacks and rich desserts.",
    descriptionBn:
      "নাশতা ও মিষ্টান্নের জন্য আস্ত মাখনস্বাদী কাজুবাদাম, পারিবারিক আকারের পুনরায় বন্ধযোগ্য প্যাকেট।",
    priceCents: 132000,
    salePriceCents: 119000,
    stock: 40,
    image: "/products/cashews.svg",
    featured: true,
    category: "nuts",
    brand: "nutri-harvest",
  },
  {
    name: "Roasted Pistachios 400g",
    nameBn: "ভাজা পেস্তাবাদাম ৪০০ গ্রাম",
    slug: "roasted-pistachios-400g",
    description:
      "Lightly roasted pistachios with a delicate crunch, generously packed for sharing.",
    descriptionBn: "ভাগ করে খাওয়ার জন্য প্রচুর পরিমাণ হালকা ভাজা, মচমচে পেস্তাবাদাম।",
    priceCents: 148000,
    salePriceCents: 134000,
    stock: 25,
    image: "/products/pistachios.svg",
    category: "nuts",
    brand: "nutri-harvest",
  },
  {
    name: "Walnut Kernels 400g",
    nameBn: "আখরোটের শাঁস ৪০০ গ্রাম",
    slug: "walnut-kernels-400g",
    description: "Fresh walnut halves with a rich, earthy flavour, packed with care.",
    descriptionBn: "সমৃদ্ধ মাটির ঘ্রাণ ও স্বাদের তাজা আখরোটের শাঁস, যত্নে প্যাক করা।",
    priceCents: 128000,
    salePriceCents: 115000,
    stock: 28,
    image: "/products/walnuts.svg",
    category: "nuts",
    brand: "shuddho-naturals",
  },
  {
    name: "Golden Raisins 500g",
    nameBn: "সোনালি কিশমিশ ৫০০ গ্রাম",
    slug: "golden-raisins-500g",
    description: "Plump golden raisins for snacking, baking, pulao and desserts.",
    descriptionBn: "নাশতা, বেকিং, পোলাও ও মিষ্টান্নে ব্যবহারের জন্য রসালো সোনালি কিশমিশ।",
    priceCents: 48000,
    salePriceCents: 42000,
    stock: 80,
    image: "/products/raisins.svg",
    category: "dates-dry-fruits",
    brand: "nutri-harvest",
  },
  {
    name: "Ajwa Dates 1kg",
    nameBn: "আজওয়া খেজুর ১ কেজি",
    slug: "ajwa-dates-1kg",
    description: "Hand-selected soft Ajwa dates in a value kilo pack for the family.",
    descriptionBn:
      "হাতে বাছাই করা নরম ও প্রাকৃতিক মিষ্টি আজওয়া খেজুর, পরিবারের জন্য এক কেজি প্যাক।",
    priceCents: 189000,
    salePriceCents: 172000,
    stock: 20,
    image: "/products/ajwa-dates.svg",
    flashSale: true,
    featured: true,
    category: "dates-dry-fruits",
    brand: "nutri-harvest",
  },
  {
    name: "Medjool Dates 1kg",
    nameBn: "মেডজুল খেজুর ১ কেজি",
    slug: "medjool-dates-1kg",
    description: "Large, tender Medjool dates with a caramel-like natural sweetness.",
    descriptionBn: "বড় ও কোমল মেডজুল খেজুর, ক্যারামেলের আভাসসহ প্রাকৃতিক মিষ্টি স্বাদ।",
    priceCents: 265000,
    salePriceCents: 242000,
    stock: 15,
    image: "/products/medjool-dates.svg",
    featured: true,
    category: "dates-dry-fruits",
    brand: "nutri-harvest",
  },
  {
    name: "Dried Figs 500g",
    nameBn: "শুকনো ডুমুর ৫০০ গ্রাম",
    slug: "dried-figs-500g",
    description: "Naturally sweet dried figs with a tender centre and seed-speckled texture.",
    descriptionBn: "প্রাকৃতিক মিষ্টি স্বাদের শুকনো ডুমুর, নরম শাঁস ও বীজের সুন্দর টেক্সচার।",
    priceCents: 138000,
    salePriceCents: 126000,
    stock: 18,
    image: "/products/figs.svg",
    category: "dates-dry-fruits",
    brand: "paharika",
  },
  {
    name: "Premium Dry Fruit Pouch 300g",
    nameBn: "প্রিমিয়াম ড্রাই ফ্রুট পাউচ ৩০০ গ্রাম",
    slug: "premium-dry-fruit-pouch-300g",
    description:
      "A mixed pouch of almonds, cashews, raisins and dates for gifting or everyday snacking.",
    descriptionBn: "উপহার বা নাশতার জন্য কাজু, কাঠবাদাম, কিশমিশ ও খেজুরের মিশ্র ড্রাই ফ্রুট পাউচ।",
    priceCents: 85000,
    salePriceCents: 76000,
    stock: 44,
    image: "/products/dry-fruit-pouch.svg",
    featured: true,
    category: "dates-dry-fruits",
    brand: "nutri-harvest",
  },
  {
    name: "Premium Festival Gift Box",
    nameBn: "প্রিমিয়াম উৎসব উপহার বক্স",
    slug: "premium-festival-gift-box",
    description: "A festive box of dates, dry fruits and nuts, arranged and ready to gift.",
    descriptionBn:
      "খেজুর, শুকনো ফল ও বাদামসহ সাজানো উৎসবের উপযোগী উপহার বক্স, দেওয়ার জন্য প্রস্তুত।",
    priceCents: 245000,
    salePriceCents: 225000,
    stock: 12,
    image: "/products/gift-box.svg",
    featured: true,
    category: "dates-dry-fruits",
    brand: "deshi-shad",
  },
  {
    name: "Aromatic Chinigura Rice 1kg",
    nameBn: "সুগন্ধি চিনিগুরা চাল ১ কেজি",
    slug: "aromatic-chinigura-rice-1kg",
    description: "Small-grain aromatic rice prized for khichuri and festive pulao.",
    descriptionBn: "ছোট দানার সুগন্ধি চাল — খিচুড়ি ও উৎসবের পোলাওর জন্য প্রসিদ্ধ।",
    priceCents: 14500,
    stock: 95,
    image: "/products/chinigura-rice.svg",
    category: "grains-rice",
    brand: "shuddho-naturals",
  },
  {
    name: 'Rechargeable Table Fan 12"',
    nameBn: "রিচার্জেবল টেবিল ফ্যান ১২ ইঞ্চি",
    slug: "rechargeable-table-fan-12inch",
    description: "Portable rechargeable fan with three speeds and up to 8 hours of backup power.",
    descriptionBn:
      "তিন স্পিডসহ পোর্টেবল রিচার্জেবল টেবিল ফ্যান, একবার চার্জে ৮ ঘণ্টা পর্যন্ত ব্যাকআপ।",
    priceCents: 24500,
    salePriceCents: 21900,
    stock: 35,
    image: "/products/electronics-fan.svg",
    featured: true,
    category: "electronics",
    brand: "paharika",
  },
  {
    name: "LED Bulb 3 pcs",
    nameBn: "এলইডি বাল্ব ৩ পিস",
    slug: "led-bulb-3pcs",
    description: "Energy-saving 9W LED bulbs with bright white light for every room.",
    descriptionBn: "কম বিদ্যুৎ খরচের ৯ ওয়াট এলইডি বাল্ব, ঘরের জন্য ঝলমলে সাদা আলো।",
    priceCents: 9900,
    salePriceCents: 8500,
    stock: 120,
    image: "/products/led-bulb.svg",
    flashSale: true,
    category: "electronics",
    brand: "deshi-shad",
  },
  {
    name: "Power Bank 10000mAh",
    nameBn: "পাওয়ার ব্যাংক ১০০০০ এমএএইচ",
    slug: "power-bank-10000mah",
    description:
      "Slim power bank with dual USB output and fast charging for phones and accessories.",
    descriptionBn:
      "ডুয়েল ইউএসবি আউটপুট ও ফাস্ট চার্জিংসহ পাতলা পাওয়ার ব্যাংক — ফোন ও আকসেসরির জন্য।",
    priceCents: 18900,
    salePriceCents: 16500,
    stock: 42,
    image: "/products/power-bank.svg",
    category: "electronics",
    brand: "paharika",
  },
  {
    name: "Vitamin C 1000mg (60 tablets)",
    nameBn: "ভিটামিন সি ১০০০ মিগ্রা (৬০ ট্যাবলেট)",
    slug: "vitamin-c-1000mg-60-tablets",
    description: "High-potency vitamin C tablets to support immunity through every season.",
    descriptionBn: "প্রতিটি মৌসুমে রোগ প্রতিরোধ ক্ষমতা বাড়াতে হাই-পটেন্সি ভিটামিন সি ট্যাবলেট।",
    priceCents: 12500,
    salePriceCents: 11000,
    stock: 60,
    image: "/products/vitamin-c.svg",
    featured: true,
    category: "health-wellness",
    brand: "shuddho-naturals",
  },
  {
    name: "Multivitamin Tablets (30)",
    nameBn: "মাল্টিভিটামিন ট্যাবলেট (৩০)",
    slug: "multivitamin-tablets-30",
    description: "Daily multivitamin with essential vitamins and minerals for men and women.",
    descriptionBn: "পুরুষ ও নারীদের জন্য প্রয়োজনীয় ভিটামিন ও খনিজসহ দৈনন্দিন মাল্টিভিটামিন।",
    priceCents: 9800,
    salePriceCents: 8700,
    stock: 75,
    image: "/products/multivitamin.svg",
    category: "health-wellness",
    brand: "shuddho-naturals",
  },
  {
    name: "Fish Oil Omega-3 Capsules (60)",
    nameBn: "ফিশ অয়েল ওমেগা-৩ ক্যাপসুল (৬০)",
    slug: "fish-oil-omega3-capsules-60",
    description: "Purified fish oil capsules with EPA and DHA for heart and brain health.",
    descriptionBn: "হৃদয় ও মস্তিষ্কের স্বাস্থ্যের জন্য EPA ও DHA সহ বিশুদ্ধ ফিশ অয়েল ক্যাপসুল।",
    priceCents: 15500,
    salePriceCents: 13900,
    stock: 38,
    image: "/products/fish-oil.svg",
    category: "health-wellness",
    brand: "shuddho-naturals",
  },
  {
    name: "Baby Wipes 100 pcs",
    nameBn: "বেবি উইপস ১০০ পিস",
    slug: "baby-wipes-100pcs",
    description:
      "Soft, alcohol-free wipes gentle enough for newborn skin, every change of the day.",
    descriptionBn: "নবজাতকের ত্বকের জন্য কোমল, অ্যালকোহলমুক্ত উইপস — দিনের প্রতিটি সময়ের জন্য।",
    priceCents: 6500,
    salePriceCents: 5700,
    stock: 110,
    image: "/products/baby-wipes.svg",
    category: "baby-care",
    brand: "shuddho-naturals",
  },
  {
    name: "Baby Lotion 200ml",
    nameBn: "বেবি লোশন ২০০ মিলিলিটার",
    slug: "baby-lotion-200ml",
    description: "Light daily moisturiser with a gentle, tear-free formula for soft baby skin.",
    descriptionBn:
      "কোমল শিশুর ত্বকের জন্য হালকা দৈনন্দিন ময়েস্চারাইজার, চোখে জ্বালা না দেওয়া সূত্র।",
    priceCents: 7800,
    salePriceCents: 6900,
    stock: 66,
    image: "/products/baby-lotion.svg",
    category: "baby-care",
    brand: "deshi-shad",
  },
  {
    name: "Baby Shampoo 300ml",
    nameBn: "বেবি শ্যাম্পু ৩০০ মিলিলিটার",
    slug: "baby-shampoo-300ml",
    description: "No-tear gentle cleansing shampoo that keeps baby hair soft and manageable.",
    descriptionBn:
      "চোখে জ্বালা না দেওয়া কোমল শ্যাম্পু — শিশুর চুল রাখে নরম ও সহজে সামলানো যায় এমন।",
    priceCents: 8900,
    salePriceCents: 7900,
    stock: 58,
    image: "/products/baby-shampoo.svg",
    flashSale: true,
    category: "baby-care",
    brand: "deshi-shad",
  },
  {
    name: "Airtight Storage Container 1L",
    nameBn: "এয়ারটাইট স্টোরেজ কনটেইনার ১ লিটার",
    slug: "airtight-storage-container-1l",
    description: "Airtight plastic container that keeps rice, pulses and spices fresh for longer.",
    descriptionBn: "চাল, ডাল ও মসলা দীর্ঘ সময় সতেজ রাখার এয়ারটাইট প্লাস্টিক স্টোরেজ কনটেইনার।",
    priceCents: 11500,
    salePriceCents: 9900,
    stock: 88,
    image: "/products/storage-container.svg",
    category: "home-kitchen",
    brand: "paharika",
  },
  {
    name: "Non-stick Frying Pan 26cm",
    nameBn: "নন-স্টিক ফ্রাইয়িং প্যান ২৬ সেমি",
    slug: "nonstick-frying-pan-26cm",
    description: "Even-heating non-stick pan with a comfortable heat-resistant handle.",
    descriptionBn: "সহজ উত্তাপ হ্যান্ডেলসহ সমান গরম হওয়া নন-স্টিক ফ্রাইয়িং প্যান।",
    priceCents: 22500,
    salePriceCents: 19900,
    stock: 30,
    image: "/products/frying-pan.svg",
    featured: true,
    category: "home-kitchen",
    brand: "paharika",
  },
  {
    name: "Stainless Steel Kettle 1.5L",
    nameBn: "স্টেইনলেস স্টিল কেটলি ১.৫ লিটার",
    slug: "stainless-steel-kettle-15l",
    description: "1.5 litre stovetop kettle in food-grade stainless steel for quick boiling.",
    descriptionBn: "দ্রুত ফোটানোর জন্য ফুড-গ্রেড স্টেইনলেস স্টিলের ১.৫ লিটার স্টোভটপ কেটলি।",
    priceCents: 31500,
    salePriceCents: 27900,
    stock: 24,
    image: "/products/kettle.svg",
    category: "home-kitchen",
    brand: "paharika",
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
  [
    "/products/photo-spice-spoons.webp",
    "/products/photo-spices.webp",
    "/products/chili-powder.svg",
    "/products/turmeric-powder.svg",
    "/products/coriander-powder.svg",
    "/products/cumin-seeds.svg",
    "/products/garam-masala.svg",
    "/products/panch-phoron.svg",
    "/products/methi.svg",
    "/products/black-seed.svg",
  ],
  [
    "/products/photo-honey.webp",
    "/products/wildflower-honey.svg",
    "/products/mustard-honey.svg",
    "/products/litchi-honey.svg",
    "/products/black-seed-honey.svg",
  ],
  [
    "/products/photo-almonds.webp",
    "/products/photo-cashews.webp",
    "/products/photo-pistachios.webp",
    "/products/photo-walnuts.webp",
    "/products/photo-raisins.webp",
    "/products/almonds.svg",
    "/products/cashews.svg",
    "/products/pistachios.svg",
    "/products/walnuts.svg",
    "/products/raisins.svg",
    "/products/mixed-nuts.svg",
  ],
  [
    "/products/photo-dates.webp",
    "/products/ajwa-dates.svg",
    "/products/medjool-dates.svg",
    "/products/figs.svg",
    "/products/dry-fruit-pouch.svg",
    "/products/gift-box.svg",
  ],
  ["/products/ghee.svg", "/products/soyabean-oil.svg", "/products/master-oil.svg"],
  ["/products/red-rice.svg", "/products/chinigura-rice.svg"],
  ["/products/electronics-fan.svg", "/products/led-bulb.svg", "/products/power-bank.svg"],
  ["/products/vitamin-c.svg", "/products/multivitamin.svg", "/products/fish-oil.svg"],
  ["/products/baby-wipes.svg", "/products/baby-lotion.svg", "/products/baby-shampoo.svg"],
  ["/products/storage-container.svg", "/products/frying-pan.svg", "/products/kettle.svg"],
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
        barcode: generateBarcodeValue(),
        category: { connect: { slug: category } },
        ...(brand ? { brand: { connect: { slug: brand } } } : {}),
      },
    });
  }
  // Catalog rows created before barcode support still need a scannable label.
  const unlabelled = await prisma.product.findMany({
    where: { barcode: null },
    select: { id: true },
  });
  for (const product of unlabelled) {
    await prisma.product.update({
      where: { id: product.id },
      data: { barcode: generateBarcodeValue() },
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
  const email = "admin@store.storelaunch.com";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const passwordHash = await bcrypt.hash("#SuperAdmin@2026#", 10);
  return prisma.user.create({
    data: { email, name: "Store Admin", passwordHash, roles: [Roles.Customer, Roles.Admin] },
  });
}

export async function seedSuperAdmin(prisma: PrismaClient) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Demo super admin seeding is disabled in production. Create the platform owner through setup.",
    );
  }
  const email = "superadmin@storelaunch.com";
  const phone = canonicalPhone("01686769805");
  const existing = await prisma.user.findUnique({ where: { email } });
  const targetRoles = [Roles.Customer, Roles.Admin, Roles.SuperAdmin];
  if (existing) {
    const needsUpdate =
      !existing.phone ||
      !targetRoles.every((r) => existing.roles.includes(r)) ||
      existing.email !== email;
    if (needsUpdate) {
      return prisma.user.update({
        where: { email: existing.email },
        data: { email, phone, roles: targetRoles },
      });
    }
    return existing;
  }
  const passwordHash = await bcrypt.hash("#SuperAdmin@2026#", 10);
  return prisma.user.create({
    data: {
      email,
      name: "Platform Owner",
      passwordHash,
      phone,
      roles: targetRoles,
    },
  });
}

export async function seedWarehouseKeeper(prisma: PrismaClient) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Demo warehouse keeper seeding is disabled in production. Create warehouse staff through admin.",
    );
  }
  const email = "warehouse@store.storelaunch.com";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const passwordHash = await bcrypt.hash("#SuperAdmin@2026#", 10);
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
  const email = "sales@store.storelaunch.com";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const passwordHash = await bcrypt.hash("#SuperAdmin@2026#", 10);
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
  const email = "support@store.storelaunch.com";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const passwordHash = await bcrypt.hash("#SuperAdmin@2026#", 10);
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
  const email = "manager@store.storelaunch.com";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const passwordHash = await bcrypt.hash("#SuperAdmin@2026#", 10);
  return prisma.user.create({
    data: {
      email,
      name: "Operations Manager",
      passwordHash,
      roles: [Roles.Customer, Roles.Manager],
    },
  });
}

export async function seedCustomer(prisma: PrismaClient) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Demo customer seeding is disabled in production.",
    );
  }
  const email = "customer@store.storelaunch.com";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const passwordHash = await bcrypt.hash("#SuperAdmin@2026#", 10);
  return prisma.user.create({
    data: {
      email,
      name: "Demo Customer",
      passwordHash,
      roles: [Roles.Customer],
    },
  });
}
