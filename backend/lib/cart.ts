import { campaignPriceSelect, withCampaignPrice } from "./campaign-pricing";
import "server-only";
import { cacheTag } from "next/cache";
import { cookies } from "next/headers";
import { db } from "./db";
import { getCurrentUser } from "./session";
import { effectivePriceCents } from "./money";

import { CART_COOKIE } from "./cart-merge";
export { CART_COOKIE, mergeGuestCartIntoUserCart } from "./cart-merge";

export type CartData = {
  id: string;
  items: {
    id: string;
    quantity: number;
    selected: boolean;
    product: {
      id: string;
      name: string;
      nameBn: string | null;
      slug: string;
      priceCents: number;
      salePriceCents: number | null;
      stock: number;
      images: string[];
      brand?: { name: string; nameBn: string | null; slug: string } | null;
    };
  }[];
  subtotalCents: number;
  itemCount: number;
};

export async function getOrCreateCartId(): Promise<string> {
  const user = await getCurrentUser();
  const cookieStore = await cookies();

  if (user) {
    const existing = await db.cart.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (existing) return existing.id;
    const created = await db.cart.create({ data: { userId: user.id } });
    return created.id;
  }

  const cookieId = cookieStore.get(CART_COOKIE)?.value;
  if (cookieId) {
    const existing = await db.cart.findFirst({
      where: { id: cookieId, userId: null },
      select: { id: true },
    });
    if (existing) return existing.id;
  }
  const created = await db.cart.create({ data: {} });
  cookieStore.set(CART_COOKIE, created.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return created.id;
}

export async function getCartIdOrNull(): Promise<string | null> {
  const user = await getCurrentUser();
  if (user) {
    const c = await db.cart.findUnique({ where: { userId: user.id }, select: { id: true } });
    return c?.id ?? null;
  }
  const cookieStore = await cookies();
  const cookieId = cookieStore.get(CART_COOKIE)?.value;
  if (!cookieId) return null;
  const c = await db.cart.findFirst({
    where: { id: cookieId, userId: null },
    select: { id: true },
  });
  return c?.id ?? null;
}

export async function getCart(): Promise<CartData | null> {
  const cartId = await getCartIdOrNull();
  if (!cartId) return null;
  const cart = await db.cart.findUnique({
    where: { id: cartId },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              nameBn: true,
              slug: true,
              priceCents: true,
              salePriceCents: true,
              campaignOffers: campaignPriceSelect,
              stock: true,
              images: true,
              brand: { select: { name: true, nameBn: true, slug: true } },
            },
          },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!cart) return null;
  const items = cart.items.map((i) => ({
    id: i.id,
    quantity: i.quantity,
    selected: i.selected,
    product: withCampaignPrice(i.product),
  }));
  const subtotalCents = items
    .filter((item) => item.selected && item.product.stock > 0)
    .reduce(
      (s, i) =>
        s + effectivePriceCents(i.product.priceCents, i.product.salePriceCents) * i.quantity,
      0,
    );
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);
  return { id: cart.id, items, subtotalCents, itemCount };
}

async function cartItemCount(cartId: string): Promise<number> {
  "use cache: private";
  cacheTag("cart-count");
  const cart = await db.cart.findUnique({
    where: { id: cartId },
    select: { items: { select: { quantity: true } } },
  });
  return cart ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0;
}

export async function getCartCount(): Promise<number> {
  const cartId = await getCartIdOrNull();
  if (!cartId) return 0;
  return cartItemCount(cartId);
}

export async function getCheckoutCart(): Promise<CartData | null> {
  const cart = await getCart();
  if (!cart) return null;
  const items = cart.items.filter((item) => item.selected && item.product.stock > 0);
  return { ...cart, items, itemCount: items.reduce((sum, item) => sum + item.quantity, 0) };
}
