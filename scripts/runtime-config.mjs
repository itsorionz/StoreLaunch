export function productionConfigIssues(env = process.env) {
  const issues = [];
  const required = ["DATABASE_URL", "AUTH_SECRET", "LICENSE_SECRET", "NEXT_PUBLIC_BASE_URL"];
  for (const name of required) {
    if (!env[name]?.trim()) issues.push(`${name} is required`);
  }

  if (env.DATABASE_URL) {
    try {
      const databaseUrl = new URL(env.DATABASE_URL);
      if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
        issues.push("DATABASE_URL must use PostgreSQL");
      }
    } catch {
      issues.push("DATABASE_URL must be a valid PostgreSQL URL");
    }
  }
  for (const name of ["AUTH_SECRET", "LICENSE_SECRET"]) {
    if (env[name] && Buffer.byteLength(env[name], "utf8") < 32) {
      issues.push(`${name} must contain at least 32 bytes`);
    }
  }
  if (env.NEXT_PUBLIC_BASE_URL) {
    try {
      const baseUrl = new URL(env.NEXT_PUBLIC_BASE_URL);
      if (baseUrl.protocol !== "https:")
        issues.push("NEXT_PUBLIC_BASE_URL must use HTTPS in production");
    } catch {
      issues.push("NEXT_PUBLIC_BASE_URL must be a valid absolute URL");
    }
  }

  const cloudinary = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];
  if (cloudinary.some((name) => Boolean(env[name])) && cloudinary.some((name) => !env[name])) {
    issues.push("All CLOUDINARY_* credentials must be configured together");
  }

  if (env.SMTP_HOST && !env.EMAIL_FROM)
    issues.push("EMAIL_FROM is required when SMTP_HOST is configured");
  if (env.SMTP_PORT && !/^\d{1,5}$/.test(env.SMTP_PORT))
    issues.push("SMTP_PORT must be a valid port number");

  const smsProvider = env.SMS_PROVIDER ?? "disabled";
  if (!["smsq", "bulksmsbd", "generic", "disabled", "console"].includes(smsProvider)) {
    issues.push("SMS_PROVIDER is not supported");
  }
  if (env.NODE_ENV === "production" && smsProvider === "console") {
    issues.push("SMS_PROVIDER=console is development-only");
  }
  if (smsProvider === "smsq" || smsProvider === "bulksmsbd") {
    for (const name of ["SMS_API_KEY", "SMS_SENDER_ID"]) {
      if (!env[name]) issues.push(`${name} is required for SMS_PROVIDER=${smsProvider}`);
    }
    if (smsProvider === "smsq" && !env.SMS_CLIENT_ID)
      issues.push("SMS_CLIENT_ID is required for SMSQ");
  }
  if (smsProvider === "generic" && !env.SMS_API_URL)
    issues.push("SMS_API_URL is required for the generic SMS provider");

  const livePayments = env.SSLCOMMERZ_SANDBOX === "false";
  if (livePayments) {
    for (const name of [
      "SSLCOMMERZ_STORE_ID",
      "SSLCOMMERZ_STORE_PASSWORD",
      "PAYMENT_RECOVERY_SECRET",
    ]) {
      if (!env[name]) issues.push(`${name} is required when live SSLCommerz payments are enabled`);
    }
    if (
      env.PAYMENT_RECOVERY_SECRET &&
      Buffer.byteLength(env.PAYMENT_RECOVERY_SECRET, "utf8") < 32
    ) {
      issues.push("PAYMENT_RECOVERY_SECRET must contain at least 32 bytes");
    }
  }

  if (env.SHIPMENT_SYNC_SECRET && Buffer.byteLength(env.SHIPMENT_SYNC_SECRET, "utf8") < 32) {
    issues.push("SHIPMENT_SYNC_SECRET must contain at least 32 bytes");
  }

  return issues;
}
