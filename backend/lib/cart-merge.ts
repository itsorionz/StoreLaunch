import "server-only";
import { db } from "./db";

export const CART_COOKIE = "cart_id";
export type CartMergeResult = {
  mergedLines: number;
  cappedLines: number;
  unavailableLines: number;
};

/** A guest basket is consumed once, together with every change to the owned basket. */
export async function mergeGuestCartIntoUserCart(
  guestCartId: string,
  userId: string,
): Promise<CartMergeResult> {
  const empty = { mergedLines: 0, cappedLines: 0, unavailableLines: 0 };
  if (!guestCartId || guestCartId.length > 100 || !userId) return empty;
  return db.$transaction(async (tx) => {
    // Serialize first-basket creation and merges from different devices for this user.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('cart-merge'), hashtext(${userId}))::text`;
    await tx.$queryRaw`SELECT id FROM "Cart" WHERE id = ${guestCartId} FOR UPDATE`;
    const guest = await tx.cart.findFirst({
      where: { id: guestCartId, userId: null },
      include: { items: true },
    });
    if (!guest) return empty;
    const user = await tx.user.findUnique({ where: { id: userId }, select: { active: true } });
    if (!user?.active) throw new Error("CART_MERGE_USER_UNAVAILABLE");
    const userCart = await tx.cart.upsert({ where: { userId }, update: {}, create: { userId } });
    await tx.$queryRaw`SELECT id FROM "Cart" WHERE id = ${userCart.id} FOR UPDATE`;
    const result = { ...empty };
    for (const item of [...guest.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${item.productId} FOR UPDATE`;
      const product = await tx.product.findUnique({
        where: { id: item.productId },
        select: { active: true, stock: true },
      });
      if (!product?.active || product.stock < 1 || item.quantity < 1) {
        result.unavailableLines++;
        continue;
      }
      const existing = await tx.cartItem.findUnique({
        where: { cartId_productId: { cartId: userCart.id, productId: item.productId } },
      });
      const wanted = (existing?.quantity ?? 0) + item.quantity;
      // Do not lower an existing basket line when stock has fallen since it was added.
      // Checkout still validates its availability; the merge adds only available units.
      const quantity = Math.max(existing?.quantity ?? 0, Math.min(99, product.stock, wanted));
      if (quantity < wanted) result.cappedLines++;
      if (existing) {
        if (quantity === existing.quantity) continue;
        await tx.cartItem.update({ where: { id: existing.id }, data: { quantity } });
      } else {
        await tx.cartItem.create({
          data: {
            cartId: userCart.id,
            productId: item.productId,
            quantity,
            selected: item.selected,
          },
        });
      }
      result.mergedLines++;
    }
    await tx.cart.delete({ where: { id: guest.id } });
    return result;
  });
}
