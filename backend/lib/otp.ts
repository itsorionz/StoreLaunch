import { db } from "./db";
import { sendSms } from "./sms";
import { randomInt } from "node:crypto";
import { canonicalPhone } from "./phone";
import { getVerificationTemplates, renderMessageTemplate } from "./message-templates";
export { canonicalPhone } from "./phone";

export type OtpUser = { id: string; email: string; name: string; roles: string[] };

export async function findUserByPhone(input: string): Promise<OtpUser | null> {
  const phone = canonicalPhone(input);
  if (phone.length < 10) return null;

  const candidates = await db.user.findMany({
    where: { phone: { not: null } },
    select: { id: true, email: true, name: true, roles: true, phone: true, active: true },
  });
  const matches = candidates.filter((u) => u.phone && canonicalPhone(u.phone) === phone);
  if (matches.length !== 1) return null;
  const match = matches[0];
  if (!match.active) return null;
  return { id: match.id, email: match.email, name: match.name, roles: match.roles };
}

export type CreateOtpResult =
  | { ok: true; phone: string }
  | {
      ok: false;
      code: "RATE_LIMIT" | "NO_ACCOUNT" | "SMS_FAILED" | "INVALID_PHONE";
      wait?: number;
    };

async function createOtp(phone: string): Promise<CreateOtpResult> {
  const code = String(randomInt(100000, 1000000));
  const prepared = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${phone}, 0))::text`;
    const last = await tx.phoneOtp.findFirst({ where: { phone }, orderBy: { createdAt: "desc" } });
    if (last && Date.now() - last.createdAt.getTime() < 60_000)
      return {
        ok: false as const,
        wait: Math.ceil((60_000 - (Date.now() - last.createdAt.getTime())) / 1000),
      };
    await tx.phoneOtp.updateMany({
      where: { phone, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    const otp = await tx.phoneOtp.create({
      data: { phone, code, expiresAt: new Date(Date.now() + 5 * 60_000) },
    });
    return { ok: true as const, id: otp.id };
  });
  if (!prepared.ok) return { ok: false, code: "RATE_LIMIT", wait: prepared.wait };
  const templates = await getVerificationTemplates();
  const message = renderMessageTemplate(templates.smsBody, {
    code,
    minutes: 5,
    storeName: templates.storeName,
  });
  if (!(await sendSms(phone, message))) {
    await db.phoneOtp.updateMany({
      where: { id: prepared.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return { ok: false, code: "SMS_FAILED" };
  }
  return { ok: true, phone };
}

export async function createPhoneOtp(input: string): Promise<CreateOtpResult> {
  const phone = canonicalPhone(input);
  if (!/^8801[3-9]\d{8}$/.test(phone)) return { ok: false, code: "INVALID_PHONE" };

  const user = await findUserByPhone(phone);
  if (!user) return { ok: false, code: "NO_ACCOUNT" };
  return createOtp(phone);
}

export async function verifyPhoneOtp(input: string, codeInput: string): Promise<OtpUser | null> {
  const phone = canonicalPhone(input);
  const code = codeInput.trim();

  const otp = await db.phoneOtp.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gte: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return null;
  if (otp.attempts >= 5) return null;

  if (otp.code !== code) {
    await db.phoneOtp.updateMany({
      where: { id: otp.id, consumedAt: null, attempts: { lt: 5 } },
      data: { attempts: { increment: 1 } },
    });
    return null;
  }

  const consumed = await db.phoneOtp.updateMany({
    where: { id: otp.id, consumedAt: null, attempts: { lt: 5 }, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (!consumed.count) return null;
  return findUserByPhone(phone);
}
