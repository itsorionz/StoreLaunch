import { z } from "zod";
import type { Prisma } from "@backend/generated/prisma/client";
import { SearchLimits } from "./search-config.mjs";

export const appSearchSchema = z.object({
  q: z.string().trim().max(SearchLimits.queryLength).optional().default(""),
});
export const searchTerms = (query: string) => query.trim().split(/\s+/u).filter(Boolean);
export const literalSearchTerm = (term: string) => term.replace(/[\\%_]/g, "\\$&");
export function userTextWhere(query: string): Prisma.UserWhereInput {
  return {
    AND: searchTerms(query).map((term) => {
      const match = { contains: literalSearchTerm(term), mode: "insensitive" as const };
      const digits = term.replace(/\D/g, "");
      return {
        OR: [
          { name: match },
          { email: match },
          { phone: match },
          ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
        ],
      };
    }),
  };
}
export function productTextWhere(query: string): Prisma.ProductWhereInput {
  const terms = searchTerms(query);
  return terms.length
    ? {
        AND: terms.map((term) => {
          const match = { contains: literalSearchTerm(term), mode: "insensitive" as const };
          return {
            OR: [
              { name: match },
              { nameBn: match },
              { description: match },
              { descriptionBn: match },
              { slug: match },
              { sku: match },
              { barcode: match },
              { brand: { is: { OR: [{ name: match }, { nameBn: match }, { slug: match }] } } },
              { category: { is: { OR: [{ name: match }, { nameBn: match }, { slug: match }] } } },
            ],
          };
        }),
      }
    : {};
}
export function orderTextWhere(query: string): Prisma.OrderWhereInput {
  return {
    AND: searchTerms(query).map((term) => {
      const match = { contains: literalSearchTerm(term), mode: "insensitive" as const };
      const digits = term.replace(/\D/g, "");
      return {
        OR: [
          { number: match },
          { recipientName: match },
          { phone: match },
          { city: match },
          { line1: match },
          { additionalInfo: match },
          { items: { some: { name: match } } },
          { items: { some: { product: { is: { sku: match } } } } },
          { items: { some: { product: { is: { barcode: match } } } } },
          ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
        ],
      };
    }),
  };
}
