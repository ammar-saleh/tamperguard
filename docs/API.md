# API reference

Options, lifecycle, events and lock mode. For what is and is not detected, see the [coverage matrix](COVERAGE.md).

## Options

| Option | Default | Behavior |
| --- | --- | --- |
| `selector` | `'[data-guard]'` | CSS selector within `root`; includes `root` itself when it is a matching element. |
| `root` | current `document` | `Document`, `Element`, or a known `ShadowRoot`. No automatic iframe traversal. |
| `mode` | `'report'` | `report`: events/callback plus optional telemetry. `silent`: events/callback, never telemetry. `lock`: telemetry plus destructive lock unless suppressed on an unsealed guard. |
| `interval` | `1000` | Sweep interval in ms. `0` disables sweeps; property, CSSOM, newly attached shadow roots, and template changes then require events or manual checks. |
| `watchMutations` | `false` | Inspect queued mutation history, including restored edits. Enabled by `protect()`. |
| `watchVisibility` | `false` | Compare display/visibility/opacity and five occlusion samples. May cause false positives and layout work. |
| `watchEnvironment` | `true` | Audit selected API descriptors; report replacement and reject baseline acceptance while they differ. See [Before you deploy](../README.md#before-you-deploy). |
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
