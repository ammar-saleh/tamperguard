# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-19

First public preview.

### Added
- Core `TamperGuard` integrity monitor (zero dependencies, fully offline).
- Detection of content tampering: edited text, changed attributes, injected or
  removed nodes, and inline-style changes in guarded regions.
- Optional `watchStyles` mode to detect same-origin stylesheet (CSS) edits.
- Three reaction modes: `lock` (self-healing full-page wall in a closed shadow
  root), `report` (beacon to `reportUrl`), and `silent` (callback only).
- Allowlist (`ignoreSelectors` / `ignoreAttributes` / `ignoreAttributePrefixes`)
  with sensible defaults so benign extensions (Grammarly, Dark Reader, …) don't
  cause false positives.
- Pristine browser-API capture to resist monkey-patching of `MutationObserver`
  and timers.
- Periodic integrity sweep as a backstop if the observer is disconnected.
- `rebaseline()` to accept intentional changes (framework re-renders).
- `window` events: `tamperguard:ready`, `tamperguard:violation`, `tamperguard:lock`.
- UMD + ESM builds, TypeScript types, plain-HTML / React / Vue demos, and an
  interactive "break-it" test page.

### Notes
- This is a client-side deterrent and signal, **not** a security boundary. It
  does not replace server-side validation. See the README's "Limitations".

> Before publishing: confirm the npm package name is available and update the
> `repository` / `homepage` URLs in `package.json` and `LICENSE` holder.
