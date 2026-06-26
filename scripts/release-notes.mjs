import { execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

export function previousTag(component, tag) {
  try {
    return execSync(`git describe --tags --abbrev=0 --match "${component}/v*" "${tag}^"`, { stdio: "pipe" })
      .toString().trim();
  } catch {
    return "";
  }
}

const COMPONENT_PATHS = {
  server: "server/",
  mobile: "mobile-app/",
};

export function buildCommitContext(component, tag) {
  const prev = previousTag(component, tag);
  // The tag doesn't exist yet when notes are generated, so use HEAD as the end ref.
  const range = prev ? `${prev}..HEAD` : "HEAD";
  // Scope to the component's directory so unrelated commits are excluded.
  const path = COMPONENT_PATHS[component] ?? "";
  const pathFilter = path ? ` -- ${path}` : "";
  const log = execSync(`git log ${range} --pretty=format:%s${pathFilter}`).toString();
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

// Manual-fill fallback: a blank structured draft with commits listed for reference.
export function renderTemplate(_template, tag, commits) {
  const component = tag.startsWith("mobile/") ? "Mobile" : "Server";
  const statusMatch = tag.match(/-(alpha|beta|rc)\./i);
  const status = statusMatch
    ? statusMatch[1].charAt(0).toUpperCase() + statusMatch[1].slice(1)
    : "Beta";
  return [
    `# ${tag}`,
    "",
    `**Component:** ${component}`,
    "",
    `**Status:** ${status}`,
    "",
    "<!-- Fill in the sections below. Delete empty ones before publishing. -->",
    "",
    "## ✨ Added",
    "- ",
    "",
    "## 🐛 Fixed",
    "- ",
    "",
    "## 📝 Notes",
    "- Intended for testing only.",
    "- Feedback is appreciated.",
    "",
    "<!-- Commits since the previous tag (for reference — delete before publishing):",
    ...commits.map((c) => `  - ${c}`),
    "-->",
    "",
  ].join("\n");
}

function claudeCliAvailable() {
  const result = spawnSync("which", ["claude"], { stdio: "pipe" });
  return result.status === 0;
}

export async function generateNotes(tag, component) {
  const template = readFileSync(join(HERE, "release-notes-prompt.md"), "utf8");
  const { commits } = buildCommitContext(component, tag);
  if (claudeCliAvailable()) {
    try {
      const prompt = buildPrompt(template, tag, commits);
      const result = spawnSync("claude", ["-p", prompt], { stdio: "pipe", encoding: "utf8" });
      if (result.status === 0 && result.stdout?.trim()) {
        return result.stdout.trim() + "\n";
      }
      if (result.stderr) console.error(`claude CLI: ${result.stderr.trim()}`);
    } catch (err) {
      console.error(`claude CLI unavailable (${err.message}); using the manual template.`);
    }
  }
  return renderTemplate(template, tag, commits);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , component, tag] = process.argv;
  generateNotes(tag, component)
    .then((notes) => process.stdout.write(notes))
    .catch((err) => { console.error(err); process.exit(1); });
}
