# Release procedure

Nothing in this repository publishes automatically. Each step below is a deliberate maintainer action.

## First publication

1. Confirm `git rev-parse --show-toplevel` prints this project directory, not an enclosing folder.
2. Create an empty public GitHub repository named `tamperguard` under the account in `package.json` (`ammar-saleh`). Do not add a README or license there; this repository already has them.
3. Push:

   ```sh
   git remote add origin https://github.com/ammar-saleh/tamperguard.git
   git push -u origin main
   ```

4. On GitHub, open **Settings → Code security** and enable **Private vulnerability reporting** (SECURITY.md links to it). Confirm the **Verify** workflow runs and passes on the push.
5. Check that the npm name is still free: `npm view tamperguard` should return a 404. A 404 is not a reservation; publish soon after checking.
6. Continue with the steps for every release.
7. After the first npm publication, change the README's Quick start to `npm install tamperguard` and add a pinned CDN example (`https://cdn.jsdelivr.net/npm/tamperguard@<version>/dist/tamperguard.min.js`) with the `integrity` value from `dist/integrity.json`. Until then the README must not advertise an npm name that nobody owns.

## Every release

1. Update `version` in `package.json`, the CDN example version in README.md, and the CHANGELOG heading (replace `unreleased` with the date).
2. Run `npm ci`, `npx playwright install chromium firefox webkit`, and `npm run check`. Development requires a maintained Node release (tested locally with Node 24; CI uses Node 22).
3. Run `npm run benchmark`. Review runtime size and content-scan cost, and update [VERIFICATION.md](VERIFICATION.md). Test physical mobile/Safari devices before claiming those devices are supported.
4. Run `npm run pack:check`. It rebuilds, creates `artifacts/tamperguard-<version>.tgz`, verifies the file allowlist, installs the tarball into a clean temporary consumer without install scripts, and checks ESM/CommonJS exports and zero runtime dependencies. Inspect `artifacts/package-check.json`.
5. Commit the rebuilt `dist/` and `types/index.d.mts` with the version bump. CI fails if the committed build output differs from a fresh build.
6. Publish with an account that has two-factor authentication enabled:

   ```sh
   npm login
   npm publish
   ```

   `prepublishOnly` runs the full check suite again before upload. Do not add tokens or credentials to any file in this repository.
7. Tag and push the release, then create a GitHub release from the tag with the CHANGELOG entry:

   ```sh
   git tag -a v0.3.0 -m "TamperGuard 0.3.0"
   git push origin v0.3.0
   ```

8. Optionally, once publishing works, configure npm trusted publishing (OIDC) for this repository so later releases can be published from CI with provenance.

## Maintenance

Pin development dependencies in package-lock.json, review updates, and rerun the browser/package suite after changes. Security-library positioning needs precise scope: publish reproduced failures and tests rather than unsupported claims of complete prevention. Document regressions in the changelog and avoid silently changing defaults in a patch release. Never overwrite or unpublish a released version; publish a new patch instead.
