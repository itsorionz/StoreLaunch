import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { productionConfigIssues } from "./runtime-config.mjs";

export function validateRuntimeEnvironment({ forceProduction = false } = {}) {
  const env = forceProduction ? { ...process.env, NODE_ENV: "production" } : process.env;
  if (!forceProduction && env.NODE_ENV !== "production") return [];
  return productionConfigIssues(env);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const issues = validateRuntimeEnvironment({
    forceProduction: process.argv.includes("--production"),
  });
  if (issues.length) {
    console.error("Production configuration is incomplete:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  } else {
    console.info("Production configuration check passed.");
  }
}
