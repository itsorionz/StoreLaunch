import { AddressTypes } from "@backend/lib/enums.mjs";
import { db } from "./db";

export const DELIVERY_ADDR_COOKIE = "sl_deliver_addr";

export type UserAddress = {
  id: string;
  name: string;
  phone: string;
  type: typeof AddressTypes.HOME | typeof AddressTypes.OFFICE | typeof AddressTypes.OTHER;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postal: string | null;
  isDefault: boolean;
};

export function listAddresses(userId: string): Promise<UserAddress[]> {
  return db.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    take: 20,
    select: {
      id: true,
      name: true,
      phone: true,
      type: true,
      line1: true,
      line2: true,
      city: true,
      region: true,
      postal: true,
      isDefault: true,
    },
  });
}

export function shortAddress(a: { line1: string; line2: string | null; city: string }): string {
  return [a.line1, a.city].filter(Boolean).join(", ");
}
