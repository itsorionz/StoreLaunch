"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requireHrmPage } from "@backend/lib/session";
import { saveReview, type HrmActionResult } from "@backend/actions/hrm";
import { ReviewForm } from "@frontend/components/hrm/review-form";
import { useToast } from "@frontend/components/ui/toast";

export default function HrmPerformancePage() {
  const router = useRouter();
  const dict = useToast();
  const [state, action, pending] = useActionState<HrmActionResult, FormData>(saveReview, null);
  const toast = useToast();

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <h2 className="font-bold">Save performance review</h2>
        <ReviewForm options={[]} />
      </div>
      <div className="card p-5">
        <h2 className="font-bold">Review deletion</h2>
        <p>Performance review management would go here.</p>
      </div>
    </div>
  );
}