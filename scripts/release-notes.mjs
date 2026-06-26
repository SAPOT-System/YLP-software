import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MODEL = "claude-sonnet-4-6";

export function previousTag(component, tag) {
  try {
    return execSync(`git describe --tags --abbrev=0 --match "${component}/v*" "${tag}^"`)
      .toString().trim();
  } catch {
    return "";
  }
}

export function buildCommitContext(component, tag) {
  const prev = previousTag(component, tag);
  const range = prev ? `${prev}..${tag}` : tag;
  const log = execSync(`git log ${range} --pretty=format:%s`).toString();
  return { previousTag: prev, commits: log.split("\n").filter(Boolean) };
}

export function buildPrompt(template, tag, commits) {
  return [
    template.trim(),
    "",
    `Tag to release: ${tag}`,
    "",
    "Commits since the previous tag for this component:",
    ...commits.map((c) => `- ${c}`),
  ].join("\n");
}

// Manual-fill fallback: the template with the tag filled in and commits for reference.
export function renderTemplate(template, tag, commits) {
  const filled = template.trim().replace(/<TAG_NAME>/g, tag);
  return [
    filled,
    "",
    "<!-- Commits since the previous tag (for reference — delete before publishing):",
    ...commits.map((c) => `  - ${c}`),
    "-->",
    "",
  ].join("\n");
}

export async function generateNotes(tag, component, { apiKey } = {}) {
  const template = readFileSync(join(HERE, "release-notes-prompt.md"), "utf8");
  const { commits } = buildCommitContext(component, tag);
  if (apiKey) {
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        messages: [{ role: "user", content: buildPrompt(template, tag, commits) }],
      });
      const text = response.content.find((b) => b.type === "text");
      if (text?.text?.trim()) return text.text.trim() + "\n";
    } catch (err) {
      console.error(`Claude unavailable (${err.message}); using the manual template.`);
    }
  }
  return renderTemplate(template, tag, commits);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , component, tag] = process.argv;
  generateNotes(tag, component, { apiKey: process.env.ANTHROPIC_API_KEY })
    .then((notes) => process.stdout.write(notes))
    .catch((err) => { console.error(err); process.exit(1); });
}
