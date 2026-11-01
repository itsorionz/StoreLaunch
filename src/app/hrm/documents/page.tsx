import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requireHrmPage } from "@backend/lib/session";
import { saveEmployeeDocument, removeEmployeeDocument, type HrmActionResult } from "@backend/actions/hrm";
import { DocumentForm, DocumentDeleteButton } from "@frontend/components/hrm/document-form";
import { useToast } from "@frontend/components/ui/toast";

export default function HrmDocumentsPage() {
  const router = useRouter();
  const dict = useToast();
  const [state, action, pending] = useActionState<HrmActionResult, FormData>(saveEmployeeDocument, null);
  const toast = useToast();

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <h2 className="font-bold">Add document</h2>
        <DocumentForm employeeId="EMP-0001" />
      </div>
      <div className="card p-5">
        <h2 className="font-bold">Documents list</h2>
        <p>Document management would go here.</p>
        <DocumentDeleteButton documentId="doc-001" />
      </div>
    </div>
  );
}