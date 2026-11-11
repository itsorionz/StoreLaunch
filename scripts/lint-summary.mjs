#!/usr/bin/env node
// Prints non-boundary lint errors grouped by file. Usage: npx eslint ... -f json > report.json && node scripts/lint-summary.mjs report.json
import { readFileSync } from "node:fs";

const file = process.argv[2] ?? ".lint-report.json";
const report = JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
const root = process.cwd().replace(/\\/g, "/") + "/";
let total = 0;
for (const f of report) {
  const msgs = f.messages.filter((m) => m.ruleId !== "@typescript-eslint/no-restricted-imports");
  if (!msgs.length) continue;
  const rel = f.filePath.replace(/\\/g, "/").replace(root, "");
  console.log(rel);
  for (const m of msgs) {
    total++;
    console.log(`   ${m.line}:${m.column}  ${m.ruleId}  ${m.message}`);
  }
}
console.log(`\n${total} non-boundary problems`);
