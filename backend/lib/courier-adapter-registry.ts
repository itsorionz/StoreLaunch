import "server-only";
import {
  type CourierAdapter,
  type CourierCredentials,
  ManualCourierAdapter,
} from "./courier-adapter";
import { PathaoCourierAdapter } from "./pathao-adapter";
import { RedXCourierAdapter } from "./redx-adapter";
import { SteadfastCourierAdapter } from "./steadfast-adapter";

const adapters: Map<string, CourierAdapter> = new Map();

export function registerCourierAdapter(name: string, adapter: CourierAdapter) {
  adapters.set(name.toLowerCase(), adapter);
}

export function getCourierAdapter(name: string): CourierAdapter | null {
  return adapters.get(name.toLowerCase()) ?? null;
}

export function getDefaultCourierAdapter(): CourierAdapter {
  return adapters.get("manual") ?? new ManualCourierAdapter();
}

export function listCourierAdapters(): string[] {
  return Array.from(adapters.keys());
}

/** DeliveryCompany columns that carry per-carrier API credentials. */
export type CourierCompanyConfig = Pick<
  CourierCredentials,
  "apiBaseUrl" | "apiClientId" | "apiSecret" | "storeId"
> & { providerKey?: string | null };

/**
 * Resolves the adapter for a delivery company by its `providerKey`
 * (steadfast | pathao | redx), passing through that row's API credentials.
 * Unknown or missing provider keys fall back to the manual adapter so
 * dispatch never blocks on courier onboarding.
 */
export function resolveCourierAdapter(
  company: CourierCompanyConfig | null | undefined,
): CourierAdapter {
  const key = (company?.providerKey ?? "").trim().toLowerCase();
  const credentials: CourierCredentials = {
    apiBaseUrl: company?.apiBaseUrl ?? null,
    apiClientId: company?.apiClientId ?? null,
    apiSecret: company?.apiSecret ?? null,
    storeId: company?.storeId ?? null,
  };
  switch (key) {
    case "steadfast":
      return new SteadfastCourierAdapter(credentials);
    case "pathao":
      return new PathaoCourierAdapter(credentials);
    case "redx":
      return new RedXCourierAdapter(credentials);
    default:
      return getCourierAdapter(key) ?? getDefaultCourierAdapter();
  }
}

// Auto-register manual adapter
registerCourierAdapter("manual", new ManualCourierAdapter());
