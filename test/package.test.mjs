import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createDemoServer } from '../scripts/serve.mjs';
const require = createRequire(import.meta.url);
const CJS = require('../dist/tamperguard.umd.js');
const ESM = await import('../dist/tamperguard.mjs');

test('CJS direct, destructured, default and ESM imports work without a DOM', () => {
  assert.equal(CJS.TamperGuard, CJS); assert.equal(CJS.default, CJS);
  assert.equal(ESM.default, ESM.TamperGuard);
  assert.equal(new CJS().getStatus().status, 'idle');
  assert.equal(new ESM.default().options.mode, 'report');
  assert.throws(() => new CJS().start(), /root/);
});

test('invalid configuration fails early', () => {
  for (const options of [null, [], { mode: 'bad' }, { interval: -1 }, { interval: Infinity },
    { typo: true }, { selector: '' }, { watchStyles: 'yes' }, { ignoreSelectors: [null] },
    { ignoreAttributes: [''] }, { onTamper: 'callback' }, { maxReportsPerMinute: -1 }]) {
    assert.throws(() => new CJS(options), TypeError);
  }
  const guard = new CJS(Object.assign(Object.create(null), { interval: 0 }));
  assert.equal(guard.options.interval, 0);
});

test('options cannot mutate shared defaults and destruction is safe before start', () => {
  const array = ['.clock']; const a = new CJS({ ignoreSelectors: array }); array.push('.anything');
  assert.deepEqual(a.options.ignoreSelectors, ['.clock']);
  assert.deepEqual(new CJS().options.ignoreSelectors, []);
  assert.throws(() => { a.options.mode = 'lock'; }, TypeError);
  a.destroy(); a.destroy(); assert.equal(a.getStatus().status, 'destroyed');
});

test('generated bundles and integrity manifest match source', () => {
  const core = readFileSync(new URL('../src/guard-core.js', import.meta.url), 'utf8');
  const manifest = JSON.parse(readFileSync(new URL('../dist/integrity.json', import.meta.url)));
  for (const [name, details] of Object.entries(manifest)) {
    const data = readFileSync(new URL(`../dist/${name}`, import.meta.url));
    assert.equal(data.length, details.bytes);
    assert.equal(`sha384-${createHash('sha384').update(data).digest('base64')}`, details.integrity);
    if (!name.includes('.min.')) assert.ok(data.toString().includes(core));
  }
  assert.ok(manifest['tamperguard.min.js'].gzipBytes < 12000, 'gzip size budget exceeded');
});

test('demo server binds only requested interface and rejects traversal/private paths', async () => {
  const server = createDemoServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ['/package.json', '/node_modules/esbuild/package.json', '/.env',
      '/test/%2e%2e%5cpackage.json', '/test/%2e%2e%2fpackage.json', '/test/%00.html']) {
      assert.ok([403, 404].includes((await fetch(url + path)).status), path);
    }
    const response = await fetch(url + '/test/fixture.html');
    assert.equal(response.status, 200); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await fetch(url + '/', { method: 'POST' })).status, 405);
    assert.equal(await (await fetch(url + '/test/fixture.html', { method: 'HEAD' })).text(), '');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
