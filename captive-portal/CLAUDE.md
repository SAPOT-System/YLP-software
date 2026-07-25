# CLAUDE.md — captive-portal

Instructions for Claude Code working in `captive-portal/` — static hotspot login pages served by the MikroTik router that provides SAPOT's LAN. See root `../CLAUDE.md` for repo-wide rules.

## Project Overview

Static HTML/CSS/JS pages shown to a device joining the SAPOT LAN via a MikroTik RouterOS Hotspot. No backend, no build step, no source code beyond markup/styling/a small client-side hashing script — this directory is deployed as-is to the router's hotspot file storage.

## Architecture

RouterOS interprets `$(...)` template syntax **on the router itself** at serve time — there is no app code in this repo that resolves these variables (e.g. `api.json`'s `$(if logged-in == 'yes')false$(else)true$(endif)`, `$(link-login-only)`). Do not expect these files to render correctly in a plain browser preview; the tokens only resolve when served by RouterOS.

Two parallel page sets exist for two RouterOS hotspot modes: the root-level `.html` files (standard/CHAP flow) and `xml/` (XML-templated variant for the WISPr/alternate hotspot mode — see the bundled `WISPAccessGatewayParam.xsd`). `md5.js` implements CHAP-style password hashing client-side to match RouterOS's login challenge.

## Directory Guide

- Root `.html` files — primary hotspot pages: `login.html` (standard login), `alogin.html` (advertisement-gated login), `rlogin.html` (RADIUS login), `logout.html`, `error.html`, `status.html`/`status-old.html`, `redirect.html`, `debug.html`, `downloads.html`.
- `xml/` — WISPr/XML-templated variant of the same page set, plus `WISPAccessGatewayParam.xsd` (the schema RouterOS validates against in that mode).
- `css/`, `img/` — shared styling and assets across both page sets.
- `errors.txt` — RouterOS internal error-code-to-message mapping.
- `api.json` — RouterOS hotspot status API template (session time/bytes remaining, login state).
- `md5.js` — client-side CHAP password hashing to match RouterOS's login challenge.

## Key Concepts

- All dynamic behavior comes from RouterOS's `$(...)` variable substitution — there is nothing to "run" or test locally without a RouterOS hotspot (or its documentation for what a given token expands to).
- Two page sets (root vs. `xml/`) correspond to two different RouterOS hotspot configurations, not two versions of the same thing — which one RouterOS actually serves depends on the router's hotspot-mode config, not on anything in this repo.

## Development Conventions

- Keep the root `.html` and `xml/` page sets in sync when changing copy/branding — a router configured for the other mode will otherwise show stale content.
- Don't introduce a build step or framework here — this is deployed as flat files to RouterOS's file storage.

## Common Pitfalls

- Treating `$(...)` tokens as broken/unresolved template syntax to "fix" — they're intentional RouterOS server-side variables, not a bug.
- Changing `errors.txt` without checking whether the corresponding RouterOS error code handling elsewhere still matches.
- Editing only the root `.html` set and forgetting the `xml/` mirror (or vice versa).

## When Modifying This Project

- Login flow changes: verify `md5.js`'s hashing still matches the challenge/response RouterOS expects — a mismatch fails login silently from the user's perspective.
- Branding/copy changes: mirror in both the root and `xml/` page sets.
