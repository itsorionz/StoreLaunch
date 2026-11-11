"use server";

import { z } from "zod";
import {
  CareerApplicationStatuses,
  CareerEmploymentTypes,
  CareerJobStatuses,
  CareerWorkplaceModes,
} from "@backend/lib/enums.mjs";
import { db } from "@backend/lib/db";
import { requireAdmin } from "@backend/lib/session";
import {
  emailAddress,
  fieldFailure,
  personName,
  recordId,
  validationFailure,
} from "@backend/lib/form-validation";
import { revalidatePath } from "next/cache";
import { logEmail } from "@backend/lib/mail";
import { renderMessageTemplate } from "@backend/lib/message-templates";
import { logger } from "@backend/lib/logger";

const log = logger.child({ scope: "action:career" });

export type CareerActionResult = {
  ok: boolean;
  id?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

const nonEmptyText = (max: number) =>
  z.string().trim().min(2, "Enter at least 2 characters").max(max, `Use at most ${max} characters`);

const jobSchema = z.object({
  id: recordId.optional(),
  slug: z
    .string()
    .trim()
    .min(2, "Enter a job URL slug")
    .max(120, "Use at most 120 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single dashes"),
  title: personName,
  department: nonEmptyText(100),
  location: nonEmptyText(120),
  employmentType: z.enum(CareerEmploymentTypes),
  workplaceMode: z.enum(CareerWorkplaceModes),
  summary: nonEmptyText(500),
  description: z.string().trim().min(20, "Add at least 20 characters").max(10000),
  requirements: z
    .string()
    .max(6000, "Requirements are too long")
    .transform((value) =>
      value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .refine((items) => items.length > 0, "Add at least one requirement")
    .refine((items) => items.length <= 20, "Add no more than 20 requirements")
    .refine(
      (items) => items.every((item) => item.length <= 250),
      "Keep each requirement under 250 characters",
    ),
  status: z.enum(CareerJobStatuses),
  closesAt: z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid closing date")
      .refine(
        (value) => !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()),
        "Enter a valid closing date",
      )
      .nullable(),
  ),
});

export async function saveCareerJob(
  _previous: CareerActionResult | null,
  formData: FormData,
): Promise<CareerActionResult> {
  const admin = await requireAdmin();
  const parsed = jobSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const input = parsed.data;

  const conflictingSlug = await db.careerJob.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (conflictingSlug && conflictingSlug.id !== input.id)
    return { ok: false, ...fieldFailure("slug", "This job URL is already in use") };

  const existing = input.id
    ? await db.careerJob.findUnique({
        where: { id: input.id },
        select: { id: true, publishedAt: true },
      })
    : null;
  if (input.id && !existing) return { ok: false, error: "This job posting no longer exists" };

  const closesAt = input.closesAt ? new Date(`${input.closesAt}T23:59:59.999Z`) : null;
  const publishedAt =
    input.status === CareerJobStatuses.Published
      ? (existing?.publishedAt ?? new Date())
      : (existing?.publishedAt ?? null);
  const data = {
    slug: input.slug,
    title: input.title,
    department: input.department,
    location: input.location,
    employmentType: input.employmentType,
    workplaceMode: input.workplaceMode,
    summary: input.summary,
    description: input.description,
    requirements: input.requirements,
    status: input.status,
    closesAt,
    publishedAt,
  };

  const job = existing
    ? await db.careerJob.update({ where: { id: existing.id }, data })
    : await db.careerJob.create({
        data: {
          ...data,
          createdById: admin.id,
          createdByName: admin.name ?? admin.email ?? "Store admin",
        },
      });

  revalidatePath("/career");
  revalidatePath("/admin/careers");
  revalidatePath(`/admin/careers/${job.id}`);
  return { ok: true, id: job.id };
}

const applicationSchema = z.object({
  jobId: recordId,
  name: personName,
  email: emailAddress,
  phone: z
    .string()
    .trim()
    .min(5, "Enter a valid phone number")
    .max(30, "Phone number is too long")
    .regex(/^\+?[\d\s()-]+$/, "Enter a valid phone number"),
  resumeUrl: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z
      .string()
      .trim()
      .max(2048, "URL is too long")
      .url("Enter a valid resume or portfolio URL")
      .refine((value) => value.startsWith("https://"), "Use a secure https:// link")
      .optional(),
  ),
  coverLetter: z
    .string()
    .trim()
    .min(30, "Write at least 30 characters")
    .max(5000, "Use at most 5000 characters"),
  consent: z.union([z.literal("on"), z.literal("true")]),
  website: z.string().max(200).default(""),
});

export async function submitCareerApplication(
  _previous: CareerActionResult | null,
  formData: FormData,
): Promise<CareerActionResult> {
  const parsed = applicationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };
  const input = parsed.data;
  if (input.website) return { ok: true };

  const uploadedFile = formData.get("resumeFile");
  const hasUploadedFile =
    typeof File !== "undefined" && uploadedFile instanceof File && uploadedFile.size > 0;
  if (!input.resumeUrl && !hasUploadedFile)
    return { ok: false, ...fieldFailure("resumeFile", "Upload a PDF CV or provide a resume link") };
  if (hasUploadedFile && uploadedFile.size > 5 * 1024 * 1024)
    return { ok: false, ...fieldFailure("resumeFile", "CV must be 5 MB or smaller") };
  if (hasUploadedFile && uploadedFile.type !== "application/pdf")
    return { ok: false, ...fieldFailure("resumeFile", "Upload a PDF file") };

  let resumeBytes: Uint8Array<ArrayBuffer> | undefined;
  let resumeFileName: string | undefined;
  if (hasUploadedFile) {
    resumeBytes = new Uint8Array(await uploadedFile.arrayBuffer());
    if (resumeBytes.length < 5 || String.fromCharCode(...resumeBytes.subarray(0, 5)) !== "%PDF-")
      return { ok: false, ...fieldFailure("resumeFile", "The uploaded file is not a valid PDF") };
    resumeFileName = uploadedFile.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "resume.pdf";
  }

  const job = await db.careerJob.findFirst({
    where: {
      id: input.jobId,
      status: CareerJobStatuses.Published,
      OR: [{ closesAt: null }, { closesAt: { gte: new Date() } }],
    },
    select: { id: true, title: true },
  });
  if (!job) return { ok: false, error: "This position is no longer accepting applications" };

  const email = input.email.toLowerCase();
  if (await db.careerApplication.findUnique({ where: { jobId_email: { jobId: job.id, email } } }))
    return {
      ok: false,
      ...fieldFailure("email", "An application with this email is already on file for this role"),
    };

  try {
    const application = await db.careerApplication.create({
      data: {
        jobId: job.id,
        name: input.name,
        email,
        phone: input.phone,
        resumeUrl: input.resumeUrl,
        resumeFile: resumeBytes,
        resumeFileName,
        resumeMimeType: resumeBytes ? "application/pdf" : null,
        coverLetter: input.coverLetter,
      },
      select: { id: true },
    });

    const settings = await db.storeSettings.findUnique({
      where: { singletonKey: 1 },
      select: {
        storeName: true,
        contactEmail: true,
        careerNotificationEmail: true,
        careerEmailSubject: true,
        careerEmailBody: true,
      },
    });
    const recipient = settings?.careerNotificationEmail || settings?.contactEmail;
    if (recipient) {
      const values = {
        storeName: settings?.storeName || "Store",
        jobTitle: job.title,
        applicantName: input.name,
        applicantEmail: email,
        applicantPhone: input.phone,
        resume:
          input.resumeUrl || (resumeFileName ? `Uploaded CV: ${resumeFileName}` : "Not provided"),
        coverLetter: input.coverLetter,
        applicationId: application.id,
      };
      await logEmail({
        to: recipient,
        subject: renderMessageTemplate(
          settings?.careerEmailSubject || "New career application: {{jobTitle}}",
          values,
        ),
        body: renderMessageTemplate(
          settings?.careerEmailBody ||
            "A new application was submitted for {{jobTitle}}. Applicant: {{applicantName}} ({{applicantEmail}})",
          values,
        ),
      });
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      log.warn("submitCareerApplication rejected", { code: "P2002", jobId: job.id, email });
      return {
        ok: false,
        ...fieldFailure("email", "An application with this email is already on file for this role"),
      };
    }
    log.error("submitCareerApplication failed", { error, jobId: job.id });
    throw error;
  }

  revalidatePath("/admin/careers");
  revalidatePath(`/admin/careers/${job.id}`);
  return { ok: true };
}

export async function updateCareerApplicationStatus(
  _previous: CareerActionResult | null,
  formData: FormData,
): Promise<CareerActionResult> {
  await requireAdmin();
  const parsed = z
    .object({ applicationId: recordId, status: z.enum(CareerApplicationStatuses) })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, ...validationFailure(parsed.error) };

  const application = await db.careerApplication.findUnique({
    where: { id: parsed.data.applicationId },
    select: { id: true, jobId: true },
  });
  if (!application) return { ok: false, error: "This application no longer exists" };

  await db.careerApplication.update({
    where: { id: application.id },
    data: { status: parsed.data.status },
  });
  revalidatePath("/admin/careers");
  revalidatePath(`/admin/careers/${application.jobId}`);
  return { ok: true };
}
