import type { NextRequest } from "next/server";
import { logger } from "./logger";

/**
 * Controller-level logging for Route Handlers (files under src/app/api that
 * export route.ts).
 *
 * Wraps an exported handler so every call is accounted for:
 *  - thrown errors are logged with method/path/duration and re-thrown, so
 *    Next.js still returns its usual 500 (and `instrumentation.ts`
 *    `onRequestError` records the same failure with request context);
 *  - 4xx/5xx responses are logged at `warn` together with the response body,
 *    which is usually the exact reason a gateway, job or webhook failed;
 *  - successful calls are logged at `debug` with their duration.
 *
 * Usage:
 *   export const POST = withRoute("payments.sslcommerz.ipn", async (request) => { ... });
 */

/**
 * Loose handler shape: any function returning a Response satisfies it
 * (every parameter type is a supertype of `never`), while the generic still
 * preserves the real signature for Next.js's route type validation.
 */
type RouteHandler = (...args: never[]) => Response | Promise<Response>;

/** What the wrapper actually invokes; cast once, at the boundary. */
type InvocableHandler = (request: NextRequest, context?: unknown) => Response | Promise<Response>;

const log = logger.child({ scope: "route" });

/** Best-effort read of an error response body; never disturbs the response. */
async function errorBody(response: Response): Promise<string | undefined> {
  try {
    const text = await response.clone().text();
    return text ? text.slice(0, 500) : undefined;
  } catch {
    return undefined;
  }
}

export function withRoute<H extends RouteHandler>(name: string, handler: H): H {
  const invoke = handler as unknown as InvocableHandler;
  const wrapped = async (request: NextRequest, context?: unknown): Promise<Response> => {
    const startedAt = Date.now();
    const requestInfo = { route: name, method: request.method, path: request.nextUrl.pathname };
    try {
      const response = await invoke(request, context);
      const durationMs = Date.now() - startedAt;
      if (response.status >= 400) {
        log.warn(`${name} responded`, {
          ...requestInfo,
          status: response.status,
          durationMs,
          body: await errorBody(response),
        });
      } else {
        log.debug(`${name} completed`, { ...requestInfo, status: response.status, durationMs });
      }
      return response;
    } catch (error) {
      log.error(`${name} failed`, { ...requestInfo, error, durationMs: Date.now() - startedAt });
      throw error;
    }
  };
  return wrapped as unknown as H;
}
