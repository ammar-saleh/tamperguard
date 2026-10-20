import { test, expect } from '@playwright/test';
import { captureObservers } from './helpers.mjs';

test.beforeEach(async ({ page }) => { await page.goto('/test/fixture.html'); });
async function start(page, options = {}) {
  await page.evaluate(options => {
    window.events = [];
    window.guard = new TamperGuard({ mode: 'silent', interval: 0, ...options,
      onTamper: detail => { window.events.push(detail); } }).start();
  }, options);
}
async function detected(page, type) {
  await expect.poll(() => page.evaluate(type => events.some(e => !type || e.type === type), type)).toBe(true);
}

const mutations = {
  text: () => document.querySelector('strong').firstChild.data = '$1',
  attribute: () => document.querySelector('strong').title = 'changed',
  'injected node': () => document.querySelector('#target').append(document.createElement('b')),
  'removed child': () => document.querySelector('strong').remove(),
  'inline style': () => document.querySelector('strong').style.display = 'none',
  'significant whitespace': () => document.querySelector('pre').textContent = 'A         B',
  'extension-looking overlay': () => {
    const overlay = document.createElement('div'); overlay.dataset.gramm = '';
    overlay.style.cssText = 'position:fixed;inset:0;background:white'; overlay.textContent = 'Fake';
    document.querySelector('#target').append(overlay);
  },
  'extension attribute': () => document.querySelector('strong').setAttribute('data-gr-ext-installed', ''),
  'root removal': () => document.querySelector('#target').remove(),
  'root replacement': () => document.querySelector('#target').outerHTML = '<section data-guard>Fake</section>',
  'identical root replacement': () => { const el = document.querySelector('#target'); el.replaceWith(el.cloneNode(true)); },
  'ancestor style': () => document.querySelector('#parent').style.display = 'none',
  'ancestor class': () => document.body.className = 'hidden',
  'target moved': () => document.querySelector('#outside').append(document.querySelector('#target')),
  'body replacement': () => document.body.replaceWith(document.createElement('body')),
  'document element removal': () => document.documentElement.remove(),
  'new matching target': () => { const el = document.createElement('div'); el.dataset.guard = ''; document.body.append(el); },
  'selector removed': () => document.querySelector('#target').removeAttribute('data-guard')
};
for (const [name, mutation] of Object.entries(mutations)) {
  test(`detects ${name}`, async ({ page }) => { await start(page); await page.evaluate(mutation); await detected(page); });
}

test('unrelated mutations do not resnapshot targets', async ({ page }) => {
  await start(page);
  const before = await page.evaluate(() => guard.getStatus().snapshots);
  await page.evaluate(() => { document.querySelector('#outside').textContent = 'Clock tick'; });
  await expect.poll(() => page.evaluate(() => guard.getStatus().checks)).toBeGreaterThan(0);
  expect(await page.evaluate(() => guard.getStatus().snapshots)).toBe(before);
  expect(await page.evaluate(() => events.length)).toBe(0);
});

test('only affected region is resnapshotted; nested targets are deduplicated', async ({ page }) => {
  await page.evaluate(() => { document.querySelector('strong').dataset.guard = ''; document.querySelector('#outside').dataset.guard = ''; });
  await start(page);
  expect(await page.evaluate(() => guard.getStatus().targets)).toBe(2);
  const before = await page.evaluate(() => guard.getStatus().snapshots);
  await page.evaluate(() => { document.querySelector('strong').textContent = 'changed'; });
  await detected(page, 'content');
  expect(await page.evaluate(() => guard.getStatus().snapshots)).toBe(before + 1);
});

test('explicit ignores are honored without changing the live DOM', async ({ page }) => {
  await start(page, { ignoreSelectors: ['.clock'], ignoreAttributes: ['spellcheck'], ignoreAttributePrefixes: ['data-benign-'] });
  await page.evaluate(() => {
    const el = document.querySelector('#target');
    const clock = document.createElement('span'); clock.className = 'clock'; clock.textContent = '12:00'; el.append(clock);
    el.setAttribute('spellcheck', 'false'); el.dataset.benignExample = 'yes'; guard.check();
  });
  expect(await page.evaluate(() => events.length)).toBe(0);
  await expect(page.locator('.clock')).toHaveText('12:00');
});

test('attribute order is canonical but whitespace is exact', async ({ page }) => {
  await page.evaluate(() => { const el = document.querySelector('strong'); el.setAttribute('a', '1'); el.setAttribute('b', '2'); });
  await start(page);
  await page.evaluate(() => { const el = document.querySelector('strong'); el.removeAttribute('a'); el.setAttribute('a', '1'); guard.check(); });
  expect(await page.evaluate(() => events.length)).toBe(0);
});

test('snapshotting does not construct clones of custom elements', async ({ page }) => {
  await page.evaluate(() => {
    window.constructed = 0;
    customElements.define('test-element', class extends HTMLElement { constructor() { super(); window.constructed++; } });
    document.querySelector('#target').append(document.createElement('test-element'));
  });
  await start(page);
  await page.evaluate(() => { guard.check(); guard.check(); });
  expect(await page.evaluate(() => window.constructed)).toBe(1);
});

test('live timers catch mutations after observer disconnection', async ({ page }) => {
  await captureObservers(page);
  await start(page, { interval: 20 });
  await page.evaluate(() => { testObservers.forEach(o => o.disconnect()); document.querySelector('strong').textContent = 'changed'; });
  await detected(page, 'content');
});

test('later reassignment of globals does not cancel captured timers', async ({ page }) => {
  await captureObservers(page);
  await start(page, { interval: 20 });
  await page.evaluate(() => {
    testObservers.forEach(o => o.disconnect()); window.setInterval = () => 0; window.MutationObserver = function () {};
    document.querySelector('strong').textContent = 'changed';
  });
  await detected(page, 'environment');
});

for (const [name, mutate] of Object.entries({
  value: () => document.querySelector('input').value = 'changed',
  checked: () => document.querySelector('input').checked = true,
  indeterminate: () => document.querySelector('input').indeterminate = true,
  'CSSOM rule': () => document.querySelector('#styles').sheet.cssRules[0].style.color = 'red',
  'stylesheet disabled': () => document.querySelector('#styles').sheet.disabled = true,
  'stylesheet media': () => document.querySelector('#styles').sheet.media.mediaText = 'print',
  'adopted stylesheet': () => { const s = new CSSStyleSheet(); s.replaceSync('[data-guard]{display:none}'); document.adoptedStyleSheets = [s]; }
})) {
  test(`periodic sweep detects ${name}`, async ({ page }) => {
    await start(page, { interval: 20, watchStyles: true }); await page.evaluate(mutate); await detected(page);
  });
}

test('input events detect values with interval disabled', async ({ page }) => {
  await start(page); await page.locator('input').fill('new value'); await detected(page, 'content');
});

test('open shadow content is observed', async ({ page }) => {
  await page.evaluate(() => { document.querySelector('#shadow').attachShadow({ mode: 'open' }).textContent = 'original'; });
  await start(page);
  await page.evaluate(() => { document.querySelector('#shadow').shadowRoot.textContent = 'changed'; });
  await detected(page, 'content');
});

test('new shadow roots are discovered by sweeps', async ({ page }) => {
  await start(page, { interval: 20 });
  await page.evaluate(() => { document.querySelector('#shadow').attachShadow({ mode: 'open' }).textContent = 'new'; });
  await detected(page, 'content');
});

test('explicit closed shadow root can be guarded', async ({ page }) => {
  await page.evaluate(() => {
    const root = document.querySelector('#shadow').attachShadow({ mode: 'closed' });
    const el = document.createElement('b'); el.dataset.guard = ''; el.textContent = 'original'; root.append(el);
    window.events = []; window.guard = new TamperGuard({ root, interval: 0, mode: 'silent', onTamper: d => events.push(d) }).start();
    el.textContent = 'changed';
  });
  await detected(page, 'content');
});

test('shadow adopted stylesheet changes are inspected', async ({ page }) => {
  await page.evaluate(() => {
    const root = document.querySelector('#shadow').attachShadow({ mode: 'open' });
    const sheet = new CSSStyleSheet(); sheet.replaceSync('b{color:red}'); root.adoptedStyleSheets = [sheet];
  });
  await start(page, { watchStyles: true, interval: 20 });
  await page.evaluate(() => { document.querySelector('#shadow').shadowRoot.adoptedStyleSheets[0].replaceSync('b{color:blue}'); });
  await detected(page, 'style');
});

test('same-origin iframe document is supported as an explicit root', async ({ page }) => {
  await page.evaluate(async () => {
    const frame = document.createElement('iframe'); document.body.append(frame);
    const doc = frame.contentDocument; const el = doc.createElement('div'); el.dataset.guard = ''; el.textContent = 'original'; doc.body.append(el);
    window.events = []; window.guard = new TamperGuard({ root: doc, mode: 'silent', interval: 20, onTamper: d => events.push(d) }).start();
    el.textContent = 'changed';
  });
  await detected(page, 'content');
});

test('template content is covered by full sweeps', async ({ page }) => {
  await page.evaluate(() => { const t = document.createElement('template'); t.innerHTML = '<b>original</b>'; document.querySelector('#target').append(t); });
  await start(page, { interval: 20 });
  await page.evaluate(() => { document.querySelector('template').content.querySelector('b').textContent = 'changed'; });
  await detected(page, 'content');
});

test('documented pixel-only limit: canvas drawing has no DOM signal', async ({ page }) => {
  await page.evaluate(() => document.querySelector('#target').append(document.createElement('canvas')));
  await start(page);
  await page.evaluate(() => { document.querySelector('canvas').getContext('2d').fillRect(0, 0, 10, 10); guard.check(); });
  expect(await page.evaluate(() => events.length)).toBe(0);
});
