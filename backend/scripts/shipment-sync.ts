import { config } from "dotenv";
import { setTimeout } from "node:timers/promises";
import { logger } from "../lib/logger";

config({ quiet: true });

const log = logger.child({ scope: "job:shipment-sync" });

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
        log.info("batch completed", {
          synced: outcomes.length,
          changed: outcomes.filter((outcome) => outcome.changed).length,
          failed: outcomes.filter((outcome) => !outcome.ok).length,
        });
      } catch (error) {
        log.error("batch failed", { error });
        if (!process.argv.includes("--watch")) throw error;
      }
      if (!process.argv.includes("--watch")) break;
      await setTimeout(300_000, undefined, { signal: stop.signal }).catch(() => undefined);
    } while (!stop.signal.aborted);
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  log.error("worker exited with failure", { error });
  process.exitCode = 1;
});
