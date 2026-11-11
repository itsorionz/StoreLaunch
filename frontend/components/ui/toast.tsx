"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Global toast system (mounted once in src/app/layout.tsx).
 *
 * Every user-triggered task should surface its outcome through this stack:
 *  - success → the task completed
 *  - warning → the task completed, but with a caveat worth knowing
 *  - error   → the task failed
 *
 * Form results are converted to toasts centrally by `ActionResultToast`
 * (frontend/components/ui/validated-form.tsx); imperative handlers call
 * `toast.success(...)` / `toast.error(...)` / `toast.warning(...)`.
 *
 * Guards built in:
 *  - dedupe: the same message+type fired twice within a short window (two
 *    watchers seeing one result, a double-click) renders once
 *  - cap: at most MAX_VISIBLE toasts; the oldest overflow is dropped
 */

export type ToastType = "success" | "error" | "warning";

type ToastAction = { label: string; onClick: () => void; dismissLabel?: string };
type Toast = { id: number; message: string; type: ToastType; action?: ToastAction };

/** Callable as `toast(message, type?, action?)` with `.success/.error/.warning` helpers. */
export type ToastFn = ((message: string, type?: ToastType, action?: ToastAction) => void) & {
  success: (message: string, action?: ToastAction) => void;
  error: (message: string, action?: ToastAction) => void;
  warning: (message: string, action?: ToastAction) => void;
};

const ToastCtx = createContext<ToastFn | null>(null);

/** At most this many toasts are on screen; older ones are dropped. */
const MAX_VISIBLE = 4;
/** Identical message+type within this window is treated as a duplicate. */
const DEDUPE_MS = 1_500;

export function useToast(): ToastFn {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastFire = useRef<{ key: string; at: number } | null>(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((message: string, type: ToastType = "success", action?: ToastAction) => {
    const text = message.trim();
    if (!text) return;

    const now = Date.now();
    const key = `${type}:${text}`;
    if (lastFire.current?.key === key && now - lastFire.current.at < DEDUPE_MS) return;
    lastFire.current = { key, at: now };

    const id = nextId.current++;
    setToasts((t) => [...t, { id, message: text, type, action }].slice(-MAX_VISIBLE));
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3000);
  }, []);

  // Build a stable callable with .success/.error/.warning without mutating hook
  // returns or reading refs during render (react-hooks/immutability, refs).
  const pushRef = useRef(push);
  useEffect(() => {
    pushRef.current = push;
  }, [push]);

  const toast = useMemo<ToastFn>(() => {
    const call = ((message: string, type: ToastType = "success", action?: ToastAction) =>
      pushRef.current(message, type, action)) as ToastFn;
    call.success = (message: string, action?: ToastAction) =>
      pushRef.current(message, "success", action);
    call.error = (message: string, action?: ToastAction) =>
      pushRef.current(message, "error", action);
    call.warning = (message: string, action?: ToastAction) =>
      pushRef.current(message, "warning", action);
    return call;
  }, []);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div
        data-toast-stack
        className="pointer-events-none fixed bottom-4 right-3 left-3 z-[110] flex max-w-sm flex-col gap-2 sm:left-auto sm:right-4 sm:w-full print:hidden"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === "error" ? "alert" : "status"}
            data-toast-type={t.type}
            data-cart-toast={t.action ? true : undefined}
            className={`animate-toast-in pointer-events-auto flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg ${
              t.type === "error"
                ? "border-accent/30 bg-surface text-accent"
                : t.type === "warning"
                  ? "border-amber-500/50 bg-surface text-amber-600 dark:text-amber-400"
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
            ) : t.type === "warning" ? (
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
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
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
                <path d="M9 12l2 2 4-4" />
              </svg>
            )}
            <p className="min-w-0 flex-1 text-sm font-semibold">{t.message}</p>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  dismiss(t.id);
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
              onClick={() => dismiss(t.id)}
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
                strokeLinejoin="round"
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
