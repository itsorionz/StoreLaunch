import "server-only";
import { db } from "./db";

export async function restoreOrderItems(userId: string, orderId: string) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, userId },
      select: { items: { select: { productId: true, quantity: true, name: true } } },
    });
    if (!order) return { ok: false as const, error: "Order not found" };
    if (!order.items.length)
      return { ok: false as const, error: "This order has no items to restore" };
    const cart = await tx.cart.upsert({ where: { userId }, update: {}, create: { userId } });
    await tx.$queryRaw`SELECT id FROM "Cart" WHERE id = ${cart.id} FOR UPDATE`;
    const items = new Map<string, { quantity: number; name: string }>();
    for (const item of order.items) {
      const existing = items.get(item.productId);
      items.set(item.productId, {
        name: item.name,
        quantity: item.quantity + (existing?.quantity ?? 0),
      });
    }
    const warnings: string[] = [];
    const availableItems: { productId: string; quantity: number; name: string; limit: number }[] =
      [];
    for (const [productId, item] of [...items].sort(([a], [b]) => a.localeCompare(b))) {
      if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
        warnings.push(`${item.name}: the original quantity is invalid`);
        continue;
      }
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR SHARE`;
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { active: true, stock: true },
      });
      if (!product?.active || product.stock < 1) {
        warnings.push(`${item.name}: currently unavailable`);
        continue;
      }
      const limit = Math.min(product.stock, 99);
      const quantity = Math.min(item.quantity, limit);
      if (quantity < item.quantity)
        warnings.push(
          `${item.name}: only ${quantity} of ${item.quantity} requested units can be restored`,
        );
      availableItems.push({ productId, quantity, name: item.name, limit });
    }
    if (!availableItems.length)
      return { ok: false as const, error: "These items are currently unavailable", warnings };

    for (const item of availableItems) {
      const existing = await tx.cartItem.findUnique({
        where: { cartId_productId: { cartId: cart.id, productId: item.productId } },
      });
      if (!existing) {
        await tx.cartItem.create({
          data: {
            cartId: cart.id,
            productId: item.productId,
            quantity: item.quantity,
            selected: true,
          },
        });
        continue;
      }
      const quantity = Math.max(existing.quantity, item.quantity);
      if (quantity > item.quantity && quantity > item.limit)
        warnings.push(
          `${item.name}: keeping the ${quantity} units already in your cart, above the current limit of ${item.limit}`,
        );
      await tx.cartItem.update({
        where: { id: existing.id },
        data: { quantity, selected: true },
      });
    }
    return {
      ok: true as const,
      message:
        "Your cart now holds the available items from this order. Review current prices and availability before checkout.",
      warnings,
    };
  });
}
