import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { captureObservers } from './helpers.mjs';
test.beforeEach(async ({ page }) => { await page.goto('/test/fixture.html'); });
async function setup(page, options = {}) {
  await page.evaluate(options => {
    window.events = []; window.guard = new TamperGuard({ mode: 'report', interval: 0, ...options, onTamper: d => { events.push(d); } }).start();
  }, options);
}

test('reports continuously, deduplicates unchanged states, and keeps original baseline', async ({ page }) => {
  await setup(page);
  const counts = await page.evaluate(() => {
    const el = document.querySelector('strong'), original = el.textContent, counts = [];
    for (const text of ['a', 'a', 'b', original, 'a']) { el.textContent = text; guard.check(); counts.push(events.length); }
    return counts;
  });
  expect(counts).toEqual([1, 1, 2, 2, 3]);
  expect(await page.evaluate(() => guard.getStatus().active)).toBe(true);
});

test('start is idempotent and cannot silently rebaseline', async ({ page }) => {
  await setup(page, { interval: 20 });
  await page.evaluate(() => { document.querySelector('strong').textContent = 'changed'; guard.start(); guard.check(); });
  expect(await page.evaluate(() => events.length)).toBe(1);
});

test('stop releases observation and timers; restart takes a fresh baseline', async ({ page }) => {
  await setup(page, { interval: 20 });
  await page.evaluate(() => guard.stop());
  const before = await page.evaluate(() => guard.getStatus().checks);
  await page.evaluate(() => { document.querySelector('strong').textContent = 'new'; });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => guard.getStatus().checks)).toBe(before);
  await page.evaluate(() => { guard.start(); guard.check(); });
  expect(await page.evaluate(() => events.length)).toBe(0);
});

test('rebaseline retargets framework replacements and resumes reporting', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    document.querySelector('#target').outerHTML = '<div data-guard id="target">new</div>';
    guard.rebaseline(); guard.check();
  });
  expect(await page.evaluate(() => events.length)).toBe(0);
  await page.evaluate(() => { document.querySelector('#target').textContent = 'unauthorized'; guard.check(); });
  expect(await page.evaluate(() => events.length)).toBe(1);
});

test('update accepts synchronous changes and preserves return value', async ({ page }) => {
  await setup(page);
  const value = await page.evaluate(() => guard.update(() => { document.querySelector('strong').textContent = 'approved'; return 42; }));
  expect(value).toBe(42); expect(await page.evaluate(() => events.length)).toBe(0);
});

test('update refuses to accept pending unauthorized changes', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(() => {
    document.querySelector('strong').textContent = 'pending tamper';
    let ran = false;
    try { guard.update(() => { ran = true; }); }
    catch (e) { return { ran, count: events.length, message: e.message }; }
  });
  expect(result.ran).toBe(false); expect(result.count).toBe(1);
  expect(result.message).toContain('rebaseline');
});

test('update does not swallow callback failures or accept partial changes', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(() => {
    let message;
    try { guard.update(() => { document.querySelector('strong').textContent = 'partial update'; throw Error('application error'); }); }
    catch (e) { message = e.message; }
    return { message, count: events.length };
  });
  expect(result).toEqual({ message: 'application error', count: 1 });
});

test('async update is rejected before execution', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(() => {
    let ran = false;
    try { guard.update(async () => { ran = true; }); } catch (e) { return { ran, message: e.message }; }
  });
  expect(result.ran).toBe(false); expect(result.message).toContain('synchronous');
});

test('destroy is idempotent and terminal, including from a callback', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => {
    window.guard = new TamperGuard({ onTamper: () => guard.destroy() }).start();
    document.querySelector('strong').textContent = 'changed'; guard.check(); guard.destroy();
  });
  expect(await page.evaluate(() => guard.getStatus().status)).toBe('destroyed');
  expect(await page.evaluate(() => { try { guard.start(); return false; } catch { return true; } })).toBe(true);
  expect(errors).toEqual([]);
});

test('empty selection is observable and later matches are not silently trusted', async ({ page }) => {
  await setup(page, { selector: '.late' });
  expect(await page.evaluate(() => guard.getStatus().targets)).toBe(0);
  await page.evaluate(() => { document.querySelector('#outside').className = 'late'; });
  await expect.poll(() => page.evaluate(() => events.some(e => e.type === 'targets'))).toBe(true);
});

test('explicit whole-document fallback detects changes outside marked regions', async ({ page }) => {
  await setup(page, { selector: '.missing', guardWholeDocument: true });
  await page.evaluate(() => { document.querySelector('#outside').textContent = 'changed'; });
  await expect.poll(() => page.evaluate(() => events.length)).toBeGreaterThan(0);
});

test('callback errors are counted without stopping monitoring', async ({ page }) => {
  await page.evaluate(() => {
    window.guard = new TamperGuard({ interval: 0, onTamper: () => { throw Error('callback failed'); } }).start();
    document.querySelector('strong').textContent = 'changed'; guard.check();
  });
  expect(await page.evaluate(() => guard.getStatus().callbackErrors)).toBe(1);
  expect(await page.evaluate(() => guard.getStatus().active)).toBe(true);
});

test('pageshow performs an immediate full check', async ({ page }) => {
  await captureObservers(page);
  await setup(page);
  await page.evaluate(() => {
    testObservers.forEach(o => o.disconnect()); document.querySelector('input').value = 'changed';
    window.dispatchEvent(new Event('pageshow'));
  });
  expect(await page.evaluate(() => events.length)).toBe(1);
});

test('silent mode never sends a configured beacon', async ({ page }) => {
  await page.evaluate(() => { window.sent = 0; navigator.sendBeacon = () => { sent++; return true; }; });
  await setup(page, { mode: 'silent', reportUrl: '/report' });
  await page.evaluate(() => { document.querySelector('strong').textContent = 'changed'; guard.check(); });
  expect(await page.evaluate(() => sent)).toBe(0);
});

test('beacon refusal falls back to fetch, redacts payload, and caps reports', async ({ page }) => {
  await page.evaluate(() => {
    history.replaceState(null, '', '?secret=TOKEN#private');
    window.sent = []; navigator.sendBeacon = () => false;
    window.fetch = async (url, options) => { sent.push({ url, options }); return { ok: true }; };
  });
  await setup(page, { reportUrl: '/report', maxReportsPerMinute: 2 });
  await page.evaluate(() => { for (const s of ['a', 'b', 'c']) { document.querySelector('strong').textContent = s; guard.check(); } });
  const result = await page.evaluate(() => ({ sent, status: guard.getStatus() }));
  expect(result.sent).toHaveLength(2); expect(result.status.reportsDropped).toBe(1);
  const payload = JSON.parse(result.sent[0].options.body);
  expect(Object.keys(payload).sort()).toEqual(['at', 'origin', 'reason', 'selector', 'targetId', 'type']);
  expect(result.sent[0].options.referrerPolicy).toBe('no-referrer');
  expect(JSON.stringify(result.sent)).not.toContain('TOKEN');
});

test('fetch rejection is caught without unhandled rejection', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.evaluate(() => { navigator.sendBeacon = () => false; window.fetch = () => Promise.reject(Error('offline')); });
  await setup(page, { reportUrl: '/report' });
  await page.evaluate(() => { document.querySelector('strong').textContent = 'changed'; guard.check(); });
  await expect.poll(() => page.evaluate(() => guard.getStatus().reportErrors)).toBe(1);
  expect(errors).toEqual([]);
});

test('native beacon delivers the documented payload to a real HTTP collector', async ({ page }) => {
  const received = [];
  const collector = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8'); req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      received.push({ method: req.method, contentType: req.headers['content-type'], body });
      res.writeHead(204, { 'Access-Control-Allow-Origin': 'http://127.0.0.1:8080',
        'Access-Control-Allow-Credentials': 'true', Connection: 'close' }); res.end();
    });
  });
  await new Promise(resolve => collector.listen(0, '127.0.0.1', resolve));
  try {
    await setup(page, { reportUrl: `http://127.0.0.1:${collector.address().port}/collect` });
    await page.evaluate(() => { document.querySelector('strong').textContent = 'changed'; guard.check(); });
    await expect.poll(() => received.length).toBe(1);
    expect(received[0].method).toBe('POST'); expect(received[0].contentType).toContain('text/plain');
    expect(JSON.parse(received[0].body).type).toBe('content');
    expect(received[0].body).not.toContain('$1,299');
  } finally { await new Promise(resolve => collector.close(resolve)); }
});

test('lock is opt-in and reconstructs after body/html removal and host styling', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await setup(page, { mode: 'lock' });
  await page.evaluate(() => { document.querySelector('strong').textContent = 'changed'; });
  await expect(page.locator('[data-tamperguard-wall]')).toHaveCount(1);
  for (const operation of ['body', 'html', 'style']) {
    await page.evaluate(operation => {
      if (operation === 'body') document.body.remove();
      if (operation === 'html') document.documentElement.remove();
      if (operation === 'style') document.querySelector('[data-tamperguard-wall]').style.display = 'none';
    }, operation);
    await expect(page.locator('[data-tamperguard-wall]')).toBeVisible();
  }
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => guard.getStatus().status)).toBe('locked');
});

test('callback suppression keeps monitoring without locking', async ({ page }) => {
  await page.evaluate(() => {
    window.guard = new TamperGuard({ mode: 'lock', onTamper: () => true }).start();
    document.querySelector('strong').textContent = 'changed'; guard.check();
  });
  await expect(page.locator('#target')).toHaveCount(1);
  expect(await page.evaluate(() => guard.getStatus().active)).toBe(true);
});

test('strict CSP and Trusted Types allow detection and lock without HTML sinks', async ({ page, browserName }) => {
  await page.route('**/test/fixture.html', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(),
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'none'; require-trusted-types-for 'script'; trusted-types 'none'" } });
  });
  await page.goto('/test/fixture.html');
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await setup(page, { mode: 'lock', message: '<img src=x onerror=alert(1)>' });
  await page.evaluate(() => { document.querySelector('strong').textContent = 'changed'; });
  await expect(page.locator('[data-tamperguard-wall]')).toBeVisible();
  expect(errors).toEqual([]);
});
