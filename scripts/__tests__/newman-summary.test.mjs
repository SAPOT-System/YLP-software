import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize } from "../newman-summary.mjs";

const passing = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="SAPOT API - sync" tests="4">
  <testsuite name="Pull Remote Changes" tests="3" failures="0" errors="0" time="0.12"/>
  <testsuite name="Push Local Data" tests="3" failures="0" errors="0" time="0.08"/>
</testsuites>`;

const failing = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="SAPOT API - admin" tests="6">
  <testsuite name="Ban User" tests="3" failures="1" errors="0" time="0.20"/>
  <testsuite name="Get My Admin Info" tests="3" failures="0" errors="0" time="0.05"/>
</testsuites>`;

test("renders a row per collection with totals", () => {
  const output = summarize({ sync: passing });

  assert.match(output, /\| sync \| 6 \| 0 \| . Pass \|/);
});

test("marks a collection with failures as failing", () => {
  const output = summarize({ admin: failing });

  assert.match(output, /\| admin \| 6 \| 1 \| . Fail \|/);
});

test("counts errors as failures", () => {
  const errored = failing.replace('failures="1" errors="0"', 'failures="0" errors="2"');
  const output = summarize({ admin: errored });

  assert.match(output, /\| admin \| 6 \| 2 \| . Fail \|/);
});

test("sorts rows by label and emits a header", () => {
  const output = summarize({ sync: passing, admin: failing });
  const lines = output.trim().split("\n");

  assert.match(lines[0], /^\| Collection \|/);
  assert.ok(lines.findIndex((l) => l.startsWith("| admin ")) < lines.findIndex((l) => l.startsWith("| sync ")));
});

test("reports an empty run rather than throwing", () => {
  assert.match(summarize({}), /No collections were run/);
});
