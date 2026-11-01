import "server-only";
import { db } from "./db";

const defaultEmailSubject = "Verify your email address";
const defaultVerificationBody =
  "Your verification code is {{code}}. It expires in {{minutes}} minutes.";

export type VerificationTemplateData = {
  storeName: string;
  emailSubject: string;
  emailBody: string;
  smsBody: string;
};

export async function getVerificationTemplates(): Promise<VerificationTemplateData> {
  const settings = await db.storeSettings.findFirst({
    select: {
      storeName: true,
      emailVerificationSubject: true,
      emailVerificationBody: true,
      smsVerificationBody: true,
    },
  });
  return {
    storeName: settings?.storeName || "My Store",
    emailSubject: settings?.emailVerificationSubject || defaultEmailSubject,
    emailBody: settings?.emailVerificationBody || defaultVerificationBody,
    smsBody: settings?.smsVerificationBody || defaultVerificationBody,
  };
}

export function renderMessageTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/{{\s*([a-zA-Z]+)\s*}}/g, (_match, key: string) =>
    String(values[key] ?? ""),
  );
}
