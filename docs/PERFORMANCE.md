# Performance

Run `npm run benchmark` after installing the Playwright Chromium build. Results are written to `artifacts/benchmark.json`, including engine version, OS/CPU, Node version, distribution sizes, warmup policy in the script, and 50 measurements per tree size for each of three profiles: constructor defaults, hardened factory, and hardened factory with visibility sampling. Sweeps are disabled during measurement to isolate each manual check.

The synthetic fixture has one protected element with 100, 1,000, or 10,000 span children, each containing two attributes and a short text node. Five full checks warm up each case. The median is sample 26 and p95 is sample 48 of 50 sorted timings. Each case also performs 20 unrelated mutations and counts target snapshots. Timer resolution, JIT, garbage collection, power state and system load affect results; do not interpret differences below timer resolution as meaningful.

See [release verification](VERIFICATION.md) for the latest measured results; the complete per-profile data is in `artifacts/benchmark.json`. These are engineering measurements on a desktop, not guarantees for phones, busy applications, or all browsers. Rerun against your deployment shape. The latest release verification records are in the local artifacts folder.

## Work performed

- A full sweep reads and serializes all covered content, form properties and ancestor attributes. With `watchStyles`, it also reads accessible stylesheet rules. Work scales with inspected content; this is not constant time.
- A mutation delivery reselects the target set and checks placement/ancestors, but snapshots only targets containing changed nodes. Nested targets are covered by their outer selected target.
- With `watchStyles`, a mutation delivery re-reads stylesheets only when a record involves a `<style>` or `<link>` element. Every sweep and manual `check()` reads them all. On a test page with a 5,000-rule stylesheet and a clock ticking outside the guarded region, reading styles on every delivery took about 9 ms per frame; it now takes none.
- Unrelated mutation batches still have selection/structure overhead; zero content snapshots does not mean zero CPU cost.
- Exact token snapshots retain baseline and last-seen strings. This consumes memory proportional to the protected state, in exchange for avoiding clone construction and collision-dependent comparisons.
- Environment auditing adds a fixed set of descriptor comparisons per check. Strict history processes at most 10,000 queued records and retains node ownership in a WeakMap. The browser may still allocate larger native queues before a check.
- Visibility sampling reads computed style, bounds and five hit-test points per target. This can force layout; offscreen points are skipped. The synthetic benchmark is not a worst-case layout workload.
- Many targeted regions with long ancestor chains can cost more than one equivalent shallow region. Selector complexity and large stylesheets also matter.

## Practical tuning

Prefer small static regions. Keep the default 1-second backstop until you measure actual requirements. An observer delivery already batches synchronous mutations; the library does not add a long debounce that deliberately expands detection latency.

Do not disable the interval unless you accept losing automatic CSSOM/property/template/new-shadow checks and the observer backstop. Background tabs may throttle even an enabled timer. A 10,000-child check can consume a substantial portion of a frame on a desktop and much longer on a phone.

Use `getStatus().checks`, `snapshots`, `styleReads`, and `lastCheckMs` to inspect behavior. Measure input latency and long tasks in your application, with actual extensions, styles, and mutations. The benchmark does not establish real-device battery, heap-growth, or latency budgets. Add those measurements before deploying on resource-constrained devices.
