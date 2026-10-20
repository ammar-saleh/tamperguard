# Security model

TamperGuard is an observation library running inside the page it observes. Its output is not attestation, authorization, proof of a transaction, or evidence that a screenshot is authentic.

## Assumptions

The application deliberately chooses a trustworthy baseline after loading the intended content. JavaScript remains enabled and the browser delivers mutation callbacks or timers. The library and relevant browser APIs have not already been replaced. Developers explicitly decide which legitimate changes to accept.

Native private fields, frozen public objects, separate monitor/controller handles, captured observer/timer/lock DOM methods, and selected API descriptor audits resist ordinary post-start modification. Sealing blocks lifecycle and baseline-acceptance operations on that instance. These measures do not stop pre-start compromise, privileged extensions/debuggers, local overrides, script blocking, all prototype or per-node overrides, or runtime control. Private state is not a secret from the browser owner. See [local hardening](docs/HARDENING.md).

## What a violation means

An inspected state differs from the baseline in a covered dimension. It does not establish who changed it, whether the change was malicious, whether executable content already ran, or whether any backend data changed. A lack of violations is not proof of integrity. Telemetry can be blocked, forged, replayed, or dropped. An unchanged anomalous state is deduplicated; later different anomalies continue to be reported.

With `watchMutations`, recorded transient DOM changes are inspected even after restoration. Property/CSSOM changes restored between sweeps, unobserved fragments and inaccessible roots can still be missed. It cannot inspect pixels, OS rendering, inaccessible shadow trees, cross-origin frame contents, inaccessible stylesheet rules, browser user styles, or remote bytes behind an unchanged image/font/media URL. Optional visibility sampling detects some sibling overlays; it is not a pixel audit and misses pointer-transparent overlays and unsampled areas. See [COVERAGE.md](docs/COVERAGE.md).

## Integration hazards

- Keep permission, price, score, account and transaction validation on the server. For shareable evidence, provide an authenticated verification URL backed by canonical server records; a client-side badge is not proof.
- Use a strict CSP, safe DOM construction, and SRI for pinned external scripts where appropriate. This library does not replace those controls.
- Start in report mode. Translation, autofill, themes, screen-reader tooling, extensions, and application re-renders can cause legitimate changes. Test with your users' workflows.
- Ignore rules intentionally create blind spots. Never infer extension authenticity from an element name or `data-*` attribute.
- Keep a factory controller private, and share only the monitor. Seal only static screens that need no cleanup or approved updates; sealing prevents stop/destroy/rebaseline/update until reload.
- `update()` and `rebaseline()` accept the current state. There is no cryptographic distinction between your authorized code and other code executing in the same page. Avoid broad or automatic acceptance.
- Lock mode erases the document and unsaved work. Closed shadow DOM isolates styles; it does not deny access to browser owners or privileged tooling. A lock may still be bypassed.
- Baselines retain selected DOM text and live form values in memory. Prefer static regions and avoid selecting passwords or other sensitive inputs. Network bodies exclude those values, but configuration such as a selector can itself contain sensitive text.
- A collector must validate input, limit requests and storage, account for missing reports, and avoid automatic punitive actions based only on a client report. `maxReportsPerMinute` is a local convenience, not a backend abuse control.
- Beacon uses browser credential/referrer policy. Set a suitable `Referrer-Policy` on the page and use a trusted endpoint. `reports` counts queued/attempted sends, not confirmed delivery.

## Reporting a problem

For reproducible implementation defects, include the library version, browser/version, options, minimal HTML, expected coverage, and observed behavior. Do not include real credentials or personal DOM content.

Before the public repository is established, report privately to the project owner through the channel where the package was obtained. After publication, use the repository's private vulnerability reporting feature if enabled. Do not assume an unconfigured issue tracker or address is monitored.

This release is locally regression-tested; it has not received an independent security audit. Known browser-control limitations are design boundaries rather than claims of an unfixable server-side vulnerability.
