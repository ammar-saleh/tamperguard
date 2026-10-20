# Local hardening

Version 0.3 separates observation from lifecycle control, uses native private fields, freezes its public objects and prototype, and checks selected browser APIs for post-start replacement. It needs no backend. These measures remove convenient page-level bypasses; they cannot establish trust against the browser owner.

## Recommended module integration

Initialize after the intended DOM and styles have stabilized. Keep the controller in application module scope. Share only the monitor when another component needs status.

```js
import TamperGuard from 'tamperguard';

const { monitor, controller } = TamperGuard.protect({
  selector: '[data-guard]',
  mode: 'report',
  interval: 1000,
  onTamper(detail) { console.log(detail.type, detail.reason); }
});

// Optional approved application change, before sealing:
controller.update(() => {
  document.querySelector('[data-guard] strong').textContent = '$999.00';
});
console.log(monitor.getStatus());
```

`protect()` starts immediately, enables mutation history and stylesheet inspection, and rejects a non-null `reportUrl`. Defaults also include environment, ancestor, form-property and open-shadow checks. There are no telemetry requests. The monitor exposes only `check()` and `getStatus()`; the controller exposes lifecycle and acceptance operations. Do not attach the controller to `window`, DOM nodes, or a publicly reachable application object. The ordinary constructor remains available, but sharing its instance also shares its lifecycle methods.

## Sealed static screens

For a screen that must not accept further application changes:

```js
const { monitor, controller } = TamperGuard.protect({
  mode: 'lock',
  interval: 250,
  watchVisibility: true
});
controller.seal();
```

Sealing requires an active, clean baseline with at least one target. It permanently rejects `stop()`, `destroy()`, `update()` and `rebaseline()` on that instance. There is no unseal method. A truthy callback return can no longer suppress lock mode. Reload/navigation resets the browsing context; browser control can still bypass the mechanism. Sealing does not change a report-mode guard into a lock-mode guard.

Lock mode erases the page and unsaved work. Its renderer uses captured DOM operations and repairs removal of the wall while callbacks and timers run. Use `demos/hardened/index.html` in the repository to try it. Do not seal framework components that need routing cleanup, approved updates or unmounting. The React/Vue demos deliberately keep an unsealed controller private.

## What is harder now

| Attempt | Response / boundary |
| --- | --- |
| Assign `_active`, replace instance methods or edit the class prototype | State is in native private fields; instances, prototype and class are frozen. |
| Find `stop()` on the shared monitor | No lifecycle methods or underlying guard reference are exposed. |
| Use a leaked sealed controller to reset or stop monitoring | Lifecycle and baseline acceptance methods throw. |
| Edit DOM and immediately restore it | Strict mode examines queued mutation records, including old text/attribute values and structural changes. |
| Replace a child with identical markup | Strict mutation history observes the replacement even when the final snapshot matches. |
| Drain pending changes through an approved update | `update()` checks pending history before allowing its callback. |
| Replace selected DOM APIs or common serialization/array APIs after startup | Descriptor audit emits `environment` and inspection continues, so the replacement does not silence later content signals. Baseline acceptance is rejected until those APIs are restored or the guard is destroyed and recreated. Captured observer/timer and lock-rendering methods resist later replacement. |
| Keep re-inserting an element to fight the lock wall | Observer-driven repairs are limited to bursts of 10 per second so the tab cannot freeze; the one-second repair timer keeps restoring the wall. |
| Send a huge batch of mutations | Record processing is capped at 10,000 per check; exceeding it emits `overflow` and forces a full snapshot if monitoring continues. |
| Cover a target with an external element | Optional visibility sampling can detect increased occlusion at five interior hit-test points. |

Native private fields protect against ordinary page JavaScript property access, not a privileged debugger. See [MDN's private-element documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Private_elements), including its DevTools exception. Mutation history relies on the browser delivering records; [takeRecords()](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver/takeRecords) also drains them for synchronous checks.

## Costs and remaining boundaries

- Visibility sampling is opt-in. It reads layout, computed display/visibility/opacity, and five hit-test points. Scrolling, dialogs, responsive layouts and legitimate overlays can trigger it. Offscreen/zero-size targets have no occlusion sample. Transparent or `pointer-events: none` overlays, gaps between samples, and browser UI can escape it. [elementFromPoint()](https://developer.mozilla.org/en-US/docs/Web/API/Document/elementFromPoint) is a hit test, not a pixel integrity check.
- Mutation history adds record processing and node ownership tracking. It does not log every operation: ignores still apply, one mutation signal per affected target per batch is sufficient, and inaccessible roots/template fragments may lack observation. Form-property or CSSOM changes restored between sweeps can still be missed.
- Environment auditing covers selected descriptors, not every JS intrinsic, per-node override, proxy, event handler or execution path. Compromise before module evaluation/startup can poison the captured baseline. A hostile browser can block scripts, replace resources, pause execution, cancel timers or alter the runtime. Benign tools that wrap audited APIs after startup (error monitoring, analytics, session replay) also produce `environment` violations, and in lock mode they lock the page. Start the guard after those integrations.
- Native mutation queues can consume memory before the record cap runs. An attacker that blocks the main thread also blocks the monitor. There is no worker, service worker or infinite watchdog pretending to solve this trust boundary.
- A 250 ms sweep increases work relative to the 1-second default. Measure small, representative targets and actual stylesheets. No interval is a guaranteed deadline in background or suspended tabs. See [performance](PERFORMANCE.md).
- No local monitor can authenticate screenshots, authorize prices or transactions, protect canvas/media pixels, or guarantee detection of every same-page attack. Events and status are diagnostics, not cryptographic evidence.

Start with report mode to establish the application's legitimate changes. Enable destructive, sealed behavior only for stable screens where those semantics fit.
