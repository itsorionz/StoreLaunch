import "server-only";
import { z } from "zod";
import { db } from "./db";
import { InboxCategories, PromotionAudiences, PromotionStatuses, Roles } from "./enums.mjs";
import { recordId, safeLink, validationFailure, fieldFailure } from "./form-validation";
import type { Prisma } from "@backend/generated/prisma/client";
import { lockCampaignPricing } from "./campaign-pricing";

export type PromotionResult = {
  ok: boolean;
  id?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  count?: number;
  alreadySent?: boolean;
};

export const promotionDraftSchema = z
  .object({
    id: recordId.optional(),
    title: z
      .string()
      .trim()
      .min(3, "Enter at least 3 characters")
      .max(100, "Use at most 100 characters"),
    body: z
      .string()
      .trim()
      .min(5, "Enter at least 5 characters")
      .max(2000, "Use at most 2000 characters"),
    href: safeLink.default(""),
    campaignId: recordId
      .or(z.literal(""))
      .default("")
      .transform((value) => value || null),
    audience: z.enum(PromotionAudiences),
    selectedUserIds: z
      .array(recordId)
      .max(1000, "Select at most 1000 customers; use All customers for a larger broadcast")
      .default([]),
  })
  .refine(
    (d) => d.audience !== PromotionAudiences.SelectedCustomers || d.selectedUserIds.length > 0,
    { path: ["selectedUserIds"], message: "Select at least one customer" },
  );

async function activeAdmin(tx: Prisma.TransactionClient, id: string) {
  return tx.user.findFirst({
    where: { id, active: true, roles: { has: Roles.Admin } },
    select: { id: true, name: true, email: true },
  });
}

export async function savePromotionDraft(
  actorId: string,
  input: unknown,
): Promise<PromotionResult> {
  const parsed = promotionDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const { id, campaignId, audience, title, body, href } = parsed.data;
  const selectedUserIds =
    audience === PromotionAudiences.SelectedCustomers
      ? [...new Set(parsed.data.selectedUserIds)]
      : [];
  return db.$transaction(async (tx) => {
    const admin = await activeAdmin(tx, actorId);
    if (!admin) return { ok: false, error: "An active administrator account is required" };
    if (id) {
      await tx.$queryRaw`SELECT id FROM "Promotion" WHERE id = ${id} FOR UPDATE`;
      const existing = await tx.promotion.findUnique({ where: { id } });
      if (!existing) return { ok: false, error: "Promotion not found" };
      if (existing.status !== PromotionStatuses.Draft)
        return {
          ok: false,
          error: "Sent promotions cannot be changed. Create a new promotion instead",
        };
    }
    if (campaignId && !(await tx.campaign.findUnique({ where: { id: campaignId } })))
      return { ok: false, ...fieldFailure("campaignId", "Campaign no longer exists") };
    if (selectedUserIds.length) {
      const count = await tx.user.count({
        where: { id: { in: selectedUserIds }, active: true, roles: { has: Roles.Customer } },
      });
      if (count !== selectedUserIds.length)
        return {
          ok: false,
          ...fieldFailure(
            "selectedUserIds",
            "Select active customer accounts only. Remove unavailable accounts and try again",
          ),
        };
    }
    const data = {
      title,
      body,
      audience,
      selectedUserIds,
      campaignId,
      href: campaignId ? `/products?campaign=${campaignId}` : href || null,
    };
    const promotion = id
      ? await tx.promotion.update({ where: { id }, data })
      : await tx.promotion.create({
          data: {
            ...data,
            createdById: admin.id,
            createdByName: admin.name || admin.email || "Admin",
          },
        });
    return { ok: true, id: promotion.id };
  });
}

/** Delivers a snapshot once to existing active customers; new accounts are not backfilled. */
export async function sendPromotionToCustomers(
  actorId: string,
  id: string,
): Promise<PromotionResult> {
  if (!recordId.safeParse(id).success) return { ok: false, error: "Choose a valid promotion" };
  return db.$transaction(
    async (tx) => {
      const admin = await activeAdmin(tx, actorId);
      if (!admin) return { ok: false, error: "An active administrator account is required" };
      await lockCampaignPricing(tx, true);
      await tx.$queryRaw`SELECT id FROM "Promotion" WHERE id = ${id} FOR UPDATE`;
      const promotion = await tx.promotion.findUnique({
        where: { id },
        include: { campaign: { select: { active: true } } },
      });
      if (!promotion) return { ok: false, error: "Promotion not found" };
      if (promotion.status === PromotionStatuses.Sent)
        return { ok: true, id, count: promotion.recipientCount, alreadySent: true };
      if (promotion.campaignId && !promotion.campaign?.active)
        return { ok: false, error: "Activate the linked campaign before sending this promotion" };
      const recipients = await tx.user.findMany({
        where: {
          active: true,
          roles: { has: Roles.Customer },
          ...(promotion.audience === PromotionAudiences.SelectedCustomers
            ? { id: { in: promotion.selectedUserIds } }
            : {}),
        },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      if (
        promotion.audience === PromotionAudiences.SelectedCustomers &&
        recipients.length !== promotion.selectedUserIds.length
      )
        return {
          ok: false,
          error:
            "Some selected customers are no longer active. Edit the recipient list before sending",
        };
      if (!recipients.length)
        return { ok: false, error: "There are no active customers in this audience" };
      const sentAt = new Date();
      for (let offset = 0; offset < recipients.length; offset += 1000) {
        await tx.inboxMessage.createMany({
          data: recipients.slice(offset, offset + 1000).map((user) => ({
            userId: user.id,
            promotionId: id,
            category: InboxCategories.PROMOTION,
            title: promotion.title,
            body: promotion.body,
            href: promotion.href,
            sourceKey: `promotion:${id}`,
            createdAt: sentAt,
          })),
        });
      }
      await tx.promotion.update({
        where: { id },
        data: {
          status: PromotionStatuses.Sent,
          sentAt,
          recipientCount: recipients.length,
          sentById: admin.id,
          sentByName: admin.name || admin.email || "Admin",
        },
      });
      return { ok: true, id, count: recipients.length, alreadySent: false };
    },
    { timeout: 60000 },
  );
}
