#!/usr/bin/env node
// Emits the remaining boundary violations as a cluster-partitioned worklist.
// Usage: node scripts/boundary-worklist.mjs [--write file]
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const out = (() => {
  try {
    return execSync('npx eslint "src/**/*.{ts,tsx}" "frontend/**/*.{ts,tsx}" -f json', {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (e) {
    // ESLint exits non-zero when violations exist; the JSON is still on stdout.
    if (e.stdout) return e.stdout;
    throw e;
  }
})();
const report = JSON.parse(out);
const root = process.cwd().replace(/\\/g, "/") + "/";
const files = [];
for (const f of report) {
  const hits = f.messages.filter((m) => m.ruleId === "@typescript-eslint/no-restricted-imports");
  if (!hits.length) continue;
  const rel = f.filePath.replace(/\\/g, "/").replace(root, "");
  const lines = hits.map((m) => m.line);
  files.push({ file: rel, count: hits.length, lines });
}
const clusters = {
  "A-account": (f) => /^src\/app\/\(store\)\/account\//.test(f),
  "B-store": (f) => /^src\/app\/\(store\)\//.test(f) && !/^src\/app\/\(store\)\/account\//.test(f),
  "C-admin": (f) => /^src\/app\/admin\//.test(f),
  "D-hrm": (f) => /^src\/app\/hrm\//.test(f),
  "E-rider": (f) => /^src\/app\/rider\//.test(f),
  "F-sales": (f) => /^src\/app\/sales\//.test(f),
  "G-support": (f) => /^src\/app\/support\//.test(f),
  "H-warehouse": (f) => /^src\/app\/warehouse\//.test(f),
  "I-api-root": (f) =>
    /^src\/app\/(api\/|sitemap|robots|layout|not-found|setup)/.test(f) || f === "src/proxy.ts",
};
const grouped = {};
const assigned = new Set();
for (const [k, pred] of Object.entries(clusters)) {
  grouped[k] = files.filter((x) => pred(x.file));
  grouped[k].forEach((x) => assigned.add(x.file));
}
grouped["Z-unassigned"] = files.filter((x) => !assigned.has(x.file));

const total = files.length;
console.log(`TOTAL remaining boundary violations in files: ${total}`);
for (const [k, arr] of Object.entries(grouped)) {
  if (!arr.length) continue;
  const hits = arr.reduce((s, x) => s + x.count, 0);
  console.log(`\n## ${k}  (${arr.length} files, ${hits} imports)`);
  arr.sort((a, b) => a.file.localeCompare(b.file)).forEach((x) => console.log(`  ${x.file}`));
}
if (process.argv.includes("--write")) {
  const idx = process.argv.indexOf("--write");
  const target = process.argv[idx + 1];
  writeFileSync(target, JSON.stringify({ total, grouped }, null, 1));
  console.log(`\nWrote ${target}`);
}
