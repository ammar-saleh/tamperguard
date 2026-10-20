/*! TamperGuard v0.3.0 | MIT License | https://github.com/asaleh123/tamperguard#readme */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) define([], factory);
  else if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TamperGuard = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
/* TamperGuard: observable DOM integrity, not a browser trust boundary.
 * Wrapped by scripts/build.mjs. No module-load browser effects.
 */
const TG_FREEZE = Object.freeze;
const TG_JSON = JSON.stringify;
const TG_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const TG_APPLY = Reflect.apply;
const TG_DEFAULTS = TG_FREEZE({
  selector: '[data-guard]', root: null, mode: 'report',
  message: 'This page changed unexpectedly. Refresh to continue.',
  interval: 1000, watchStyles: false, watchProperties: true,
  watchShadowDOM: true, watchAncestors: true, guardWholeDocument: false,
  watchMutations: false, watchVisibility: false, watchEnvironment: true,
  reportUrl: null, onTamper: null, maxReportsPerMinute: 20,
  ignoreSelectors: [], ignoreAttributes: [], ignoreAttributePrefixes: []
});
const TG_ENV_ERROR = 'Browser APIs changed after this guard started, so no new baseline can be accepted. ' +
  'Restore them, or destroy this guard and start a new one after the integration that replaced them has loaded.';
// Observer-driven wall repairs per second; the 1-second repair timer still runs beyond this.
const TG_WALL_BURST = 10;
// One wall owner per document prevents two guards from rebuilding each other's wall.
const TG_LOCKS = new WeakMap();

function tgParent(node) { return node.parentNode || node.host || null; }
function tgContains(parent, node) {
  for (let current = node; current; current = tgParent(current)) if (current === parent) return true;
  return false;
}
function tgAttributes(node, options) {
  return Array.from(node.attributes, a => [a.namespaceURI, a.name, a.value])
    .filter(a => !options.ignoreAttributes.includes(a[1]) &&
      !options.ignoreAttributePrefixes.some(prefix => a[1].startsWith(prefix)))
    .sort((a, b) => {
      const left = `${a[0] || ''}\u0000${a[1]}`, right = `${b[0] || ''}\u0000${b[1]}`;
      return left < right ? -1 : left > right ? 1 : 0;
    });
}

class TamperGuard {
  #sealed = false;
  #owners = new WeakMap();
  #integrity = [];
  #apiFault = '';
  #options; #status; #active; #targets; #shadows; #shadowObservers; #ids; #nextId; #revision; #checking; #updating; #observer; #timer; #wallObserver; #wallTimer; #wall; #reportTimes; #metrics; #doc; #root; #win; #reportUrl; #api; #onResume; #onInput; #selection; #lastSelection; #style; #lastStyle;
  get options() { return this.#options; }
  get status() { return this.#status; }
  static TamperGuard = TamperGuard;
  static default = TamperGuard;
  // Keep controller in application module scope; share only monitor if needed.
  static protect(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Options must be an object');
    if (options.reportUrl != null) throw new TypeError('protect() is local-only; omit reportUrl');
    const guard = new TamperGuard({ watchMutations: true, watchStyles: true, ...options });
    guard.start();
    const monitor = TG_FREEZE(Object.assign(Object.create(null), {
      getStatus: () => guard.getStatus(), check: () => guard.check()
    }));
    const controller = TG_FREEZE(Object.assign(Object.create(null), {
      start: () => { guard.start(); }, stop: () => { guard.stop(); },
      rebaseline: () => { guard.rebaseline(); }, update: fn => guard.update(fn),
      seal: () => { guard.seal(); }, destroy: () => { guard.destroy(); }, lock: () => { guard.lock(); }
    }));
    return TG_FREEZE({ monitor, controller });
  }
  constructor(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Options must be an object');
    for (const key of Object.keys(options)) {
      if (!Object.hasOwn(TG_DEFAULTS, key)) throw new TypeError(`Unknown option: ${key}`);
    }
    const o = { ...TG_DEFAULTS, ...options };
    if (!['lock', 'report', 'silent'].includes(o.mode)) throw new TypeError('Invalid mode');
    if (typeof o.selector !== 'string' || !o.selector.trim()) throw new TypeError('Invalid selector');
    if (typeof o.message !== 'string') throw new TypeError('message must be a string');
    if (!Number.isFinite(o.interval) || o.interval < 0 || o.interval > 2147483647) throw new TypeError('Invalid interval');
    if (!Number.isInteger(o.maxReportsPerMinute) || o.maxReportsPerMinute < 0) throw new TypeError('Invalid maxReportsPerMinute');
    for (const key of ['watchStyles', 'watchProperties', 'watchShadowDOM', 'watchAncestors', 'guardWholeDocument', 'watchMutations', 'watchVisibility', 'watchEnvironment']) {
      if (typeof o[key] !== 'boolean') throw new TypeError(`${key} must be boolean`);
    }
    for (const key of ['ignoreSelectors', 'ignoreAttributes', 'ignoreAttributePrefixes']) {
      if (!Array.isArray(o[key]) || o[key].some(v => typeof v !== 'string' || !v.trim())) throw new TypeError(`Invalid ${key}`);
      o[key] = TG_FREEZE([...o[key]]);
    }
    if (o.onTamper !== null && typeof o.onTamper !== 'function') throw new TypeError('Invalid onTamper');
    if (o.reportUrl !== null && typeof o.reportUrl !== 'string') throw new TypeError('Invalid reportUrl');
    this.#options = TG_FREEZE(o);
    this.#status = 'idle';
    this.#active = false;
    this.#targets = [];
    this.#shadows = new Set();
    this.#shadowObservers = new Map();
    this.#ids = new WeakMap();
    this.#nextId = 1;
    this.#revision = 0;
    this.#checking = false;
    this.#updating = false;
    this.#observer = null;
    this.#timer = null;
    this.#wallObserver = null;
    this.#wallTimer = null;
    this.#wall = null;
    this.#reportTimes = [];
    this.#metrics = { checks: 0, snapshots: 0, violations: 0, reports: 0,
      reportsDropped: 0, reportErrors: 0, callbackErrors: 0, inaccessibleStylesheets: 0, lastCheckMs: 0 };
    TG_FREEZE(this);
  }

  #init() {
    if (this.#doc) return;
    const root = this.#options.root || (typeof document !== 'undefined' ? document : null);
    if (!root || ![1, 9, 11].includes(root.nodeType) || !root.querySelectorAll ||
        (root.nodeType === 11 && !root.host)) throw new TypeError('root must be a Document, Element or ShadowRoot');
    const doc = root.nodeType === 9 ? root : root.ownerDocument;
    const win = doc.defaultView;
    if (!win || !win.MutationObserver) throw new Error('TamperGuard requires a browser with MutationObserver');
    root.querySelectorAll(this.#options.selector);
    for (const selector of this.#options.ignoreSelectors) doc.createElement('div').matches(selector);
    let reportUrl = null;
    if (this.#options.reportUrl !== null) {
      const url = new URL(this.#options.reportUrl, doc.baseURI);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new TypeError('reportUrl must be HTTP(S) without credentials');
      reportUrl = url.href;
    }
    this.#root = root; this.#doc = doc; this.#win = win; this.#reportUrl = reportUrl;
    // Live-realm timers keep running. Capturing only resists later global
    // reassignment; it does not establish trust in pre-start code or prototypes.
    this.#api = {
      Observer: win.MutationObserver,
      setInterval: win.setInterval.bind(win), clearInterval: win.clearInterval.bind(win),
      now: win.Date.now.bind(win.Date), perf: win.performance.now.bind(win.performance),
      fetch: win.fetch ? win.fetch.bind(win) : null,
      beacon: win.navigator.sendBeacon ? win.navigator.sendBeacon.bind(win.navigator) : null,
      observe: win.MutationObserver.prototype.observe,
      disconnect: win.MutationObserver.prototype.disconnect,
      takeRecords: win.MutationObserver.prototype.takeRecords,
      style: win.getComputedStyle.bind(win),
      rect: win.Element.prototype.getBoundingClientRect,
      hit: win.Document.prototype.elementFromPoint,
      createElement: doc.createElement.bind(doc),
      appendChild: win.Node.prototype.appendChild,
      replaceChildren: win.Element.prototype.replaceChildren,
      setAttribute: win.Element.prototype.setAttribute,
      removeAttribute: win.Element.prototype.removeAttribute,
      setText: TG_DESCRIPTOR(win.Node.prototype, 'textContent').set,
      attachShadow: win.Element.prototype.attachShadow,
      addEventListener: win.EventTarget.prototype.addEventListener,
      focus: win.HTMLElement.prototype.focus,
      setAdoptedStyles: TG_DESCRIPTOR(win.Document.prototype, 'adoptedStyleSheets')?.set
    };
    this.#captureIntegrity();
    this.#onResume = () => { if (this.#active && !doc.hidden) this.check(); };
    // Only input inside a guarded region can change snapshotted form state; typing
    // elsewhere is left to observers and sweeps instead of forcing a full check per key.
    this.#onInput = event => {
      if (!this.#active || !this.#options.watchProperties) return;
      const origin = event.composedPath?.()[0] || event.target;
      if (this.#targets.some(t => tgContains(t.el, origin))) this.check();
    };
  }

  #id(node) {
    if (!this.#ids.has(node)) this.#ids.set(node, this.#nextId++);
    return this.#ids.get(node);
  }

  #captureIntegrity() {
    const w = this.#win;
    const add = (object, keys) => {
      if (!object) return;
      for (const key of keys) this.#integrity.push({ object, key, descriptor: TG_DESCRIPTOR(object, key) });
    };
    this.#integrity = [];
    add(w, ['MutationObserver', 'setInterval', 'clearInterval', 'getComputedStyle', 'Object', 'Array', 'JSON', 'Reflect']);
    add(w.MutationObserver.prototype, ['observe', 'disconnect', 'takeRecords']);
    add(w.Node.prototype, ['nodeType', 'nodeValue', 'childNodes', 'parentNode', 'ownerDocument', 'isConnected', 'textContent', 'appendChild']);
    add(w.Element.prototype, ['attributes', 'localName', 'namespaceURI', 'shadowRoot', 'querySelectorAll', 'matches', 'getAttributeNS', 'getBoundingClientRect', 'setAttribute', 'removeAttribute', 'attachShadow', 'replaceChildren']);
    add(w.Document.prototype, ['querySelectorAll', 'createElement', 'styleSheets', 'adoptedStyleSheets', 'elementFromPoint']);
    add(w.ShadowRoot?.prototype, ['querySelectorAll', 'adoptedStyleSheets', 'host']);
    add(w.EventTarget.prototype, ['addEventListener', 'removeEventListener']);
    add(w.Event.prototype, ['composedPath', 'target']);
    add(w.HTMLInputElement.prototype, ['value', 'checked', 'indeterminate']);
    add(w.HTMLTextAreaElement.prototype, ['value']);
    add(w.HTMLSelectElement.prototype, ['value', 'selectedIndex']);
    add(w.HTMLOptionElement.prototype, ['selected']);
    add(w.CSSStyleSheet.prototype, ['cssRules', 'disabled']);
    add(w.JSON, ['stringify']); add(w.Reflect, ['apply']); add(w.Object, ['freeze', 'getOwnPropertyDescriptor']);
    add(w.Array, ['from']); add(w.Array.prototype, ['map', 'filter', 'some', 'includes', 'push', 'pop', 'sort', Symbol.iterator]);
    add(this.#doc, ['querySelectorAll', 'createElement', 'styleSheets', 'elementFromPoint']);
    if (this.#root !== this.#doc) add(this.#root, ['querySelectorAll', 'matches', 'childNodes', 'attributes']);
  }

  #checkIntegrity() {
    let fault = '';
    // Use numeric iteration: a patched iterator must not skip the audit itself.
    for (let i = 0; i < this.#integrity.length; i++) {
      const entry = this.#integrity[i], before = entry.descriptor;
      const after = TG_DESCRIPTOR(entry.object, entry.key);
      if ((!before) !== (!after) || (before && after &&
          (before.value !== after.value || before.get !== after.get || before.set !== after.set ||
           before.configurable !== after.configurable || before.writable !== after.writable))) fault += `${i},`;
    }
    if (fault !== this.#apiFault) {
      this.#apiFault = fault;
      if (fault) this.#violation('environment', null, 'browser-api-replaced');
    }
    return fault !== '';
  }

  #drainRecords(delivered) {
    const records = [];
    let overflow = false;
    const collect = queue => {
      if (queue.length > 10000 - records.length) overflow = true;
      for (let i = 0; i < queue.length && records.length < 10000; i++) records.push(queue[i]);
    };
    collect(delivered || []);
    if (this.#observer) collect(TG_APPLY(this.#api.takeRecords, this.#observer, []));
    for (const observer of this.#shadowObservers.values()) collect(TG_APPLY(this.#api.takeRecords, observer, []));
    return { records, overflow };
  }

  #ignored(node, target) {
    for (let current = node; current && current !== target; current = tgParent(current)) {
      if (current.nodeType === 1 && this.#options.ignoreSelectors.some(selector => current.matches(selector))) return true;
    }
    return false;
  }

  #inspectHistory(records, revision) {
    const signaled = new Set(), o = this.#options;
    for (const record of records) {
      if (!this.#active || revision !== this.#revision) return;
      const target = this.#targets.find(t => t.el === this.#owners.get(record.target) || tgContains(t.el, record.target) ||
        (o.watchAncestors && record.type === 'attributes' && tgContains(record.target, t.el)) ||
        (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].some(n => tgContains(n, t.el))));
      if (!target || signaled.has(target.id) || (tgContains(target.el, record.target) && this.#ignored(record.target, target.el))) continue;
      let changed = false;
      if (record.type === 'attributes') {
        const name = record.attributeName;
        if (o.ignoreAttributes.includes(name) || o.ignoreAttributePrefixes.some(prefix => name.startsWith(prefix))) continue;
        changed = record.oldValue !== record.target.getAttributeNS(record.attributeNamespace, name);
      } else if (record.type === 'characterData') {
        changed = record.oldValue !== record.target.nodeValue;
      } else if (record.type === 'childList') {
        for (const node of [...record.addedNodes, ...record.removedNodes]) {
          if (!this.#ignored(node, target.el)) { changed = true; break; }
        }
      }
      if (changed) { signaled.add(target.id); this.#violation('mutation', target, 'unapproved-mutation-observed'); }
    }
  }

  #visibility(el) {
    const style = this.#api.style(el);
    const summary = `${style.display}|${style.visibility}|${style.opacity}`;
    const rect = TG_APPLY(this.#api.rect, el, []);
    const w = this.#win.innerWidth, h = this.#win.innerHeight;
    let count = 0, covered = 0;
    // Five hit-test samples; no screenshots, layout fingerprint or pixel hashing.
    for (const [dx, dy] of [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) {
      const x = rect.left + rect.width * dx, y = rect.top + rect.height * dy;
      if (!rect.width || !rect.height || x < 0 || y < 0 || x >= w || y >= h) continue;
      count++;
      const hit = TG_APPLY(this.#api.hit, this.#doc, [x, y]);
      // Document hit-testing retargets shadow content to its host.
      if (!hit || (!tgContains(el, hit) && !(hit.shadowRoot && tgContains(hit, el)))) covered++;
    }
    return { style: summary, covered: count ? covered / count : null };
  }

  #select() {
    const list = Array.from(this.#root.querySelectorAll(this.#options.selector));
    if (this.#root.nodeType === 1 && this.#root.matches(this.#options.selector)) list.unshift(this.#root);
    if (!list.length && this.#options.guardWholeDocument && this.#doc.body) list.push(this.#doc.body);
    const selected = new Set(list);
    return list.filter(el => {
      for (let p = tgParent(el); p; p = tgParent(p)) if (selected.has(p)) return false;
      return true;
    });
  }

  #snapshot(el) {
    this.#metrics.snapshots++;
    const tokens = [], stack = [el], o = this.#options;
    while (stack.length) {
      const node = stack.pop();
      if (node === null) { tokens.push('/'); continue; }
      if (node.nodeType === 1) {
        if (node !== el && o.ignoreSelectors.some(selector => node.matches(selector))) continue;
        if (o.watchMutations) this.#owners.set(node, el);
        tokens.push('element', node.namespaceURI, node.localName, tgAttributes(node, o));
        if (o.watchProperties) {
          if (node.localName === 'input') tokens.push('input', node.value, node.checked, node.indeterminate);
          if (node.localName === 'textarea') tokens.push('textarea', node.value);
          if (node.localName === 'option') tokens.push('option', node.selected);
          if (node.localName === 'select') tokens.push('select', node.selectedIndex, node.value);
        }
        stack.push(null);
        if (o.watchShadowDOM && node.shadowRoot) { this.#observeShadow(node.shadowRoot); stack.push(node.shadowRoot); }
        const children = node.localName === 'template' && node.content ? node.content.childNodes : node.childNodes;
        for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
      } else if (node.nodeType === 11) {
        if (o.watchMutations) this.#owners.set(node, el);
        tokens.push('shadow', node.mode || 'fragment'); stack.push(null);
        for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push(node.childNodes[i]);
      } else {
        if (o.watchMutations) this.#owners.set(node, el);
        tokens.push(node.nodeType, node.nodeValue);
      }
    }
    // Exact comparison preserves whitespace and avoids hash collisions.
    return TG_JSON(tokens);
  }

  #observeShadow(root) {
    this.#shadows.add(root);
    if (this.#observer && root !== this.#root && !this.#shadowObservers.has(root)) {
      const observer = new this.#api.Observer(records => this.#check(records));
      TG_APPLY(this.#api.observe, observer, [root, this.#observerOptions()]);
      this.#shadowObservers.set(root, observer);
    }
  }

  #pruneShadows() {
    for (const root of this.#shadows) {
      if (root !== this.#root && !this.#targets.some(t => tgContains(t.el, root.host))) {
        const observer = this.#shadowObservers.get(root);
        if (observer) TG_APPLY(this.#api.disconnect, observer, []);
        this.#shadowObservers.delete(root); this.#shadows.delete(root);
      }
    }
  }

  #structure(el) {
    const chain = [];
    for (let node = tgParent(el); node; node = tgParent(node)) {
      chain.push(this.#id(node));
      if (this.#options.watchAncestors && node.nodeType === 1) chain.push(tgAttributes(node, this.#options));
    }
    return TG_JSON([el.isConnected, this.#id(el.ownerDocument), chain]);
  }

  #styles() {
    const out = [], seen = new Set();
    let inaccessible = 0;
    const visit = sheet => {
      if (seen.has(sheet)) { out.push('reference', this.#id(sheet)); return; }
      seen.add(sheet);
      out.push('sheet', this.#id(sheet), sheet.href, sheet.disabled, sheet.media?.mediaText || '');
      try {
        for (const rule of Array.from(sheet.cssRules)) { out.push(rule.cssText); if (rule.styleSheet) visit(rule.styleSheet); }
      } catch { inaccessible++; out.push('inaccessible'); }
    };
    for (const root of [this.#doc, ...this.#shadows]) {
      if (root !== this.#doc && !root.host?.isConnected) continue;
      out.push('scope', this.#id(root));
      for (const sheet of Array.from(root.styleSheets || [])) visit(sheet);
      for (const sheet of Array.from(root.adoptedStyleSheets || [])) visit(sheet);
    }
    this.#metrics.inaccessibleStylesheets = inaccessible;
    return TG_JSON(out);
  }

  #baseline() {
    this.#shadows.clear();
    this.#owners = new WeakMap();
    if (this.#root.nodeType === 11) this.#shadows.add(this.#root);
    this.#targets = this.#select().map(el => {
      const content = this.#snapshot(el), structure = this.#structure(el);
      const visibility = this.#options.watchVisibility ? this.#visibility(el) : null;
      return { el, id: this.#id(el), content, structure, visibility, lastVisibility: '', lastContent: content, lastStructure: structure };
    });
    this.#selection = TG_JSON(this.#targets.map(t => t.id));
    this.#lastSelection = this.#selection;
    this.#style = this.#options.watchStyles ? this.#styles() : null;
    this.#lastStyle = this.#style;
    this.#revision++;
  }

  #observerOptions() {
    return { subtree: true, childList: true, characterData: true, attributes: true,
      attributeOldValue: this.#options.watchMutations, characterDataOldValue: this.#options.watchMutations };
  }

  #connect() {
    this.#observer = new this.#api.Observer(records => this.#check(records));
    TG_APPLY(this.#api.observe, this.#observer, [this.#doc, this.#observerOptions()]);
    if (this.#root !== this.#doc) TG_APPLY(this.#api.observe, this.#observer, [this.#root, this.#observerOptions()]);
    for (const shadow of this.#shadows) this.#observeShadow(shadow);
    if (this.#options.interval > 0) this.#timer = this.#api.setInterval(() => this.check(), this.#options.interval);
    this.#doc.addEventListener('visibilitychange', this.#onResume);
    this.#win.addEventListener('pageshow', this.#onResume);
    this.#doc.addEventListener('input', this.#onInput, true);
    this.#doc.addEventListener('change', this.#onInput, true);
  }

  #disconnect() {
    if (this.#observer) TG_APPLY(this.#api.disconnect, this.#observer, []);
    this.#observer = null;
    for (const observer of this.#shadowObservers.values()) TG_APPLY(this.#api.disconnect, observer, []);
    this.#shadowObservers.clear();
    if (this.#timer !== null) this.#api.clearInterval(this.#timer);
    this.#timer = null;
    this.#doc?.removeEventListener('visibilitychange', this.#onResume);
    this.#win?.removeEventListener('pageshow', this.#onResume);
    this.#doc?.removeEventListener('input', this.#onInput, true);
    this.#doc?.removeEventListener('change', this.#onInput, true);
  }

  start() {
    if (['destroyed', 'locked'].includes(this.#status)) throw new Error(`Cannot start a ${this.#status} guard`);
    if (this.#active) return this;
    this.#init();
    if (this.#options.watchEnvironment && this.#checkIntegrity()) throw new Error(TG_ENV_ERROR);
    this.#baseline(); this.#active = true; this.#status = 'watching'; this.#connect();
    this.#emit('ready', { targets: this.#targets.length });
    return this;
  }

  check() { this.#check(null); }

  #check(records) {
    if (!this.#active || this.#checking || this.#updating) return;
    this.#checking = true;
    const perf = this.#api.perf, started = perf(), revision = this.#revision;
    this.#metrics.checks++;
    try {
      // Keep inspecting after an environment fault: a late, benign SDK that wraps an
      // audited API must not silence later content signals. Stopping can only hide changes.
      if (this.#options.watchEnvironment) this.#checkIntegrity();
      if (!this.#active || revision !== this.#revision) return;
      const delivered = records;
      const { records: history, overflow } = this.#drainRecords(records);
      if (overflow) this.#violation('overflow', null, 'mutation-batch-limit');
      if (this.#options.watchMutations) this.#inspectHistory(history, revision);
      if (!this.#active || revision !== this.#revision) return;
      // Null means a full scan; drained records never narrow a requested sweep.
      records = delivered === null || overflow ? null : history;
      const selection = TG_JSON(this.#select().map(el => this.#id(el)));
      if (selection !== this.#lastSelection) {
        this.#lastSelection = selection;
        if (selection !== this.#selection) this.#violation('targets', null, 'selection-changed');
      }
      for (const target of this.#targets) {
        if (!this.#active || revision !== this.#revision) return;
        const structure = this.#structure(target.el);
        if (structure !== target.lastStructure) {
          target.lastStructure = structure;
          if (structure !== target.structure) this.#violation('structure', target, 'placement-or-ancestor-changed');
        }
        if (!this.#active || revision !== this.#revision) return;
        if (this.#options.watchVisibility) {
          const current = this.#visibility(target.el);
          const signature = TG_JSON(current);
          if (signature !== target.lastVisibility) {
            target.lastVisibility = signature;
            if (current.style !== target.visibility.style ||
                (current.covered !== null && target.visibility.covered !== null && current.covered > target.visibility.covered)) {
              this.#violation('visibility', target, 'visibility-or-occlusion-changed');
            }
          }
        }
        if (!this.#active || revision !== this.#revision) return;
        if (!records || records.some(record => tgContains(target.el, record.target))) {
          const content = this.#snapshot(target.el);
          if (content !== target.lastContent) {
            target.lastContent = content;
            if (content !== target.content) this.#violation('content', target, 'snapshot-changed');
          }
        }
      }
      if (this.#active && revision === this.#revision) this.#pruneShadows();
      if (this.#active && revision === this.#revision && this.#options.watchStyles) {
        const style = this.#styles();
        if (style !== this.#lastStyle) {
          this.#lastStyle = style;
          if (style !== this.#style) this.#violation('style', null, 'stylesheet-changed');
        }
      }
    } catch {
      this.#violation('error', null, 'inspection-failed');
    } finally {
      this.#metrics.lastCheckMs = perf() - started;
      this.#checking = false;
    }
  }

  rebaseline() {
    this.#assertMutable();
    if (['destroyed', 'locked'].includes(this.#status)) throw new Error(`Cannot rebaseline a ${this.#status} guard`);
    this.#init();
    if (this.#options.watchEnvironment && this.#checkIntegrity()) throw new Error(TG_ENV_ERROR);
    const active = this.#active;
    this.#disconnect(); this.#baseline();
    if (active) { this.#status = 'watching'; this.#connect(); }
    return this;
  }

  update(fn) {
    this.#assertMutable();
    if (!this.#active || this.#updating) throw new Error('update requires an active guard and cannot be nested');
    if (typeof fn !== 'function' || fn.constructor?.name === 'AsyncFunction') throw new TypeError('update requires a synchronous function');
    this.check();
    if (!this.#active) throw new Error('Guard stopped before update');
    if (this.#status === 'tampered') throw new Error('Resolve the violation and explicitly rebaseline before update');
    this.#updating = true;
    try {
      const result = fn();
      if (result && typeof result.then === 'function') throw new TypeError('update cannot return a Promise');
      this.rebaseline();
      return result;
    } finally {
      this.#updating = false; this.check();
    }
  }

  stop() {
    this.#assertMutable();
    return this.#halt();
  }

  #halt() {
    this.#active = false; this.#disconnect(); this.#stopWall();
    if (!['locked', 'destroyed'].includes(this.#status)) this.#status = 'stopped';
    return this;
  }

  destroy() {
    this.#assertMutable();
    this.#halt(); this.#wall?.remove(); this.#wall = null;
    if (this.#doc && TG_LOCKS.get(this.#doc) === this) TG_LOCKS.delete(this.#doc);
    this.#targets = []; this.#shadows.clear(); this.#ids = new WeakMap();
    this.#owners = new WeakMap(); this.#integrity = [];
    this.#doc = null; this.#win = null; this.#root = null; this.#api = null;
    this.#status = 'destroyed';
  }

  getStatus() {
    return { status: this.#status, active: this.#active, sealed: this.#sealed, targets: this.#targets.length,
      observers: Number(!!this.#observer) + this.#shadowObservers.size + Number(!!this.#wallObserver),
      timers: Number(this.#timer !== null) + Number(this.#wallTimer !== null), ...this.#metrics };
  }

  #assertMutable() { if (this.#sealed) throw new Error('Guard is permanently sealed; reload the document to reset'); }

  seal() {
    if (this.#sealed) return this;
    this.check();
    if (!this.#active || this.#status !== 'watching' || this.#targets.length === 0) {
      throw new Error('Only an active, clean guard with targets can be sealed');
    }
    this.#sealed = true;
    return this;
  }

  #violation(type, target, reason) {
    if (!this.#active) return;
    this.#status = 'tampered'; this.#metrics.violations++;
    const detail = TG_FREEZE({ type, reason, targetId: target?.id ?? null,
      selector: this.#options.selector, at: this.#api.now(), origin: this.#win.location.origin });
    // Never include DOM content, input values or page path/query/hash.
    this.#emit('violation', detail);
    if (!this.#active) return;
    if (this.#options.mode !== 'silent' && this.#reportUrl) this.#report(detail);
    let suppressed = false;
    try { suppressed = Boolean(this.#options.onTamper?.(detail)); }
    catch { this.#metrics.callbackErrors++; }
    if (this.#active && (!suppressed || this.#sealed) && this.#options.mode === 'lock') this.lock();
  }

  #report(detail) {
    const now = this.#api.perf();
    this.#reportTimes = this.#reportTimes.filter(t => now - t < 60000);
    if (this.#reportTimes.length >= this.#options.maxReportsPerMinute) { this.#metrics.reportsDropped++; return; }
    this.#reportTimes.push(now);
    const body = TG_JSON(detail);
    try {
      if (this.#api.beacon?.(this.#reportUrl, body)) { this.#metrics.reports++; return; }
    } catch { /* Rejected beacons still get a fetch attempt. */ }
    if (!this.#api.fetch) { this.#metrics.reportErrors++; return; }
    try {
      this.#metrics.reports++;
      Promise.resolve(this.#api.fetch(this.#reportUrl, { method: 'POST', body,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, keepalive: true,
        credentials: 'same-origin', referrerPolicy: 'no-referrer' }))
        .then(response => { if (!response.ok) this.#metrics.reportErrors++; })
        .catch(() => { this.#metrics.reportErrors++; });
    } catch { this.#metrics.reportErrors++; }
  }

  #emit(name, detail) {
    try { this.#win.dispatchEvent(new this.#win.CustomEvent(`tamperguard:${name}`, { detail })); }
    catch { /* Events must not interrupt inspection. */ }
  }

  #stopWall() {
    if (this.#wallObserver) TG_APPLY(this.#api.disconnect, this.#wallObserver, []);
    this.#wallObserver = null;
    if (this.#wallTimer !== null) this.#api.clearInterval(this.#wallTimer);
    this.#wallTimer = null;
  }

  lock() {
    if (this.#status === 'destroyed') throw new Error('Cannot lock a destroyed guard');
    if (this.#status === 'locked') return;
    this.#init(); this.#halt(); this.#status = 'locked';
    if (TG_LOCKS.has(this.#doc) && TG_LOCKS.get(this.#doc) !== this) {
      this.#emit('lock', { message: this.#options.message });
      return;
    }
    TG_LOCKS.set(this.#doc, this);
    // Explicit opt-in destructive reaction. No HTML injection sinks or eval.
    const append = (parent, child) => TG_APPLY(this.#api.appendChild, parent, [child]);
    const attr = (node, name, value) => TG_APPLY(this.#api.setAttribute, node, [name, value]);
    const text = (node, value) => TG_APPLY(this.#api.setText, node, [value]);
    const render = () => {
      if (this.#wallObserver) TG_APPLY(this.#api.disconnect, this.#wallObserver, []);
      let html = this.#doc.documentElement;
      if (!html) { html = this.#api.createElement('html'); append(this.#doc, html); }
      TG_APPLY(this.#api.removeAttribute, html, ['style']);
      TG_APPLY(this.#api.removeAttribute, html, ['hidden']);
      TG_APPLY(this.#api.removeAttribute, html, ['inert']);
      if (this.#api.setAdoptedStyles) TG_APPLY(this.#api.setAdoptedStyles, this.#doc, [[]]);
      const head = this.#api.createElement('head');
      const title = this.#api.createElement('title'); text(title, 'Page changed'); append(head, title);
      const body = this.#api.createElement('body'), host = this.#api.createElement('div');
      attr(host, 'data-tamperguard-wall', '');
      attr(host, 'style', 'position:fixed;inset:0;z-index:2147483647;display:block;visibility:visible;opacity:1');
      const root = this.#api.attachShadow ? TG_APPLY(this.#api.attachShadow, host, [{ mode: 'closed' }]) : host;
      const panel = this.#api.createElement('section');
      attr(panel, 'role', 'alertdialog'); attr(panel, 'aria-modal', 'true');
      attr(panel, 'aria-labelledby', 'tg-title'); attr(panel, 'aria-describedby', 'tg-message');
      attr(panel, 'style', 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;box-sizing:border-box;background:#10121a;color:white;font:16px system-ui;text-align:center');
      const heading = this.#api.createElement('h1'); attr(heading, 'id', 'tg-title'); text(heading, 'Page changed unexpectedly');
      const message = this.#api.createElement('p'); attr(message, 'id', 'tg-message'); text(message, this.#options.message);
      const button = this.#api.createElement('button'); text(button, 'Refresh');
      attr(button, 'style', 'padding:12px 24px;font:inherit;cursor:pointer');
      TG_APPLY(this.#api.addEventListener, button, ['click', () => this.#win.location.reload()]);
      append(panel, heading); append(panel, message); append(panel, button); append(root, panel); append(body, host);
      TG_APPLY(this.#api.replaceChildren, html, [head, body]); this.#wall = host;
      TG_APPLY(this.#api.focus, button, []);
      if (this.#wallObserver) TG_APPLY(this.#api.observe, this.#wallObserver, [this.#doc, { childList: true, subtree: true, attributes: true }]);
    };
    // A script that re-inserts its node whenever the wall removes it would otherwise
    // ping-pong with this observer forever inside one microtask checkpoint and freeze
    // the tab. Bound bursts; the timer below keeps repairing at least once a second.
    let burstStart = -Infinity, burst = 0;
    this.#wallObserver = new this.#api.Observer(() => {
      const now = this.#api.perf();
      if (now - burstStart >= 1000) { burstStart = now; burst = 0; }
      if (++burst <= TG_WALL_BURST) render();
    });
    render();
    this.#wallTimer = this.#api.setInterval(() => {
      if (!this.#wall?.isConnected || this.#doc.body?.children.length !== 1) render();
    }, 1000);
    this.#emit('lock', { message: this.#options.message });
  }
}

TG_FREEZE(TamperGuard.prototype);
TG_FREEZE(TamperGuard);

  return TamperGuard;
});
