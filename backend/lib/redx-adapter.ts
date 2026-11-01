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

const DEFAULT_BASE_URL = "https://redx.com.bd/api";

/**
 * RedX courier adapter.
 * Auth: `access_token` header with the merchant API token (stored as apiSecret).
 */
export class RedXCourierAdapter implements CourierAdapter {
  name = "RedX";
  readonly isApi: boolean;
  private readonly baseUrl: string;
  private readonly accessToken: string;

  constructor(credentials: CourierCredentials = {}) {
    this.baseUrl = (credentials.apiBaseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.accessToken = credentials.apiSecret?.trim() ?? "";
    this.isApi = this.accessToken.length > 0;
  }

  private headers(): Record<string, string> {
    return { access_token: this.accessToken, "Content-Type": "application/json" };
  }

  private assertConfigured(action: string) {
    if (!this.isApi)
      throw new CourierApiError(
        this.name,
        "NOT_CONFIGURED",
        `RedX access token is not configured; cannot ${action}`,
      );
  }

  async createShipment(request: ShipmentRequest): Promise<ShipmentResponse> {
    this.assertConfigured("create shipment");
    const { parcel } = request;
    const body = {
      invoice: request.trackingNumber?.trim() || parcel.orderNumber,
      merchant_order_id: parcel.orderNumber,
      recipientName: parcel.recipientName,
      recipientPhone: parcel.recipientPhone,
      recipientAddress: parcel.address,
      recipientCity: parcel.city,
      recipientThana: parcel.area ?? "",
      packetAmount: Math.round((parcel.codCents ?? 0) / 100),
      deliveryType: "home",
      note: parcel.note ?? "",
    };
    const response = await courierFetch(this.name, `${this.baseUrl}/v1/shipment/create`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    const data = (await readJson(response, this.name)) as Record<string, unknown>;
    const trackingNumber = pickString(data, "tracking_id", "trackingId", "invoice") ?? body.invoice;
    return {
      trackingNumber,
      status: this.mapStatus(pickString(data, "status") ?? "Pending"),
      labelUrl: null,
    };
  }

  async getTracking(trackingNumber: string): Promise<TrackingResult> {
    this.assertConfigured("fetch tracking");
    if (!trackingNumber.trim())
      throw new CourierApiError(this.name, "MISSING_TRACKING", "Tracking number is required");
    const response = await courierFetch(
      this.name,
      `${this.baseUrl}/v1/shipment/tracking/${encodeURIComponent(trackingNumber.trim())}`,
      { method: "GET", headers: this.headers() },
    );
    const data = (await readJson(response, this.name)) as Record<string, unknown>;
    const carrierStatus = pickString(data, "status", "current_status") ?? "Pending";
    const history = Array.isArray(data.status_history) ? data.status_history : [];
    const statusHistory = history.flatMap((entry) => {
      const status = pickString(entry, "status", "title");
      if (!status) return [];
      const timestamp = pickString(entry, "date", "timestamp");
      return [
        {
          timestamp: timestamp ? new Date(timestamp) : new Date(),
          status,
          location: pickString(entry, "location") ?? undefined,
          note: pickString(entry, "comment", "remarks") ?? undefined,
        },
      ];
    });
    return { trackingNumber, status: this.mapStatus(carrierStatus), statusHistory };
  }

  async calculateRate(parcel: Parcel): Promise<RateQuote> {
    this.assertConfigured("quote rate");
    const response = await courierFetch(this.name, `${this.baseUrl}/v1/shipment/rate`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        recipientCity: parcel.city,
        recipientThana: parcel.area ?? "",
        packetAmount: Math.round((parcel.codCents ?? 0) / 100),
        weight: (parcel.weightGrams ?? 500) / 1000,
      }),
    });
    const data = (await readJson(response, this.name)) as Record<string, unknown>;
    const rateCents = centsOf(
      pickString(data, "delivery_charge", "chargeable_amount", "rate", "cost"),
    );
    if (rateCents === null)
      throw new CourierApiError(this.name, "RATE_UNAVAILABLE", "RedX did not return a rate");
    return {
      carrier: this.name,
      rateCents: rateCents * 100,
      currencyCode: parcel.currencyCode ?? "BDT",
    };
  }

  async generateLabel(): Promise<LabelInfo> {
    return { labelUrl: null, format: "PDF" };
  }

  mapStatus(carrierStatus: string): CourierShipmentStatus {
    const status = carrierStatus.trim().toLowerCase();
    if (["delivered"].includes(status)) return "Delivered";
    if (["at drop point", "at_drop_point", "out for delivery", "out_for_delivery"].includes(status))
      return "OutForDelivery";
    if (["in transit", "in_transit", "in-transit", "pickup", "hub"].includes(status))
      return "InTransit";
    if (["returned", "return", "rto"].includes(status)) return "Returned";
    if (["cancelled", "canceled", "hold", "failed"].includes(status)) return "Failed";
    if (["pending", "created", "confirmed"].includes(status)) return "Created";
    return "Created";
  }
}
