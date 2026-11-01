import { config } from "dotenv";
import { setTimeout } from "node:timers/promises";

config({ quiet: true });
async function main() {
  const { runPaymentRecoveryBatch } = await import("../lib/payment-recovery");
  const { db } = await import("../lib/db");
  const stop = new AbortController();
  process.on("SIGINT", () => stop.abort());
  process.on("SIGTERM", () => stop.abort());
  try {
    do {
      try {
        const results = await runPaymentRecoveryBatch();
        console.log(
          JSON.stringify({
            time: new Date().toISOString(),
            processed: results.length,
            resolved: results.filter((result) => result.ok).length,
          }),
        );
      } catch (error) {
        console.error(
          "Payment recovery batch failed",
          error instanceof Error ? error.name : "UnknownError",
        );
        if (!process.argv.includes("--watch")) throw error;
      }
      if (!process.argv.includes("--watch")) break;
      await setTimeout(60_000, undefined, { signal: stop.signal }).catch(() => undefined);
    } while (!stop.signal.aborted);
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  process.exitCode = 1;
});
