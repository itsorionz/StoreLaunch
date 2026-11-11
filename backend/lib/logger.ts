/**
 * Structured, leveled logger for all server-side code (controllers, API
 * routes, integrations).
 *
 * Design goals:
 *  - One grep-able line per event: timestamp, level, scope, message, context.
 *  - Errors are serialized with their stack plus any domain properties
 *    (Prisma `code`/`meta`, gateway response codes, ...), which is what makes
 *    a failure debuggable without reproducing it.
 *  - Secrets never reach the log: messages and context values pass through a
 *    sanitizer that redacts e-mail addresses, phone numbers and anything that
 *    looks like a credential. Callers may log freely.
 *  - Never throws: a logging failure must never take down a request.
 *
 * Output format:
 *  - development  → human readable, colourised when attached to a TTY
 *  - production   → one JSON object per line (stdout → any log shipper)
 *
 * Configuration (both optional):
 *  - LOG_LEVEL  = debug | info | warn | error   (default: debug in dev, info in prod)
 *  - LOG_FORMAT = pretty | json                 (default: pretty in dev, json in prod)
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Arbitrary structured context attached to a log line. */
export type LogContext = Record<string, unknown>;

export type Logger = {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** Returns a logger that always merges `context` into its lines. */
  child(context: LogContext): Logger;
};

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Re-evaluated per call so tests and scripts can override env at runtime. */
function enabledLevel(): number {
  const configured = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (Object.hasOwn(LEVEL_ORDER, configured)) return LEVEL_ORDER[configured as LogLevel];
  return LEVEL_ORDER[process.env.NODE_ENV === "production" ? "info" : "debug"];
}

function outputFormat(): "pretty" | "json" {
  const configured = (process.env.LOG_FORMAT ?? "").toLowerCase();
  if (configured === "pretty" || configured === "json") return configured;
  return process.env.NODE_ENV === "production" ? "json" : "pretty";
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_STACK_LENGTH = 6_000;

/** E-mail addresses (PII). */
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Bangladeshi mobile numbers, with or without the country code. */
const BD_PHONE_PATTERN = /(?:\+?880|0)1[3-9]\d{8}/g;
/** Any other international number that is explicitly prefixed with "+". */
const INTERNATIONAL_PHONE_PATTERN = /\+\d{10,15}/g;
/** credential=value / "credential": "value" pairs. Bearer tokens are handled first. */
const SECRET_PATTERN =
  /\b(?:api[_-]?key|apikey|store[_-]?passwd|client[_-]?secret|access[_-]?token|refresh[_-]?token|password|passwd|secret|authorization|bearer)\b["']?\s*[:=]\s*["']?[^\s"',;&}]{3,}/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g;
/** Context keys whose value is a credential regardless of its shape. */
const SENSITIVE_KEY_PATTERN =
  /^(?:api[_-]?key|apikey|store[_-]?passwd|client[_-]?secret|access[_-]?token|refresh[_-]?token|password|passwd|secret|authorization|token|cookie|otp|pin)$/i;

function sanitizeText(value: string): string {
  const redacted = value
    .replace(EMAIL_PATTERN, "[email]")
    .replace(BD_PHONE_PATTERN, "[phone]")
    .replace(INTERNATIONAL_PHONE_PATTERN, "[phone]")
    .replace(BEARER_PATTERN, "Bearer [secret]")
    .replace(SECRET_PATTERN, (match) => {
      const separatorIndex = match.search(/[:=]/);
      return separatorIndex === -1 ? "[secret]" : `${match.slice(0, separatorIndex + 1)}[secret]`;
    });
  return redacted.length > MAX_MESSAGE_LENGTH
    ? `${redacted.slice(0, MAX_MESSAGE_LENGTH)}…(+${redacted.length - MAX_MESSAGE_LENGTH} chars)`
    : redacted;
}

/** Recursively walks a context value: redacts strings, caps size, breaks cycles. */
function sanitizeValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[Function]";
  if (typeof value === "symbol") return String(value);
  if (value instanceof Error) return serializeError(value, depth + 1, seen);
  if (depth >= 4) return "[Depth limit]";
  if (typeof value === "object") {
    const object = value as object;
    if (seen.has(object)) return "[Circular]";
    seen.add(object);
    if (Array.isArray(value)) {
      const items = value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1, seen));
      if (value.length > 20) items.push(`…(+${value.length - 20} more)`);
      return items;
    }
    const output: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>);
    for (const [key, entryValue] of entries.slice(0, 50)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? "[secret]"
        : sanitizeValue(entryValue, depth + 1, seen);
    }
    if (entries.length > 50) output["…"] = `(+${entries.length - 50} more keys)`;
    return output;
  }
  return String(value);
}

/**
 * Turns any thrown value into a loggable shape: message + stack (both
 * redacted) plus the extra properties frameworks attach to errors —
 * Prisma's `code`/`meta`, Next's `digest`, gateway response codes, ...
 */
function serializeError(error: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (!(error instanceof Error)) {
    if (error === null || error === undefined) return error;
    return sanitizeValue(error, depth, seen);
  }
  if (seen.has(error)) return "[Circular]";
  seen.add(error);

  const output: Record<string, unknown> = {
    name: error.name,
    message: sanitizeText(error.message),
  };
  if (error.stack) output.stack = sanitizeText(error.stack.slice(0, MAX_STACK_LENGTH));

  // Framework/library properties carried on the error instance.
  const extra = error as unknown as Record<string, unknown>;
  for (const key of ["code", "meta", "clientVersion", "digest", "cause", "status", "statusCode"]) {
    if (extra[key] !== undefined && key !== "stack" && key !== "message") {
      output[key] = sanitizeValue(extra[key], depth + 1, seen);
    }
  }
  // Any other own enumerable properties (custom error classes).
  for (const [key, value] of Object.entries(extra)) {
    if (key in output || key === "stack" || key === "message" || key === "name") continue;
    output[key] = sanitizeValue(value, depth + 1, seen);
  }
  // AggregateError: cap the child list.
  const children = (error as { errors?: unknown }).errors;
  if (Array.isArray(children) && children.length) {
    output.errors = children.slice(0, 5).map((child) => serializeError(child, depth + 1, seen));
  }
  return output;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const COLORS = {
  debug: "\x1b[90m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
};

function colorize(text: string, color: keyof typeof COLORS, enabled: boolean): string {
  return enabled ? `${COLORS[color]}${text}${COLORS.reset}` : text;
}

function isTTY(): boolean {
  // Defensive: in the Edge runtime even touching `process.stdout` throws.
  try {
    return Boolean(nodeProcess()?.stdout?.isTTY);
  } catch {
    return false;
  }
}

function compactJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[Unserializable]";
  }
}

function formatPretty(
  level: LogLevel,
  scope: string | undefined,
  message: string,
  context: LogContext,
): string {
  const time = new Date().toISOString().slice(11, 23);
  const levelTag = colorize(level.toUpperCase().padEnd(5), level, isTTY());
  const scopeTag = scope ? colorize(` [${scope}]`, "dim", isTTY()) : "";
  const detail = Object.keys(context).length ? ` ${compactJson(context)}` : "";
  return `${colorize(time, "dim", isTTY())} ${levelTag}${scopeTag} ${message}${detail}`;
}

function formatJson(
  level: LogLevel,
  scope: string | undefined,
  message: string,
  context: LogContext,
): string {
  return JSON.stringify({
    time: new Date().toISOString(),
    level,
    ...(scope ? { scope } : {}),
    msg: message,
    ...context,
  });
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

/**
 * `process.stdout`/`process.stderr` do not exist in the Edge runtime, and the
 * bundler rejects *direct* references to them there (instrumentation.ts is
 * compiled for both runtimes). Reaching them through `globalThis` keeps this
 * module isomorphic: Node writes to the streams, Edge falls back to console.
 */
type WriteStream = { write?(chunk: string): void; isTTY?: boolean };
type RuntimeProcess = { stdout?: WriteStream; stderr?: WriteStream };

function nodeProcess(): RuntimeProcess | undefined {
  try {
    return (globalThis as { process?: RuntimeProcess }).process;
  } catch {
    return undefined;
  }
}

function write(
  level: LogLevel,
  staticContext: LogContext,
  message: string,
  context?: LogContext,
): void {
  try {
    if (LEVEL_ORDER[level] < enabledLevel()) return;

    const merged: LogContext = { ...staticContext, ...(context ?? {}) };
    const scope = typeof merged.scope === "string" ? merged.scope : undefined;
    delete merged.scope;

    // Every value passes through the sanitizer: strings are redacted and
    // sized, Errors (conventionally passed as `error`) keep their stack and
    // domain properties such as Prisma's `code`. Sanitizing the object as a
    // whole (not value-by-value) lets secret-looking keys redact their value.
    const sanitized = (sanitizeValue(merged, 0, new WeakSet<object>()) ?? {}) as LogContext;

    const formatted =
      outputFormat() === "json"
        ? formatJson(level, scope, message, sanitized)
        : formatPretty(level, scope, message, sanitized);

    emit(level, formatted);
  } catch {
    // Logging must never break the request it is observing.
  }
}

/** stdout/stderr when available (node), console fallback elsewhere (edge). */
function emit(level: LogLevel, line: string): void {
  try {
    const stream = level === "error" ? nodeProcess()?.stderr : nodeProcess()?.stdout;
    if (stream && typeof stream.write === "function") {
      stream.write(`${line}\n`);
      return;
    }
  } catch {
    // fall through to console
  }
  try {
    if (level === "error") console.error(line);
    else console.log(line);
  } catch {
    // Give up rather than throw.
  }
}

function createLogger(staticContext: LogContext): Logger {
  const scope = typeof staticContext.scope === "string" ? staticContext.scope : undefined;
  const context = scope ? { ...staticContext, scope } : { ...staticContext };
  return {
    debug: (message, logContext) => write("debug", context, message, logContext),
    info: (message, logContext) => write("info", context, message, logContext),
    warn: (message, logContext) => write("warn", context, message, logContext),
    error: (message, logContext) => write("error", context, message, logContext),
    child: (childContext) => createLogger({ ...context, ...childContext }),
  };
}

/** Root logger. Prefer `logger.child({ scope })` at module level in controllers. */
export const logger: Logger = createLogger({});

/** Redacts credential-bearing headers before they are logged. */
export function safeHeaders(
  headers: Headers | Record<string, string | string[] | undefined>,
): Record<string, string> {
  const blocked = new Set([
    "cookie",
    "set-cookie",
    "authorization",
    "proxy-authorization",
    "x-api-key",
    "x-auth-token",
  ]);
  const pairs: [string, string][] =
    typeof (headers as Headers).entries === "function"
      ? [...(headers as Headers).entries()]
      : Object.entries(headers as Record<string, string | string[] | undefined>).flatMap(
          ([key, value]): [string, string][] => {
            if (value === null || value === undefined) return [];
            return Array.isArray(value)
              ? value.map((item): [string, string] => [key, item])
              : [[key, String(value)]];
          },
        );
  const output: Record<string, string> = {};
  for (const [key, value] of pairs) {
    if (blocked.has(key.toLowerCase())) continue;
    output[key] = sanitizeText(value).slice(0, 300);
  }
  return output;
}
