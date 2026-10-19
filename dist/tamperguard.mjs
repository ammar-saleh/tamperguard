/*! TamperGuard v0.1.0 | MIT License | https://github.com/asaleh123/tamperguard#readme */
/*
 * TamperGuard core.
 *
 * A client-side integrity monitor: it snapshots the regions you mark, watches
 * them for modification (edited text/attributes, injected or removed nodes,
 * inline-style changes, and optionally stylesheet edits), and reacts — lock
 * the page, report the violation, or hand it to your own callback.
 *
 * This file is the single source of truth. The build (scripts/build.mjs) wraps
 * it into dist/tamperguard.umd.js and dist/tamperguard.esm.js. It contains no
 * import/export of its own on purpose.
 *
 * Design notes:
 *   - Fully offline. The network is never required; reportUrl is optional.
 *   - Transparent by design. No anti-debugging or obfuscation — this is an
 *     integrity check, not an evasion tool. It raises the cost of casual
 *     tampering; it is NOT a substitute for server-side validation.
 *   - Robust against monkey-patching: it captures pristine copies of the
 *     browser APIs it relies on before page code can swap them out.
 */

/* --- tiny, fast, non-cryptographic hash (FNV-1a, 32-bit -> 8 hex). ---------
 * A crypto hash would add no real protection here: when the attacker controls
 * the browser, they control the hashing code too. All we need is reliable
 * change-detection, which this gives cheaply. */
function tgHash(str) {
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

/* Capture pristine browser APIs from a throwaway iframe, so later monkey-
 * patching of window.MutationObserver / timers can't blind the guard. Falls
 * back to the live window if the iframe trick isn't available. */
function captureCleanApis() {
  var win = null;
  try {
    var frame = document.createElement('iframe');
    frame.style.display = 'none';
    frame.setAttribute('aria-hidden', 'true');
    (document.body || document.documentElement).appendChild(frame);
    win = frame.contentWindow;
    // Keep references, then drop the frame from the DOM.
    var api = grab(win);
    frame.remove();
    if (api.MutationObserver) return api;
  } catch (e) { /* fall through */ }
  return grab(window);

  function grab(w) {
    return {
      MutationObserver: w.MutationObserver,
      setInterval: w.setInterval ? w.setInterval.bind(w) : setInterval,
      clearInterval: w.clearInterval ? w.clearInterval.bind(w) : clearInterval,
      setTimeout: w.setTimeout ? w.setTimeout.bind(w) : setTimeout,
      now: (w.Date && w.Date.now) ? w.Date.now.bind(w.Date) : Date.now
    };
  }
}

var DEFAULT_IGNORE_SELECTORS = [
  // Common benign browser-extension nodes that mutate the DOM.
  'grammarly-desktop-integration', 'grammarly-extension',
  '[data-gramm]', '[data-lt-installed]'
];
var DEFAULT_IGNORE_ATTR_PREFIXES = [
  'data-gr-', 'data-gramm', 'data-darkreader', 'data-lt-'
];
var DEFAULT_IGNORE_ATTRS = [
  'data-new-gr-c-s-check-loaded', 'data-gr-ext-installed', 'spellcheck'
];

var TG_DEFAULTS = {
  selector: '[data-guard]',
  mode: 'lock',                 // 'lock' | 'report' | 'silent'
  message: 'This page has been modified. Please refresh to continue.',
  interval: 1000,               // periodic integrity sweep (ms); 0 disables
  watchStyles: false,           // also hash same-origin stylesheet rules
  guardWholeDocument: false,    // if no targets match, guard <body> (risky)
  reportUrl: null,              // optional endpoint for violation beacons
  onTamper: null,               // function(detail) -> truthy to suppress action
  ignoreSelectors: DEFAULT_IGNORE_SELECTORS,
  ignoreAttributes: DEFAULT_IGNORE_ATTRS,
  ignoreAttributePrefixes: DEFAULT_IGNORE_ATTR_PREFIXES
};

function TamperGuard(options) {
  options = options || {};
  var o = {};
  for (var k in TG_DEFAULTS) o[k] = TG_DEFAULTS[k];
  for (var j in options) if (options.hasOwnProperty(j)) o[j] = options[j];
  this.options = o;

  this.api = captureCleanApis();
  this.targets = [];            // [{ el, hash }]
  this.styleHash = null;
  this.status = 'idle';         // 'idle' | 'watching' | 'tampered' | 'stopped'
  this.observer = null;
  this._sweep = null;
  this._wall = null;
  this._wallObserver = null;
}

/* Produce the canonical, allowlist-cleaned HTML we hash. Cloning means we
 * never mutate the live page; removing allowlisted nodes/attributes keeps
 * benign extensions (Grammarly, Dark Reader, ...) from tripping the guard. */
TamperGuard.prototype._clean = function (el) {
  var o = this.options;
  var clone = el.cloneNode(true);

  o.ignoreSelectors.forEach(function (sel) {
    try {
      var found = clone.querySelectorAll(sel);
      for (var i = 0; i < found.length; i++) found[i].remove();
    } catch (e) { /* bad selector, ignore */ }
  });

  (function strip(node) {
    if (node.nodeType === 1) {
      o.ignoreAttributes.forEach(function (a) { node.removeAttribute(a); });
      var attrs = Array.prototype.slice.call(node.attributes);
      attrs.forEach(function (attr) {
        for (var p = 0; p < o.ignoreAttributePrefixes.length; p++) {
          if (attr.name.indexOf(o.ignoreAttributePrefixes[p]) === 0) {
            node.removeAttribute(attr.name);
            return;
          }
        }
      });
      var kids = Array.prototype.slice.call(node.children);
      kids.forEach(strip);
    }
  })(clone);

  return clone.outerHTML.replace(/\s+/g, ' ').trim();
};

TamperGuard.prototype._hashStyles = function () {
  var out = '';
  var sheets;
  try { sheets = document.styleSheets; } catch (e) { return ''; }
  for (var i = 0; i < sheets.length; i++) {
    try {
      var rules = sheets[i].cssRules; // throws for cross-origin sheets
      for (var r = 0; r < rules.length; r++) out += rules[r].cssText;
    } catch (e) { /* cross-origin / inaccessible: skip */ }
  }
  return tgHash(out);
};

TamperGuard.prototype.start = function () {
  var self = this;
  var o = this.options;

  var list = Array.prototype.slice.call(document.querySelectorAll(o.selector));
  if (list.length === 0) {
    if (o.guardWholeDocument && document.body) {
      list = [document.body];
    } else {
      if (typeof console !== 'undefined') {
        console.warn('[TamperGuard] no elements matched "' + o.selector +
          '"; nothing is being guarded.');
      }
      return this;
    }
  }

  this.targets = list.map(function (el) {
    return { el: el, hash: tgHash(self._clean(el)) };
  });
  if (o.watchStyles) this.styleHash = this._hashStyles();

  // Fast path: react the instant the DOM changes.
  if (this.api.MutationObserver) {
    this.observer = new this.api.MutationObserver(function () { self.check(); });
    list.forEach(function (el) {
      self.observer.observe(el, {
        childList: true, subtree: true, attributes: true, characterData: true
      });
    });
  }

  // Backstop: a periodic sweep guarantees detection even if the observer is
  // disconnected or removed, and is the only way to catch stylesheet edits.
  if (o.interval > 0) {
    this._sweep = this.api.setInterval(function () { self.check(); }, o.interval);
  }

  this.status = 'watching';
  this._emit('ready', { targets: this.targets.length });
  return this;
};

TamperGuard.prototype.check = function () {
  if (this.status === 'tampered' || this.status === 'stopped') return;
  for (var i = 0; i < this.targets.length; i++) {
    var t = this.targets[i];
    if (tgHash(this._clean(t.el)) !== t.hash) {
      return this._violation('content', t.el);
    }
  }
  if (this.options.watchStyles && this._hashStyles() !== this.styleHash) {
    return this._violation('style', null);
  }
};

/* Accept the current state as the new baseline — call after a change YOU made
 * on purpose (e.g. a framework re-render), to avoid a false positive. */
TamperGuard.prototype.rebaseline = function () {
  var self = this;
  this.targets.forEach(function (t) { t.hash = tgHash(self._clean(t.el)); });
  if (this.options.watchStyles) this.styleHash = this._hashStyles();
  return this;
};

TamperGuard.prototype.stop = function () {
  if (this.observer) { this.observer.disconnect(); this.observer = null; }
  if (this._sweep) { this.api.clearInterval(this._sweep); this._sweep = null; }
  if (this.status !== 'tampered') this.status = 'stopped';
  return this;
};

TamperGuard.prototype.getStatus = function () {
  return { status: this.status, targets: this.targets.length };
};

TamperGuard.prototype._violation = function (type, el) {
  if (this.status === 'tampered') return;
  this.status = 'tampered';
  this.stop();

  var detail = {
    type: type,                       // 'content' | 'style'
    selector: this.options.selector,
    url: (typeof location !== 'undefined') ? location.href : '',
    at: this.api.now()
  };
  this._emit('violation', detail);
  if (this.options.reportUrl) this._report(detail);

  // onTamper can inspect the violation and return truthy to suppress the
  // built-in reaction (useful for custom UX).
  var suppressed = false;
  if (typeof this.options.onTamper === 'function') {
    try { suppressed = this.options.onTamper(detail); } catch (e) {}
  }
  if (suppressed) return;

  if (this.options.mode === 'lock') this.lock();
  // 'report' and 'silent' take no visible action beyond the callback/beacon.
};

TamperGuard.prototype._report = function (detail) {
  try {
    var body = JSON.stringify(detail);
    if (navigator && navigator.sendBeacon) {
      navigator.sendBeacon(this.options.reportUrl, body);
    } else if (typeof fetch === 'function') {
      fetch(this.options.reportUrl, {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json' }, body: body
      });
    }
  } catch (e) { /* reporting is best-effort and must never throw */ }
};

TamperGuard.prototype._emit = function (name, detail) {
  try {
    if (typeof CustomEvent === 'function' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tamperguard:' + name, { detail: detail }));
    }
  } catch (e) {}
};

/* Wipe the page and draw a self-healing lock wall. The wall lives in a closed
 * shadow root so page scripts/styles can't easily reach into it, and it is
 * redrawn if removed — so deleting it in DevTools just leaves a blank page. */
TamperGuard.prototype.lock = function () {
  var self = this;
  try { document.documentElement.innerHTML = ''; } catch (e) {}
  if (!document.body) {
    document.documentElement.appendChild(document.createElement('body'));
  }
  this._emit('lock', { message: this.options.message });

  function render() {
    var host = document.createElement('div');
    host.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647');
    var root;
    try { root = host.attachShadow({ mode: 'closed' }); }
    catch (e) { root = host; }
    root.innerHTML =
      '<div style="position:fixed;inset:0;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:14px;padding:24px;' +
      'box-sizing:border-box;background:#0b0b0f;color:#fff;text-align:center;' +
      'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">' +
      '<div style="font-size:52px">&#128274;</div>' +
      '<div style="font-size:22px;font-weight:600">Tamper detected</div>' +
      '<div style="opacity:.75;max-width:460px;line-height:1.5">' +
      escapeHtml(self.options.message) + '</div>' +
      '<button id="tg-refresh" style="margin-top:8px;padding:10px 18px;border:0;' +
      'border-radius:8px;background:#fff;color:#0b0b0f;font-size:15px;' +
      'font-weight:600;cursor:pointer">Refresh</button></div>';
    var btn = root.querySelector ? root.querySelector('#tg-refresh') : null;
    if (btn) btn.addEventListener('click', function () { location.reload(); });
    document.body.appendChild(host);
    self._wall = host;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  render();
  if (this.api.MutationObserver) {
    this._wallObserver = new this.api.MutationObserver(function () {
      if (self._wall && !document.body.contains(self._wall)) render();
    });
    this._wallObserver.observe(document.documentElement, {
      childList: true, subtree: true
    });
  }
};

export { TamperGuard };
export default TamperGuard;
