# TamperGuard

[![Verify](https://github.com/asaleh123/tamperguard/actions/workflows/ci.yml/badge.svg)](https://github.com/asaleh123/tamperguard/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/tamperguard)](https://www.npmjs.com/package/tamperguard)
[![license](https://img.shields.io/npm/l/tamperguard)](LICENSE)

A small, zero-dependency monitor that notices when selected parts of a web page change unexpectedly, and tells you. **Reporting is the default.** Locking the page is an explicit, opt-in reaction.

TamperGuard is a **first layer**: a local tamper signal and deterrent, not a security boundary. Anyone who controls the browser can turn it off. Keep real validation (prices, permissions, transactions) on your server.

| Good for | Not for |
| --- | --- |
| Noticing casual edits such as "Inspect element → change the price → screenshot" | Proving a screenshot is authentic |
| Flagging injected overlays, swapped text or hidden content in a region you choose | Stopping a determined user, a debugger or a browser extension with full access |
| Diagnostics: "what changed this DOM region, and when?" | Authorizing payments, scores or account changes |
| Demonstrating and teaching client-side tampering | Replacing CSP, SRI or server-side checks |

It runs entirely in the page, needs no backend, and sends nothing over the network unless you configure a `reportUrl`.

## Install

```sh
npm install tamperguard
```

```js
import TamperGuard from 'tamperguard';
// CommonJS also works: const TamperGuard = require('tamperguard');

const guard = new TamperGuard({
  selector: '[data-guard]',
  mode: 'report',
  onTamper(detail) {
    console.log(detail.type, detail.reason, detail.targetId);
  }
}).start();
```

```html
<section data-guard>
  <h2>Example price</h2>
  <strong>$1,299.00</strong>
</section>
```

Without a bundler, load the browser build (it defines a global `TamperGuard`) and start once the protected DOM exists:

```html
<script src="https://cdn.jsdelivr.net/npm/tamperguard@0.3.0/dist/tamperguard.min.js"
        integrity="sha384-REPLACE-WITH-VALUE-FROM-dist/integrity.json"
        crossorigin="anonymous" defer></script>
<script type="module">
  // Module scripts run after parsing, so the guarded elements exist.
  const guard = new TamperGuard({ selector: '[data-guard]' }).start();
</script>
```

Always pin an exact version on a CDN. Copy the `integrity` value for that version from `dist/integrity.json` in the package, which lists the size and SHA-384 hash of each build. Self-hosting `dist/tamperguard.min.js` works the same way.

The package supports ESM, CommonJS, a browser global, and TypeScript (NodeNext). Importing or constructing it during SSR is safe; `start()` needs a live browser document.

## Before you deploy

TamperGuard cannot tell a benign change from a malicious one, so most surprises come from your own page. Go through this list in **report mode** before turning on lock mode.

1. **Start after third-party scripts.** By default the guard records selected browser APIs at start and reports an `environment` violation if one is replaced later. Error-monitoring, analytics and session-replay SDKs often wrap APIs such as `addEventListener`, `setInterval` or input value setters. Initialize those first, then start the guard, or set `watchEnvironment: false`. Detection keeps running after an `environment` violation, but `rebaseline()` and `update()` refuse to accept a new baseline until the APIs are restored. To recover, `destroy()` the guard and start a new one.
2. **Check `<html>` and `<body>` attributes.** Ancestor attribute changes count as tampering (`watchAncestors: true`), because hiding a region through its parent is a common trick. Modals that add `overflow: hidden` to `<body>`, dark-mode classes on `<html>`, and language switches all trigger it. If your app does this, set `watchAncestors: false`. Moving or replacing the region is still detected.
3. **Guard small, static regions.** Typing in a guarded form field counts as a change. Choose stable selectors (IDs or `data-*` markers), not `:hover` or `:focus`.
4. **Accept your own changes explicitly.** Wrap approved DOM updates in `update()` or call `rebaseline()` after a known commit. See [framework integration](docs/FRAMEWORKS.md) for React and Vue.
5. **Lock mode erases the page.** Unsaved work is lost and a refresh is required. Measure false positives with real users' extensions, translation, autofill and themes first.

Read the [coverage matrix](docs/COVERAGE.md) for exactly what is and is not detected, and [SECURITY.md](SECURITY.md) for the threat model.

## Hardened local integration

Use `TamperGuard.protect()` for separate frozen monitor/controller handles, mutation-history checks and stylesheet inspection. Keep the controller in module scope; share only the monitor. The factory rejects a telemetry endpoint.

```js
const { monitor, controller } = TamperGuard.protect({ mode: 'report' });
console.log(monitor.getStatus());
// For a static screen only: controller.seal();
```

`seal()` permanently blocks stop, destroy and baseline acceptance on that instance until reload. It does not enable lock mode by itself. For the sealed lock example, tradeoffs and bypass boundaries, read [local hardening](docs/HARDENING.md). Native private state and frozen public objects protect ordinary property access; they cannot defeat privileged debugging or script blocking.

## Detection and behavior

- Observes text, attributes, children, target removal/replacement, target-set changes, movement through ancestors, and ancestor attributes.
- Preserves significant whitespace; snapshots without cloning custom elements or using collision-prone hashes.
- Checks input, textarea, select, and option state. User input inside a guarded region triggers a check; programmatic changes rely on a sweep or `check()`.
- Traverses open shadow roots inside guarded targets. A known closed shadow root may be supplied as an explicit `root`.
- Optionally checks readable stylesheet rules, disabled/media state, imports, and adopted stylesheets.
- Optionally inspects mutation history, including edit-and-restore and identical-markup replacements; enabled by `protect()`.
- Audits selected browser API descriptors for post-start replacement by default, and keeps inspecting content afterwards. Optional visibility sampling detects some external overlays.
- Uses mutation records to resnapshot affected regions; nested selected targets are covered once. Periodic checks remain a full backstop.
- Continues reporting changed anomalous states without accepting them as a new trusted baseline. An unchanged anomaly is not emitted on every sweep.

A `targets` violation means the original set was removed, replaced, reordered, or expanded. Replacement targets are **not automatically trusted or continuously content-baselined**. Restore the original elements or explicitly accept the new set with `rebaseline()`.

Detection runs after DOM mutation delivery or on a timer, not before a script executes. Pixel-only changes and inaccessible browser state remain outside coverage. Strict mutation history covers observed transient DOM changes; restored property/CSSOM changes can still be missed. Visibility sampling covers some overlays, not all visual changes.

## Options

| Option | Default | Behavior |
| --- | --- | --- |
| `selector` | `'[data-guard]'` | CSS selector within `root`; includes `root` itself when it is a matching element. |
| `root` | current `document` | `Document`, `Element`, or a known `ShadowRoot`. No automatic iframe traversal. |
| `mode` | `'report'` | `report`: events/callback plus optional telemetry. `silent`: events/callback, never telemetry. `lock`: telemetry plus destructive lock unless suppressed on an unsealed guard. |
| `interval` | `1000` | Sweep interval in ms. `0` disables sweeps; property, CSSOM, newly attached shadow roots, and template changes then require events or manual checks. |
| `watchMutations` | `false` | Inspect queued mutation history, including restored edits. Enabled by `protect()`. |
| `watchVisibility` | `false` | Compare display/visibility/opacity and five occlusion samples. May cause false positives and layout work. |
| `watchEnvironment` | `true` | Audit selected API descriptors; report replacement and reject baseline acceptance while they differ. See [Before you deploy](#before-you-deploy). |
| `watchStyles` | `false` | Inspect accessible stylesheets across the document and known shadow roots. This is intentionally broader than the selected content. |
| `watchProperties` | `true` | Include live form state. Normal typing in protected fields will be a change. |
| `watchShadowDOM` | `true` | Inspect open shadow content inside selected regions. |
| `watchAncestors` | `true` | Detect ancestor attribute changes, including theme/language/visibility changes on `<html>` and `<body>`. Turn off if your app changes those legitimately. |
| `guardWholeDocument` | `false` | Fall back to the owning document's body if there are no matches. Independent of the scope of `root`; use carefully. |
| `ignoreSelectors` | `[]` | Exclude matching descendants and their entire subtrees. Does not exclude a target root itself. |
| `ignoreAttributes` | `[]` | Explicitly exclude named attributes everywhere, including inside targets. |
| `ignoreAttributePrefixes` | `[]` | Explicitly exclude attribute-name prefixes. |
| `reportUrl` | `null` | HTTP(S) collector endpoint. No network telemetry without one. |
| `maxReportsPerMinute` | `20` | Per-instance rolling network-attempt cap. `0` disables network reports. Local events are not rate-limited. |
| `onTamper` | `null` | Receives a frozen detail object. Truthy return suppresses the built-in lock only when unsealed. Does not suppress events, reporting, or accept a baseline. |
| `message` | refresh instruction | Plain text shown on the lock screen. |

These defaults describe the constructor; `protect()` also defaults `watchStyles` and `watchMutations` to true.

Options are validated and copied; the public options object and ignore arrays are frozen. Unknown option names throw. Create a new instance to change configuration. No browser extension gets an automatic trust exemption. An attacker can imitate any ignored selector or attribute, and legitimate extensions can cause real changes.

## Lifecycle and approved changes

```js
guard.start();                   // idempotent while active
guard.check();                   // synchronous full check
guard.update(() => {             // synchronous approved mutation
  document.querySelector('[data-guard] strong').textContent = '$999.00';
});
guard.rebaseline();              // explicitly accept current targets/state
guard.getStatus();               // status, active, targets, diagnostic counters
guard.stop();                    // stop observers, listeners, sweeps, wall healing
guard.start();                   // restart with a fresh baseline
guard.destroy();                 // terminal cleanup; removes own wall if any
```

`update()` checks pending changes first and refuses to run while the guard is `tampered`; resolve the violation and explicitly rebaseline before proceeding. Otherwise it accepts the synchronous callback's final state. It rejects async callbacks and Promise returns. If the callback throws, partial changes are checked against the previous baseline. Do not hide application errors or use an async function with this API.

`rebaseline()` discovers replacement targets and rebuilds observation. It retains the current active/stopped state. It does not resume a stopped guard. Starting with zero matches is observable through `getStatus().targets === 0`; later matching elements produce a target-set violation.

Report/silent violations set status to `tampered` while `active` remains true. `rebaseline()` changes an active guard back to `watching`. Locking is terminal for that instance; refresh restores the application. `destroy()` is idempotent when unsealed. Sealed guards reject destroy, stop, update and rebaseline. Multiple lock guards from the same library instance share one wall owner. Avoid loading multiple independent copies of the library on one page.

## Events and telemetry

```js
window.addEventListener('tamperguard:violation', ({ detail }) => {
  // { type, reason, targetId, selector, origin, at }
});
// Also: tamperguard:ready { targets }, tamperguard:lock { message }
```

Types are `content`, `structure`, `targets`, `style`, `mutation`, `environment`, `visibility`, `overflow`, and `error`. Target IDs are local to an instance and are diagnostic identifiers, not authentication tokens. A single operation can cause multiple distinct violation types. Callback exceptions are counted without breaking observation.

The network body is JSON sent as `text/plain;charset=UTF-8` to avoid a JSON-content-type CORS preflight. A rejected/throwing `sendBeacon()` falls back to keepalive fetch; fetch rejections and non-OK responses are counted. Beacon acceptance means queued, **not delivered**. There is no delivery guarantee or retry queue. The endpoint must parse the JSON body, validate its shape, limit requests, and treat all client reports as untrusted.

Payloads contain no DOM text, input values, full page URL, path, query, or fragment. Your configured selector can still contain sensitive information. Browser-level cookies and referrer policy remain relevant: beacon uses browser policy; fetch explicitly sets `referrerPolicy: 'no-referrer'` and same-origin credentials. Set an appropriate page `Referrer-Policy` and collector retention policy. Baselines do contain guarded text/form state in browser memory until replaced or destroyed.

## Lock mode

Locking erases the document, including unsaved work. It creates an accessible alert dialog using DOM construction, without `innerHTML`, `eval`, a Trusted Types policy, or an iframe. The wall repairs document/body/host removal and host attribute changes while active. Repairs triggered by other scripts are rate-limited so a script that keeps re-inserting its own element cannot freeze the tab; a one-second timer keeps repairing. Its closed shadow root provides style isolation, not a security boundary. On an unsealed guard, `stop()` leaves the visible wall but stops repairs; `destroy()` removes it without restoring the erased page.

## Browser support

Requires ES2022 (native private fields and `Object.hasOwn`): Chrome/Edge 93+, Firefox 92+, Safari 15.4+. Every release is tested on current Chromium, Firefox and WebKit through Playwright. Playwright WebKit is not a substitute for testing on physical Safari/iOS devices.

## Try the demos

```sh
git clone https://github.com/asaleh123/tamperguard.git
cd tamperguard
npm ci
npm run build
npm run serve
```

Open **http://127.0.0.1:8080/demos/**. The playground, attack matrix, hardened demo and React/Vue examples use locally built assets and make no CDN requests.

## Verification and performance

```sh
npx playwright install chromium firefox webkit
npm run check          # build, Node/package contracts, types, three browser engines
npm run pack:check     # pack and install into a clean temporary consumer
npm run benchmark      # reproducible synthetic measurements
```

CI runs the same checks on every push and pull request. The browser suite covers private-state and sealed-controller resistance, transient mutation history, API replacement, optional occlusion sampling, detection, intentionally excluded cases, lifecycle, reporting failures, CSP/Trusted Types, and offline demos. See [verification results](docs/VERIFICATION.md), [performance methodology](docs/PERFORMANCE.md), and the [release checklist](docs/RELEASING.md).

## Positioning and prior work

DOM monitoring is established prior art. [DOMtegrity](https://github.com/toreini/DOMtegrity) explores a different, server-assisted protocol and threat model. [disable-devtool](https://github.com/theajack/disable-devtool) focuses on restricting developer tools. TamperGuard's focus is a small, inspectable, scoped monitor with lifecycle control, explicit acceptance, and reproducible browser tests. It does not claim to supersede those systems or defeat browser owners.

## Contributing and security

Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). Each behavior change needs a regression test and a precise statement of coverage. Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), not in public issues.

[MIT](LICENSE) © asaleh123
