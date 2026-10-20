# Changelog

## 0.3.0 - unreleased

First public release. A local tamper signal with no server requirement and no claim of protection against the browser owner.

- Native private state, frozen instances/class/prototype, and local-only `protect()` with separate monitor/controller handles.
- Permanent `seal()` rejects stop, destroy, update and rebaseline; sealed lock mode cannot be suppressed by callback returns.
- Optional strict mutation history detects restored observed DOM edits and same-markup replacements; enabled by the factory.
- Bounded mutation record processing with explicit overflow violations; pending records are checked before approved updates.
- Default selected browser API audit, captured observer operations and lock rendering methods.
- Optional five-point visibility/occlusion sampling, with documented coverage and performance limits.
- Hardened static demo, private framework controllers, three-engine adversarial tests and benchmarks for three profiles.
- TypeScript declarations for ESM and CommonJS, SHA-384 integrity manifest, and security/coverage/hardening documentation.

### Fixed before release

- An `environment` violation (for example a monitoring SDK wrapping `addEventListener` after start) no longer stops all later checks. Content, structure and target changes keep being reported.
- The lock wall no longer freezes the tab when another script or extension keeps re-inserting its own element; observer-driven repairs are rate-limited and the one-second repair timer continues.
- Typing in form fields outside guarded regions no longer forces a full check on every keystroke.
- Builds normalize line endings, so bundles and SRI hashes are identical on Windows, macOS and Linux checkouts.
- Clearer error when a baseline cannot be accepted after an API replacement, including how to recover.

## Pre-release history

Versions 0.1.0 and 0.2.0 were local development milestones and were never published.

### 0.2.0 - 2026-10-19

Breaking reliability and packaging release. No claim of protection against an attacker-controlled browser.

#### Changed

- Default reaction is report; silent never sends telemetry.
- Removed implicit extension trust exemptions. Ignore rules are explicit configuration.
- Exact, iterative snapshots replace cloning, whitespace normalization, and 32-bit hashes.
- Reports continue after violations and deduplicate unchanged anomalous states.
- Frozen, validated options; report payload now uses origin instead of a full URL.
- Public status includes active state, lock/destroy states, and diagnostic counters.

#### Added

- Detection of target replacement/removal/set changes, ancestor changes, live form state, open shadow content, adopted/disabled/media stylesheet changes.
- Synchronous update transactions, retargeting rebaseline, terminal destroy, page-resume checks.
- Targeted mutation scans and nested-region deduplication.
- Reporting caps, beacon refusal fallback, caught network errors.
- DOM-built lock screen with accessibility labels and body/document repair; shared wall ownership.
- Three-engine browser regression suite, types/package checks, CI, reproducible benchmarks, consumer tarball verification.
- Minified distribution, SHA-384 integrity manifest, ESM/CommonJS-specific declarations.
- Offline React/Vue demos with lifecycle cleanup and approved-commit examples.
- Coverage, migration, threat model, performance, contribution, and release documentation.

#### Fixed

- Detached-iframe timers never firing in Chrome.
- Guarding stale detached nodes without reporting root replacement.
- Ignored extension attributes hiding arbitrary injected content.
- Significant whitespace changes disappearing during normalization.
- Report mode stopping permanently after its first violation.
- Lock repair crashing when body is removed.
- CommonJS named import not matching documented behavior.
- Repeated starts leaking observers and sweeps.
- Demo server path containment and unrestricted-interface binding.

### 0.1.0 - 2026-10-19

Initial local preview: scoped HTML hashing, MutationObserver and sweep design, report/lock/silent modes, extension ignore defaults, UMD/ESM packaging, declarations, demos, and eight interactive checks. Superseded by 0.2.0.
