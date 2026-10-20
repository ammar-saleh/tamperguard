import { test, expect } from '@playwright/test';

test('plain HTML playground reports and supports approved updates', async ({ page }) => {
  await page.goto('/demos/plain-html/');
  await page.locator('#legit').click();
  await expect(page.locator('.price')).toHaveText('$999.00');
  expect(await page.evaluate(() => demoMonitor.getStatus().violations)).toBe(0);
  await page.locator('#replace').click();
  await expect(page.locator('#events')).toContainText('targets');
  await expect(page.locator('h1')).toHaveText('Try to change the evidence.');
});

test('interactive matrix passes and cannot be double-started', async ({ page }) => {
  await page.goto('/test/break-it.html'); await page.locator('#run').click();
  await expect(page.locator('#run')).toBeDisabled();
  await expect(page.locator('#summary')).toHaveText('15/15 passed');
  await expect(page.locator('#run')).toBeEnabled();
});

for (const framework of ['react', 'vue']) {
  test(`${framework} offline demo updates, detects tamper, and cleans up`, async ({ page }) => {
    const errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      if (!route.request().url().startsWith('http://127.0.0.1:8080/')) { external.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    await page.goto(`/demos/${framework}/`);
    await page.locator('#increment').click(); await expect(page.locator('#count')).toHaveText('1');
    await page.locator('#approved').click(); await expect(page.locator('.price')).toHaveText('$999.00');
    await expect(page.locator('#violations')).toHaveText('0');
    await page.locator('#tamper').click(); await expect.poll(async () => Number(await page.locator('#violations').innerText())).toBeGreaterThan(0);
    await page.evaluate(() => window.unmountDemo());
    expect(await page.evaluate(() => window.demoMonitor.getStatus().status)).toBe('destroyed');
    expect(errors).toEqual([]); expect(external).toEqual([]);
  });
}

test('minified browser distribution exposes the same API', async ({ page }) => {
  await page.goto('/test/fixture.html');
  await page.addScriptTag({ url: '/dist/tamperguard.min.js' });
  expect(await page.evaluate(() => {
    const guard = new TamperGuard({ mode: 'silent', interval: 0 }).start();
    document.querySelector('strong').textContent = 'changed'; guard.check();
    const count = guard.getStatus().violations; guard.destroy(); return count;
  })).toBe(1);
});

test('sealed local demo rejects monitor modification and locks on restored edits', async ({ page }) => {
  await page.goto('/demos/hardened/');
  await page.locator('#disable').click();
  await expect(page.locator('#result')).toContainText('rejected');
  expect(await page.evaluate(() => window.tamperMonitor.getStatus().sealed)).toBe(true);
  await page.locator('#restore').click();
  await expect(page.locator('[data-tamperguard-wall]')).toBeAttached();
});
