import "server-only";
import { canonicalPhone } from "./phone";

/** True means accepted by the gateway, not confirmed delivery to the handset. */
export async function sendSms(to: string | null | undefined, text: string): Promise<boolean> {
  if (!to || !text) return false;
  const provider = process.env.SMS_PROVIDER ?? (process.env.SMS_API_URL ? "generic" : "disabled");
  if (provider === "console") {
    if (process.env.NODE_ENV === "production") return false;
    console.log(`[sms:development-only] ${to} ${text}`);
    return true;
  }
  if (provider === "disabled") return false;
  try {
    const apiKey = process.env.SMS_API_KEY;
    const senderId = process.env.SMS_SENDER_ID;
    if (provider === "smsq" || provider === "bulksmsbd") {
      const phone = canonicalPhone(to);
      if (!/^8801[3-9]\d{8}$/.test(phone) || !apiKey || !senderId) return false;
      if (provider === "smsq") {
        const clientId = process.env.SMS_CLIENT_ID;
        if (!clientId) return false;
        const response = await fetch("https://api.smsq.global/api/v2/SendSMS", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ApiKey: apiKey,
            ClientId: clientId,
            SenderId: senderId,
            MobileNumbers: phone,
            Message: text,
            Is_Unicode: Array.from(text).some((character) => character.codePointAt(0)! > 127),
            Is_Flash: false,
          }),
          signal: AbortSignal.timeout(10_000),
          cache: "no-store",
          redirect: "error",
        });
        if (!response.ok) return false;
        const data = (await response.json()) as {
          ErrorCode?: number;
          Data?: { MessageId?: string }[];
        };
        return data.ErrorCode === 0 && Array.isArray(data.Data) && Boolean(data.Data[0]?.MessageId);
      }
      const response = await fetch("https://bulksmsbd.net/api/smsapi", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          api_key: apiKey,
          senderid: senderId,
          number: phone,
          message: text,
          type: "text",
        }),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
        redirect: "error",
      });
      if (!response.ok) return false;
      const data = (await response.json()) as number | { response_code?: number | string };
      return typeof data === "number" ? data === 202 : Number(data?.response_code) === 202;
    }
    if (provider === "generic" && process.env.SMS_API_URL) {
      const url = new URL(process.env.SMS_API_URL);
      if (
        url.protocol !== "https:" &&
        !(
          process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname)
        )
      )
        return false;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ to, text, message: text, body: text }),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
        redirect: "error",
      });
      if (!response.ok) return false;
      const data = (await response.json()) as { success?: boolean; accepted?: boolean };
      return data.success === true || data.accepted === true;
    }
  } catch {
    // Do not log keys, recipient numbers, OTPs or provider response bodies.
    return false;
  }
  return false;
}
