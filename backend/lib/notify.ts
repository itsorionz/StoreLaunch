import { InboxCategories } from "@backend/lib/enums.mjs";
import { db } from "./db";
import { logEmail } from "./mail";
import { sendSms } from "./sms";
import { logger } from "./logger";

const log = logger.child({ scope: "notify" });

export async function notifyBackInStock(productId: string): Promise<void> {
  try {
    const product = await db.product.findUnique({
      where: { id: productId },
      select: { name: true, slug: true },
    });
    if (!product) return;

    const subs = await db.stockNotification.findMany({
      where: { productId, notifiedAt: null },
      include: { user: { select: { email: true, phone: true } } },
    });
    if (subs.length === 0) return;

    const base =
      process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.NEXT_PUBLIC_BASE_URL ??
      "http://localhost:3000";
    const link = `${base}/products/${product.slug}`;
    const subject = `Back in stock: ${product.name}`;
    const body = `Good news! "${product.name}" is available again. Order now: ${link}`;

    const accepted: string[] = [];
    for (const sub of subs) {
      await db.inboxMessage.createMany({
        data: {
          userId: sub.userId,
          category: InboxCategories.NOTIFICATION,
          title: "Back in stock",
          body: `${product.name} is available again.`,
          href: `/products/${product.slug}`,
          sourceKey: `stock:${sub.id}`,
        },
        skipDuplicates: true,
      });
      await logEmail({ to: sub.user.email, subject, body });
      if (await sendSms(sub.user.phone, body)) accepted.push(sub.id);
    }

    await db.stockNotification.updateMany({
      where: { id: { in: accepted } },
      data: { notifiedAt: new Date() },
    });
    log.debug("back-in-stock notifications sent", { productId, accepted: accepted.length });
  } catch (e) {
    // Never rethrown — a notification outage must not break the request that
    // triggered it, so this line is the only trace of the failure.
    log.error("notifyBackInStock failed", { error: e, productId });
  }
}
