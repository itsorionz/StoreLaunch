import "server-only";
import { logger } from "./logger";

const log = logger.child({ scope: "sslcommerz" });

const SANDBOX_BASE = "https://sandbox.sslcommerz.com";
const LIVE_BASE = "https://securepay.sslcommerz.com";

function baseUrl(): string {
  return process.env.SSLCOMMERZ_SANDBOX === "false" ? LIVE_BASE : SANDBOX_BASE;
}

function credentials() {
  const storeId = process.env.SSLCOMMERZ_STORE_ID;
  const storePassword = process.env.SSLCOMMERZ_STORE_PASSWORD;
  if (!storeId || !storePassword)
    throw new Error("SSLCOMMERZ_STORE_ID / SSLCOMMERZ_STORE_PASSWORD not set");
  return { storeId, storePassword };
}

export type SslcommerzInitiateInput = {
  tranId: string;
  amount: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  address: string;
  city: string;
  postal?: string;
  productName: string;
  productCategory: string;
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
  ipnUrl: string;
  orderId: string;
};

export type SslcommerzSession =
  | { ok: true; gatewayUrl: string; sessionKey?: string }
  | { ok: false; error: string; uncertain?: boolean };

export async function initiateSslcommerzSession(
  input: SslcommerzInitiateInput,
): Promise<SslcommerzSession> {
  if (!process.env.SSLCOMMERZ_STORE_ID || !process.env.SSLCOMMERZ_STORE_PASSWORD)
    return { ok: false, error: "Payment provider is not configured" };
  const { storeId, storePassword } = credentials();
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  const body = new URLSearchParams({
    store_id: storeId,
    store_passwd: storePassword,
    total_amount: input.amount.toFixed(2),
    currency: input.currency,
    tran_id: input.tranId,
    success_url: `${base}${input.successUrl}?tran_id=${input.tranId}`,
    fail_url: `${base}${input.failUrl}?tran_id=${input.tranId}`,
    cancel_url: `${base}${input.cancelUrl}?tran_id=${input.tranId}`,
    ipn_url: `${base}${input.ipnUrl}`,
    shipping_method: "Courier",
    product_name: input.productName.slice(0, 250),
    product_category: input.productCategory.slice(0, 100),
    product_profile: "general",
    cus_name: input.customerName,
    cus_email: input.customerEmail,
    cus_add1: input.address,
    cus_city: input.city,
    cus_country: "Bangladesh",
    cus_phone: input.customerPhone,
    ship_name: input.customerName,
    ship_add1: input.address,
    ship_city: input.city,
    ship_postcode: input.postal ?? "1000",
    ship_country: "Bangladesh",
    value_a: input.orderId,
  });

  const res = await fetch(`${baseUrl()}/gwprocess/v4/api.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok)
    return {
      ok: false,
      error: "Payment provider returned an unexpected response",
      uncertain: true,
    };

  const data = (await res.json().catch(() => null)) as {
    status?: string;
    sessionkey?: string;
    GatewayPageURL?: string;
    failedreason?: string;
  } | null;

  if (data?.status === "SUCCESS" && data.GatewayPageURL) {
    const gateway = new URL(data.GatewayPageURL);
    if (
      gateway.protocol !== "https:" ||
      !["sandbox.sslcommerz.com", "securepay.sslcommerz.com"].includes(gateway.hostname)
    )
      return { ok: false, error: "Unrecognized payment destination", uncertain: true };
    return { ok: true, gatewayUrl: gateway.toString(), sessionKey: data.sessionkey };
  }
  return {
    ok: false,
    error: data?.failedreason ?? "Could not initiate payment session",
    uncertain: data?.status !== "FAILED",
  };
}

export type SslcommerzValidation = {
  isValid: boolean;
  status: string;
  tranId: string;
  amount?: number;
  currencyType?: string;
  highRisk?: boolean;
};

/** Server-side validation call (validatorapi) — never trust IPN payload alone. */
export async function validateSslcommerzPayment(
  valId: string,
): Promise<SslcommerzValidation | null> {
  if (!process.env.SSLCOMMERZ_STORE_ID || !process.env.SSLCOMMERZ_STORE_PASSWORD) return null;
  const { storeId, storePassword } = credentials();
  const url = `${baseUrl()}/validator/api/validationserverAPI.php?val_id=${encodeURIComponent(valId)}&store_id=${encodeURIComponent(storeId)}&store_passwd=${encodeURIComponent(storePassword)}&format=json`;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      tran_id?: string;
      amount?: number | string;
      currency_amount?: number | string;
      currency_type?: string;
      currency?: string;
      risk_level?: string | number;
    };
    const valid = data?.status === "VALID" || data?.status === "VALIDATED";
    return {
      isValid: valid,
      status: data?.status ?? "UNKNOWN",
      tranId: data?.tran_id ?? "",
      amount: Number(data?.currency_amount ?? data?.amount),
      currencyType: data?.currency_type ?? data?.currency,
      highRisk: String(data?.risk_level ?? "0") !== "0",
    };
  } catch (error) {
    // Validation is the source of truth for IPN fulfilment — a transport or
    // parse failure here means a paid order cannot be verified right now.
    log.warn("payment validation request failed", { error, valId });
    return null;
  }
}

export type SslcommerzQuery =
  | { kind: "Paid"; validation: SslcommerzValidation; valId: string }
  | { kind: "Failed" }
  | { kind: "Pending" | "Unknown" };

/** Query independently of the browser. Missing/malformed records never prove non-payment. */
export async function querySslcommerzPayment(
  tranId: string,
  sessionKey?: string | null,
): Promise<SslcommerzQuery> {
  if (!process.env.SSLCOMMERZ_STORE_ID || !process.env.SSLCOMMERZ_STORE_PASSWORD)
    return { kind: "Unknown" };
  const { storeId, storePassword } = credentials();
  const params = new URLSearchParams({
    store_id: storeId,
    store_passwd: storePassword,
    format: "json",
    ...(sessionKey ? { sessionkey: sessionKey } : { tran_id: tranId }),
  });
  try {
    const res = await fetch(
      `${baseUrl()}/validator/api/merchantTransIDvalidationAPI.php?${params}`,
      { cache: "no-store", signal: AbortSignal.timeout(20_000) },
    );
    if (!res.ok) return { kind: "Unknown" };
    const data = await res.json();
    if (data?.APIConnect !== "DONE") return { kind: "Unknown" };
    const rows: { tran_id?: string; sessionkey?: string; status?: string; val_id?: string }[] =
      sessionKey ? [data] : Array.isArray(data.element) ? data.element : [];
    if (
      !rows.length ||
      (!sessionKey && Number(data.no_of_trans_found) !== rows.length) ||
      rows.some((row) => row.tran_id !== tranId || (sessionKey && row.sessionkey !== sessionKey))
    )
      return { kind: "Unknown" };
    const successful = rows.filter((row) => row.status === "VALID" || row.status === "VALIDATED");
    if (successful.length === 1 && successful[0].val_id) {
      const valId = successful[0].val_id;
      const validation = await validateSslcommerzPayment(valId);
      if (validation?.isValid && validation.tranId === tranId)
        return { kind: "Paid", validation, valId };
      return { kind: "Unknown" };
    }
    if (successful.length) return { kind: "Unknown" };
    if (rows.every((row) => row.status === "FAILED")) return { kind: "Failed" };
    return { kind: rows.some((row) => row.status === "PENDING") ? "Pending" : "Unknown" };
  } catch (error) {
    log.warn("payment query request failed", { error, tranId, hasSessionKey: Boolean(sessionKey) });
    return { kind: "Unknown" };
  }
}
