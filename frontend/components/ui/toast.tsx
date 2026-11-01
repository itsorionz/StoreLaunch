"use client";

import { createContext, useCallback, useContext, useState } from "react";

type ToastAction = { label: string; onClick: () => void; dismissLabel?: string };
type Toast = { id: number; message: string; type: "success" | "error"; action?: ToastAction };

type ToastFn = (message: string, type?: "success" | "error", action?: ToastAction) => void;

const ToastCtx = createContext<ToastFn | null>(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback<ToastFn>((message, type = "success", action) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type, action }]);
    setTimeout(
      () => {
        setToasts((t) => t.filter((x) => x.id !== id));
      },
      action ? 6000 : 4000,
    );
  }, []);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div
        data-toast-stack
        className="pointer-events-none fixed bottom-4 right-3 left-3 z-[110] flex max-w-sm flex-col gap-2 sm:left-auto sm:right-4 sm:w-full"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === "error" ? "alert" : "status"}
            data-cart-toast={t.action ? true : undefined}
            className={`animate-toast-in pointer-events-auto flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg ${
              t.type === "error"
                ? "border-accent/30 bg-surface text-accent"
                : t.action
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-primary/30 bg-surface text-primary"
            }`}
          >
            {t.type === "error" ? (
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
                className="shrink-0"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="m15 9-6 6" />
                <path d="m9 9 6 6" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="mt-0.5 shrink-0"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            )}
            <p className="min-w-0 flex-1 text-sm font-semibold">{t.message}</p>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  setToasts((prev) => prev.filter((entry) => entry.id !== t.id));
                  t.action?.onClick();
                }}
                className="inline-flex shrink-0 items-center gap-2 rounded-md bg-black px-3 py-2 text-sm font-bold text-yellow-400 transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {t.action.label}
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M4 12h16m-6-6 6 6-6 6" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 ${t.action ? "border-2 border-white focus-visible:ring-white" : "opacity-60 focus-visible:ring-ring"}`}
              aria-label={t.action?.dismissLabel ?? "Dismiss"}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
