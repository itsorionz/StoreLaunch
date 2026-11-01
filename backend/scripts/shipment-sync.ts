import { config } from "dotenv";
import { setTimeout } from "node:timers/promises";

config({ quiet: true });
async function main() {
  const { runShipmentSyncBatch } = await import("../lib/shipment-sync");
  const { db } = await import("../lib/db");
  const stop = new AbortController();
  process.on("SIGINT", () => stop.abort());
  process.on("SIGTERM", () => stop.abort());
  try {
    do {
      try {
        const outcomes = await runShipmentSyncBatch();
        console.log(
          JSON.stringify({
            time: new Date().toISOString(),
            synced: outcomes.length,
            changed: outcomes.filter((outcome) => outcome.changed).length,
            failed: outcomes.filter((outcome) => !outcome.ok).length,
          }),
        );
      } catch (error) {
        console.error(
          "Shipment sync batch failed",
          error instanceof Error ? error.name : "UnknownError",
        );
        if (!process.argv.includes("--watch")) throw error;
      }
      if (!process.argv.includes("--watch")) break;
      await setTimeout(300_000, undefined, { signal: stop.signal }).catch(() => undefined);
    } while (!stop.signal.aborted);
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  process.exitCode = 1;
});
