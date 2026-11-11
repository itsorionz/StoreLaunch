
const MAX_LOGIN_ATTEMPTS = 5;
const MAX_OTP_ATTEMPTS = 3;
const MAX_API_ATTEMPTS = 100;

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const otpAttempts = new Map<string, { count: number; resetAt: number }>();
const apiAttempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(
  key: string,
  map: Map<string, { count: number; resetAt: number }>,
  maxAttempts: number,
): { limited: boolean; waitMs: number } | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() > entry.resetAt) {
    map.delete(key);
    return null;
  }
  if (entry.count >= maxAttempts) {
    const waitMs = entry.resetAt - Date.now();
    return { limited: true, waitMs };
  }
  return null;
}

export function authenticateRateLimit(
  identifier: string,
  maxAttempts: number = MAX_LOGIN_ATTEMPTS,
): { limited: boolean; waitMs: number } | null {
  const key = `rate-limit:AUTH:${identifier}`;
  return isRateLimited(key, loginAttempts, maxAttempts);
}

export function otpRateLimit(
  identifier: string,
  maxAttempts: number = MAX_OTP_ATTEMPTS,
): { limited: boolean; waitMs: number } | null {
  const key = `rate-limit:OTP:${identifier}`;
  return isRateLimited(key, otpAttempts, maxAttempts);
}

export function apiRateLimit(
  identifier: string,
  maxAttempts: number = MAX_API_ATTEMPTS,
): { limited: boolean; waitMs: number } | null {
  const key = `rate-limit:API:${identifier}`;
  return isRateLimited(key, apiAttempts, maxAttempts);
}

export function recordAuthAttempt(identifier: string, success: boolean): void {
  const key = `rate-limit:AUTH:${identifier}`;
  const entry = loginAttempts.get(key);
  if (success) {
    loginAttempts.delete(key);
  } else if (entry) {
    const newCount = entry.count + 1;
    const resetAt = entry.resetAt;
    loginAttempts.set(key, { count: newCount, resetAt });
  }
}

export function recordOtpAttempt(identifier: string, success: boolean): void {
  const key = `rate-limit:OTP:${identifier}`;
  const entry = otpAttempts.get(key);
  if (success) {
    otpAttempts.delete(key);
  } else if (entry) {
    const newCount = entry.count + 1;
    const resetAt = entry.resetAt;
    otpAttempts.set(key, { count: newCount, resetAt });
  }
}

export function recordApiAttempt(identifier: string, success: boolean): void {
  const key = `rate-limit:API:${identifier}`;
  const entry = apiAttempts.get(key);
  if (success) {
    apiAttempts.delete(key);
  } else if (entry) {
    const newCount = entry.count + 1;
    const resetAt = entry.resetAt;
    apiAttempts.set(key, { count: newCount, resetAt });
  }
}
