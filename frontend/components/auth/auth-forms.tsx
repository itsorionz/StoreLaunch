"use client";

import { Roles } from "@backend/lib/enums.mjs";
import { ValidatedForm, ValidationInput } from "@frontend/components/ui/validated-form";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  loginAction,
  registerAction,
  requestPhoneOtp,
  verifyPhoneOtpAction,
  selectLoginRoleAction,
  restartLoginAction,
  requestPasswordResetAction,
  verifyPasswordResetOtpAction,
  completePasswordResetAction,
  type AuthFormState,
} from "@backend/actions/auth";
import { useDict, fmt } from "@frontend/i18n/provider";

export type LoginRole =
  | typeof Roles.Customer
  | typeof Roles.Rider
  | typeof Roles.Admin
  | typeof Roles.Support
  | typeof Roles.Warehouse
  | typeof Roles.Sales
  | typeof Roles.Manager;

// One label per role — no fallthrough (Warehouse/Sales used to render as "Admin").
const roleLabels: Record<LoginRole, (dict: ReturnType<typeof useDict>) => string> = {
  [Roles.Customer]: (dict) => dict.auth.roleCustomer,
  [Roles.Rider]: (dict) => dict.auth.roleRider,
  [Roles.Admin]: (dict) => dict.auth.roleAdmin,
  [Roles.Support]: (dict) => dict.auth.roleSupport,
  [Roles.Warehouse]: (dict) => dict.auth.roleWarehouse,
  [Roles.Sales]: (dict) => dict.auth.roleSales,
  [Roles.Manager]: (dict) => dict.auth.roleManager,
};

export function LoginTabs({
  callbackUrl,
  pendingProof,
}: {
  callbackUrl?: string;
  pendingProof?: { ticket: string; roles: LoginRole[] } | null;
}) {
  const dict = useDict();
  const [tab, setTab] = useState<"email" | "phone">("email");
  if (pendingProof && pendingProof.roles.length > 1)
    return (
      <LoginRoleChoice
        ticket={pendingProof.ticket}
        roles={pendingProof.roles}
        callbackUrl={callbackUrl}
      />
    );
  return (
    <>
      <div className="mb-5 flex rounded-xl bg-surface-2 p-1">
        {(["email", "phone"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              tab === t
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t === "email" ? dict.auth.tabEmail : dict.auth.tabPhone}
          </button>
        ))}
      </div>
      {tab === "email" ? (
        <LoginForm callbackUrl={callbackUrl} />
      ) : (
        <PhoneOtpForm callbackUrl={callbackUrl} />
      )}
    </>
  );
}

export function PhoneOtpForm({ callbackUrl }: { callbackUrl?: string }) {
  const [resetKey, setResetKey] = useState(0);
  return (
    <PhoneOtpFlow
      key={resetKey}
      callbackUrl={callbackUrl}
      onChangePhone={() => setResetKey((k) => k + 1)}
    />
  );
}

function PhoneOtpFlow({
  callbackUrl,
  onChangePhone,
}: {
  callbackUrl?: string;
  onChangePhone: () => void;
}) {
  const dict = useDict();
  const [sendState, sendAction, sendPending] = useActionState<AuthFormState, FormData>(
    requestPhoneOtp,
    null,
  );
  const [verifyState, verifyAction, verifyPending] = useActionState<AuthFormState, FormData>(
    verifyPhoneOtpAction,
    null,
  );

  const sentPhone = sendState?.sent ? (sendState.phone ?? "") : "";
  const phase = sentPhone ? "code" : "phone";

  const sendError =
    sendState?.errorCode === "SMS_FAILED"
      ? dict.auth.smsFailed
      : sendState?.errorCode === "INVALID_PHONE"
        ? dict.auth.invalidPhone
        : sendState?.errorCode === "NO_ACCOUNT"
          ? dict.auth.noPhoneAccount
          : sendState?.errorCode === "RATE_LIMIT"
            ? fmt(dict.auth.otpWait, { s: sendState.wait ?? 60 })
            : sendState?.fieldErrors
              ? undefined
              : sendState?.error;

  const verifyError =
    verifyState?.errorCode === "INVALID_OTP"
      ? dict.auth.invalidOtp
      : verifyState?.fieldErrors
        ? undefined
        : verifyState?.error;

  if (verifyState?.ticket && verifyState.roles && verifyState.roles.length > 1)
    return (
      <LoginRoleChoice
        ticket={verifyState.ticket}
        roles={verifyState.roles}
        callbackUrl={callbackUrl}
      />
    );

  if (phase === "phone") {
    return (
      <ValidatedForm
        errors={sendState?.fieldErrors}
        result={sendState}
        noValidate
        action={sendAction}
        className="space-y-4"
      >
        {sendError && (
          <p className="rounded-lg bg-accent/10 px-3 py-2.5 text-sm font-medium text-accent">
            {sendError}
          </p>
        )}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{dict.auth.phoneLabel}</span>
          <ValidationInput
            type="tel"
            name="phone"
            required
            className="input"
            placeholder="+8801XXXXXXXXX"
            autoComplete="tel"
          />
        </label>
        <button type="submit" disabled={sendPending} className="btn-primary w-full">
          {sendPending ? dict.auth.sendingOtp : dict.auth.sendOtp}
        </button>
        <p className="text-center text-sm text-muted">
          {dict.auth.newHere}{" "}
          <Link href="/register" className="font-semibold text-primary hover:underline">
            {dict.auth.createAccount}
          </Link>
        </p>
      </ValidatedForm>
    );
  }

  return (
    <div className="space-y-4">
      {sendError ? (
        <p
          role="alert"
          className="rounded-lg bg-accent/10 px-3 py-2.5 text-sm font-medium text-accent"
        >
          {sendError}
        </p>
      ) : (
        <p className="rounded-lg bg-primary-light px-3 py-2.5 text-sm font-medium text-primary-dark">
          {fmt(dict.auth.otpSent, { phone: sentPhone })}
        </p>
      )}

      <ValidatedForm
        errors={verifyState?.fieldErrors ?? (verifyError ? { code: [verifyError] } : undefined)}
        result={verifyState}
        noValidate
        action={verifyAction}
        className="space-y-4"
      >
        <ValidationInput type="hidden" name="phone" value={sentPhone} />
        <ValidationInput type="hidden" name="callbackUrl" value={callbackUrl || ""} />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{dict.auth.enterOtp}</span>
          <ValidationInput
            type="text"
            name="code"
            required
            minLength={4}
            maxLength={6}
            inputMode="numeric"
            autoComplete="one-time-code"
            className="input text-center text-lg font-bold tracking-[0.4em]"
            placeholder="••••••"
          />
        </label>
        <button type="submit" disabled={verifyPending} className="btn-primary w-full">
          {verifyPending ? dict.auth.verifyingOtp : dict.auth.verifyOtp}
        </button>
      </ValidatedForm>

      <div className="flex items-center justify-between text-sm">
        <ValidatedForm
          errors={sendState?.fieldErrors}
          result={sendState}
          noValidate
          action={sendAction}
        >
          <ValidationInput type="hidden" name="phone" value={sentPhone} />
          <button
            type="submit"
            disabled={sendPending}
            className="font-semibold text-primary hover:underline"
          >
            {sendPending ? "…" : dict.auth.resendOtp}
          </button>
        </ValidatedForm>
        <button type="button" onClick={onChangePhone} className="text-muted hover:text-foreground">
          {dict.auth.changePhone}
        </button>
      </div>
    </div>
  );
}

function LoginRoleChoice({
  ticket,
  roles,
  callbackUrl,
}: {
  ticket: string;
  roles: LoginRole[];
  callbackUrl?: string;
}) {
  const dict = useDict();
  const [state, action, pending] = useActionState(selectLoginRoleAction, null);
  return (
    <ValidatedForm
      errors={state?.fieldErrors}
      result={state}
      noValidate
      action={action}
      className="space-y-4"
    >
      <ValidationInput type="hidden" name="ticket" value={ticket} />
      <ValidationInput type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />
      <p className="text-sm font-semibold">{dict.auth.chooseRole}</p>
      <p className="text-sm text-muted">{dict.auth.chooseRoleHint}</p>
      {state?.error && !state.fieldErrors && (
        <p role="alert" className="text-sm text-accent">
          {state.error}
        </p>
      )}
      <div className="grid gap-2">
        {roles.map((role) => (
          <button
            key={role}
            type="submit"
            name="role"
            value={role}
            disabled={pending}
            className="btn-primary w-full"
          >
            {roleLabels[role](dict)}
          </button>
        ))}
      </div>
      <button
        type="submit"
        formAction={restartLoginAction}
        disabled={pending}
        className="w-full text-sm text-muted hover:text-foreground"
      >
        {dict.auth.useDifferentAccount}
      </button>
    </ValidatedForm>
  );
}

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const dict = useDict();
  const permalink = callbackUrl
    ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "/login";
  const [state, action, pending] = useActionState(loginAction, null, permalink);
  if (state?.ticket && state.roles && state.roles.length > 1)
    return <LoginRoleChoice ticket={state.ticket} roles={state.roles} callbackUrl={callbackUrl} />;
  return (
    <ValidatedForm
      errors={state?.fieldErrors}
      result={state}
      noValidate
      action={action}
      className="space-y-4"
    >
      {state?.error && !state.fieldErrors && (
        <p
          role="alert"
          className="rounded-lg bg-accent/10 px-3 py-2.5 text-sm font-medium text-accent"
        >
          {state.error}
        </p>
      )}
      <ValidationInput type="hidden" name="callbackUrl" value={callbackUrl || ""} />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">{dict.auth.email}</span>
        <ValidationInput
          type="email"
          name="email"
          required
          className="input"
          autoComplete="email"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">{dict.auth.password}</span>
        <ValidationInput
          type="password"
          name="password"
          required
          className="input"
          autoComplete="current-password"
        />
      </label>
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? dict.auth.signingIn : dict.auth.signIn}
      </button>
      <p className="text-center text-sm text-muted">
        {dict.auth.newHere}{" "}
        <Link href="/register" className="font-semibold text-primary hover:underline">
          {dict.auth.createAccount}
        </Link>
      </p>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="font-semibold text-primary hover:underline">
          Forgot password?
        </Link>
      </p>
    </ValidatedForm>
  );
}

export function ForgotPasswordForm() {
  const [request, requestAction, requestPending] = useActionState<AuthFormState, FormData>(
    requestPasswordResetAction,
    null,
  );
  const [verify, verifyAction, verifyPending] = useActionState<AuthFormState, FormData>(
    verifyPasswordResetOtpAction,
    null,
  );
  const [complete, completeAction, completePending] = useActionState<AuthFormState, FormData>(
    completePasswordResetAction,
    null,
  );
  if (complete?.sent)
    return (
      <div className="space-y-4">
        <p role="status" className="rounded-lg bg-primary-light p-3 text-sm text-primary-dark">
          Your password has been updated. Sign in with your new password.
        </p>
        <Link className="btn-primary block w-full text-center" href="/login">
          Sign in
        </Link>
      </div>
    );
  if (verify?.ticket)
    return (
      <ValidatedForm
        errors={complete?.fieldErrors}
        result={complete}
        noValidate
        action={completeAction}
        className="space-y-4"
      >
        <ValidationInput type="hidden" name="token" value={verify.ticket} />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">New password</span>
          <ValidationInput
            type="password"
            name="password"
            required
            minLength={8}
            maxLength={72}
            className="input"
            autoComplete="new-password"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Confirm new password</span>
          <ValidationInput
            type="password"
            name="confirmPassword"
            required
            minLength={8}
            maxLength={72}
            className="input"
            autoComplete="new-password"
          />
        </label>
        {complete?.error && (
          <p role="alert" className="text-sm text-accent">
            {complete.error}
          </p>
        )}
        <button disabled={completePending} className="btn-primary w-full">
          {completePending ? "Updating…" : "Update password"}
        </button>
      </ValidatedForm>
    );
  if (request?.sent && request.phone)
    return (
      <div className="space-y-4">
        <p className="rounded-lg bg-primary-light p-3 text-sm text-primary-dark">{request.error}</p>
        <ValidatedForm
          errors={verify?.fieldErrors}
          result={verify}
          noValidate
          action={verifyAction}
          className="space-y-4"
        >
          <ValidationInput type="hidden" name="phone" value={request.phone} />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">SMS code</span>
            <ValidationInput
              type="text"
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="input"
              placeholder="6-digit code"
            />
          </label>
          {verify?.error && (
            <p role="alert" className="text-sm text-accent">
              {verify.error}
            </p>
          )}
          <button disabled={verifyPending} className="btn-primary w-full">
            {verifyPending ? "Verifying…" : "Verify and continue"}
          </button>
        </ValidatedForm>
      </div>
    );
  return (
    <ValidatedForm
      errors={request?.fieldErrors}
      result={request}
      noValidate
      action={requestAction}
      className="space-y-4"
    >
      <p className="text-sm text-muted">
        Enter your account email or phone number. We’ll send a reset link or verification code if an
        account matches.
      </p>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Email or phone number</span>
        <ValidationInput
          name="identifier"
          required
          autoComplete="username"
          className="input"
          placeholder="Email or +8801XXXXXXXXX"
        />
      </label>
      {request?.error && !request.sent && (
        <p role="alert" className="text-sm text-accent">
          {request.error}
        </p>
      )}
      {request?.sent && (
        <p role="status" className="text-sm text-muted">
          {request.error}
        </p>
      )}
      <button disabled={requestPending} className="btn-primary w-full">
        {requestPending ? "Sending…" : "Continue"}
      </button>
      <p className="text-center text-sm">
        <Link className="font-semibold text-primary" href="/login">
          Back to sign in
        </Link>
      </p>
    </ValidatedForm>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    completePasswordResetAction,
    null,
  );
  if (state?.sent)
    return (
      <div className="space-y-4">
        <p role="status" className="text-sm text-primary-dark">
          Your password has been updated.
        </p>
        <Link className="btn-primary block text-center" href="/login">
          Sign in
        </Link>
      </div>
    );
  return (
    <ValidatedForm
      errors={state?.fieldErrors}
      result={state}
      noValidate
      action={action}
      className="space-y-4"
    >
      <ValidationInput type="hidden" name="token" value={token} />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">New password</span>
        <ValidationInput
          type="password"
          name="password"
          required
          minLength={8}
          maxLength={72}
          className="input"
          autoComplete="new-password"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Confirm new password</span>
        <ValidationInput
          type="password"
          name="confirmPassword"
          required
          minLength={8}
          maxLength={72}
          className="input"
          autoComplete="new-password"
        />
      </label>
      {state?.error && (
        <p role="alert" className="text-sm text-accent">
          {state.error}
        </p>
      )}
      <button disabled={pending} className="btn-primary w-full">
        {pending ? "Updating…" : "Update password"}
      </button>
    </ValidatedForm>
  );
}

export function RegisterForm({ referralCode = "" }: { referralCode?: string }) {
  const dict = useDict();
  const [state, action, pending] = useActionState(registerAction, null);
  return (
    <ValidatedForm
      errors={state?.fieldErrors}
      result={state}
      noValidate
      action={action}
      className="space-y-4"
    >
      {state?.error && !state.fieldErrors && (
        <p
          role="alert"
          className="rounded-lg bg-accent/10 px-3 py-2.5 text-sm font-medium text-accent"
        >
          {state.error}
        </p>
      )}
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">{dict.auth.name}</span>
        <ValidationInput type="text" name="name" required className="input" autoComplete="name" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">{dict.auth.email}</span>
        <ValidationInput
          type="email"
          name="email"
          required
          className="input"
          autoComplete="email"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">{dict.auth.password}</span>
        <ValidationInput
          type="password"
          name="password"
          required
          minLength={8}
          className="input"
          autoComplete="new-password"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">{dict.auth.confirmPassword}</span>
        <ValidationInput
          type="password"
          name="confirmPassword"
          required
          minLength={8}
          maxLength={72}
          className="input"
          autoComplete="new-password"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Referral code (optional)</span>
        <ValidationInput
          name="referralCode"
          defaultValue={referralCode}
          maxLength={32}
          placeholder="Enter your friend's referral code"
          className="input uppercase"
        />
      </label>
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? dict.auth.creating : dict.auth.createAccount}
      </button>
      <p className="text-center text-sm text-muted">
        {dict.auth.alreadyHave}{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          {dict.auth.signIn}
        </Link>
      </p>
    </ValidatedForm>
  );
}
