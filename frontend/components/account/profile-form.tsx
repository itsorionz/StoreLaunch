"use client";

import { Genders } from "@backend/lib/enums.mjs";
import {
  ActionResultToast,
  ValidatedForm,
  ValidationInput,
  ValidationSelect,
} from "@frontend/components/ui/validated-form";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  confirmContactOtp,
  requestContactOtp,
  updateProfile,
  type AccountActionResult,
  type ContactVerificationActionResult,
} from "@backend/actions/account";
import { useToast } from "@frontend/components/ui/toast";
import { useDict } from "@frontend/i18n/provider";

type Profile = {
  name: string;
  email: string;
  phone: string | null;
  gender: string | null;
  dateOfBirth: Date | null;
  profilePhotoVersion: string | null;
};

export function ProfileForm({ profile }: { profile: Profile }) {
  const dict = useDict();
  const toast = useToast();
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [gender, setGender] = useState(profile.gender ?? "");
  const [state, action, pending] = useActionState<AccountActionResult | null, FormData>(
    async (previous, data) => {
      const result = await updateProfile(previous, data);
      if (result.ok) {
        setPreview(null);
        setGender(String(data.get("gender") ?? ""));
        toast(dict.account.profileUpdated);
        router.refresh();
      }
      return result;
    },
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  useEffect(() => {
    if (state?.ok) {
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [state]);

  const dob = profile.dateOfBirth ? profile.dateOfBirth.toISOString().slice(0, 10) : "";

  return (
    <>
      <ValidatedForm
        errors={state?.fieldErrors}
        result={state}
        successToast={false}
        noValidate
        action={action}
        className="space-y-5"
      >
        <div className="flex items-center gap-4">
          {preview || profile.profilePhotoVersion ? (
            // The authenticated photo endpoint must bypass the public image optimizer.
            <img
              src={preview ?? `/api/account/photo?v=${profile.profilePhotoVersion}`}
              alt="Profile photo"
              className="h-16 w-16 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-light text-2xl font-bold text-primary">
              {(profile.name || profile.email).charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold">{profile.name}</p>
            <p className="truncate text-sm text-muted">{profile.email}</p>
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Profile photo</span>
          <ValidationInput
            ref={fileRef}
            type="file"
            name="profilePhoto"
            accept="image/jpeg,image/png,image/webp"
            className="input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              setPreview(file ? URL.createObjectURL(file) : null);
            }}
          />
          <span className="mt-1 block text-xs text-muted">
            JPEG, PNG or WebP, up to 2 MB. Select a photo, then save your profile.
          </span>
        </label>
        {profile.profilePhotoVersion && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="removePhoto" />
            Remove current photo
          </label>
        )}

        {state?.error && !state.fieldErrors && !state.ok && (
          <div
            role="alert"
            className="rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent"
          >
            {state.error}
          </div>
        )}

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            {dict.account.fullName} <span className="text-accent">*</span>
          </span>
          <ValidationInput
            type="text"
            name="name"
            defaultValue={profile.name}
            required
            minLength={2}
            className="input"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{dict.account.gender}</span>
            <ValidationSelect
              name="gender"
              value={gender}
              onChange={(event) => setGender(event.target.value)}
              className="input"
            >
              <option value="">{dict.account.select}</option>
              <option value={Genders.male}>{dict.account.male}</option>
              <option value={Genders.female}>{dict.account.female}</option>
              <option value={Genders.other}>{dict.account.other}</option>
            </ValidationSelect>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{dict.account.dob}</span>
            <ValidationInput type="date" name="dateOfBirth" defaultValue={dob} className="input" />
          </label>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={pending} className="btn-primary btn-lg w-full sm:w-auto">
            {pending ? "…" : dict.account.updateProfile}
          </button>
        </div>
      </ValidatedForm>
      <ContactDetails email={profile.email} phone={profile.phone} />
    </>
  );
}

function ContactDetails({ email, phone }: { email: string; phone: string | null }) {
  const dict = useDict();
  const toast = useToast();
  const [editing, setEditing] = useState<"Email" | "Phone" | null>(null);
  const currentValue = editing === "Email" ? email : editing === "Phone" ? phone : null;

  return (
    <section className="mt-6 space-y-4 border-t border-border pt-5">
      <div>
        <h2 className="font-semibold">Contact details</h2>
        <p className="mt-1 text-sm text-muted">
          Email and mobile number are read-only. Verify a new value by OTP to change it.
        </p>
      </div>
      <ContactRow
        label={dict.account.emailAddress}
        value={email}
        actionLabel="Change email"
        onEdit={() => setEditing("Email")}
      />
      <ContactRow
        label={dict.account.mobileNo}
        value={phone}
        actionLabel={phone ? "Change number" : "Add mobile"}
        onEdit={() => setEditing("Phone")}
      />
      {editing && (
        <ContactEditor
          key={editing}
          channel={editing}
          currentValue={currentValue}
          onCancel={() => setEditing(null)}
          onVerified={() => {
            setEditing(null);
            toast(editing === "Email" ? "Email updated" : "Mobile number updated");
          }}
        />
      )}
    </section>
  );
}

function ContactRow({
  label,
  value,
  actionLabel,
  onEdit,
}: {
  label: string;
  value: string | null;
  actionLabel: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted">{label}</p>
        <p className="mt-1 break-all text-sm font-medium">{value || "Not added"}</p>
      </div>
      <button type="button" onClick={onEdit} className="btn-outline shrink-0">
        {actionLabel}
      </button>
    </div>
  );
}

function ContactEditor({
  channel,
  currentValue,
  onCancel,
  onVerified,
}: {
  channel: "Email" | "Phone";
  currentValue: string | null;
  onCancel: () => void;
  onVerified: () => void;
}) {
  const dict = useDict();
  const [requestState, requestAction, requestPending] = useActionState<
    ContactVerificationActionResult | null,
    FormData
  >(requestContactOtp, null);
  const [verifyState, verifyAction, verifyPending] = useActionState<
    ContactVerificationActionResult | null,
    FormData
  >(async (previous, data) => {
    const result = await confirmContactOtp(previous, data);
    if (result.ok) onVerified();
    return result;
  }, null);
  const isEmail = channel === "Email";
  const sentTarget = requestState?.sent ? (requestState.target ?? "") : "";

  if (requestState?.sent && sentTarget && requestState.challengeId) {
    return (
      <section className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <ActionResultToast result={requestState} />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold">Enter verification code</h3>
            <p className="mt-1 break-all text-sm text-muted">
              We sent a 6-digit {isEmail ? "email" : "SMS"} code to{" "}
              <span className="font-medium text-foreground">{sentTarget}</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="btn-outline shrink-0 px-3 py-2 text-xs"
          >
            Cancel
          </button>
        </div>
        {requestState.error && (
          <p role="alert" className="text-sm text-accent">
            {requestState.error}
          </p>
        )}
        <ValidatedForm
          errors={verifyState?.fieldErrors}
          result={verifyState}
          successToast={false}
          noValidate
          action={verifyAction}
          className="space-y-3"
        >
          <ValidationInput type="hidden" name="channel" value={channel} />
          <ValidationInput type="hidden" name="target" value={sentTarget} />
          <ValidationInput type="hidden" name="challengeId" value={requestState.challengeId} />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">6-digit verification code</span>
            <ValidationInput
              type="text"
              name="code"
              required
              minLength={6}
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="input max-w-sm"
              placeholder="Enter the code"
              autoFocus
            />
          </label>
          <button type="submit" disabled={verifyPending} className="btn-primary w-full sm:w-auto">
            {verifyPending ? "Confirming…" : "Confirm and save"}
          </button>
        </ValidatedForm>
        <div className="flex flex-wrap items-center gap-4">
          <ValidatedForm noValidate action={requestAction} result={requestState}>
            <ValidationInput type="hidden" name="channel" value={channel} />
            <ValidationInput type="hidden" name="target" value={sentTarget} />
            <button
              type="submit"
              disabled={requestPending}
              className="text-sm font-medium text-primary hover:underline"
            >
              {requestPending ? "Sending…" : "Resend code"}
            </button>
          </ValidatedForm>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">
            {isEmail
              ? "Change email address"
              : currentValue
                ? "Change mobile number"
                : "Add mobile number"}
          </h3>
          <p className="mt-1 text-sm text-muted">
            Enter the new {isEmail ? "email address" : "mobile number"}; we’ll send a one-time code
            to verify it.
          </p>
        </div>
        <button type="button" onClick={onCancel} className="btn-outline shrink-0 px-3 py-2 text-xs">
          Cancel
        </button>
      </div>
      {requestState?.error && (
        <p role="alert" className="text-sm text-accent">
          {requestState.error}
        </p>
      )}
      <ValidatedForm
        errors={requestState?.fieldErrors}
        result={requestState}
        noValidate
        action={requestAction}
        className="flex flex-col gap-3 sm:flex-row sm:items-start"
      >
        <ValidationInput type="hidden" name="channel" value={channel} />
        <label className="block flex-1">
          <span className="mb-1.5 block text-sm font-medium">
            {isEmail ? dict.account.emailAddress : dict.account.mobileNo}
          </span>
          <ValidationInput
            type={isEmail ? "email" : "tel"}
            name="target"
            required
            autoComplete={isEmail ? "email" : "tel"}
            className="input"
            placeholder={isEmail ? "name@example.com" : "+8801XXXXXXXXX"}
          />
        </label>
        <button
          type="submit"
          disabled={requestPending}
          className="btn-primary w-full sm:mt-7 sm:w-auto"
        >
          {requestPending ? "Sending…" : "Send verification code"}
        </button>
      </ValidatedForm>
    </section>
  );
}
