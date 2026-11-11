"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveLeaveRequest, type HrmActionResult } from "@backend/actions/hrm";
import { LeaveRequestForm } from "@frontend/components/hrm/leave-request-form";

export default function HrmLeavePage() {
  const router = useRouter();
  const [state] = useActionState<HrmActionResult, FormData>(saveLeaveRequest, null);

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
