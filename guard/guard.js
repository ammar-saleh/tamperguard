/*
 * TamperGuard — a small, dependency-free client-side integrity check.
 *
 * What it does:
 *   1. Takes a "snapshot" (normalized HTML) of the regions you mark with
 *      [data-guard] and hashes each one.
 *   2. Watches those regions with a MutationObserver.
 *   3. If a watched region's hash stops matching its baseline (text edited,
 *      attribute changed, node injected/removed, inline style changed), it
 *      locks the page with a full-screen wall.
 *
 * Honest limits (read these):
 *   - This runs in the user's browser, so a determined person who controls
 *     their browser can still get around it (disable JS, use DevTools
 *     "Local overrides", run an extension before the page, etc.). The goal is
 *     to stop CASUAL tampering and fake "edit-and-screenshot" — not to beat a
 *     motivated reverse engineer. Anything that must be trustworthy still has
 *     to be checked on a server.
 *   - It is intentionally transparent (no anti-debugging / obfuscation). It is
 *     an integrity check, not an evasion tool.
 */
(function (global) {
  'use strict';

  // --- tiny hash (FNV-1a, 32-bit -> 8 hex chars). Good enough to notice a
  // --- change; it is not a cryptographic guarantee.
  function hashString(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  // Collapse whitespace so trivial reflow differences don't cause false alarms.
  function snapshot(el) {
    return el.outerHTML.replace(/\s+/g, ' ').trim();
  }

  function TamperGuard(options) {
    options = options || {};
    this.selector = options.selector || '[data-guard]';
    this.message = options.message ||
      'This page has been modified. Please refresh to continue.';
    this.onTamper = options.onTamper || null; // optional custom handler
    this.targets = [];   // [{ el, hash }]
    this.locked = false;
    this.observer = null;
    this._wall = null;
    this._wallObserver = null;
  }

  TamperGuard.prototype.start = function () {
    var self = this;
    var els = Array.prototype.slice.call(document.querySelectorAll(this.selector));
    if (els.length === 0 && document.body) els = [document.body];

    this.targets = els.map(function (el) {
      return { el: el, hash: hashString(snapshot(el)) };
    });

    this.observer = new MutationObserver(function () { self.check(); });
    els.forEach(function (el) {
      self.observer.observe(el, {
        childList: true, subtree: true,
        attributes: true, characterData: true
      });
    });
    return this;
  };

  TamperGuard.prototype.check = function () {
    if (this.locked) return;
    for (var i = 0; i < this.targets.length; i++) {
      var t = this.targets[i];
      if (hashString(snapshot(t.el)) !== t.hash) {
        this.trigger();
        return;
      }
    }
  };

  // Call this AFTER a legitimate change you made yourself, so the new state
  // becomes the accepted baseline (prevents false positives).
  TamperGuard.prototype.rebaseline = function () {
    var self = this;
    this.targets.forEach(function (t) { t.hash = hashString(snapshot(t.el)); });
    return this;
  };

  TamperGuard.prototype.trigger = function () {
    if (this.locked) return;
    this.locked = true;
    if (this.observer) this.observer.disconnect();
    if (this.onTamper) { this.onTamper(); return; }
    this.lock();
  };

  TamperGuard.prototype.lock = function () {
    var self = this;

    // Wipe the page so the old (tampered) content is gone, not just hidden.
    try { document.documentElement.innerHTML = ''; } catch (e) {}
    if (!document.body) {
      document.documentElement.appendChild(document.createElement('body'));
    }

    function render() {
      var wall = document.createElement('div');
      wall.setAttribute('style', [
        'position:fixed', 'inset:0', 'z-index:2147483647',
        'display:flex', 'flex-direction:column',
        'align-items:center', 'justify-content:center',
        'gap:14px', 'padding:24px', 'box-sizing:border-box',
        'background:#0b0b0f', 'color:#fff', 'text-align:center',
        'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif'
      ].join(';'));
      wall.innerHTML =
        '<div style="font-size:52px">&#128274;</div>' +
        '<div style="font-size:22px;font-weight:600">Tamper detected</div>' +
        '<div style="opacity:.75;max-width:460px;line-height:1.5">' +
          self.message + '</div>' +
        '<button id="tg-refresh" style="margin-top:8px;padding:10px 18px;' +
          'border:0;border-radius:8px;background:#fff;color:#0b0b0f;' +
          'font-size:15px;font-weight:600;cursor:pointer">Refresh</button>';
      document.body.appendChild(wall);
      self._wall = wall;
      var btn = wall.querySelector('#tg-refresh');
      if (btn) btn.addEventListener('click', function () { location.reload(); });
    }

    render();

    // If someone deletes the wall from DevTools, put it back.
    this._wallObserver = new MutationObserver(function () {
      if (self._wall && !document.body.contains(self._wall)) render();
    });
    this._wallObserver.observe(document.documentElement, {
      childList: true, subtree: true
    });
  };

  global.TamperGuard = TamperGuard;
})(typeof window !== 'undefined' ? window : this);
