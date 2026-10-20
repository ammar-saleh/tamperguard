import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { cpus, platform, arch } from 'node:os';
import { createDemoServer } from './serve.mjs';
const server = createDemoServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/test/fixture.html`);
  const results = await page.evaluate(async () => {
    const results = [];
    for (const profile of ['snapshot', 'hardened', 'hardened-visibility']) for (const count of [100, 1000, 10000]) {
      document.body.innerHTML = '<div data-guard>' + '<span class="item" title="value">Price $1,299.00</span>'.repeat(count) + '</div><aside></aside>';
      const t = performance.now();
      const protection = profile === 'snapshot' ? null : TamperGuard.protect({ interval: 0, mode: 'silent', watchVisibility: profile === 'hardened-visibility' });
      const guard = protection?.monitor || new TamperGuard({ interval: 0, mode: 'silent' }).start();
      const startMs = performance.now() - t;
      for (let i = 0; i < 5; i++) guard.check();
      const checks = [];
      for (let i = 0; i < 50; i++) { const now = performance.now(); guard.check(); checks.push(performance.now() - now); }
      const before = guard.getStatus().snapshots;
      for (let i = 0; i < 20; i++) { document.querySelector('aside').textContent = String(i); await new Promise(r => setTimeout(r, 0)); }
      checks.sort((a, b) => a - b);
      results.push({ profile, children: count, startMs, medianCheckMs: checks[25], p95CheckMs: checks[47],
        unrelatedMutationSnapshots: guard.getStatus().snapshots - before });
      if (protection) protection.controller.destroy(); else guard.destroy();
    }
    return results;
  });
  const report = { browser: browser.version(), node: process.version, platform: `${platform()} ${arch()}`,
    cpu: cpus()[0]?.model, samplesPerSize: 50, results,
    sizes: JSON.parse(readFileSync('dist/integrity.json')) };
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/benchmark.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); await new Promise(r => server.close(r)); }
