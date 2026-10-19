// Zero-dependency build: wraps src/guard-core.js into UMD + ESM bundles.
// Pure string concatenation (no JS parsing), so it can't silently corrupt code.
//   node scripts/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const core = readFileSync(join(root, 'src', 'guard-core.js'), 'utf8');

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

console.log(`built dist/tamperguard.umd.js (${umd.length} bytes)`);
console.log(`built dist/tamperguard.mjs (${esm.length} bytes)`);
