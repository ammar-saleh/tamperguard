# Contributing

Install with `npm ci`, install Playwright browsers, and run `npm run check`. Keep the runtime dependency-free; build/test dependencies are allowed. `src/guard-core.js` is the source of truth, and `npm run build` regenerates all shipped bundles and the integrity manifest. Commit the regenerated `dist/` files and `types/index.d.mts` with your source change; CI fails when they are stale.

For behavioral changes, add a browser regression that fails without the fix. Include Chromium, Firefox and WebKit where their APIs permit the feature. Add an expected-undetected test and coverage documentation for intentional boundaries rather than claiming an untested guarantee. Changes to exports, types, lifecycle or reporting also need corresponding contract tests.

Do not add anti-debugging loops, secret client-side keys, automatic extension trust, or claims that a client-controlled report proves authenticity. Keep all DOM text and form values out of telemetry. A new exclusion must explain the detection coverage it removes.

Use `npm run benchmark` for changes to traversal, observers or snapshots. Report the engine/hardware and fixture size. Do not extrapolate one synthetic desktop measurement to mobile performance.

For issue reports, include a minimal reproduction, library/browser versions, options, expected behavior, and actual events. Remove personal information from fixtures. See SECURITY.md for security-related reports.
