# Release verification: 0.3.0

Verified on October 19, 2026, in the Windows development workspace. These results describe this local run, not a hosted CI run or an independent security audit. CI repeats the same checks on Linux for every push and pull request.

| Check | Result |
| --- | --- |
| Browser regression suite | 336 passed: 112 scenarios in each of Chromium, Firefox and WebKit |
| Node/package contract tests | 5 passed |
| TypeScript NodeNext consumers | ESM and CommonJS positive/negative checks passed |
| Packed consumer installation | Local tarball installed into a fresh temporary project; ESM/CommonJS imports passed |
| Runtime dependencies | None |
| Dependency advisory check | `npm audit` reported zero known vulnerabilities at verification time |
| Distribution integrity | Generated SHA-384 manifest checked against all three bundles; builds normalize line endings so hashes match across operating systems |
| Local documentation links | All resolved |
| Demo review | Index, playground, hardened, attack matrix, React and Vue demos checked in light and dark color schemes and at 375px width; the interactive attack matrix passed 15/15 |

Coverage includes frozen/private state, read-only handles, permanent sealing, restored DOM edits, bounded mutation storms, selected API replacement (including continued detection after a late SDK-style wrap), captured lock rendering, lock-wall responsiveness against a re-inserting script, input-event scoping, optional occlusion detection, local-only networking, lifecycle cleanup, explicit updates, callback reentrancy, shadow DOM, stylesheets, live form properties, strict browser policies, offline framework examples, and deliberately undetected boundary cases.

## Performance snapshot

Playwright Chromium 156.0.8078.4, Node 24.18.0, Windows x64, Intel Core i7-14700. Fifty warm full checks per size; see the benchmark script and [PERFORMANCE.md](PERFORMANCE.md) for methodology.

| Profile | Children | Median full check | p95 full check |
| --- | --- | --- | --- |
| snapshot | 100 | 0.1 ms | 0.3 ms |
| snapshot | 1,000 | 1.1 ms | 1.3 ms |
| snapshot | 10,000 | 11.5 ms | 12.3 ms |
| hardened | 100 | 0.2 ms | 0.3 ms |
| hardened | 1,000 | 1.0 ms | 1.1 ms |
| hardened | 10,000 | 9.9 ms | 12.3 ms |
| hardened-visibility | 100 | 0.1 ms | 0.2 ms |
| hardened-visibility | 1,000 | 0.9 ms | 1.0 ms |
| hardened-visibility | 10,000 | 9.9 ms | 11.9 ms |

Twenty unrelated mutation batches per fixture caused zero target content snapshots in every profile. Selection and structural checks still have a cost. The minified runtime is 20,395 bytes, 7,173 bytes gzip. Profiles ran sequentially; warmup, JIT and timer resolution explain small differences, so lower numbers do not establish that more checks make the library faster. Visibility measurements on a static synthetic layout are not a worst-case layout cost. These measurements do not establish mobile, battery, or all-application guarantees.

## Reproduce

```sh
npm ci
npx playwright install chromium firefox webkit
npm run check
npm run pack:check
npm run benchmark
```

Local artifacts (ignored by git) include the tested tarball, package file manifest and benchmark JSON. Regenerate them after source changes; do not carry this result forward as evidence for an untested release.

Remaining work outside this repository: create the public GitHub repository and npm publication (see [RELEASING.md](RELEASING.md)), perform application-specific extension/hydration/privacy checks, and test physical mobile devices before making device-specific claims.
