"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { savePayrollRun, type HrmActionResult } from "@backend/actions/hrm";
import { PayrollRunForm } from "@frontend/components/hrm/payroll-controls";

export default function HrmPayrollPage() {
  const router = useRouter();
  const [state] = useActionState<HrmActionResult, FormData>(savePayrollRun, null);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <h2 className="font-bold">Generate payroll run</h2>
        <PayrollRunForm defaultMonth={new Date().toISOString().slice(0, 7)} />
      </div>
      <div className="card p-5">
        <h2 className="font-bold">Pay run actions</h2>
        <p>Pay run management would go here.</p>
      </div>
    </div>
  );
}
