import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run through npm run pack:check');
function run(args, cwd) {
  const result = spawnSync(process.execPath, [npm, ...args], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}
mkdirSync('artifacts', { recursive: true });
const [pack] = JSON.parse(run(['pack', '--json', '--ignore-scripts', '--pack-destination', 'artifacts']));
const paths = pack.files.map(file => file.path);
for (const expected of ['dist/tamperguard.min.js', 'dist/tamperguard.mjs', 'types/index.d.mts', 'types/index.d.cts', 'SECURITY.md', 'docs/HARDENING.md']) {
  assert.ok(paths.includes(expected), `Missing ${expected}`);
}
assert.ok(!paths.some(path => /^(test|node_modules|artifacts|demos)\//.test(path)));
const consumer = mkdtempSync(join(tmpdir(), 'tamperguard-consumer-'));
try {
  writeFileSync(join(consumer, 'package.json'), '{"private":true}');
  run(['install', resolve('artifacts', pack.filename), '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false'], consumer);
  writeFileSync(join(consumer, 'check.mjs'), `import T, {TamperGuard} from 'tamperguard';
import {createRequire} from 'node:module';
const cjs=createRequire(import.meta.url)('tamperguard');
if(typeof T.protect!=='function' || typeof cjs.protect!=='function' || !Object.isFrozen(T.prototype) || T!==TamperGuard || cjs!==cjs.TamperGuard || new T().getStatus().status!=='idle') throw Error('Broken package exports');`);
  const check = spawnSync(process.execPath, ['check.mjs'], { cwd: consumer, encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
  const pkg = JSON.parse(readFileSync(join(consumer, 'node_modules/tamperguard/package.json')));
  assert.equal(Object.keys(pkg.dependencies || {}).length, 0);
} finally {
  if (!resolve(consumer).startsWith(resolve(tmpdir()) + sep + 'tamperguard-consumer-')) throw new Error('Unexpected cleanup path');
  rmSync(consumer, { recursive: true, force: true });
}
writeFileSync('artifacts/package-check.json', JSON.stringify(pack, null, 2) + '\n');
console.log(`Verified packed installation: artifacts/${pack.filename} (${pack.size} bytes; no runtime dependencies)`);
