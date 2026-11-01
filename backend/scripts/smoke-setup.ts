/** Smoke-test helper: performs the real setup flow (no HTTP), prints activation token. */
import { config } from "dotenv";
import { db } from "../lib/db";
import { signActivationToken } from "../lib/license";
import { performSetup } from "../lib/setup";

config({ path: ".env" });

const key = process.argv[2];
if (!key) {
  console.error("Usage: tsx backend/scripts/smoke-setup.ts <license-key>");
  process.exit(1);
}

async function main() {
  const result = await performSetup({
    licenseKey: key,
    adminName: "Store Admin",
    email: "admin@store.local",
    password: "admin1234",
    storeName: "Demo Store",
    currencySymbol: "৳",
    currencyCode: "BDT",
    contactEmail: "hello@demo.store",
    contactPhone: "+8801700000000",
    deliveryEstimate: "12-24 HOURS",
  });
  if (!result.ok) {
    console.error("SETUP_FAILED:", result.error);
    process.exit(1);
  }
  console.log("SETUP_DONE");
  const token = await signActivationToken(Date.now() + 365 * 86400_000);
  console.log("TOKEN", token);
  console.log(`products=${await db.product.count()} categories=${await db.category.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
