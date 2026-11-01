"use client";
import { DeliveryRelationships, DeliveryAttemptReasons } from "@backend/lib/enums.mjs";
import { useActionState } from "react";
import { saveDeliveryAttempt, saveDeliveryProof } from "@backend/actions/rider";
import {
  ValidatedForm,
  ValidationInput,
  ValidationSelect,
  ValidationTextarea,
} from "@frontend/components/ui/validated-form";

export function DeliveryAttemptForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(saveDeliveryAttempt, null);
  return (
    <ValidatedForm
      errors={state?.fieldErrors}
      result={state}
      successMessage="Delivery attempt saved."
      noValidate
      action={action}
      className="card space-y-4 p-5"
    >
      <input name="orderId" type="hidden" value={orderId} />
      {state?.error && !state.fieldErrors && (
        <p role="alert" className="text-accent">
          {state.error}
        </p>
      )}
      <label className="block text-sm font-medium">
        What happened?
        <ValidationSelect
          name="reason"
          className="input mt-1"
          defaultValue={DeliveryAttemptReasons.noAnswer}
        >
          <option value={DeliveryAttemptReasons.noAnswer}>Customer did not answer</option>
          <option value={DeliveryAttemptReasons.unavailable}>Customer unavailable</option>
          <option value={DeliveryAttemptReasons.addressIssue}>Address could not be found</option>
          <option value={DeliveryAttemptReasons.refused}>Customer refused delivery</option>
          <option value={DeliveryAttemptReasons.rescheduled}>
            Customer requested another time
          </option>
          <option value={DeliveryAttemptReasons.other}>Other issue</option>
        </ValidationSelect>
      </label>
      <label className="block text-sm font-medium">
        Attempt notes
        <ValidationTextarea
          name="note"
          required
          minLength={5}
          maxLength={1000}
          rows={4}
          className="input mt-1"
          placeholder="Record the contact attempt and the agreed next step"
        />
      </label>
      <label className="block text-sm font-medium">
        Retry time (optional, Bangladesh time)
        <ValidationInput name="nextAttempt" type="datetime-local" className="input mt-1" />
      </label>
      <p className="text-xs text-muted">
        The parcel stays out for delivery. Refused orders must be reviewed by the store before a
        return or cancellation.
      </p>
      <button className="btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save delivery attempt"}
      </button>
    </ValidatedForm>
  );
}

export function DeliveryProofForm({
  orderId,
  cashDue,
}: {
  orderId: string;
  cashDue: string | null;
}) {
  const [state, action, pending] = useActionState(saveDeliveryProof, null);
  return (
    <ValidatedForm
      errors={state?.fieldErrors}
      result={state}
      successMessage="Delivery completed."
      noValidate
      action={action}
      className="card space-y-4 p-5"
    >
      <input name="orderId" type="hidden" value={orderId} />
      {state?.error && !state.fieldErrors && (
        <p role="alert" className="text-accent">
          {state.error}
        </p>
      )}
      <label className="block text-sm font-medium">
        Received by
        <ValidationInput
          name="receivedBy"
          required
          minLength={2}
          maxLength={100}
          autoComplete="off"
          className="input mt-1"
          placeholder="Name of the person who accepted the parcel"
        />
      </label>
      <label className="block text-sm font-medium">
        Receiver relationship
        <ValidationSelect
          name="relationship"
          defaultValue={DeliveryRelationships.customer}
          className="input mt-1"
        >
          <option value={DeliveryRelationships.customer}>Customer</option>
          <option value={DeliveryRelationships.family}>Family member</option>
          <option value={DeliveryRelationships.reception}>Reception / security</option>
          <option value={DeliveryRelationships.other}>Other authorized person</option>
        </ValidationSelect>
      </label>
      <label className="block text-sm font-medium">
        Handover notes (optional)
        <ValidationTextarea name="note" maxLength={1000} rows={3} className="input mt-1" />
      </label>
      <label className="block text-sm font-medium">
        Parcel photo (optional)
        <ValidationInput
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="mt-2 block w-full text-sm"
        />
      </label>
      <p className="text-xs text-muted">
        JPEG, PNG or WebP, up to 5 MB. Photograph the parcel or safe handover location; avoid faces
        and identity documents.
      </p>
      <label className="block text-sm">
        <ValidationInput name="handoverConfirmed" type="checkbox" value="true" className="mr-2" />I
        confirm this parcel has been handed to the receiver above.
      </label>
      {cashDue && (
        <label className="block rounded-xl bg-accent/5 p-4 text-sm font-semibold">
          <ValidationInput name="cashCollected" type="checkbox" value="true" className="mr-2" />I
          collected the full {cashDue} due for this delivery.
        </label>
      )}
      <p className="text-xs text-muted">
        The handover record cannot be edited after completion. Confirm the receiver and cash amount
        before saving.
      </p>
      <button className="btn-primary w-full sm:w-auto" disabled={pending}>
        {pending ? "Completing…" : "Complete delivery"}
      </button>
    </ValidatedForm>
  );
}
