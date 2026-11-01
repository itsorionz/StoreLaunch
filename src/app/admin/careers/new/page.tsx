import Link from "next/link";
import { CareerJobForm } from "@frontend/components/admin/career-job-form";

export const metadata = { title: "Post a job | Admin" };

export default function NewCareerJobPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/careers" className="text-sm font-medium text-primary hover:underline">
          ← Careers
        </Link>
        <h1 className="mt-3 text-2xl font-bold">Post a job</h1>
        <p className="mt-1 text-sm text-muted">
          Save a draft while preparing the details, or publish it to accept applications.
        </p>
      </div>
      <CareerJobForm />
    </div>
  );
}
