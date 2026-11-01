import "server-only";
import { db } from "./db";

export async function changeCartSelection(
  cartId: string,
  ids: string[] | null,
  selected: boolean,
  remove = false,
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Cart" WHERE id = ${cartId} FOR UPDATE`;
    const where = {
      cartId,
      ...(ids ? { id: { in: ids } } : {}),
      ...(selected ? { product: { stock: { gt: 0 } } } : {}),
    };
    const validateWhere = { cartId, ...(ids ? { id: { in: ids } } : {}) };
    if (ids && (await tx.cartItem.count({ where: validateWhere })) !== new Set(ids).size)
      return { ok: false, error: "Cart items changed. Refresh and try again." };
    if (selected && ids === null) {
      await tx.cartItem.updateMany({
        where: { cartId, product: { stock: { lte: 0 } } },
        data: { selected: false },
      });
    }
    if (remove) await tx.cartItem.deleteMany({ where: { ...where, selected: true } });
    else await tx.cartItem.updateMany({ where, data: { selected } });
    return { ok: true };
  });
}
