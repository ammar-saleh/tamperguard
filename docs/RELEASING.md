# Release procedure

This repository prepares a local release; it does not publish automatically.

1. Use a dedicated repository rooted in this project directory. Verify `git rev-parse --show-toplevel` before adding files; do not accidentally publish an enclosing Desktop/home repository.
2. Confirm ownership and availability of the npm name and actual GitHub repository. Update package metadata if needed. A registry 404 during preparation is not a reservation of the name.
3. Review README, migration notes, coverage matrix and license attribution. Enable private vulnerability reporting on the eventual public repository and update SECURITY.md with the real reporting route.
4. Run `npm ci`, `npx playwright install chromium firefox webkit`, and `npm run check`. CI uses `--with-deps` on Linux. Development requires a maintained Node release (tested locally with Node 24; CI configured for Node 22).
5. Run `npm run benchmark`. Review runtime size, content-scan cost and actual application behavior. Test physical mobile/Safari devices before claiming those devices are certified.
6. Run `npm run pack:check`. It rebuilds, creates `artifacts/tamperguard-0.3.0.tgz`, verifies the file allowlist, installs the tarball into a clean temporary consumer without install scripts, and checks ESM/CommonJS exports and zero runtime dependencies. Inspect `artifacts/package-check.json`.
7. Check that the tarball includes built JavaScript, ESM/CJS declarations, license, README, security/coverage docs, and integrity metadata. It excludes demos, tests, dependencies, local artifacts and credentials.
8. Only after deciding to release, publish the reviewed tarball with the intended npm account and access settings. Configure npm trusted publishing/provenance when the actual repository and release workflow exist. Do not add credentials to files or blindly publish from a parent folder.
9. Tag the reviewed commit, attach release notes and publish the static demo assets if desired. Preserve framework license files emitted beside bundled examples. Keep CDN versions pinned and use the generated SRI values. Do not present the demo lock as proof of screenshot authenticity.

## Maintenance

Pin development dependencies in package-lock.json, review updates, and rerun the browser/package suite after changes. Security-library positioning needs precise scope: publish reproduced failures and tests rather than unsupported claims of complete prevention. Document regressions in the changelog and avoid silently changing defaults in a patch release.

The CI file is prepared locally. A local passing suite is not evidence that the hosted workflow has already run.
