# Local release verification: 0.3.0

Verified on October 19, 2026, in the Windows development workspace. These results describe this local run, not a hosted CI run or an independent security audit.

| Check | Result |
| --- | --- |
| Browser regression suite | 324 passed: 108 scenarios in each of Chromium, Firefox and WebKit |
| Node/package contract tests | 5 passed |
| TypeScript NodeNext consumers | ESM and CommonJS positive/negative checks passed |
| Packed consumer installation | Local tarball installed into a fresh temporary project; ESM/CommonJS imports passed |
| Runtime dependencies | None |
| Dependency advisory check | npm audit reported zero known vulnerabilities at verification time |
| Distribution integrity | Generated SHA-384 manifest checked against all three bundles |
| Local documentation links | All resolved |
| Demo visual review | Sealed demo inspected at 1280px and 390px; no horizontal overflow or initial violations on mobile |

Coverage includes frozen/private state, read-only handles, permanent sealing, restored DOM edits, bounded mutation storms, selected API replacement, captured lock rendering, optional occlusion detection, local-only networking, and the original timer/root-replacement/ignore-list/reporting/lock/CommonJS failures, lifecycle cleanup, explicit updates, callback reentrancy, shadow DOM, stylesheets, live form properties, strict browser policies, offline framework examples, and deliberately undetected boundary cases. The original eight interactive checks have been replaced with a 15-case demonstration and the larger automated suite.

## Performance snapshot

Playwright Chromium 156.0.8078.4, Node 24.18.0, Windows x64, Intel Core i7-14700. Fifty warm full checks per size; see the benchmark script and PERFORMANCE.md for methodology.

| Profile | Children | Median full check | p95 full check |
| --- | --- | --- | --- |
| snapshot | 100 | 0.1 ms | 0.2 ms |
| snapshot | 1,000 | 1.0 ms | 1.3 ms |
| snapshot | 10,000 | 11.2 ms | 11.8 ms |
| hardened | 100 | 0.2 ms | 0.3 ms |
| hardened | 1,000 | 0.9 ms | 1.2 ms |
| hardened | 10,000 | 10.0 ms | 11.9 ms |
| hardened-visibility | 100 | 0.1 ms | 0.2 ms |
| hardened-visibility | 1,000 | 0.9 ms | 1.1 ms |
| hardened-visibility | 10,000 | 9.9 ms | 12.0 ms |

Twenty unrelated mutation batches per fixture caused zero target content snapshots in every profile. Selection and structural checks still have a cost. The minified runtime is 20,076 bytes, 7,011 bytes gzip. Profiles ran sequentially; warmup, JIT and timer resolution explain small differences, so lower numbers do not establish that more checks make the library faster. Visibility measurements on a static synthetic layout are not a worst-case layout cost. These measurements do not establish mobile, battery, or all-application guarantees.

## Reproduce

```sh
npm ci
npx playwright install chromium firefox webkit
npm run check
npm run pack:check
npm run benchmark
```

Local artifacts include the tested tarball, package file manifest, benchmark JSON, complete final test log, and screenshots. Regenerate them after source changes; do not carry forward this result as evidence for an untested release.

Remaining deployment work: choose the real public repository and publishing account, perform application-specific extension/hydration/privacy checks, and test physical mobile devices before making device-specific claims. Publishing and external hosting have not been performed.
