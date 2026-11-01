import { Roles, normalizeRole } from "@backend/lib/enums.mjs";
import { NextResponse, type NextRequest } from "next/server";
import { decodeProtectedHeader, jwtDecrypt } from "jose";
import { hkdfSync } from "node:crypto";
import { verifyActivationToken, signActivationToken } from "@backend/lib/license";
import { db } from "@backend/lib/db";

const ACTIVATION_COOKIE = "sl_act";
const ACTIVATION_DAYS = 365;

const PUBLIC_PATHS = ["/setup", "/login", "/register", "/api/setup", "/api/auth", "/api/webhooks"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
];

async function sessionRole(request: NextRequest): Promise<string | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const keyMaterial = new TextEncoder().encode(secret);
  for (const name of SESSION_COOKIES) {
    const raw = request.cookies.get(name)?.value;
    if (!raw) continue;
    try {
      const { enc } = decodeProtectedHeader(raw);
      const length = enc === "A256GCM" ? 32 : 64;
      const key = new Uint8Array(
        hkdfSync("sha256", keyMaterial, name, `Auth.js Generated Encryption Key (${name})`, length),
      );
      const { payload } = await jwtDecrypt(raw, key);
      if (typeof payload.role === "string") return normalizeRole(payload.role);
    } catch {
      continue;
    }
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/api/health/live" || pathname === "/api/health/ready") {
    return NextResponse.next();
  }
  // Machine payment/shipment recovery jobs and provider callbacks enforce their own authentication.
  if (
    pathname === "/api/jobs/payment-recovery" ||
    pathname === "/api/jobs/shipment-sync" ||
    pathname.startsWith("/api/payments/sslcommerz/")
  )
    return NextResponse.next();

  if (pathname.startsWith("/account/deliveries")) {
    const url = request.nextUrl.clone();
    url.pathname = "/rider";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // License activation gate: unactivated instances can only reach /setup.
  // If setup was already completed (e.g. via CLI) or the cookie expired,
  // re-issue the activation cookie instead of bouncing forever.
  const token = request.cookies.get(ACTIVATION_COOKIE)?.value;
  const activated = token ? await verifyActivationToken(token) : false;

  if (!activated && !isPublic(pathname)) {
    const settings = await db.storeSettings.findFirst({ select: { setupCompletedAt: true } });
    if (settings?.setupCompletedAt) {
      const fresh = await signActivationToken(Date.now() + ACTIVATION_DAYS * 86400_000);
      const response = NextResponse.next();
      response.cookies.set(ACTIVATION_COOKIE, fresh, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: ACTIVATION_DAYS * 86400,
      });
      return response;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Auth gate for account/admin/hrm/rider/support areas (role checks happen in layouts/actions)
  const hasSession = SESSION_COOKIES.some((c) => request.cookies.has(c));
  if (
    !hasSession &&
    (pathname.startsWith("/account") ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/checkout") ||
      pathname === "/cart" ||
      pathname.startsWith("/rider") ||
      pathname.startsWith("/hrm") ||
      pathname.startsWith("/support"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?callbackUrl=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  // Role-based spaces: riders stay in the rider app, support agents in the support
  // portal; switch role at login to shop.
  const role = await sessionRole(request);
  const roleLockedTo = role === Roles.Rider ? "/rider" : role === Roles.Support ? "/support" : null;
  if (
    roleLockedTo &&
    !pathname.startsWith(roleLockedTo) &&
    !isPublic(pathname) &&
    !pathname.startsWith("/api")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = roleLockedTo;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|public/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)",
  ],
};
