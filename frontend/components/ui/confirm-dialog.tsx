"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setOpts(o);
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setOpts(null);
  }, []);

  useEffect(() => {
    if (!opts) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(false);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [opts, close]);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {opts && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={opts.title}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-black/50" onClick={() => close(false)} aria-hidden />
          <div className="relative w-full max-w-sm animate-scale-in rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div
              className={`mb-4 flex h-11 w-11 items-center justify-center rounded-full ${opts.danger !== false ? "bg-accent/10" : "bg-primary-light"}`}
            >
              {opts.danger !== false ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className="text-accent"
                >
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
              ) : (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className="text-primary"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              )}
            </div>
            <h2 className="text-lg font-bold tracking-tight">{opts.title}</h2>
            {opts.description && (
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{opts.description}</p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => close(false)}
                className="btn-outline btn-sm"
              >
                {opts.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                className={`btn-sm inline-flex items-center justify-center rounded-lg px-4 font-semibold transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] ${
                  opts.danger !== false
                    ? "bg-accent text-white hover:opacity-90"
                    : "bg-primary text-white hover:bg-primary-dark"
                }`}
              >
                {opts.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}
