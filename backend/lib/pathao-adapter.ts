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

const DEFAULT_BASE_URL = "https://merchant-api-prod.pathao.com";
const OAUTH_URL = "https://oauth2.pathao.com/oauth/token";

/**
 * Pathao courier adapter (merchant API).
 * Auth: OAuth2 password grant (client id/secret + merchant username/password
 * stored in apiClientId/apiSecret); store id in storeId.
 */
export class PathaoCourierAdapter implements CourierAdapter {
  name = "Pathao";
  readonly isApi: boolean;
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly storeId: string | null;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(credentials: CourierCredentials = {}) {
    this.baseUrl = (credentials.apiBaseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.clientId = credentials.apiClientId?.trim() ?? "";
    // apiSecret holds "client_secret" or "client_secret\nusername\npassword".
    this.clientSecret = credentials.apiSecret?.trim() ?? "";
    this.storeId = credentials.storeId?.trim() || null;
    this.isApi = Boolean(this.clientId && this.clientSecret && this.storeId);
  }

  private assertConfigured(action: string) {
    if (!this.isApi)
      throw new CourierApiError(
        this.name,
        "NOT_CONFIGURED",
        `Pathao credentials are not configured; cannot ${action}`,
      );
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    this.assertConfigured("authenticate");
    // apiSecret holds either "client_secret" or "client_secret\nusername\npassword".
    const [clientSecret, username, password] = this.clientSecret.split("\n");
    const fields: Record<string, string> = {
      client_id: this.clientId,
      client_secret: clientSecret,
      grant_type: username && password ? "password" : "client_credentials",
    };
    if (username && password) {
      fields.username = username;
      fields.password = password;
    }
    const response = await courierFetch(this.name, OAUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    });
    const data = (await readJson(response, this.name)) as Record<string, unknown>;
    const value = pickString(data, "access_token", "accessToken");
    if (!value)
      throw new CourierApiError(this.name, "AUTH_FAILED", "Pathao did not return an access token");
    const expiresIn = Number(data.expires_in ?? 3600);
    this.token = { value, expiresAt: Date.now() + expiresIn * 1000 };
    return value;
  }

  private async apiHeaders(): Promise<Record<string, string>> {
    const token = await this.accessToken();
    return {
      Authorization: `Bearer ${token}`,
      "X-Store-ID": this.storeId ?? "",
      "Content-Type": "application/json",
    };
  }

  /** Resolve Pathao numeric city/zone ids from the free-text address. */
  private async resolveCityAndZone(
    parcel: Parcel,
  ): Promise<{ cityId: number | null; zoneId: number | null }> {
    const headers = await this.apiHeaders();
    const cities = (await readJson(
      await courierFetch(this.name, `${this.baseUrl}/api/v2/cities`, { method: "GET", headers }),
      this.name,
    )) as { data?: unknown[] } | unknown[];
    const cityList = Array.isArray(cities) ? cities : (cities.data ?? []);
    const wantedCity = parcel.city.trim().toLowerCase();
    const city = cityList.find(
      (entry) => pickString(entry, "city_name", "name")?.toLowerCase() === wantedCity,
    );
    const cityId = city ? Number(pickString(city, "city_id", "id")) : null;
    if (!cityId) return { cityId: null, zoneId: null };
    const zones = (await readJson(
      await courierFetch(this.name, `${this.baseUrl}/api/v2/zones?city_id=${cityId}`, {
        method: "GET",
        headers,
      }),
      this.name,
    )) as { data?: unknown[] } | unknown[];
    const zoneList = Array.isArray(zones) ? zones : (zones.data ?? []);
    const wantedZone = parcel.area?.trim().toLowerCase();
    const zone = wantedZone
      ? zoneList.find(
          (entry) => pickString(entry, "zone_name", "name")?.toLowerCase() === wantedZone,
        )
      : undefined;
    const zoneId = zone ? Number(pickString(zone, "zone_id", "id")) : null;
    return { cityId, zoneId };
  }

  async createShipment(request: ShipmentRequest): Promise<ShipmentResponse> {
    this.assertConfigured("create shipment");
    const { parcel } = request;
    const { cityId, zoneId } = await this.resolveCityAndZone(parcel);
    if (!cityId)
      throw new CourierApiError(
        this.name,
        "CITY_UNRESOLVED",
        `Pathao has no city matching "${parcel.city}"`,
      );
    const headers = await this.apiHeaders();
    const body = {
      merchant_order_id: request.trackingNumber?.trim() || parcel.orderNumber,
      recipient_name: parcel.recipientName,
      recipient_phone: parcel.recipientPhone,
      recipient_address: parcel.address,
      city_id: cityId,
      zone_id: zoneId,
      amount: Math.round((parcel.codCents ?? 0) / 100),
      special_instruction: parcel.note ?? "",
      delivery_type: "home_delivery",
      package_type: "parcel",
    };
    const data = (await readJson(
      await courierFetch(this.name, `${this.baseUrl}/api/v2/orders`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
      this.name,
    )) as Record<string, unknown>;
    const inner = (data.data ?? data) as Record<string, unknown>;
    const trackingNumber =
      pickString(inner, "tracking_code", "invoice_id", "merchant_order_id") ??
      body.merchant_order_id;
    return {
      trackingNumber,
      status: this.mapStatus(pickString(inner, "status") ?? "placed"),
      labelUrl: null,
    };
  }

  async getTracking(trackingNumber: string): Promise<TrackingResult> {
    this.assertConfigured("fetch tracking");
    if (!trackingNumber.trim())
      throw new CourierApiError(this.name, "MISSING_TRACKING", "Tracking number is required");
    const headers = await this.apiHeaders();
    const data = (await readJson(
      await courierFetch(
        this.name,
        `${this.baseUrl}/api/v2/orders/${encodeURIComponent(trackingNumber.trim())}/status`,
        { method: "GET", headers },
      ),
      this.name,
    )) as Record<string, unknown>;
    const inner = (data.data ?? data) as Record<string, unknown>;
    const carrierStatus = pickString(inner, "status", "current_status") ?? "placed";
    const history = Array.isArray(inner.status_history) ? inner.status_history : [];
    const statusHistory = history.flatMap((entry) => {
      const status = pickString(entry, "status", "title");
      if (!status) return [];
      const timestamp = pickString(entry, "timestamp", "date");
      return [
        {
          timestamp: timestamp ? new Date(timestamp) : new Date(),
          status,
          note: pickString(entry, "remark", "comment") ?? undefined,
        },
      ];
    });
    return { trackingNumber, status: this.mapStatus(carrierStatus), statusHistory };
  }

  async calculateRate(parcel: Parcel): Promise<RateQuote> {
    this.assertConfigured("quote rate");
    const headers = await this.apiHeaders();
    const { cityId, zoneId } = await this.resolveCityAndZone(parcel);
    const query = new URLSearchParams({
      city_id: String(cityId ?? ""),
      zone_id: String(zoneId ?? ""),
      delivery_type: "home_delivery",
      weight: String((parcel.weightGrams ?? 500) / 1000),
    });
    const data = (await readJson(
      await courierFetch(this.name, `${this.baseUrl}/api/v2/shipping-cost?${query}`, {
        method: "GET",
        headers,
      }),
      this.name,
    )) as Record<string, unknown>;
    const inner = (data.data ?? data) as Record<string, unknown>;
    const rateCents = centsOf(pickString(inner, "shipping_cost", "delivery_charge", "cost"));
    if (rateCents === null)
      throw new CourierApiError(this.name, "RATE_UNAVAILABLE", "Pathao did not return a rate");
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
    if (["out_for_delivery", "rider_assigned", "picked"].includes(status)) return "OutForDelivery";
    if (["in_transit", "at_hub", "hub"].includes(status)) return "InTransit";
    if (["return", "returned", "return_collection", "rto"].includes(status)) return "Returned";
    if (["cancelled", "canceled", "hold", "delivery_delayed", "failed"].includes(status))
      return "Failed";
    if (["placed", "confirmed", "packing"].includes(status)) return "Created";
    return "Created";
  }
}
