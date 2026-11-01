export const LICENSE_PREFIX = "SL1";

function getSecret(): string {
  const secret = process.env.LICENSE_SECRET;
  if (!secret) throw new Error("LICENSE_SECRET is not set");
  return secret;
}

function b64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64urlEncode(new Uint8Array(sig));
}

export type LicensePayload = {
  v: 1;
  /** issued-at unix seconds */
  iat: number;
  /** expiry unix seconds; omitted = never expires */
  exp?: number;
  /** optional store slug binding */
  slug?: string;
};

/** Generate a signed license key: SL1.<payload>.<signature> */
export async function generateLicenseKey(
  opts: { expiresInDays?: number; slug?: string } = {},
): Promise<{ key: string; payload: LicensePayload }> {
  const payload: LicensePayload = { v: 1, iat: Math.floor(Date.now() / 1000) };
  if (opts.expiresInDays) payload.exp = payload.iat + opts.expiresInDays * 86400;
  if (opts.slug) payload.slug = opts.slug;
  const payloadStr = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmac(payloadStr);
  return { key: `${LICENSE_PREFIX}.${payloadStr}.${signature}`, payload };
}

export type VerifyResult =
  | { ok: true; payload: LicensePayload }
  | { ok: false; reason: "malformed" | "bad-signature" | "expired" };

/** Verify a license key offline (HMAC signature + expiry). */
export async function verifyLicenseKey(key: string): Promise<VerifyResult> {
  const parts = key.trim().split(".");
  if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) return { ok: false, reason: "malformed" };
  const [, payloadStr, signature] = parts;
  const expected = await hmac(payloadStr);
  if (signature !== expected) return { ok: false, reason: "bad-signature" };
  let payload: LicensePayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadStr)));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload };
}

/** One-way hash for storing issued keys in the License table. */
export async function hashLicenseKey(key: string): Promise<string> {
  return hmac(`store:${key.trim()}`);
}

/** Sign a short-lived activation token for the activation cookie. */
export async function signActivationToken(expiresAtMs: number): Promise<string> {
  const data = `act:${expiresAtMs}`;
  const sig = await hmac(data);
  return `${expiresAtMs}.${sig}`;
}

export async function verifyActivationToken(token: string): Promise<boolean> {
  const [expStr, sig] = token.split(".");
  if (!expStr || !sig) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return sig === (await hmac(`act:${expStr}`));
}
