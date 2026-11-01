"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveLeaveDecision, type HrmActionResult } from "@backend/actions/hrm";
import { useConfirm } from "@frontend/components/ui/confirm-dialog";
import { useToast } from "@frontend/components/ui/toast";

/** Approve / reject buttons for one pending leave request. */
export function LeaveDecisionButtons({ requestId }: { requestId: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const decide = (decision: "Approved" | "Rejected") => {
    startTransition(async () => {
      if (
        decision === "Rejected" &&
        !(await confirm({
          title: "Reject this leave request?",
          description:
            "The request stays on record as rejected; it can be re-requested for other dates.",
          confirmLabel: "Reject",
        }))
      )
        return;
      const result: HrmActionResult = await saveLeaveDecision(requestId, decision);
      if (result?.ok) {
        toast(decision === "Approved" ? "Leave approved." : "Leave rejected.");
        router.refresh();
      } else {
        toast(result?.error ?? "Could not update the request.", "error");
      }
    });
  };

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => decide("Approved")}
        className="btn-outline btn-sm disabled:opacity-50"
      >
        Approve
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => decide("Rejected")}
        className="btn-outline btn-sm text-accent disabled:opacity-50"
      >
        Reject
      </button>
    </div>
  );
}
