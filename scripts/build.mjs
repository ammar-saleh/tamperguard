// Zero-runtime-dependency library; esbuild minifies and builds offline demos.
//   node scripts/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { transform, build } from 'esbuild';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
// Normalize line endings so builds (and SRI hashes) match on every OS and checkout.
const lf = text => text.replace(/\r\n/g, '\n');
const core = lf(readFileSync(join(root, 'src', 'guard-core.js'), 'utf8'));

const banner =
  `/*! TamperGuard v${pkg.version} | ${pkg.license} License | ${pkg.homepage || 'tamperguard'} */\n`;

const umd =
  banner +
  `(function (root, factory) {\n` +
  `  if (typeof define === 'function' && define.amd) define([], factory);\n` +
  `  else if (typeof module === 'object' && module.exports) module.exports = factory();\n` +
  `  else root.TamperGuard = factory();\n` +
  `})(typeof self !== 'undefined' ? self : this, function () {\n` +
  `  'use strict';\n` +
  core +
  `\n  return TamperGuard;\n});\n`;

const esm =
  banner +
  core +
  `\nexport { TamperGuard };\nexport default TamperGuard;\n`;

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'tamperguard.umd.js'), umd);
writeFileSync(join(root, 'dist', 'tamperguard.mjs'), esm);

const min = (await transform(umd, { minify: true, legalComments: 'inline', target: 'es2022' })).code;
writeFileSync(join(root, 'dist', 'tamperguard.min.js'), min);
writeFileSync(join(root, 'types', 'index.d.mts'), lf(readFileSync(join(root, 'types', 'index.d.ts'), 'utf8')));
const integrity = {};
for (const [name, code] of [['tamperguard.umd.js', umd], ['tamperguard.mjs', esm], ['tamperguard.min.js', min]]) {
  integrity[name] = { bytes: Buffer.byteLength(code), gzipBytes: gzipSync(code).length,
    integrity: `sha384-${createHash('sha384').update(code).digest('base64')}` };
}
writeFileSync(join(root, 'dist', 'integrity.json'), JSON.stringify(integrity, null, 2) + '\n');

console.log(`built dist/tamperguard.umd.js (${umd.length} bytes)`);
console.log(`built dist/tamperguard.mjs (${esm.length} bytes)`);

for (const framework of ['react', 'vue']) {
  await build({ entryPoints: [join(root, 'demos', framework, 'app.jsx')],
    outfile: join(root, 'demos', framework, 'bundle.js'), bundle: true,
    format: 'iife', target: 'es2022', minify: true, legalComments: 'linked',
    define: { 'process.env.NODE_ENV': '"development"', __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' } });
}
