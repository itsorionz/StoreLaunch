import { db } from './backend/lib/db';
async function main() {
  const riders = await db.rider.findMany({ select: { id: true, name: true, phone: true, active: true } });
  console.log(JSON.stringify(riders, null, 2));
  await db.$disconnect();
}
main();
