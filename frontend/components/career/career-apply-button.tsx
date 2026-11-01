"use client";

export function CareerApplyButton({ targetId }: { targetId: string }) {
  function openApplication() {
    const details = document.getElementById(targetId);
    if (!(details instanceof HTMLDetailsElement)) return;

    details.open = true;
    window.history.replaceState(null, "", `#${targetId}`);
    requestAnimationFrame(() => details.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <button
      type="button"
      onClick={openApplication}
      className="btn-primary inline-flex items-center justify-center"
      aria-controls={targetId}
    >
      Apply for this role
    </button>
  );
}
