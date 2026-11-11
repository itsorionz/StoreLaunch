import { unstable_noStore } from "next/cache";
import { connection } from "next/server";
import WarehousePage from "@/app/warehouse/page";

export default async function AdminWarehousePage() {
  unstable_noStore();
  await connection();
  return <WarehousePage />;
}
