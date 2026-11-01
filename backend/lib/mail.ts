import "server-only";
import nodemailer from "nodemailer-v10";
import type { Transporter } from "nodemailer-v10";

let transporter: Transporter | undefined;

function getTransporter() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transporter;
}

export async function sendEmail({
  to,
  subject,
  body,
  html,
}: {
  to: string | null | undefined;
  subject: string;
  body: string;
  html?: string;
}): Promise<boolean> {
  const mailer = getTransporter();
  if (!to || !mailer || !process.env.EMAIL_FROM) return false;
  try {
    await mailer.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      text: body,
      ...(html ? { html } : {}),
    });
    return true;
  } catch {
    return false;
  }
}

/** Order and review notifications use the same real SMTP transport. */
export async function logEmail(message: {
  to: string | null | undefined;
  subject: string;
  body: string;
}) {
  if (await sendEmail(message)) return;
  if (process.env.NODE_ENV !== "production")
    console.info(`[email:development-only] ${message.to ?? "(no recipient)"} ${message.subject}`);
}
