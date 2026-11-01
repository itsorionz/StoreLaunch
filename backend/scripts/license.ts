/**
 * Generate StoreLaunch license keys (offline HMAC-signed).
 *
 * Usage:
 *   npm run license:generate                       # perpetual key
 *   npm run license:generate -- --days 365         # expires in 365 days
 *   npm run license:generate -- --slug my-store    # bound to a store slug
 *   npm run license:generate -- --count 5          # generate 5 keys
 */
import { config } from "dotenv";
import { generateLicenseKey, hashLicenseKey } from "../lib/license";

config({ path: ".env" });

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const days = arg("--days") ? Number(arg("--days")) : undefined;
  const slug = arg("--slug");
  const count = arg("--count") ? Number(arg("--count")) : 1;

  if (!process.env.LICENSE_SECRET) {
    console.error("LICENSE_SECRET is not set in .env");
    process.exit(1);
  }

  for (let i = 0; i < count; i++) {
    const { key, payload } = await generateLicenseKey({ expiresInDays: days, slug });
    const hash = await hashLicenseKey(key);
    console.log(`\nLicense key #${i + 1}:`);
    console.log(`  ${key}`);
    console.log(`  expires: ${payload.exp ? new Date(payload.exp * 1000).toISOString() : "never"}`);
    console.log(`  hash:    ${hash}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
