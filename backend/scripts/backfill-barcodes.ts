import "dotenv/config";
import { db } from "../lib/db";
import { generateBarcodeValue } from "../lib/barcode";

/** Assigns an auto-generated barcode to every product that does not have one. */
async function main() {
  const products = await db.product.findMany({
    where: { barcode: null },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  for (const product of products) {
    await db.product.update({
      where: { id: product.id },
      data: { barcode: generateBarcodeValue() },
    });
    console.log(` ${product.name} -> barcode assigned`);
  }

  console.log(`Done: ${products.length} product(s) updated.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
