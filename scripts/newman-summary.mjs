#!/usr/bin/env node
// Converts the JUnit XML that scripts/run-postman-tests.sh writes into a
// markdown table for $GITHUB_STEP_SUMMARY.
//
// One job runs every collection and publishes a per-category table, rather than
// a 12-way matrix: under the Compose approach each matrix leg would pay the
// ~4 minute stack boot, roughly 45 minutes of runner time for the same
// information.
//
// Parses with a regex rather than an XML parser dependency. newman's JUnit
// output is machine-generated and regular, and this repo has no root
// package.json to hang a dependency from.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const TESTSUITE = /<testsuite\b[^>]*>/g;
const attr = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? match[1] : "";
};

export function summarize(xmlByLabel) {
  const labels = Object.keys(xmlByLabel).sort();

  if (labels.length === 0) {
    return "No collections were run.\n";
  }

  const rows = labels.map((label) => {
    const suites = xmlByLabel[label].match(TESTSUITE) || [];

    let assertions = 0;
    let failures = 0;

    for (const suite of suites) {
      assertions += Number(attr(suite, "tests") || 0);
      failures += Number(attr(suite, "failures") || 0);
      failures += Number(attr(suite, "errors") || 0);
    }

    return { label, assertions, failures };
  });

  const totalFailures = rows.reduce((sum, row) => sum + row.failures, 0);

  const lines = [
    "| Collection | Assertions | Failures | Result |",
    "| --- | ---: | ---: | --- |",
    ...rows.map(
      (row) =>
        `| ${row.label} | ${row.assertions} | ${row.failures} | ${row.failures === 0 ? "✅ Pass" : "❌ Fail"} |`
    ),
    "",
    totalFailures === 0
      ? `**All ${rows.length} collections passed.**`
      : `**${totalFailures} assertion failure(s) across ${rows.filter((r) => r.failures > 0).length} collection(s).**`,
    ""
  ];

  return lines.join("\n");
}

async function main() {
  const reportDir = process.argv[2] || "reports";
  const entries = await readdir(reportDir);
  const xmlByLabel = {};

  for (const entry of entries.filter((e) => e.endsWith(".xml"))) {
    xmlByLabel[path.basename(entry, ".xml")] = await readFile(path.join(reportDir, entry), "utf8");
  }

  process.stdout.write(summarize(xmlByLabel));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
