"use server";

import { campaignPriceSelect, withCampaignPrice } from "../lib/campaign-pricing";
import { z } from "zod";
import { cookies } from "next/headers";
import { listAddresses, DELIVERY_ADDR_COOKIE, type UserAddress } from "../lib/addresses";
import { changeCartSelection } from "../lib/cart-selection";
import { recordId } from "../lib/form-validation";

import { updateTag } from "next/cache";
import { revalidateStore } from "../lib/revalidate";
import { getOrCreateCartId, getCartIdOrNull, getCart } from "../lib/cart";
import { getStoreSettings } from "../lib/settings";
import { db } from "../lib/db";
import { getCurrentUser } from "../lib/session";

export type CartActionResult = { ok: boolean; error?: string; itemCount?: number };

function bustCartCount() {
  updateTag("cart-count");
}

export async function addToCart(productId: string, quantity = 1): Promise<CartActionResult> {
  if (!recordId.safeParse(productId).success)
    return { ok: false, error: "Invalid record. Refresh the page and try again" };
  const qty = Number(quantity);
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > 99)
    return { ok: false, error: "Enter a whole quantity between 1 and 99" };
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, stock: true, active: true },
  });
  if (!product || !product.active) return { ok: false, error: "Product not available" };
  if (product.stock < qty) return { ok: false, error: "Not enough stock" };

  const cartId = await getOrCreateCartId();
  const added = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Cart" WHERE id = ${cartId} FOR UPDATE`;
    const current = await tx.cartItem.findUnique({
      where: { cartId_productId: { cartId, productId } },
    });
    const nextQuantity = (current?.quantity ?? 0) + qty;
    if (nextQuantity > Math.min(99, product.stock)) return false;
    await tx.cartItem.upsert({
      where: { cartId_productId: { cartId, productId } },
      update: { quantity: nextQuantity },
      create: { cartId, productId, quantity: nextQuantity },
    });
    return true;
  });
  if (!added) return { ok: false, error: "Not enough stock or cart quantity limit reached" };
  bustCartCount();
  const cart = await getCart();
  return { ok: true, itemCount: cart?.itemCount ?? 0 };
}

export async function updateCartItem(itemId: string, quantity: number): Promise<CartActionResult> {
  if (!recordId.safeParse(itemId).success)
    return { ok: false, error: "Invalid record. Refresh the page and try again" };
  const qty = Number(quantity);
  if (!Number.isSafeInteger(qty) || qty < 0 || qty > 99)
    return { ok: false, error: "Enter a whole quantity between 0 and 99" };
  const cartId = await getCartIdOrNull();
  if (!cartId) return { ok: false, error: "Cart not found" };
  const item = await db.cartItem.findFirst({ where: { id: itemId, cartId } });
  if (!item) return { ok: false, error: "Item not found" };

  if (qty < 1) {
    await db.cartItem.delete({ where: { id: itemId } });
  } else {
    const product = await db.product.findUnique({
      where: { id: item.productId },
      select: { stock: true },
    });
    if (product && product.stock < qty) return { ok: false, error: "Not enough stock" };
    await db.cartItem.update({ where: { id: itemId }, data: { quantity: Math.min(99, qty) } });
  }
  bustCartCount();
  const cart = await getCart();
  return { ok: true, itemCount: cart?.itemCount ?? 0 };
}

export async function removeCartItem(itemId: string): Promise<CartActionResult> {
  if (!recordId.safeParse(itemId).success)
    return { ok: false, error: "Invalid record. Refresh the page and try again" };
  const cartId = await getCartIdOrNull();
  if (!cartId) return { ok: false, error: "Cart not found" };
  await db.cartItem.deleteMany({ where: { id: itemId, cartId } });
  bustCartCount();
  const cart = await getCart();
  return { ok: true, itemCount: cart?.itemCount ?? 0 };
}

export type CartViewItem = {
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
};

export type CartView = {
  items: CartViewItem[];
  notificationProductIds: string[];
  signedIn: boolean;
  flashSaleAvailable: boolean;
  featuredCampaign: { id: string; title: string; linkUrl: string } | null;
  addresses: UserAddress[];
  selectedAddressId: string | null;
  recommendations: {
    id: string;
    name: string;
    nameBn: string | null;
    slug: string;
    images: string[];
    priceCents: number;
    salePriceCents: number | null;
  }[];
  subtotalCents: number;
  itemCount: number;
  currencySymbol: string;
  deliveryFeeCents: number;
  freeShippingOverCents: number | null;
  deliveryEstimate: string;
};

export async function getCartView(): Promise<CartView> {
  const [cart, settings, user] = await Promise.all([
    getCart(),
    getStoreSettings(),
    getCurrentUser(),
  ]);
  const cartProductIds = cart?.items.map((item) => item.product.id) ?? [];
  const [addresses, jar, featuredCampaign, notifications] = await Promise.all([
    user ? listAddresses(user.id) : Promise.resolve([]),
    cookies(),
    db.campaign.findFirst({
      where: {
        active: true,
        showInCart: true,
        products: { some: { product: { active: true, stock: { gt: 0 } } } },
      },
      orderBy: [{ order: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        linkUrl: true,
        flashSale: true,
        products: {
          where: {
            product: {
              active: true,
              stock: { gt: 0 },
              id: { notIn: cartProductIds },
            },
          },
          orderBy: { product: { name: "asc" } },
          take: 4,
          select: {
            product: {
              select: {
                id: true,
                name: true,
                nameBn: true,
                slug: true,
                images: true,
                priceCents: true,
                salePriceCents: true,
                campaignOffers: campaignPriceSelect,
              },
            },
          },
        },
      },
    }),
    user && cartProductIds.length
      ? db.stockNotification.findMany({
          where: { userId: user.id, productId: { in: cartProductIds }, notifiedAt: null },
          select: { productId: true },
        })
      : Promise.resolve([]),
  ]);
  const selectedAddressId =
    addresses.find((address) => address.id === jar.get(DELIVERY_ADDR_COOKIE)?.value)?.id ??
    addresses.find((address) => address.isDefault)?.id ??
    addresses[0]?.id ??
    null;
  return {
    signedIn: Boolean(user),
    flashSaleAvailable: Boolean(featuredCampaign?.flashSale),
    featuredCampaign: featuredCampaign
      ? {
          id: featuredCampaign.id,
          title: featuredCampaign.title,
          linkUrl: featuredCampaign.linkUrl || `/products?campaign=${featuredCampaign.id}`,
        }
      : null,
    addresses,
    selectedAddressId,
    recommendations: (featuredCampaign?.products ?? []).map(({ product }) =>
      withCampaignPrice(product),
    ),
    items: cart?.items ?? [],
    notificationProductIds: notifications.map((notification) => notification.productId),
    subtotalCents: cart?.subtotalCents ?? 0,
    itemCount: cart?.itemCount ?? 0,
    currencySymbol: settings.currencySymbol,
    deliveryFeeCents: settings.deliveryFeeCents,
    freeShippingOverCents: settings.freeShippingOverCents,
    deliveryEstimate: settings.deliveryEstimate,
  };
}

export async function clearCart(): Promise<void> {
  const cartId = await getCartIdOrNull();
  if (cartId) await db.cartItem.deleteMany({ where: { cartId } });
  revalidateStore();
}

export async function getCartForPage() {
  const user = await getCurrentUser();
  const cart = await getCart();
  return { cart, userId: user?.id ?? null };
}

export async function selectCartItems(
  ids: string[] | null,
  selected: boolean,
): Promise<CartActionResult> {
  const parsed = z
    .object({ ids: z.array(recordId).max(200).min(1).nullable(), selected: z.boolean() })
    .safeParse({ ids, selected });
  if (!parsed.success) return { ok: false, error: "Choose valid cart items and selection." };
  const cartId = await getCartIdOrNull();
  if (!cartId) return { ok: false, error: "Cart not found" };
  const result = await changeCartSelection(cartId, parsed.data.ids, parsed.data.selected);
  if (result.ok) bustCartCount();
  return result;
}

export async function removeSelectedCartItems(): Promise<CartActionResult> {
  const cartId = await getCartIdOrNull();
  if (!cartId) return { ok: false, error: "Cart not found" };
  const result = await changeCartSelection(cartId, null, false, true);
  if (result.ok) bustCartCount();
  return result;
}
