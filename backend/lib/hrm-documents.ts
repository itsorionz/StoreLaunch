import "server-only";
import { z } from "zod";
import { db } from "./db";
import { EmployeeDocumentKinds } from "./enums.mjs";
import { hrmFailure, type HrmResult } from "./hrm";
import { recordId, safeLink } from "./form-validation";

/**
 * Employee documents mirror the careers-resume pattern: a PDF/image stored as
 * bytes (streamed back through an admin-only route) or an external link.
 * Admin-only everywhere; nothing here is public.
 */

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export const employeeDocumentSchema = z.object({
  employeeId: recordId,
  kind: z.enum(EmployeeDocumentKinds),
  title: z.string().trim().min(2, "Enter a title").max(200, "Use at most 200 characters"),
  url: safeLink,
});

export type EmployeeDocumentInput = z.infer<typeof employeeDocumentSchema>;

export async function addEmployeeDocument(
  input: EmployeeDocumentInput,
  file: FormDataEntryValue | null,
): Promise<HrmResult> {
  const employee = await db.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true },
  });
  if (!employee) return hrmFailure("Employee not found");

  const hasFile = typeof File !== "undefined" && file instanceof File && file.size > 0;
  if (!input.url && !hasFile)
    return hrmFailure("Upload a PDF or image, or provide a document link", "url");
  if (hasFile) {
    if (file.size > MAX_DOCUMENT_BYTES) return hrmFailure("File must be 5 MB or smaller", "url");
    if (!ALLOWED_TYPES.includes(file.type))
      return hrmFailure("Upload a PDF, JPEG, PNG or WebP file", "url");
  }

  let bytes: Uint8Array<ArrayBuffer> | undefined;
  let fileName: string | undefined;
  let mimeType: string | undefined;
  if (hasFile && file instanceof File) {
    bytes = new Uint8Array(await file.arrayBuffer());
    fileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "document";
    mimeType = file.type;
  }

  const document = await db.employeeDocument.create({
    data: {
      employeeId: input.employeeId,
      kind: input.kind,
      title: input.title,
      fileName: fileName ?? null,
      mimeType: mimeType ?? null,
      bytes: bytes ?? null,
      url: input.url || null,
    },
  });
  return { ok: true, id: document.id };
}

export async function deleteEmployeeDocument(documentId: string): Promise<HrmResult> {
  const document = await db.employeeDocument.findUnique({
    where: { id: documentId },
    select: { id: true },
  });
  if (!document) return hrmFailure("Document not found");
  await db.employeeDocument.delete({ where: { id: documentId } });
  return { ok: true, id: documentId };
}

/** Raw row for the admin download stream (see api/admin/employee-documents). */
export async function getStoredDocument(documentId: string) {
  return db.employeeDocument.findUnique({
    where: { id: documentId },
    select: { bytes: true, fileName: true, mimeType: true },
  });
}
