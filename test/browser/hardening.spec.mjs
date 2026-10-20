import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => page.goto('/test/fixture.html'));
async function protect(page, options = {}) {
  await page.evaluate(options => {
    window.events = [];
    const { monitor, controller } = TamperGuard.protect({ interval: 0, ...options, onTamper: d => { events.push(d); } });
    window.monitor = monitor;
    // Deliberately exposed only in the test harness to exercise controller policy.
    window.controller = controller;
  }, options);
}

test('state, options, instance methods and class prototype resist replacement', async ({ page }) => {
  const result = await page.evaluate(() => {
    const guard = new TamperGuard({ mode: 'silent', interval: 0 }).start();
    const writes = [Reflect.set(guard, '_active', false), Reflect.set(guard, 'status', 'stopped'),
      Reflect.set(guard, 'options', {}), Reflect.set(guard, 'check', () => {}),
      Reflect.set(TamperGuard.prototype, 'check', () => {}), Reflect.set(TamperGuard, 'protect', () => {})];
    const keys = Reflect.ownKeys(guard);
    document.querySelector('strong').textContent = 'changed'; guard.check();
    const result = { writes, keys, violations: guard.getStatus().violations, active: guard.getStatus().active };
    guard.destroy(); return result;
  });
  expect(result.writes).toEqual([false, false, false, false, false, false]);
  expect(result.keys).toEqual([]); expect(result.violations).toBe(1); expect(result.active).toBe(true);
});

test('read-only handle has no lifecycle capability or mutable status reference', async ({ page }) => {
  await protect(page);
  const result = await page.evaluate(() => {
    const status = monitor.getStatus(); status.active = false; status.violations = 999;
    return { keys: Object.keys(monitor), prototype: Object.getPrototypeOf(monitor),
      overwrite: Reflect.set(monitor, 'check', () => {}), active: monitor.getStatus().active, count: monitor.getStatus().violations };
  });
  expect(result.keys.sort()).toEqual(['check', 'getStatus']); expect(result.prototype).toBeNull();
  expect(result.overwrite).toBe(false); expect(result.active).toBe(true); expect(result.count).toBe(0);
});

test('sealed controller cannot stop, destroy or accept a new baseline', async ({ page }) => {
  await protect(page);
  expect(await page.evaluate(() => {
    controller.seal();
    return ['stop', 'destroy', 'rebaseline', 'update'].map(name => {
      try { controller[name](() => {}); return false; } catch (e) { return e.message.includes('sealed'); }
    });
  })).toEqual([true, true, true, true]);
  await page.evaluate(() => { document.querySelector('strong').textContent = 'changed'; });
  await expect.poll(() => page.evaluate(() => monitor.getStatus().violations)).toBeGreaterThan(0);
  expect(await page.evaluate(() => monitor.getStatus().sealed)).toBe(true);
});

test('sealing requires targets and a clean active baseline', async ({ page }) => {
  expect(await page.evaluate(() => {
    const idle = new TamperGuard(), empty = new TamperGuard({ selector: '.missing' }).start();
    const dirty = new TamperGuard().start(); document.querySelector('strong').textContent = 'changed';
    const result = [idle, empty, dirty].map(g => { try { g.seal(); return false; } catch { return true; } });
    [idle, empty, dirty].forEach(g => g.destroy()); return result;
  })).toEqual([true, true, true]);
});

test('sealed lock ignores callback suppression and repairs its wall', async ({ page }) => {
  await page.evaluate(() => {
    const p = TamperGuard.protect({ mode: 'lock', onTamper: () => true });
    p.controller.seal(); window.monitor = p.monitor;
    document.querySelector('strong').textContent = 'changed';
  });
  await expect(page.locator('[data-tamperguard-wall]')).toHaveCount(1);
  await page.evaluate(() => document.body.remove());
  await expect(page.locator('[data-tamperguard-wall]')).toHaveCount(1);
  expect(await page.evaluate(() => monitor.getStatus().status)).toBe('locked');
});

for (const [name, mutate] of Object.entries({
  text: () => { const el = document.querySelector('strong').firstChild, old = el.data; el.data = 'changed'; el.data = old; },
  attribute: () => { const el = document.querySelector('strong'); el.setAttribute('title', 'changed'); el.removeAttribute('title'); },
  injection: () => { const el = document.createElement('b'); document.querySelector('#target').append(el); el.remove(); },
  replacement: () => { const el = document.querySelector('strong'); el.replaceWith(el.cloneNode(true)); },
  'root detach and restore': () => { const el = document.querySelector('#target'), parent = el.parentNode; el.remove(); parent.append(el); },
  'ancestor hide and restore': () => { const el = document.querySelector('#parent'); el.hidden = true; el.hidden = false; el.removeAttribute('hidden'); }
})) {
  test(`strict history detects ${name} even when final state matches`, async ({ page }) => {
    await protect(page); await page.evaluate(mutate);
    await expect.poll(() => page.evaluate(() => events.some(e => e.type === 'mutation'))).toBe(true);
  });
}

test('manual checks drain queued history before an attacker can request an approved update', async ({ page }) => {
  await protect(page);
  expect(await page.evaluate(() => {
    const el = document.querySelector('strong').firstChild, text = el.data; el.data = 'fake'; el.data = text;
    try { controller.update(() => {}); return false; } catch { return true; }
  })).toBe(true);
});

test('strict updates accept only explicit transactions and ignore configured noise', async ({ page }) => {
  await protect(page, { ignoreAttributes: ['data-clock'], ignoreSelectors: ['.noise'] });
  await page.evaluate(() => {
    controller.update(() => { document.querySelector('strong').textContent = 'approved'; });
    const root = document.querySelector('#target'), noise = document.createElement('span'); noise.className = 'noise';
    root.append(noise); noise.remove(); root.dataset.clock = '12:00'; monitor.check();
  });
  expect(await page.evaluate(() => events.length)).toBe(0);
});

test('strict history sees shadow-tree changes that are restored', async ({ page }) => {
  await page.evaluate(() => { document.querySelector('#shadow').attachShadow({ mode: 'open' }).textContent = 'original'; });
  await protect(page);
  await page.evaluate(() => { const root = document.querySelector('#shadow').shadowRoot; root.textContent = 'fake'; root.textContent = 'original'; monitor.check(); });
  expect(await page.evaluate(() => events.some(e => e.type === 'mutation'))).toBe(true);
});

test('mutation storms produce an overflow signal instead of unbounded processing', async ({ page }) => {
  await protect(page);
  await page.evaluate(() => { const el = document.querySelector('strong'); for (let i = 0; i < 10010; i++) el.title = String(i); monitor.check(); });
  expect(await page.evaluate(() => events.some(e => e.type === 'overflow'))).toBe(true);
});

for (const name of ['querySelectorAll', 'stringify', 'iterator', 'disconnect', 'value']) {
  test(`post-start ${name} replacement raises an environment violation`, async ({ page }) => {
    await protect(page);
    await page.evaluate(name => {
      let object, key;
      if (name === 'querySelectorAll') { object = Document.prototype; key = name; }
      if (name === 'stringify') { object = JSON; key = name; }
      if (name === 'iterator') { object = Array.prototype; key = Symbol.iterator; }
      if (name === 'disconnect') { object = MutationObserver.prototype; key = name; }
      if (name === 'value') { object = HTMLInputElement.prototype; key = name; }
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      try {
        Object.defineProperty(object, key, { configurable: true, value: () => [] });
        monitor.check();
      } finally { Object.defineProperty(object, key, descriptor); }
    }, name);
    expect(await page.evaluate(() => events.some(e => e.type === 'environment'))).toBe(true);
  });
}

test('a late SDK-style API wrap does not silence later content detection', async ({ page }) => {
  await protect(page);
  const types = await page.evaluate(() => {
    // Error-monitoring and session-replay tools commonly wrap these after page load.
    const add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (...args) { return Reflect.apply(add, this, args); };
    try {
      monitor.check();
      document.querySelector('strong').textContent = '$1.00';
      monitor.check();
      return events.map(e => e.type);
    } finally { EventTarget.prototype.addEventListener = add; }
  });
  expect(types).toContain('environment');
  expect(types).toContain('content');
});

test('after an environment fault a new guard can be started as documented', async ({ page }) => {
  const result = await page.evaluate(() => {
    const guard = new TamperGuard({ mode: 'silent', interval: 0 }).start();
    window.setInterval = window.setInterval.bind(window);
    let message = '';
    try { guard.rebaseline(); } catch (error) { message = error.message; }
    guard.destroy();
    const next = new TamperGuard({ mode: 'silent', interval: 0 }).start();
    const status = next.getStatus().status;
    next.destroy();
    return { message, status };
  });
  expect(result.message).toMatch(/destroy this guard/);
  expect(result.status).toBe('watching');
});

test('environment damage cannot be accepted with rebaseline', async ({ page }) => {
  await protect(page);
  expect(await page.evaluate(() => {
    const original = document.querySelectorAll; document.querySelectorAll = () => [];
    try { controller.rebaseline(); return false; }
    catch { return true; }
    finally { delete document.querySelectorAll; }
  })).toBe(true);
});

test('visual sampling detects a sibling overlay while scoped content is unchanged', async ({ page }) => {
  await protect(page, { watchVisibility: true, interval: 20 });
  await page.evaluate(() => {
    const el = document.createElement('div'); el.style.cssText = 'position:fixed;inset:0;z-index:999999;background:white';
    document.body.append(el);
  });
  await expect.poll(() => page.evaluate(() => events.some(e => e.type === 'visibility'))).toBe(true);
});

test('visual sampling tolerates an unrelated overlay away from the target', async ({ page }) => {
  await protect(page, { watchVisibility: true });
  await page.evaluate(() => {
    const el = document.createElement('div'); el.style.cssText = 'position:fixed;bottom:0;right:0;width:10px;height:10px';
    document.body.append(el); monitor.check();
  });
  expect(await page.evaluate(() => events.length)).toBe(0);
});

test('local-only protection rejects a network endpoint and makes no report requests', async ({ page }) => {
  expect(await page.evaluate(() => { try { TamperGuard.protect({ reportUrl: '/collect' }); return false; } catch { return true; } })).toBe(true);
  const requests = []; page.on('request', r => requests.push(r.url()));
  await protect(page);
  await page.evaluate(() => { document.querySelector('strong').textContent = 'changed'; monitor.check(); });
  expect(requests).toEqual([]);
});


test('sealed lock renders through captured DOM methods after post-start replacement', async ({ page }) => {
  await page.evaluate(() => {
    const p = TamperGuard.protect({ mode: 'lock' }); p.controller.seal(); window.monitor = p.monitor;
    const replacements = [[Node.prototype, 'appendChild'], [Element.prototype, 'replaceChildren'],
      [Element.prototype, 'setAttribute'], [Element.prototype, 'removeAttribute'],
      [Element.prototype, 'attachShadow'], [Document.prototype, 'createElement'], [Node.prototype, 'textContent']];
    const saved = replacements.map(([object, key]) => Object.getOwnPropertyDescriptor(object, key));
    try {
      replacements.forEach(([object, key]) => Object.defineProperty(object, key, { configurable: true, value: () => { throw Error('replaced'); } }));
      monitor.check();
    } finally { replacements.forEach(([object, key], i) => Object.defineProperty(object, key, saved[i])); }
  });
  await expect(page.locator('[data-tamperguard-wall]')).toHaveCount(1);
  expect(await page.evaluate(() => monitor.getStatus().status)).toBe('locked');
});

test('local factory rejects invalid option containers', async ({ page }) => {
  expect(await page.evaluate(() => [null, false, 1, 'options', []].map(options => {
    try { TamperGuard.protect(options); return false; } catch (e) { return e instanceof TypeError; }
  }))).toEqual([true, true, true, true, true]);
});
