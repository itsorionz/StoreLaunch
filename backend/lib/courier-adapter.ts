import "server-only";

export type CourierShipmentStatus =
  "Pending" | "Created" | "InTransit" | "OutForDelivery" | "Delivered" | "Failed" | "Returned";

/** Credentials persisted on the DeliveryCompany row for API-backed couriers. */
export interface CourierCredentials {
  apiBaseUrl?: string | null;
  apiClientId?: string | null;
  apiSecret?: string | null;
  storeId?: string | null;
}

/** Everything a carrier needs to accept a parcel. */
export interface Parcel {
  orderId: string;
  orderNumber: string;
  recipientName: string;
  recipientPhone: string;
  /** Street address lines joined (line1 + line2). */
  address: string;
  city: string;
  /** Thana / zone / area within the city. */
  area?: string | null;
  postal?: string | null;
  /** Cash on delivery amount in minor units; 0 for prepaid parcels. */
  codCents?: number;
  currencyCode?: string;
  weightGrams?: number;
  note?: string | null;
}

export interface ShipmentRequest {
  parcel: Parcel;
  /** Operator-entered tracking number; used as merchant reference when present. */
  trackingNumber?: string;
}

export interface ShipmentResponse {
  trackingNumber: string | null;
  status: CourierShipmentStatus;
  labelUrl: string | null;
}

export interface RateQuote {
  carrier: string;
  rateCents: number;
  currencyCode: string;
  etaDaysFrom?: number;
  etaDaysTo?: number;
}

export interface LabelInfo {
  labelUrl: string | null;
  format: "PDF" | "URL";
}

export interface TrackingEvent {
  timestamp: Date;
  status: string;
  location?: string;
  note?: string;
}

export interface TrackingResult {
  trackingNumber: string;
  status: CourierShipmentStatus;
  statusHistory: TrackingEvent[];
}

/** Thrown when a carrier API call fails; callers fall back to manual mode. */
export class CourierApiError extends Error {
  readonly provider: string;
  readonly code: string;
  constructor(provider: string, code: string, message: string) {
    super(message);
    this.name = "CourierApiError";
    this.provider = provider;
    this.code = code;
  }
}

export interface CourierAdapter {
  name: string;
  /** True when this instance has real API credentials configured. */
  readonly isApi: boolean;
  createShipment(request: ShipmentRequest): Promise<ShipmentResponse>;
  getTracking(trackingNumber: string): Promise<TrackingResult>;
  calculateRate(parcel: Parcel): Promise<RateQuote>;
  generateLabel(request: ShipmentRequest): Promise<LabelInfo>;
  mapStatus(carrierStatus: string): CourierShipmentStatus;
}

/**
 * Manual provider adapter - used when no courier API integration is available.
 * Stores tracking numbers manually without API calls.
 */
export class ManualCourierAdapter implements CourierAdapter {
  name = "Manual";
  readonly isApi = false;

  async createShipment(request: ShipmentRequest): Promise<ShipmentResponse> {
    return {
      trackingNumber: request.trackingNumber ?? null,
      status: "Pending",
      labelUrl: null,
    };
  }

  async getTracking(trackingNumber: string): Promise<TrackingResult> {
    return { trackingNumber, status: "Pending", statusHistory: [] };
  }

  async calculateRate(parcel: Parcel): Promise<RateQuote> {
    return { carrier: "Manual", rateCents: 0, currencyCode: parcel.currencyCode ?? "BDT" };
  }

  async generateLabel(): Promise<LabelInfo> {
    return { labelUrl: null, format: "URL" };
  }

  mapStatus(): CourierShipmentStatus {
    return "Pending";
  }
}

/** Shared helpers for API-backed adapters. */

export async function courierFetch(
  provider: string,
  url: string,
  init: RequestInit,
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } catch (error) {
    throw new CourierApiError(
      provider,
      "NETWORK_ERROR",
      `${provider} API unreachable: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function readJson(response: Response, provider: string): Promise<unknown> {
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    throw new CourierApiError(
      provider,
      `HTTP_${response.status}`,
      `${provider} API error ${response.status}: ${text.slice(0, 300)}`,
    );
  }
  return body;
}

/** First non-empty string among candidate object fields. */
export function pickString(source: unknown, ...keys: string[]): string | null {
  if (!source || typeof source !== "object") return null;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

export function centsOf(value: unknown): number | null {
  const parsed =
    typeof value === "string" ? Number.parseFloat(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

/** Minimal order shape needed to build a carrier parcel. */
export interface ParcelSourceOrder {
  id: string;
  number: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  region?: string | null;
  postal?: string | null;
  totalCents: number;
  paymentMethod: string;
  currencyCode?: string | null;
  additionalInfo?: string | null;
}

/** Builds the carrier parcel payload from an order; COD amount for COD orders. */
export function orderToParcel(order: ParcelSourceOrder): Parcel {
  return {
    orderId: order.id,
    orderNumber: order.number,
    recipientName: order.recipientName,
    recipientPhone: order.phone,
    address: [order.line1, order.line2].filter(Boolean).join(", "),
    city: order.city,
    area: order.region ?? null,
    postal: order.postal ?? null,
    codCents: order.paymentMethod === "COD" ? order.totalCents : 0,
    currencyCode: order.currencyCode ?? "BDT",
    note: order.additionalInfo ?? null,
  };
}
