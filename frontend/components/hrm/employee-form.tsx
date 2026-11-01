"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EmploymentTypes, EmployeeStatuses } from "@backend/lib/enums.mjs";
import { saveEmployee, type HrmActionResult } from "@backend/actions/hrm";
import {
  ValidatedForm,
  ValidationInput,
  ValidationSelect,
  ValidationTextarea,
} from "@frontend/components/ui/validated-form";

type StaffOption = { id: string; name: string; email: string };

type EmployeeDefaults = {
  id?: string;
  userId?: string;
  designation: string;
  department: string;
  employmentType: string;
  status: string;
  joinDate: string;
  probationEndDate: string;
  exitDate: string;
  monthlySalaryCents: number | null;
  emergencyContactName: string;
  emergencyContactPhone: string;
  notes: string;
};

/**
 * Onboarding / edit form. Create mode either links an existing staff account
 * (picked from the pending list) or creates a fresh one with a staff role;
 * edit mode keeps the account untouched and edits the employment record.
 */
export function EmployeeForm({
  employee,
  staffOptions = [],
  presetUserId = "",
  presetName = "",
  presetEmail = "",
  presetApplicationId = "",
}: {
  employee?: EmployeeDefaults;
  staffOptions?: StaffOption[];
  presetUserId?: string;
  presetName?: string;
  presetEmail?: string;
  presetApplicationId?: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<HrmActionResult, FormData>(saveEmployee, null);
  const editing = Boolean(employee?.id);
  const [linkExisting, setLinkExisting] = useState(
    editing ? true : Boolean(presetUserId) || staffOptions.length > 0,
  );

  useEffect(() => {
    if (state?.ok && state.id) router.push(`/hrm/employees/${state.id}`);
    else if (state?.ok) router.push("/hrm/employees");
    if (state?.ok) router.refresh();
  }, [state, router]);

  const money =
    employee?.monthlySalaryCents != null ? (employee.monthlySalaryCents / 100).toFixed(2) : "";

  return (
    <ValidatedForm
      action={action}
      errors={state?.fieldErrors}
      result={state}
      successMessage={editing ? "Employee updated." : "Employee onboarded."}
      className="card space-y-4 p-5"
    >
      {editing && <input type="hidden" name="id" value={employee!.id} />}
      {editing && <input type="hidden" name="userId" value={employee!.userId} />}
      {!editing && presetApplicationId && (
        <input type="hidden" name="applicationId" value={presetApplicationId} />
      )}

      {!editing && (
        <div className="grid gap-2">
          <label className="text-sm font-medium">Staff account</label>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="accountMode"
                checked={linkExisting}
                onChange={() => setLinkExisting(true)}
              />
              Link an existing staff account
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="accountMode"
                checked={!linkExisting}
                onChange={() => setLinkExisting(false)}
              />
              Create a new staff account
            </label>
          </div>
          {linkExisting && (
            <ValidationSelect name="userId" defaultValue={presetUserId} className="input">
              <option value="">Select a staff account…</option>
              {staffOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} — {option.email}
                </option>
              ))}
            </ValidationSelect>
          )}
        </div>
      )}

      {!editing && !linkExisting && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">
            Full name
            <ValidationInput name="name" defaultValue={presetName} className="input" required />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Email
            <ValidationInput
              type="email"
              name="email"
              defaultValue={presetEmail}
              className="input"
              required
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Password
            <ValidationInput type="password" name="password" className="input" required />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Login role
            <ValidationSelect name="role" defaultValue="Support" className="input" required>
              <option value="Admin">Admin</option>
              <option value="Manager">Manager</option>
              <option value="Support">Support</option>
              <option value="Warehouse">Warehouse</option>
              <option value="Sales">Sales</option>
            </ValidationSelect>
          </label>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">
          Designation
          <ValidationInput
            name="designation"
            defaultValue={employee?.designation ?? ""}
            className="input"
            placeholder="e.g. Warehouse executive"
            required
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Department
          <ValidationInput
            name="department"
            defaultValue={employee?.department ?? ""}
            className="input"
            placeholder="e.g. Operations"
            required
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Employment type
          <ValidationSelect
            name="employmentType"
            defaultValue={employee?.employmentType ?? EmploymentTypes.FullTime}
            className="input"
          >
            {Object.values(EmploymentTypes).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </ValidationSelect>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Status
          <ValidationSelect
            name="status"
            defaultValue={employee?.status ?? EmployeeStatuses.Active}
            className="input"
          >
            {(editing
              ? Object.values(EmployeeStatuses)
              : [EmployeeStatuses.Active, EmployeeStatuses.Probation]
            ).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </ValidationSelect>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Join date
          <ValidationInput
            type="date"
            name="joinDate"
            defaultValue={employee?.joinDate ?? ""}
            className="input"
            required
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Probation ends <span className="text-muted">(optional)</span>
          <ValidationInput
            type="date"
            name="probationEndDate"
            defaultValue={employee?.probationEndDate ?? ""}
            className="input"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Monthly salary (taka)
          <ValidationInput
            name="monthlySalaryCents"
            defaultValue={money}
            className="input"
            placeholder="e.g. 25000"
            inputMode="decimal"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Exit date <span className="text-muted">(when exited)</span>
          <ValidationInput
            type="date"
            name="exitDate"
            defaultValue={employee?.exitDate ?? ""}
            className="input"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Emergency contact name
          <ValidationInput
            name="emergencyContactName"
            defaultValue={employee?.emergencyContactName ?? ""}
            className="input"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Emergency contact phone
          <ValidationInput
            name="emergencyContactPhone"
            defaultValue={employee?.emergencyContactPhone ?? ""}
            className="input"
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm font-medium">
        Notes <span className="text-muted">(optional)</span>
        <ValidationTextarea
          name="notes"
          defaultValue={employee?.notes ?? ""}
          rows={3}
          className="input"
        />
      </label>

      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Saving…" : editing ? "Save changes" : "Onboard employee"}
      </button>
    </ValidatedForm>
  );
}
