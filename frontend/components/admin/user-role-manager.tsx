"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createUserAction, updateUserRoles, type AdminActionResult } from "@backend/actions/admin";
import { Roles } from "@backend/lib/enums.mjs";
import { Modal } from "@frontend/components/ui/modal";
import { ValidatedForm, ValidationInput } from "@frontend/components/ui/validated-form";

const ROLE_OPTIONS = Object.values(Roles);

function label(role: string) {
  return role.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function RoleChecks({
  selected,
  onChange,
  name = "roles",
}: {
  selected: string[];
  onChange: (roles: string[]) => void;
  name?: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">Roles</legend>
      <p className="text-xs text-muted">
        A user can have multiple roles. The active login session chooses one role after password/OTP
        verification.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {ROLE_OPTIONS.map((role) => {
          const checked = selected.includes(role);
          return (
            <label
              key={role}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                name={name}
                value={role}
                checked={checked}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, role]
                    : selected.filter((value) => value !== role);
                  onChange(next);
                }}
              />
              <span>{label(role)}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function AddUserModal() {
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<string[]>([Roles.Customer]);
  const router = useRouter();
  const [state, action, pending] = useActionState<AdminActionResult | null, FormData>(
    createUserAction,
    null,
  );
  const onSavedRef = useRef(() => {
    setOpen(false);
    setRoles([Roles.Customer]);
    router.refresh();
  });
  useEffect(() => {
    if (state?.ok) onSavedRef.current();
  }, [state]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        Add user
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add user" wide>
        <ValidatedForm
          errors={state?.fieldErrors}
          result={state}
          successMessage="User created."
          noValidate
          action={action}
          className="space-y-4"
        >
          {state?.error && !state.fieldErrors && !state.ok && (
            <p
              role="alert"
              className="rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent"
            >
              {state.error}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Name</span>
              <ValidationInput
                type="text"
                name="name"
                required
                minLength={2}
                className="input"
                placeholder="Full name"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Email</span>
              <ValidationInput
                type="email"
                name="email"
                required
                className="input"
                placeholder="user@example.com"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Phone (optional)</span>
              <ValidationInput
                type="text"
                name="phone"
                className="input"
                placeholder="01XXXXXXXXX"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Password</span>
              <ValidationInput
                type="password"
                name="password"
                required
                minLength={8}
                className="input"
                placeholder="Min 8 characters"
              />
            </label>
          </div>
          <RoleChecks selected={roles} onChange={setRoles} />
          {!roles.length && <p className="text-xs text-accent">Select at least one role.</p>}
          <button
            type="submit"
            disabled={pending || !roles.length}
            className="btn-primary w-full sm:w-auto"
          >
            {pending ? "Creatingâ€¦" : "Create user"}
          </button>
        </ValidatedForm>
      </Modal>
    </>
  );
}

export function UserRolesModal({
  user,
  disabled,
}: {
  user: { id: string; name: string; email: string; roles: string[] };
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<string[]>(user.roles);
  const router = useRouter();
  const [state, action, pending] = useActionState<AdminActionResult | null, FormData>(
    updateUserRoles,
    null,
  );
  const onSavedRef = useRef(() => {
    setOpen(false);
    router.refresh();
  });
  useEffect(() => {
    if (state?.ok) onSavedRef.current();
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setRoles(user.roles);
          setOpen(true);
        }}
        disabled={disabled}
        className="btn-outline btn-sm disabled:opacity-50"
      >
        Roles
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Roles Â· ${user.name}`} wide>
        <p className="mb-4 text-sm text-muted">{user.email}</p>
        <ValidatedForm
          errors={state?.fieldErrors}
          result={state}
          successMessage="User roles updated."
          noValidate
          action={action}
          className="space-y-4"
        >
          <input type="hidden" name="id" value={user.id} />
          {state?.error && !state.fieldErrors && !state.ok && (
            <p
              role="alert"
              className="rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent"
            >
              {state.error}
            </p>
          )}
          <RoleChecks selected={roles} onChange={setRoles} />
          {!roles.length && <p className="text-xs text-accent">Select at least one role.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending || !roles.length} className="btn-primary">
              {pending ? "Savingâ€¦" : "Save roles"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-outline">
              Cancel
            </button>
          </div>
        </ValidatedForm>
      </Modal>
    </>
  );
}
