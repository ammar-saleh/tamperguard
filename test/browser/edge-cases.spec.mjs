import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => page.goto('/test/fixture.html'));

test('multiple lock guards share one wall instead of fighting', async ({ page }) => {
  await page.evaluate(() => {
    window.first = new TamperGuard({ mode: 'lock' }).start();
    window.second = new TamperGuard({ mode: 'lock' }).start();
    document.querySelector('strong').textContent = 'changed';
  });
  await expect(page.locator('[data-tamperguard-wall]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => [first.status, second.status])).toEqual(['locked', 'locked']);
  const html = await page.content(); await page.waitForTimeout(100); expect(await page.content()).toBe(html);
});

test('stop ends wall healing and destroy removes the wall', async ({ page }) => {
  await page.evaluate(() => { window.guard = new TamperGuard(); guard.lock(); guard.stop(); });
  await expect(page.locator('[data-tamperguard-wall]')).toHaveCount(1);
  await page.evaluate(() => { guard.destroy(); });
  await expect(page.locator('[data-tamperguard-wall]')).toHaveCount(0);
});

test('SVG namespaced attributes and foreign content are covered', async ({ page }) => {
  await page.evaluate(() => {
    document.querySelector('#target').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><text>original</text></svg>';
    window.guard = new TamperGuard({ mode: 'silent', interval: 0 }).start();
    document.querySelector('text').setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#changed');
  });
  await expect.poll(() => page.evaluate(() => guard.getStatus().violations)).toBeGreaterThan(0);
});

test('select and textarea live state are detected', async ({ page }) => {
  await page.evaluate(() => {
    document.querySelector('#target').innerHTML = '<textarea>original</textarea><select multiple><option>a</option><option>b</option></select>';
    window.guard = new TamperGuard({ mode: 'silent', interval: 0 }).start();
    document.querySelector('textarea').value = 'changed'; guard.check();
    document.querySelectorAll('option')[1].selected = true; guard.check();
  });
  expect(await page.evaluate(() => guard.getStatus().violations)).toBe(2);
});

test('property and ancestor checks can be explicitly disabled', async ({ page }) => {
  await page.evaluate(() => {
    window.guard = new TamperGuard({ mode: 'silent', interval: 0, watchProperties: false, watchAncestors: false }).start();
    document.querySelector('input').value = 'changed'; document.body.className = 'theme'; guard.check();
  });
  expect(await page.evaluate(() => guard.getStatus().violations)).toBe(0);
});

test('invalid selectors, roots and report URLs fail instead of silently weakening coverage', async ({ page }) => {
  expect(await page.evaluate(() => {
    const cases = [{ selector: '[' }, { ignoreSelectors: ['['] }, { reportUrl: 'javascript:alert(1)' },
      { reportUrl: 'https://username:secret@example.com/' }, { root: {} }];
    return cases.every(options => { try { new TamperGuard(options).start(); return false; } catch { return true; } });
  })).toBe(true);
});

test('a synchronous event listener can destroy the guard safely', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.evaluate(() => {
    window.guard = new TamperGuard().start();
    window.addEventListener('tamperguard:violation', () => guard.destroy(), { once: true });
    document.querySelector('strong').textContent = 'changed'; guard.check();
  });
  expect(await page.evaluate(() => guard.status)).toBe('destroyed'); expect(errors).toEqual([]);
});

test('callback rebaseline is honored without stale follow-up violations', async ({ page }) => {
  await page.evaluate(() => {
    window.guard = new TamperGuard({ onTamper: () => { guard.rebaseline(); return true; } }).start();
    document.querySelector('strong').textContent = 'changed'; guard.check(); guard.check();
  });
  expect(await page.evaluate(() => guard.getStatus().violations)).toBe(1);
  expect(await page.evaluate(() => guard.status)).toBe('watching');
});

test('cross-origin stylesheet contents are reported as inaccessible', async ({ page }) => {
  await page.route('http://styles.example.test/style.css', route => route.fulfill({ contentType: 'text/css', body: 'strong{color:red}' }));
  await page.evaluate(async () => {
    await new Promise(resolve => {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'http://styles.example.test/style.css';
      link.onload = resolve; document.head.append(link);
    });
    window.guard = new TamperGuard({ mode: 'silent', watchStyles: true }).start();
  });
  expect(await page.evaluate(() => guard.getStatus().inaccessibleStylesheets)).toBe(1);
});

test('closed shadow roots without an explicit reference remain outside coverage', async ({ page }) => {
  await page.evaluate(() => {
    const shadow = document.querySelector('#shadow').attachShadow({ mode: 'closed' }); shadow.textContent = 'original';
    window.guard = new TamperGuard({ mode: 'silent', interval: 0 }).start(); shadow.textContent = 'changed'; guard.check();
  });
  expect(await page.evaluate(() => guard.getStatus().violations)).toBe(0);
});

test('external overlay is outside scoped DOM coverage', async ({ page }) => {
  await page.evaluate(() => {
    window.guard = new TamperGuard({ mode: 'silent', interval: 0 }).start();
    const fake = document.createElement('div'); fake.style.cssText = 'position:fixed;inset:0;background:white'; fake.textContent = 'fake';
    document.body.append(fake); guard.check();
  });
  expect(await page.evaluate(() => guard.getStatus().violations)).toBe(0);
});

test('state restored before observer delivery is a documented snapshot limit', async ({ page }) => {
  await page.evaluate(() => {
    window.guard = new TamperGuard({ mode: 'silent', interval: 0 }).start();
    const el = document.querySelector('strong'), text = el.textContent; el.textContent = 'temporary'; el.textContent = text;
  });
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => guard.getStatus().violations)).toBe(0);
});

test('deterministic mutation sequence remains detectable across repeated rebaselines', async ({ page }) => {
  const result = await page.evaluate(() => {
    const root = document.querySelector('#target');
    const guard = new TamperGuard({ mode: 'silent', interval: 0 }).start();
    let seed = 12345;
    for (let i = 0; i < 60; i++) {
      guard.rebaseline(); seed = (seed * 1664525 + 1013904223) >>> 0;
      const before = guard.getStatus().violations;
      switch (seed % 4) {
        case 0: root.setAttribute('data-sequence', String(i)); break;
        case 1: root.append(document.createTextNode(String(i))); break;
        case 2: root.style.paddingLeft = `${i + 1}px`; break;
        case 3: root.append(document.createElement('b')); break;
      }
      guard.check(); if (guard.getStatus().violations !== before + 1) return i;
    }
    guard.destroy(); return -1;
  });
  expect(result).toBe(-1);
});

test('removed shadow subtrees release observer registrations', async ({ page }) => {
  await page.evaluate(() => {
    document.querySelector('#shadow').attachShadow({ mode: 'open' }).textContent = 'original';
    window.guard = new TamperGuard({ mode: 'silent', interval: 0 }).start();
  });
  expect(await page.evaluate(() => guard.getStatus().observers)).toBe(2);
  await page.evaluate(() => { document.querySelector('#shadow').remove(); guard.check(); });
  expect(await page.evaluate(() => guard.getStatus().observers)).toBe(1);
});

test('many mount/unmount cycles leave no active registrations', async ({ page }) => {
  expect(await page.evaluate(() => {
    for (let i = 0; i < 100; i++) {
      const guard = new TamperGuard({ interval: 10 }).start(); guard.start(); guard.rebaseline(); guard.destroy();
      const status = guard.getStatus();
      if (status.observers || status.timers || status.targets || status.active) return false;
    }
    return true;
  })).toBe(true);
});

test('SVG template-like elements do not crash HTML template inspection', async ({ page }) => {
  await page.evaluate(() => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.append(document.createElementNS('http://www.w3.org/2000/svg', 'template'));
    document.querySelector('#target').append(svg);
    window.guard = new TamperGuard({ mode: 'silent', interval: 0 }).start();
    svg.firstChild.textContent = 'changed'; guard.check();
  });
  expect(await page.evaluate(() => guard.getStatus().violations)).toBe(1);
});
