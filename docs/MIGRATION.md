# Migrating 0.2 to 0.3

- Stop using underscore internals or monkey-patching guard methods. All state is in native private fields and public objects/prototypes are frozen. Read diagnostics through `getStatus()`.
- The constructor keeps its lifecycle API. Prefer `TamperGuard.protect()` for a local-only factory and separate `monitor`/`controller` handles; keep the controller private.
- The factory enables `watchMutations` and `watchStyles`. Legitimate temporary DOM changes can now produce `mutation` events even when final markup matches. Wrap approved synchronous changes in `controller.update()` or accept a narrowly scoped framework commit explicitly.
- Selected API replacement emits `environment` by default. If an integration legitimately replaces an audited API, initialize the guard after that integration. Disabling `watchEnvironment` reduces coverage.
- Add handling for `mutation`, `environment`, `visibility` and `overflow` violation types; one operation may produce multiple types. Counts are diagnostic, not one event per attack.
- Sealing is explicit and permanent for the instance. It blocks stop/destroy/rebaseline/update, and makes a truthy callback unable to suppress lock mode. Do not seal lifecycle-managed SPA components.
- `watchVisibility` is opt-in; measure false positives and layout costs before enabling it.
- Requires modern ES2022 support for native private fields and static class fields. Use the tested pinned 0.3.0 artifacts, not an overwritten older release.

Read [local hardening](HARDENING.md) for the recommended module pattern and residual bypasses.

# Migrating 0.1 to 0.2

This is a breaking pre-1.0 release.

1. **Default reaction is report.** Set `mode: 'lock'` only if deleting the document and losing unsaved work is intentional.
2. **No default extension exclusions.** Translation/extension markup can now trigger detection. Start in report mode, inspect real behavior, and explicitly configure accepted exclusions. Do not copy the old broad `[data-gramm]` exclusion without accepting its bypass implications.
3. **Continuous report/silent monitoring.** `status: 'tampered'` no longer implies monitoring stopped. Check `active`. The same unchanged anomaly is deduplicated; different anomalous states continue to report.
4. **Silent means no telemetry.** `reportUrl` is ignored in silent mode, while events/callbacks still run.
5. **Form properties, ancestors and open shadow content are checked by default.** Disable individual options only if their reduced coverage fits your application.
6. **Full page URLs are removed from violation details.** Use `origin`, `targetId`, `type`, `reason`, `selector`, and `at`. Update collectors to parse the JSON text body and recognize the new violation types.
7. **Rebaseline retargets replacements.** It preserves active/stopped state. Restart a stopped guard with `start()`. `start()` is idempotent while active and does not accept pending changes.
8. **Use destroy for terminal cleanup.** Stop leaves a lock wall visible but ends repairs. Destroy removes the wall without recovering deleted application content. Locked/destroyed instances cannot restart.
9. **Options are immutable and validated.** Unknown keys, malformed types, invalid selectors at startup, and non-HTTP report endpoints fail explicitly.
10. **Both CommonJS forms work.** ESM and CommonJS now have separate declaration entry points for NodeNext. The legacy `types/index.d.ts` remains for older tooling.

There are no iframe-derived API claims or hash-collision assumptions. Captured live APIs only protect against later replacement of those global function references. Pin version 0.2.0 when distributing the changed behavior; do not overwrite an existing published 0.1 build.
