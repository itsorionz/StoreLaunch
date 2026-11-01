import type { Lang } from "@frontend/i18n/constants";

const english = {
  name: "Enter a name",
  adminName: "Enter administrator name",
  email: "you@example.com",
  contactEmail: "support@example.com",
  password: "Enter your password",
  confirmPassword: "Re-enter your password",
  phone: "+8801XXXXXXXXX",
  contactPhone: "+8801XXXXXXXXX",
  code: "Enter the 6-digit code",
  line1: "House, road and area",
  line2: "Apartment, floor or landmark (optional)",
  city: "e.g. Dhaka",
  region: "Enter district or region",
  postal: "e.g. 1216",
  address: "Enter the full address",
  storeName: "Enter your store name",
  title: "Enter a title",
  slug: "e.g. spices-masala",
  description: "Describe the product, size and key details",
  message: "Write your message",
  body: "Write the message customers will receive",
  note: "Add delivery or handover details (optional)",
  additionalInfo: "Add delivery instructions or other details (optional)",
  receivedBy: "Enter the receiver's name",
  reference: "Enter the transfer or deposit reference",
  amount: "e.g. 100.00",
  price: "e.g. 500.00",
  salePrice: "Enter a lower offer price (optional)",
  priceCents: "Enter the price in minor units",
  salePriceCents: "Enter the offer price in minor units",
  stock: "e.g. 100",
  order: "e.g. 0",
  currencyCode: "e.g. BDT",
  currencySymbol: "e.g. ৳",
  deliveryFeeCents: "e.g. 6000 (minor units)",
  freeShippingOverCents: "Leave blank to disable free shipping",
  deliveryEstimate: "e.g. 12-24 HOURS",
  headerAnnouncement: "Enter the announcement shown above the header",
  headerSupportLabel: "e.g. Support",
  imageUrl: "https://example.com/image.jpg or /images/image.jpg",
  logoUrl: "https://example.com/logo.svg or /images/logo.svg",
  linkUrl: "Enter a local path or https:// URL",
  href: "Enter a local path or https:// URL (optional)",
  trackingUrl: "https://example.com/track",
  licenseKey: "Enter your SL1... license key",
  q: "Enter a search term",
} as const;

const bengali: Record<keyof typeof english, string> = {
  name: "নাম লিখুন",
  adminName: "অ্যাডমিনের নাম লিখুন",
  email: "you@example.com",
  contactEmail: "support@example.com",
  password: "পাসওয়ার্ড লিখুন",
  confirmPassword: "পাসওয়ার্ড আবার লিখুন",
  phone: "+8801XXXXXXXXX",
  contactPhone: "+8801XXXXXXXXX",
  code: "৬ সংখ্যার কোড লিখুন",
  line1: "বাড়ি, সড়ক ও এলাকার নাম",
  line2: "ফ্ল্যাট, তলা বা পরিচিত স্থান (ঐচ্ছিক)",
  city: "যেমন: ঢাকা",
  region: "জেলা বা অঞ্চলের নাম লিখুন",
  postal: "যেমন: 1216",
  address: "সম্পূর্ণ ঠিকানা লিখুন",
  storeName: "আপনার দোকানের নাম লিখুন",
  title: "শিরোনাম লিখুন",
  slug: "যেমন: spices-masala",
  description: "পণ্যের বিবরণ, আকার ও গুরুত্বপূর্ণ তথ্য লিখুন",
  message: "আপনার বার্তা লিখুন",
  body: "গ্রাহকের জন্য বার্তা লিখুন",
  note: "ডেলিভারি বা হস্তান্তরের তথ্য লিখুন (ঐচ্ছিক)",
  additionalInfo: "ডেলিভারির নির্দেশনা বা অন্য তথ্য লিখুন (ঐচ্ছিক)",
  receivedBy: "গ্রহণকারীর নাম লিখুন",
  reference: "ট্রান্সফার বা জমার রেফারেন্স লিখুন",
  amount: "যেমন: 100.00",
  price: "যেমন: 500.00",
  salePrice: "কম অফার মূল্য লিখুন (ঐচ্ছিক)",
  priceCents: "ক্ষুদ্র মুদ্রা এককে মূল্য লিখুন",
  salePriceCents: "ক্ষুদ্র মুদ্রা এককে অফার মূল্য লিখুন",
  stock: "যেমন: 100",
  order: "যেমন: 0",
  currencyCode: "যেমন: BDT",
  currencySymbol: "যেমন: ৳",
  deliveryFeeCents: "যেমন: 6000 (ক্ষুদ্র মুদ্রা এককে)",
  freeShippingOverCents: "ফ্রি ডেলিভারি বন্ধ রাখতে ফাঁকা রাখুন",
  deliveryEstimate: "যেমন: ১২-২৪ ঘণ্টা",
  headerAnnouncement: "হেডারের উপরের ঘোষণা লিখুন",
  headerSupportLabel: "যেমন: সাপোর্ট",
  imageUrl: "https://example.com/image.jpg অথবা /images/image.jpg",
  logoUrl: "https://example.com/logo.svg অথবা /images/logo.svg",
  linkUrl: "স্থানীয় পাথ বা https:// ঠিকানা লিখুন",
  href: "স্থানীয় পাথ বা https:// ঠিকানা লিখুন (ঐচ্ছিক)",
  trackingUrl: "https://example.com/track",
  licenseKey: "আপনার SL1... লাইসেন্স কী লিখুন",
  q: "অনুসন্ধানের শব্দ লিখুন",
};

const textInputTypes = new Set(["text", "search", "email", "password", "tel", "url", "number"]);

/** Shared defaults cover wrapped fields too; explicit placeholders take precedence at the control. */
export function formPlaceholder(
  name: string | undefined,
  lang: Lang,
  type = "text",
): string | undefined {
  if (!textInputTypes.has(type)) return undefined;
  const placeholders = lang === "bn" ? bengali : english;
  if (name && Object.hasOwn(placeholders, name)) return placeholders[name as keyof typeof english];
  if (type === "email") return placeholders.email;
  if (type === "tel") return placeholders.phone;
  if (type === "password") return placeholders.password;
  if (type === "number") return lang === "bn" ? "সংখ্যা লিখুন" : "Enter a number";
  if (type === "url") return "https://example.com";
  return lang === "bn" ? "এখানে লিখুন" : "Enter details";
}
