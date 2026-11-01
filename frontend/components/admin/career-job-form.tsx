"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  CareerEmploymentTypes,
  CareerJobStatuses,
  CareerWorkplaceModes,
} from "@backend/lib/enums.mjs";
import { saveCareerJob, type CareerActionResult } from "@backend/actions/career";
import {
  ValidatedForm,
  ValidationInput,
  ValidationSelect,
  ValidationTextarea,
} from "@frontend/components/ui/validated-form";
import { useToast } from "@frontend/components/ui/toast";

type CareerJobDraft = {
  id: string;
  slug: string;
  title: string;
  department: string;
  location: string;
  employmentType: string;
  workplaceMode: string;
  summary: string;
  description: string;
  requirements: string[];
  status: string;
  closesAt: Date | null;
};

export function CareerJobForm({ job }: { job?: CareerJobDraft }) {
  const router = useRouter();
  const toast = useToast();
  const [state, action, pending] = useActionState<CareerActionResult | null, FormData>(
    async (previous, formData) => {
      const result = await saveCareerJob(previous, formData);
      if (result.ok && result.id) {
        toast(job ? "Job posting saved" : "Job posting created");
        if (!job) router.push(`/admin/careers/${result.id}`);
        else router.refresh();
      }
      return result;
    },
    null,
  );

  return (
    <ValidatedForm
      action={action}
      errors={state?.fieldErrors}
      result={state}
      successToast={false}
      noValidate
      className="card max-w-4xl space-y-5 p-5 sm:p-7"
    >
      {job && <ValidationInput type="hidden" name="id" value={job.id} />}
      {state?.error && !state.fieldErrors && (
        <p role="alert" className="rounded-xl bg-accent/10 p-3 text-sm text-accent">
          {state.error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Job title
          <ValidationInput
            name="title"
            required
            maxLength={100}
            defaultValue={job?.title}
            className="input mt-1"
            placeholder="e.g. Customer Support Associate"
          />
        </label>
        <label className="block text-sm font-medium">
          URL slug
          <ValidationInput
            name="slug"
            required
            maxLength={120}
            defaultValue={job?.slug}
            className="input mt-1"
            placeholder="customer-support-associate"
          />
        </label>
        <label className="block text-sm font-medium">
          Department
          <ValidationInput
            name="department"
            required
            maxLength={100}
            defaultValue={job?.department}
            className="input mt-1"
            placeholder="e.g. Customer Experience"
          />
        </label>
        <label className="block text-sm font-medium">
          Location
          <ValidationInput
            name="location"
            required
            maxLength={120}
            defaultValue={job?.location}
            className="input mt-1"
            placeholder="e.g. Dhaka, Bangladesh"
          />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm font-medium">
          Employment type
          <ValidationSelect
            name="employmentType"
            defaultValue={job?.employmentType ?? CareerEmploymentTypes.FullTime}
            className="input mt-1"
          >
            <option value={CareerEmploymentTypes.FullTime}>Full time</option>
            <option value={CareerEmploymentTypes.PartTime}>Part time</option>
            <option value={CareerEmploymentTypes.Contract}>Contract</option>
            <option value={CareerEmploymentTypes.Internship}>Internship</option>
          </ValidationSelect>
        </label>
        <label className="block text-sm font-medium">
          Work arrangement
          <ValidationSelect
            name="workplaceMode"
            defaultValue={job?.workplaceMode ?? CareerWorkplaceModes.OnSite}
            className="input mt-1"
          >
            <option value={CareerWorkplaceModes.OnSite}>On site</option>
            <option value={CareerWorkplaceModes.Hybrid}>Hybrid</option>
            <option value={CareerWorkplaceModes.Remote}>Remote</option>
          </ValidationSelect>
        </label>
        <label className="block text-sm font-medium">
          Posting status
          <ValidationSelect
            name="status"
            defaultValue={job?.status ?? CareerJobStatuses.Draft}
            className="input mt-1"
          >
            <option value={CareerJobStatuses.Draft}>Draft</option>
            <option value={CareerJobStatuses.Published}>Published</option>
            <option value={CareerJobStatuses.Closed}>Closed</option>
          </ValidationSelect>
        </label>
      </div>
      <label className="block text-sm font-medium">
        Short summary
        <ValidationTextarea
          name="summary"
          required
          maxLength={500}
          defaultValue={job?.summary}
          rows={3}
          className="input mt-1"
          placeholder="A concise overview shown on the public careers page."
        />
      </label>
      <label className="block text-sm font-medium">
        Role description
        <ValidationTextarea
          name="description"
          required
          maxLength={10000}
          defaultValue={job?.description}
          rows={8}
          className="input mt-1"
          placeholder="Describe the role, responsibilities and what success looks like."
        />
      </label>
      <label className="block text-sm font-medium">
        Requirements <span className="font-normal text-muted">(one item per line)</span>
        <ValidationTextarea
          name="requirements"
          required
          maxLength={6000}
          defaultValue={job?.requirements.join("\n")}
          rows={6}
          className="input mt-1"
          placeholder={
            "Relevant experience\nStrong written communication\nAble to work with a team"
          }
        />
      </label>
      <label className="block text-sm font-medium">
        Application deadline <span className="font-normal text-muted">(optional)</span>
        <ValidationInput
          name="closesAt"
          type="date"
          defaultValue={job?.closesAt?.toISOString().slice(0, 10)}
          className="input mt-1 max-w-xs"
          placeholder="Select a closing date"
        />
      </label>
      <div className="flex flex-wrap gap-3 border-t border-border pt-5">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Saving…" : job ? "Save changes" : "Create job posting"}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-outline">
          Cancel
        </button>
      </div>
    </ValidatedForm>
  );
}
