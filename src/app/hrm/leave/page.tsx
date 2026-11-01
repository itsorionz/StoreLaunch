import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requireHrmPage } from "@backend/lib/session";
import { LeaveTypes } from "@backend/lib/enums.mjs";
import { saveLeaveRequest, type HrmActionResult } from "@backend/actions/hrm";
import { LeaveRequestForm } from "@frontend/components/hrm/leave-request-form";
import { ValidatedForm, ValidationInput } from "@frontend/components/ui/validated-form";
import { useToast } from "@frontend/components/ui/toast";

type Option = { id: string; label: string };

export default function HrmLeavePage() {
  const router = useRouter();
  const [state, action, pending] = useActionState<HrmActionResult, FormData>(
    saveLeaveRequest,
    null,
  );
  const toast = useToast();

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <h2 className="font-bold">Request leave</h2>
        <LeaveRequestForm options={[]} />
      </div>
      {state?.error && (
        <p role="alert" className="text-xs text-accent">
          {state.error}
        </p>
      )}
      <div className="card p-5">
        <h2 className="font-bold">Pending leave requests</h2>
        <p>Leave request management would go here.</p>
      </div>
    </div>
  );
}