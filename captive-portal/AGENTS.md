# AGENTS.md — captive-portal

Static WISPr-compliant hotspot login pages, served directly by the MikroTik router (not by `server/` or any app server). See the root `AGENTS.md` for repo-wide conventions.

## Development Workflow

No build tooling, no package manager, no dependencies — plain HTML/CSS/JS files (`login.html`, `logout.html`, `status.html`, `redirect.html`, `error.html`, `alogin.html`, `rlogin.html`, `radvert.html`, etc.) plus `css/style.css`, `img/*.svg`, and `md5.js`. Edit files directly; there is no dev server for this directory — the pages are only meaningful when uploaded to the MikroTik router's hotspot file store.

## Build

None.

## Test

None. Verification requires an actual MikroTik hotspot session (connect a device to the router, trigger the captive-portal redirect) — flag to the user that a change here can't be validated without that hardware/network setup.

## Lint / Format

None configured.

## Framework Expectations

- `api.json` uses **RouterOS template syntax** (`$(...)` placeholders filled in by the router at request time) — it is not standalone valid JSON. Don't "fix" it to be parseable JSON; that would break the router's templating.
- `xml/WISPAccessGatewayParam.xsd` and the `xml/*.html` variants implement the WISPr protocol spec — changes here must stay spec-compliant, not just visually correct.
- These pages are served by the router, not by `server/` — don't add fetches expecting a Node/Python backend behind this directory.

## Do Not Edit Manually

- `xml/WISPAccessGatewayParam.xsd` — a standard WISPr schema; only change if you're intentionally deviating from the spec.

## Common Pitfalls

- Assuming there's a build step or bundler — there isn't; these are the literal files uploaded to the router.
- Breaking RouterOS `$(...)` template variables by treating `api.json` as plain JSON.
- Forgetting that `status-old.html` and other legacy-named files may be intentionally kept for rollback — don't delete without asking.

## Validation Checklist

- [ ] `api.json` still contains valid RouterOS template syntax, not broken by edits
- [ ] Changed pages still work as plain static HTML/CSS/JS (no assumed backend, no build step)
- [ ] If a real hotspot session can't be used to verify, this limitation is stated explicitly rather than claiming the change was tested
