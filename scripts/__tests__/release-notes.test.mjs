import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, renderTemplate } from "../release-notes.mjs";

test("buildPrompt embeds template, tag, and commit bullets", () => {
  const out = buildPrompt("TEMPLATE_BODY", "mobile/v1.2.0", [
    "feat(call): add mute button",
    "fix(chat): stop dupes",
  ]);
  assert.match(out, /TEMPLATE_BODY/);
  assert.match(out, /mobile\/v1\.2\.0/);
  assert.match(out, /- feat\(call\): add mute button/);
  assert.match(out, /- fix\(chat\): stop dupes/);
});

test("renderTemplate fills the tag and lists commits for reference", () => {
  const out = renderTemplate("# <TAG_NAME>\n\n## ✨ Added\n- ...", "server/v0.8.0", [
    "feat(api): add endpoint",
  ]);
  assert.match(out, /# server\/v0\.8\.0/);
  assert.ok(!out.includes("<TAG_NAME>"));
  assert.match(out, /<!-- Commits since the previous tag/);
  assert.match(out, /- feat\(api\): add endpoint/);
});
