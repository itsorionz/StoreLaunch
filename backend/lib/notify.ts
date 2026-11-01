import { InboxCategories } from "@backend/lib/enums.mjs";
import { db } from "./db";
import { logEmail } from "./mail";
import { sendSms } from "./sms";

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
    console.log(`[notify] back-in-stock SMS accepted for ${accepted.length} subscriber(s)`);
  } catch (e) {
    console.error("[notify] notifyBackInStock failed", e);
  }
}
