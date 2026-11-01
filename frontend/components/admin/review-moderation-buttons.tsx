"use client";

import { ReviewStatuses } from "@backend/lib/enums.mjs";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { moderateReview } from "@backend/actions/admin";
import { useConfirm } from "@frontend/components/ui/confirm-dialog";
import { useToast } from "@frontend/components/ui/toast";
import { TrashIcon } from "./action-icons";

export function ReviewModerationButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function run(action: "approve" | "hide" | "delete") {
    startTransition(async () => {
      const result = await moderateReview(id, action);
      if (!result.ok) {
        toast(result.error ?? "Could not update review", "error");
        return;
      }
      toast(
        action === "approve"
          ? "Review approved"
          : action === "hide"
            ? "Review hidden"
            : "Review deleted",
      );
      router.refresh();
    });
  }

  return (
    <div className="flex gap-2 text-sm">
      {status !== ReviewStatuses.Approved && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run("approve")}
          className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
        >
          Approve
        </button>
      )}
      {status !== ReviewStatuses.Hidden && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run("hide")}
          className="btn-outline btn-sm"
        >
          Hide
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          const ok = await confirm({
            title: "Delete review?",
            description: "This permanently removes the review. This action cannot be undone.",
            confirmLabel: "Delete",
            danger: true,
          });
          if (ok) run("delete");
        }}
        className="btn-icon text-accent transition-colors hover:bg-accent/10 disabled:opacity-60"
        aria-label="Delete review"
        title="Delete"
      >
        <TrashIcon size={16} />
      </button>
    </div>
  );
}
