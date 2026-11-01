import "server-only";
import {
  type CourierAdapter,
  type CourierCredentials,
  type CourierShipmentStatus,
  type LabelInfo,
  type Parcel,
  type RateQuote,
  type ShipmentRequest,
  type ShipmentResponse,
  type TrackingResult,
  CourierApiError,
  centsOf,
  courierFetch,
  pickString,
  readJson,
} from "./courier-adapter";

const DEFAULT_BASE_URL = "https://portal.steadfast.com.bd";

/**
 * Steadfast courier adapter (https://portal.steadfast.com.bd/api-doc).
 * Auth: `api-key` header with the merchant API key (stored as apiSecret).
 */
export class SteadfastCourierAdapter implements CourierAdapter {
  name = "Steadfast";
  readonly isApi: boolean;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(credentials: CourierCredentials = {}) {
    this.baseUrl = (credentials.apiBaseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.apiKey = credentials.apiSecret?.trim() ?? "";
    this.isApi = this.apiKey.length > 0;
  }

  private headers(): Record<string, string> {
    return { "api-key": this.apiKey, "Content-Type": "application/json" };
  }

  async createShipment(request: ShipmentRequest): Promise<ShipmentResponse> {
    this.assertConfigured("create shipment");
    const { parcel } = request;
    const body = {
      invoice: request.trackingNumber?.trim() || parcel.orderNumber,
      recipient_name: parcel.recipientName,
      recipient_phone: parcel.recipientPhone,
      recipient_city: parcel.city,
      recipient_area: parcel.area ?? "",
      address: parcel.address,
      cod_amount: Math.round((parcel.codCents ?? 0) / 100),
      note: parcel.note ?? "",
    };
    const response = await courierFetch(this.name, `${this.baseUrl}/api/v1/shipment`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    const data = await readJson(response, this.name);
    const trackingNumber =
      pickString(data, "consignment_id", "consignmentId", "invoice") ?? body.invoice;
    return {
      trackingNumber,
      status: this.mapStatus(pickString(data, "status") ?? "pending"),
      labelUrl: null,
    };
  }

  async getTracking(trackingNumber: string): Promise<TrackingResult> {
    this.assertConfigured("fetch tracking");
    if (!trackingNumber.trim())
      throw new CourierApiError(this.name, "MISSING_TRACKING", "Tracking number is required");
    const response = await courierFetch(
      this.name,
      `${this.baseUrl}/api/v1/shipment_status/${encodeURIComponent(trackingNumber.trim())}`,
      { method: "GET", headers: this.headers() },
    );
    const data = (await readJson(response, this.name)) as Record<string, unknown>;
    const carrierStatus = pickString(data, "status") ?? "pending";
    const details = Array.isArray(data.shipment_details) ? data.shipment_details : [];
    const statusHistory = details.flatMap((entry) => {
      const status = pickString(entry, "status");
      if (!status) return [];
      const timestamp = pickString(entry, "timestamp", "update_time");
      return [
        {
          timestamp: timestamp ? new Date(timestamp) : new Date(),
          status,
          location: pickString(entry, "location", "hub") ?? undefined,
          note: pickString(entry, "remark", "note") ?? undefined,
        },
      ];
    });
    return { trackingNumber, status: this.mapStatus(carrierStatus), statusHistory };
  }

  async calculateRate(parcel: Parcel): Promise<RateQuote> {
    this.assertConfigured("quote rate");
    const response = await courierFetch(this.name, `${this.baseUrl}/api/v1/rate_calculator`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        merchant_invoice: parcel.orderNumber,
        recipient_city: parcel.city,
        recipient_area: parcel.area ?? "",
        cod_amount: Math.round((parcel.codCents ?? 0) / 100),
        weight: (parcel.weightGrams ?? 500) / 1000,
      }),
    });
    const data = await readJson(response, this.name);
    const rateCents = centsOf(pickString(data, "chargeable_amount", "delivery_charge", "rate"));
    if (rateCents === null)
      throw new CourierApiError(this.name, "RATE_UNAVAILABLE", "Steadfast did not return a rate");
    return {
      carrier: this.name,
      rateCents: rateCents * 100,
      currencyCode: parcel.currencyCode ?? "BDT",
    };
  }

  async generateLabel(): Promise<LabelInfo> {
    // Steadfast has no public label PDF endpoint; consignment IDs print on the
    // manifest sheet instead.
    return { labelUrl: null, format: "PDF" };
  }

  mapStatus(carrierStatus: string): CourierShipmentStatus {
    const status = carrierStatus.trim().toLowerCase();
    if (["delivered"].includes(status)) return "Delivered";
    if (["out", "delivery", "ofd"].includes(status)) return "OutForDelivery";
    if (["picking", "picked", "in_transit", "at_hub", "hub", "pickup"].includes(status))
      return "InTransit";
    if (["return", "returned", "rto"].includes(status)) return "Returned";
    if (["cancel", "cancelled", "canceled", "failed"].includes(status)) return "Failed";
    if (["confirmation", "pending", "created"].includes(status)) return "Created";
    return "Created";
  }

  private assertConfigured(action: string) {
    if (!this.isApi)
      throw new CourierApiError(
        this.name,
        "NOT_CONFIGURED",
        `Steadfast API key is not configured; cannot ${action}`,
      );
  }
}
