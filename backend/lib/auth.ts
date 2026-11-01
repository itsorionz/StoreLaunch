import { Roles } from "@backend/lib/enums.mjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { consumeLoginProof } from "./login";
import { cookies } from "next/headers";
import { CART_COOKIE, mergeGuestCartIntoUserCart } from "./cart-merge";
import { db } from "./db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        loginTicket: { label: "Verified login", type: "text" },
        role: { label: "Role", type: "text" },
      },
      async authorize(credentials) {
        const user = await consumeLoginProof(credentials?.loginTicket, credentials?.role);
        // Riders and support agents don't shop, so their guest basket stays untouched.
        if (!user || user.role === Roles.Rider || user.role === Roles.Support) return user;
        const cookieStore = await cookies();
        const guestCartId = cookieStore.get(CART_COOKIE)?.value;
        if (guestCartId) {
          // A failed merge must leave the guest basket available for a fresh login.
          await mergeGuestCartIntoUserCart(guestCartId, user.id);
          cookieStore.delete(CART_COOKIE);
        }
        return user;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role?: string }).role ?? Roles.Customer;
        token.sessionVersion = (user as { sessionVersion?: number }).sessionVersion ?? 0;
      }
      if (token.uid) {
        const current = await db.user.findUnique({
          where: { id: String(token.uid) },
          select: { active: true, sessionVersion: true },
        });
        if (!current?.active || current.sessionVersion !== Number(token.sessionVersion ?? 0))
          token.sessionRevoked = true;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sessionRevoked ? "" : (token.uid as string);
      (session.user as { role?: string }).role = token.role as string;
      return session;
    },
  },
});
