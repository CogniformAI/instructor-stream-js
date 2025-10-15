# Release Guide

Manual releases keep the process predictable and avoid surprise publishes from CI. Follow this checklist whenever cutting a new version.

1. **Prepare the changes**
   - Update version numbers in `package.json` (root) and `packages/instructor-stream/package.json`.
   - Add changelog entries in both `CHANGELOG.md` (root) and `packages/instructor-stream/CHANGELOG.md`.
   - Commit the feature/fix work before starting the release commit.

2. **Validate locally**
   - `pnpm install --frozen-lockfile`
   - `pnpm -C packages/instructor-stream test`
   - `pnpm -C packages/instructor-stream build`

3. **Create the release commit**
   - `git add .`
   - `git commit -m "Release X.Y.Z"`

4. **Tag and push**
   - `git tag vX.Y.Z`
   - `git push origin main`
   - `git push origin vX.Y.Z`

5. **Publish to npm**
   - From `packages/instructor-stream/`: `pnpm publish --access public`
   - Wait for the publish command to finish successfully, then announce the release.

6. **If something goes wrong**
   - `npm unpublish @cogniformai/instructor-stream@X.Y.Z --force` (only if the release is broken and you are absolutely sure).
   - Delete the git tag (`git tag -d vX.Y.Z`, `git push origin :refs/tags/vX.Y.Z`).
   - Fix the issue, bump to a new patch version, and re-run the checklist.

Keep this file up to date if the release flow changes (e.g., adding additional packages or automation).
