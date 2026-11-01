import { Roles } from "@backend/lib/enums.mjs";
import "next-auth";

type SessionRole =
  | typeof Roles.Customer
  | typeof Roles.Admin
  | typeof Roles.Rider
  | typeof Roles.Support
  | typeof Roles.Warehouse
  | typeof Roles.Sales
  | typeof Roles.Manager;

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: SessionRole;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    role?: SessionRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: SessionRole;
  }
}
