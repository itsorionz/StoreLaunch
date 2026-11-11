#!/usr/bin/env node
// Classifies prettier-failing files: does the HEAD version pass prettier?
// Usage: node scripts/prettier-classify.mjs < <list of files, one per line>
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as prettier from "prettier";

const files = readFileSync(0, "utf8")
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);

const brokenByUs = [];
const preExisting = [];
const newFiles = [];

for (const file of files) {
  let head;
  try {
    head = execSync(`git show HEAD:${JSON.stringify(file).slice(1, -1)}`, {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    newFiles.push(file); // no HEAD version: file is new in this migration
    continue;
  }
  try {
    const config = (await prettier.resolveConfig(file)) ?? {};
    const formatted = await prettier.format(head, { ...config, filepath: file });
    (formatted === head ? brokenByUs : preExisting).push(file);
  } catch {
    // Can't parse HEAD version (e.g. not a prettier-handled type) — leave alone.
    preExisting.push(file);
  }
}

console.log("BROKEN_BY_US (fix with prettier --write):");
brokenByUs.forEach((f) => console.log("  " + f));
console.log("\nPRE_EXISTING (leave alone):");
preExisting.forEach((f) => console.log("  " + f));
console.log("\nNEW_FILES (migration artifacts, fix):");
newFiles.forEach((f) => console.log("  " + f));
