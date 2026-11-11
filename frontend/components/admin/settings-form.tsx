"use client";

import {
  ValidatedForm,
  ValidationInput,
  ValidationSelect,
  ValidationTextarea,
} from "@frontend/components/ui/validated-form";

import { useActionState, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { updateSettings, type SettingsState } from "@backend/actions/settings";

type SettingsValues = {
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
};

export function SettingsForm({ settings }: { settings: SettingsValues }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(updateSettings, null);
  const [saveDockLeft, setSaveDockLeft] = useState(16);
  const [portalReady, setPortalReady] = useState(false);
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const alignSaveDock = () => {
      window.requestAnimationFrame(() => {
        const section = document.getElementById("branding");
        if (section) setSaveDockLeft(section.getBoundingClientRect().left);
      });
    };
    const portalFrame = window.requestAnimationFrame(() => setPortalReady(true));
    alignSaveDock();
    window.addEventListener("resize", alignSaveDock);
    return () => {
      window.cancelAnimationFrame(portalFrame);
      window.removeEventListener("resize", alignSaveDock);
    };
  }, []);

  return (
    <>
      <ValidatedForm
        errors={state?.fieldErrors}
        result={state}
        successMessage="Settings saved."
        noValidate
        action={action}
        id="admin-settings-form"
        className="space-y-6 pb-24"
      >
        {state?.error && !state.fieldErrors && (
          <p
            role="alert"
            className="rounded-lg bg-accent/10 px-3 py-2.5 text-sm font-medium text-accent"
          >
            {state.error}
          </p>
        )}
        {state?.success && (
          <p className="rounded-lg bg-primary-light px-3 py-2.5 text-sm font-medium text-primary">
            Settings saved.
          </p>
        )}

        <section className="card space-y-3 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full max-w-xl flex-1">
              <SettingsSearch />
            </div>
            <button type="submit" disabled={pending} className="btn-primary min-w-40 shrink-0">
              {pending ? "Saving..." : "Save settings"}
            </button>
          </div>
          <nav
            aria-label="Settings groups"
            className="flex flex-wrap gap-2 border-t border-border pt-3"
          >
            <GroupLink href="#branding">Store profile</GroupLink>
            <GroupLink href="#header-announcement">Storefront & delivery</GroupLink>
            <GroupLink href="#message-templates">Customer messages</GroupLink>
            <GroupLink href="#career-email">Careers</GroupLink>
            <GroupLink href="#referrals">Growth</GroupLink>
          </nav>
        </section>

        <section className="card p-6" id="branding">
          <h2 className="mb-4 border-b border-border pb-3 font-bold">Branding</h2>
          <div className="space-y-4">
            <LogoUpload storeName={settings.storeName} logoUrl={settings.logoUrl} />
            <Grid2>
              <Input
                label="Store name"
                name="storeName"
                defaultValue={settings.storeName}
                required
              />
              <Input
                label="Or use a logo URL"
                name="logoUrl"
                defaultValue={settings.logoUrl ?? ""}
                placeholder="https://... or /banners/logo.svg"
              />
            </Grid2>
            <Grid2>
              <HexColorField
                label="Primary color"
                name="primaryColor"
                value={settings.primaryColor || "#0f7b4f"}
              />
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Store language</span>
                <ValidationSelect
                  name="language"
                  defaultValue={settings.language}
                  className="input"
                >
                  <option value="en">English</option>
                  <option value="bn">বাংলা (Bangla)</option>
                </ValidationSelect>
                <span className="mt-1 block text-xs text-muted">
                  Default language for store visitors.
                </span>
              </label>
            </Grid2>
          </div>
        </section>

        <section className="card p-6" id="currency">
          <h2 className="mb-4 border-b border-border pb-3 font-bold">Currency</h2>
          <Grid2>
            <Input
              label="Symbol"
              name="currencySymbol"
              defaultValue={settings.currencySymbol}
              required
            />
            <Input
              label="Code"
              name="currencyCode"
              defaultValue={settings.currencyCode}
              required
              readOnly={Boolean(settings.currencyLockedAt)}
            />
          </Grid2>
          {settings.currencyLockedAt && (
            <p className="mt-3 text-xs text-muted">
              Currency code is locked because products or monetary activity exist. Changing currency
              would relabel prices and wallet credit. The symbol remains a display setting.
            </p>
          )}
        </section>

        <section className="card p-6" id="contact">
          <h2 className="mb-4 border-b border-border pb-3 font-bold">Contact</h2>
          <div className="space-y-4">
            <Grid2>
              <Input
                label="Contact email"
                name="contactEmail"
                type="email"
                defaultValue={settings.contactEmail ?? ""}
              />
            </Grid2>
            <Input label="Address" name="address" defaultValue={settings.address ?? ""} />
          </div>
        </section>

        <section className="card p-6" id="header-announcement">
          <h2 className="mb-4 border-b border-border pb-3 font-bold">Header announcement</h2>
          <div className="space-y-4">
            <Input
              label="Announcement message"
              name="headerAnnouncement"
              defaultValue={settings.headerAnnouncement ?? ""}
              maxLength={200}
              placeholder="12-24 HOURS delivery on all orders"
            />
            <HexColorField
              label="Announcement background color"
              name="headerAnnouncementBackground"
              value={settings.headerAnnouncementBackground || "#e6f4ec"}
            />
            <p className="text-xs text-muted">
              Repeats continuously above the store header. Leave the message blank to use the
              delivery estimate and translated default wording.
            </p>
            <Grid2>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Scroll direction</span>
                <ValidationSelect
                  name="headerAnnouncementDirection"
                  defaultValue={settings.headerAnnouncementDirection}
                  className="input"
                >
                  <option value="left">Right to left</option>
                  <option value="right">Left to right</option>
                </ValidationSelect>
              </label>
              <Input
                label="Loop duration (seconds)"
                name="headerAnnouncementSpeed"
                type="number"
                min={8}
                max={90}
                defaultValue={String(settings.headerAnnouncementSpeed)}
                required
              />
            </Grid2>
            <p className="text-xs text-muted">
              Duration controls how long one full message loop takes. Use 8 seconds for fast or 90
              seconds for slow; 24 seconds is a balanced starting point.
            </p>
            <Grid2>
              <Input
                label="Support label"
                name="headerSupportLabel"
                defaultValue={settings.headerSupportLabel ?? ""}
                maxLength={60}
                placeholder="Support"
              />
              <Input
                label="Support phone"
                name="contactPhone"
                type="tel"
                defaultValue={settings.contactPhone ?? ""}
              />
            </Grid2>
            <p className="text-xs text-muted">
              Leave the label blank for the default translation. The phone number is shared with
              store contact details; leave it blank to hide the support text.
            </p>
          </div>
        </section>

        <section className="card p-6" id="delivery">
          <h2 className="mb-4 border-b border-border pb-3 font-bold">Delivery</h2>
          <div className="space-y-4">
            <Grid2>
              <Input
                label="Delivery estimate"
                name="deliveryEstimate"
                defaultValue={settings.deliveryEstimate}
                placeholder="12-24 HOURS"
              />
              <Input
                label="Delivery fee (in cents)"
                name="deliveryFeeCents"
                type="number"
                defaultValue={String(settings.deliveryFeeCents)}
                required
              />
            </Grid2>
            <Input
              label="Free shipping over (cents, blank = never)"
              name="freeShippingOverCents"
              type="number"
              defaultValue={
                settings.freeShippingOverCents != null ? String(settings.freeShippingOverCents) : ""
              }
            />
          </div>
        </section>

        <section className="card p-6" id="returns">
          <h2 className="mb-4 border-b border-border pb-3 font-bold">Returns</h2>
          <Input
            label="Return request window after delivery (days, 0 = disabled)"
            name="returnWindowDays"
            type="number"
            min={0}
            max={90}
            defaultValue={String(settings.returnWindowDays)}
            required
          />
          <p className="mt-2 text-xs text-muted">
            This store setting controls when customers may request a return or replacement. Legal
            and product-specific exclusions still need to be honored.
          </p>
        </section>

        <section className="card space-y-4 p-6" id="message-templates">
          <div className="border-b border-border pb-3">
            <h2 className="font-bold">Email and SMS templates</h2>
            <p className="mt-1 text-sm text-muted">
              These messages are used when customers verify a new email or mobile number, and for
              phone sign-in codes. Keep the verification code placeholder in each message.
            </p>
          </div>
          <Input
            label="Verification email subject"
            name="emailVerificationSubject"
            defaultValue={settings.emailVerificationSubject}
            required
          />
          <TextArea
            label="Verification email message"
            name="emailVerificationBody"
            defaultValue={settings.emailVerificationBody}
            required
            maxLength={2000}
          />
          <TextArea
            label="Verification SMS message"
            name="smsVerificationBody"
            defaultValue={settings.smsVerificationBody}
            required
            maxLength={500}
          />
          <p className="text-xs text-muted">
            Available placeholders: <code>{"{{code}}"}</code>, <code>{"{{minutes}}"}</code>, and{" "}
            <code>{"{{storeName}}"}</code>. SMS length affects provider billing.
          </p>
        </section>

        <section className="card space-y-4 p-6" id="career-email">
          <div className="border-b border-border pb-3">
            <h2 className="font-bold">Career application notifications</h2>
            <p className="mt-1 text-sm text-muted">
              New applications are emailed to this address. Leave it blank to use the store contact
              email. SMTP delivery still requires the server mail settings.
            </p>
          </div>
          <Input
            label="Application notification recipient"
            name="careerNotificationEmail"
            type="email"
            defaultValue={settings.careerNotificationEmail ?? ""}
            placeholder="jobs@example.com"
          />
          <Input
            label="Notification email subject"
            name="careerEmailSubject"
            defaultValue={settings.careerEmailSubject}
            required
            maxLength={150}
            placeholder="New application: {{jobTitle}}"
          />
          <TextArea
            label="Notification email message"
            name="careerEmailBody"
            defaultValue={settings.careerEmailBody}
            required
            maxLength={5000}
          />
          <p className="text-xs text-muted">
            Placeholders: <code>{"{{jobTitle}}"}</code>, <code>{"{{applicantName}}"}</code>,{" "}
            <code>{"{{applicantEmail}}"}</code>, <code>{"{{applicantPhone}}"}</code>,{" "}
            <code>{"{{resume}}"}</code>, <code>{"{{coverLetter}}"}</code>, and{" "}
            <code>{"{{applicationId}}"}</code>.
          </p>
        </section>

        <section className="card space-y-4 p-6" id="referrals">
          <h2 className="border-b border-border pb-3 font-bold">Refer and earn</h2>
          <ValidationInput type="hidden" name="referralEnabled" value="false" />
          <label className="flex items-center gap-2 text-sm font-medium">
            <ValidationInput
              type="checkbox"
              name="referralEnabled"
              defaultChecked={settings.referralEnabled}
            />
            Enable referral rewards
          </label>
          <Input
            label={"Reward per referral (" + settings.currencyCode + ")"}
            name="referralRewardAmount"
            type="number"
            min={0}
            max={100000}
            step={0.01}
            defaultValue={String(settings.referralRewardCents / 100)}
            required
          />
          <p className="text-xs text-muted">
            Set 40 for a 40 taka reward in a BDT store. Zero or disabling pauses new referrals.
            Rewards go to the referrer&apos;s wallet after the new customer&apos;s first paid,
            delivered purchase. Amount changes apply to future signups; existing referrals keep
            their promised amount.
          </p>
        </section>
      </ValidatedForm>
      {portalReady &&
        mounted &&
        createPortal(
          <div
            className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40"
            style={{ left: saveDockLeft }}
          >
            <button
              type="submit"
              form="admin-settings-form"
              disabled={pending}
              className="btn-primary btn-lg min-w-40 shadow-lg"
            >
              {pending ? "Saving..." : "Save settings"}
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function LogoUpload({ storeName, logoUrl }: { storeName: string; logoUrl: string | null }) {
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);

  const showPreview = (url: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreview(url);
  };

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  return (
    <div className="grid gap-4 sm:grid-cols-[176px_1fr] sm:items-start">
      <div className="flex h-32 w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-2 p-4 sm:w-44">
        {preview ? (
          <img
            src={preview}
            alt="Selected logo preview"
            className="max-h-full max-w-full object-contain"
          />
        ) : logoUrl ? (
          <Image
            src={logoUrl}
            alt={`${storeName} logo`}
            width={160}
            height={64}
            unoptimized
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-xl font-black text-white">
            {storeName.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Store logo</span>
        <ValidationInput
          type="file"
          name="logoFile"
          accept="image/jpeg,image/png,image/webp,image/avif"
          onChange={(event) => {
            const file = event.target.files?.[0];
            showPreview(file ? URL.createObjectURL(file) : null);
          }}
          className="input block w-full file:mr-3 file:rounded-lg file:border-0 file:bg-primary-light file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary"
        />
        <span className="mt-1 block text-xs text-muted">
          JPEG, PNG, WebP or AVIF, up to 5 MB. The logo keeps its proportions, is resized to fit
          within 512 × 512 and appears in the store header once you save settings. The preview
          updates as soon as you pick a file.
        </span>
      </label>
    </div>
  );
}

function HexColorField({
  label,
  name,
  value: initialValue,
}: {
  label: string;
  name: string;
  value: string;
}) {
  const initialColor = isHexColor(initialValue) ? initialValue : "#e6f4ec";
  const [value, setValue] = useState(initialValue);
  const [pickerValue, setPickerValue] = useState(initialColor);

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <ValidationInput
          type="color"
          value={pickerValue}
          onChange={(event) => {
            setPickerValue(event.currentTarget.value);
            setValue(event.currentTarget.value);
          }}
          aria-label={`${label} color picker`}
          className="h-11 w-16 cursor-pointer rounded-lg border border-border bg-surface p-1"
        />
        <ValidationInput
          type="text"
          name={name}
          value={value}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            setValue(nextValue);
            if (isHexColor(nextValue)) setPickerValue(nextValue);
          }}
          placeholder="#RRGGBB"
          maxLength={7}
          autoComplete="off"
          spellCheck={false}
          aria-label={`${label} hex value`}
          className="input max-w-36 font-mono uppercase"
        />
        <span
          aria-label={`Color preview ${isHexColor(value) ? value : "invalid hex value"}`}
          className={`h-8 w-12 shrink-0 rounded-md border border-border shadow-sm ${isHexColor(value) ? "" : "bg-surface-2"}`}
          style={isHexColor(value) ? { backgroundColor: value } : undefined}
        />
      </div>
      <p className="mt-1 text-xs text-muted">Enter a six-digit hex color or use the picker.</p>
    </label>
  );
}

function isHexColor(value: string): boolean {
  return /^#[\da-f]{6}$/i.test(value);
}

function GroupLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-primary hover:text-primary"
    >
      {children}
    </a>
  );
}

const settingsSearchItems = [
  {
    id: "branding",
    title: "Store branding",
    terms: "store name logo upload image file url primary color language",
  },
  { id: "currency", title: "Currency", terms: "currency symbol code currency lock" },
  { id: "contact", title: "Store contact", terms: "contact email phone address" },
  {
    id: "header-announcement",
    title: "Header announcement",
    terms: "announcement message scrolling direction speed support label support phone",
  },
  {
    id: "delivery",
    title: "Delivery and shipping",
    terms: "delivery estimate fee free shipping threshold",
  },
  { id: "returns", title: "Returns", terms: "return window days replacement" },
  {
    id: "message-templates",
    title: "Email and SMS templates",
    terms: "verification email sms otp code template",
  },
  {
    id: "career-email",
    title: "Career notifications",
    terms: "career job applicant email application notification recipient",
  },
  { id: "referrals", title: "Referral rewards", terms: "referral reward wallet growth" },
];

function SettingsSearch() {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const results = normalizedQuery
    ? settingsSearchItems.filter((item) =>
        `${item.title} ${item.terms}`.toLocaleLowerCase().includes(normalizedQuery),
      )
    : [];

  return (
    <div>
      <label htmlFor="settings-search" className="mb-1.5 block text-sm font-semibold">
        Find a setting
      </label>
      <input
        id="settings-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by setting name, such as delivery fee"
        className="input max-w-xl"
        autoComplete="off"
      />
      {normalizedQuery && (
        <div className="mt-2" aria-live="polite">
          {results.length ? (
            <ul className="flex flex-wrap gap-2">
              {results.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    onClick={() => setQuery("")}
                    className="inline-flex rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15"
                  >
                    {item.title}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No matching settings. Try another search.</p>
          )}
        </div>
      )}
    </div>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
  required,
  maxLength,
}: {
  label: string;
  name: string;
  defaultValue: string;
  required?: boolean;
  maxLength: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <ValidationTextarea
        name={name}
        defaultValue={defaultValue}
        required={required}
        maxLength={maxLength}
        rows={4}
        className="input min-h-24"
      />
    </label>
  );
}

function Input({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  required,
  maxLength,
  readOnly,
  min,
  max,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  readOnly?: boolean;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <ValidationInput
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        maxLength={maxLength}
        min={min}
        max={max}
        step={step}
        readOnly={readOnly}
        required={required}
        className="input"
      />
    </label>
  );
}
