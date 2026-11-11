import { config } from "dotenv";
import { setTimeout } from "node:timers/promises";
import { logger } from "../lib/logger";

config({ quiet: true });

const log = logger.child({ scope: "job:payment-recovery" });

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
        log.info("batch completed", {
          processed: results.length,
          resolved: results.filter((result) => result.ok).length,
        });
      } catch (error) {
        log.error("batch failed", { error });
        if (!process.argv.includes("--watch")) throw error;
      }
      if (!process.argv.includes("--watch")) break;
      await setTimeout(60_000, undefined, { signal: stop.signal }).catch(() => undefined);
    } while (!stop.signal.aborted);
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  log.error("worker exited with failure", { error });
  process.exitCode = 1;
});
