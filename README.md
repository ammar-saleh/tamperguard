# TamperGuard — client-side tamper detection (starter)

A small, dependency-free guard that detects when the page is modified in the
browser (DevTools edits, injected nodes, changed attributes/inline styles) and
throws up a **"Tamper detected — refresh"** wall.

Three starter versions share one guard file:

```
no-tempering/
├── guard/guard.js      # the shared guard (~120 lines, no dependencies)
├── plain-html/index.html
├── react/index.html
└── vue/index.html
```

## How to run

Just open any of the three `index.html` files in a browser (double-click, or
drag into a tab). No build step, no server.

> React/Vue load from a CDN, so those two need internet the first time.

## How to test it

In any demo:

1. Open DevTools (F12) → **Elements**.
2. Find the box marked **"Verified price"** (it has `data-guard`).
3. Double-click its text and change it — e.g. `$1,299.00 → $1.00`, or
   `Standard → Admin`.
4. The page **locks instantly** with the wall. Deleting the wall in DevTools
   just re-draws it; **Refresh** is the only way back.

Things that should **not** trip it:
- The live clock / counter (they're outside the guarded region).
- The **"legit change"** button in the plain-HTML demo — it edits the box and
  then calls `guard.rebaseline()`, so an approved change is accepted.

## Using it on your own page

```html
<script src="guard/guard.js"></script>
<div data-guard> ...the content you want protected... </div>
<script>
  const guard = new TamperGuard({ selector: '[data-guard]' });
  document.addEventListener('DOMContentLoaded', () => guard.start());
</script>
```

Options: `selector`, `message`, `onTamper` (custom handler instead of the wall).
After a change *you* make on purpose, call `guard.rebaseline()`.

## Frameworks

A framework re-rendering **inside** a guarded region would look like tampering.
Two simple patterns:
- Guard **static** regions only (prices, notices, legal text) — what the demos do.
- Or call `guard.rebaseline()` right after your own legitimate update.

## What this is good for — and what it is NOT

**Good for:** stopping casual DOM edits, and "edit-the-page-then-screenshot"
fakes. The wall fires the moment someone edits.

**Not a security boundary.** The guard runs in the user's browser, so someone
who controls their browser can still bypass it (disable JavaScript, DevTools
"Local overrides", a proxy, or an extension that runs before the page). It
raises the effort from *seconds* to *real work* — nothing more.

**Rule that doesn't change:** anything that must be trustworthy — prices,
balances, scores, permissions — has to be validated **on the server**. Treat
this guard as a deterrent layer on top of that, never as a replacement.

This starter deliberately stays **transparent** (no anti-debugging or
obfuscation). Those add deterrence but are unreliable and easy to mistake for
malware; we can discuss them separately if you want to go further.
