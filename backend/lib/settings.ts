import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "./db";

export type StoreSettingsData = {
  referralEnabled: boolean;
  referralRewardCents: number;
  storeName: string;
  logoUrl: string | null;
  primaryColor: string;
  currencySymbol: string;
  currencyCode: string;
  currencyLockedAt: Date | null;
  language: string;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  headerAnnouncement: string | null;
  headerAnnouncementBackground: string;
  headerAnnouncementDirection: string;
  headerAnnouncementSpeed: number;
  headerSupportLabel: string | null;
  emailVerificationSubject: string;
  emailVerificationBody: string;
  smsVerificationBody: string;
  careerNotificationEmail: string | null;
  careerEmailSubject: string;
  careerEmailBody: string;
  deliveryEstimate: string;
  returnWindowDays: number;
  deliveryFeeCents: number;
  freeShippingOverCents: number | null;
  setupCompletedAt: Date | null;
};

export async function getStoreSettings(): Promise<StoreSettingsData> {
  "use cache";
  cacheLife("hours");
  cacheTag("settings");
  const settings = await db.storeSettings.findFirst();
  if (settings) return settings;
  return {
    referralEnabled: true,
    referralRewardCents: 4000,
    storeName: "My Store",
    logoUrl: null,
    primaryColor: "#0f7b4f",
    currencySymbol: "৳",
    currencyCode: "BDT",
    currencyLockedAt: null,
    language: "en",
    contactEmail: null,
    contactPhone: null,
    address: null,
    headerAnnouncement: null,
    headerAnnouncementBackground: "#e6f4ec",
    headerAnnouncementDirection: "left",
    headerAnnouncementSpeed: 24,
    headerSupportLabel: null,
    emailVerificationSubject: "Verify your email address",
    emailVerificationBody: "Your verification code is {{code}}. It expires in {{minutes}} minutes.",
    smsVerificationBody: "Your verification code is {{code}}. It expires in {{minutes}} minutes.",
    careerNotificationEmail: null,
    careerEmailSubject: "New career application: {{jobTitle}}",
    careerEmailBody:
      "A new application was submitted for {{jobTitle}}.\n\nApplicant: {{applicantName}}\nEmail: {{applicantEmail}}\nPhone: {{applicantPhone}}\nResume: {{resume}}\n\nCover letter:\n{{coverLetter}}\n\nReview application {{applicationId}} in the admin dashboard.",
    deliveryEstimate: "12-24 HOURS",
    returnWindowDays: 7,
    deliveryFeeCents: 0,
    freeShippingOverCents: null,
    setupCompletedAt: null,
  };
}

export async function isSetupCompleted(): Promise<boolean> {
  const s = await getStoreSettings();
  return s.setupCompletedAt !== null;
}
