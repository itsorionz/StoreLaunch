import type { Instrumentation } from "next";
import { logger, safeHeaders } from "../backend/lib/logger";

/**
 * Global server observability hooks (Next.js `instrumentation.ts`).
 *
 * `register` runs once per server instance (node + edge) at startup.
 * `onRequestError` is the safety net for every error that escapes a
 * controller: uncaught server-action failures, route-handler throws and
 * render errors all land here with the request they belong to — so even a
 * failure nobody wrote a `catch` for leaves a complete, grep-able record.
 *
 * Controllers that do catch and translate errors to user-facing messages
 * log at the catch site themselves (see `backend/actions/**`).
 */

export async function register(): Promise<void> {
  logger.info("server instrumentation registered", {
    runtime: process.env.NEXT_RUNTIME,
    nodeEnv: process.env.NODE_ENV,
  });
}

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  try {
    logger.error("unhandled request error", {
      error,
      route: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
      method: request.method,
      path: request.path,
      headers: safeHeaders(request.headers),
    });
  } catch {
    // Observability must never break the server.
  }
};
