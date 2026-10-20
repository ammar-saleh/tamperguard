# Changelog

## 0.3.0 - 2026-10-19

Local hardening release; no server requirement or browser-owner protection claim.

- Native private state, frozen instances/class/prototype, and local-only `protect()` with separate monitor/controller handles.
- Permanent `seal()` rejects stop, destroy, update and rebaseline; sealed lock mode cannot be suppressed by callback returns.
- Optional strict mutation history detects restored observed DOM edits and same-markup replacements; enabled by the factory.
- Bounded mutation record processing with explicit overflow violations; pending records are checked before approved updates.
- Default selected browser API audit, captured observer operations and lock rendering methods.
- Optional five-point visibility/occlusion sampling, with documented coverage and performance limits.
- Hardened static demo, private framework controllers, expanded three-engine adversarial tests and benchmarks for three profiles.
- Updated TypeScript declarations, package metadata, hardening/migration/security documentation and reproducible release artifacts.

Breaking: underscore internals no longer exist, public properties cannot be reassigned, and API replacement now produces environment violations by default. Sealing is opt-in; ordinary constructor defaults retain snapshot-only history and disabled stylesheet checks.

## 0.2.0 - 2026-10-19

Breaking reliability and packaging release. No claim of protection against an attacker-controlled browser.

### Changed

- Default reaction is report; silent never sends telemetry.
- Removed implicit extension trust exemptions. Ignore rules are explicit configuration.
- Exact, iterative snapshots replace cloning, whitespace normalization, and 32-bit hashes.
- Reports continue after violations and deduplicate unchanged anomalous states.
- Frozen, validated options; report payload now uses origin instead of a full URL.
- Public status includes active state, lock/destroy states, and diagnostic counters.

### Added

- Detection of target replacement/removal/set changes, ancestor changes, live form state, open shadow content, adopted/disabled/media stylesheet changes.
- Synchronous update transactions, retargeting rebaseline, terminal destroy, page-resume checks.
- Targeted mutation scans and nested-region deduplication.
- Reporting caps, beacon refusal fallback, caught network errors.
- DOM-built lock screen with accessibility labels and body/document repair; shared wall ownership.
- Three-engine browser regression suite, types/package checks, CI, reproducible benchmarks, consumer tarball verification.
- Minified distribution, SHA-384 integrity manifest, ESM/CommonJS-specific declarations.
- Offline React/Vue demos with lifecycle cleanup and approved-commit examples.
- Coverage, migration, threat model, performance, contribution, and release documentation.

### Fixed

- Detached-iframe timers never firing in Chrome.
- Guarding stale detached nodes without reporting root replacement.
- Ignored extension attributes hiding arbitrary injected content.
- Significant whitespace changes disappearing during normalization.
- Report mode stopping permanently after its first violation.
- Lock repair crashing when body is removed.
- CommonJS named import not matching documented behavior.
- Repeated starts leaking observers and sweeps.
- Demo server path containment and unrestricted-interface binding.

## 0.1.0 - 2026-10-19

Initial local preview: scoped HTML hashing, MutationObserver and sweep design, report/lock/silent modes, extension ignore defaults, UMD/ESM packaging, declarations, demos, and eight interactive checks. Superseded by 0.2.0; see migration notes before upgrading.
