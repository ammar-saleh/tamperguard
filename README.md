# TamperGuard

**Zero-dependency client-side integrity monitor.** It watches the regions you
mark and **locks or reports** the page the moment they're modified — DevTools
edits, injected scripts, buggy or malicious extensions, or fake
"edit-and-screenshot" tampering. Works fully offline. No build step required.

```html
<script src="https://unpkg.com/tamperguard"></script>
<div data-guard> ...the content you want protected... </div>
<script>
  new TamperGuard().start();   // edit the box in DevTools → the page locks
</script>
```

> **Read this first — what TamperGuard is and isn't.** It runs in the user's
> browser, so a determined person who controls their browser can still bypass
> it (disable JavaScript, DevTools "Local overrides", a proxy, a pre-page
> extension). It is a **deterrent and a tamper signal**, not a security
> boundary. Anything that must be trustworthy — prices, balances, scores,
> permissions — must still be validated **on the server**. Used honestly, it's
> great at stopping casual tampering and fake screenshots, and at telling your
> backend when a page was modified in the wild.

## Install

```bash
npm install tamperguard
```

```js
import TamperGuard from 'tamperguard';      // ESM
const { TamperGuard } = require('tamperguard'); // CommonJS
```

Or drop in the CDN build (sets a global `TamperGuard`):

```html
<script src="https://unpkg.com/tamperguard"></script>
```

## Quick start

Mark what to protect with `data-guard`, then start the guard:

```html
<div data-guard>
  <span>Verified price</span>
  <strong>$1,299.00</strong>
</div>

<script>
  const guard = new TamperGuard({
    selector: '[data-guard]',
    mode: 'lock',                       // 'lock' | 'report' | 'silent'
    message: 'This page was modified. Please refresh.'
  });
  guard.start();
</script>
```

## Modes

| Mode       | What happens on tamper                                                        |
|------------|-------------------------------------------------------------------------------|
| `lock`     | Wipes the page and shows a self-healing lock wall (closed shadow DOM).         |
| `report`   | Sends a violation beacon to `reportUrl` (if set); no visible change.          |
| `silent`   | Nothing visible — just fires `onTamper` and the `tamperguard:violation` event.|

## Options

| Option                     | Default          | Meaning                                                      |
|----------------------------|------------------|--------------------------------------------------------------|
| `selector`                 | `'[data-guard]'` | Regions to protect.                                          |
| `mode`                     | `'lock'`         | Reaction on tamper.                                          |
| `message`                  | *(sensible)*     | Text on the lock wall.                                       |
| `interval`                 | `1000`           | Periodic integrity-sweep in ms. `0` disables (observer only).|
| `watchStyles`              | `false`          | Also hash same-origin stylesheet rules (catches CSS edits).  |
| `guardWholeDocument`       | `false`          | If nothing matches `selector`, guard `<body>` (use with care).|
| `reportUrl`                | `null`           | Endpoint for violation beacons.                              |
| `onTamper(detail)`         | `null`           | Callback; return truthy to suppress the built-in reaction.   |
| `ignoreSelectors`          | *(extensions)*   | Descendant nodes stripped before hashing.                    |
| `ignoreAttributes`         | *(extensions)*   | Attribute names stripped before hashing.                     |
| `ignoreAttributePrefixes`  | *(extensions)*   | Attribute prefixes stripped before hashing.                  |

### Methods & events

```js
guard.start();        // snapshot + begin watching
guard.rebaseline();   // accept the current DOM as the new baseline
guard.stop();         // stop watching (does not remove a lock wall)
guard.getStatus();    // { status, targets }

window.addEventListener('tamperguard:violation', e => console.log(e.detail));
// also: 'tamperguard:ready', 'tamperguard:lock'
```

## Frameworks

A framework re-rendering **inside** a guarded region looks like tampering, so:

- **Guard static regions** (prices, notices, legal text) — the simplest path.
- Or call **`guard.rebaseline()`** right after your own legitimate update.
- **Vue:** put `v-pre` on the guarded block so Vue leaves it alone.

Runnable demos are in [`demos/`](demos/) (plain HTML, React, Vue).

## How it works

1. On `start()`, it captures **pristine copies** of `MutationObserver` and timers
   (from a throwaway iframe) so later monkey-patching can't blind it.
2. It snapshots each guarded region as **allowlist-cleaned HTML** and hashes it
   (fast FNV-1a — a crypto hash would add no real protection on the client).
3. A **MutationObserver** reacts instantly; a **periodic sweep** is the backstop
   that still catches tampering if the observer is disconnected, and is what
   detects stylesheet edits when `watchStyles` is on.
4. On a mismatch it fires `onTamper` / the event, optionally beacons to
   `reportUrl`, and (in `lock` mode) draws the self-healing wall.

## Avoiding false positives

Real pages are mutated by benign tools — Grammarly, Dark Reader, Google
Translate, password managers. TamperGuard ships an **allowlist** (with sensible
defaults) that strips those nodes/attributes before hashing, and defaults to
**scoped** protection (`data-guard`) rather than the whole page. For a cautious
rollout, start in `mode: 'report'`, watch what fires, then switch to `lock`.

## Develop

```bash
node scripts/build.mjs   # regenerate dist/ from src/guard-core.js
node scripts/serve.mjs   # serve demos at http://localhost:8080/demos/
```

Open [`test/break-it.html`](test/break-it.html) for an automated battery of
tamper attacks that proves detection (and proves benign cases are ignored).

## License

[MIT](LICENSE)

---

*Before publishing to npm:* confirm the package name is available and update the
`repository` / `homepage` URLs in `package.json` and the copyright holder in
`LICENSE`.
