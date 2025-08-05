
> @cogniformai/instructor-stream-js@0.0.0 release /home/runner/work/instructor-stream-js/instructor-stream-js
> pnpm build:workspace && bumpp && changelogen --release && release-it
> @cogniformai/instructor-stream-js@0.0.0 build:workspace /home/runner/work/instructor-stream-js/instructor-stream-js
> pnpm -r build
Scope: 4 of 5 workspace projects
packages/providers build$ tsup
packages/providers build: CLI Building entry: src/index.ts
packages/providers build: CLI Using tsconfig: tsconfig.json
packages/providers build: CLI tsup v8.5.0
packages/providers build: CLI Using tsup config: /home/runner/work/instructor-stream-js/instructor-stream-js/packages/providers/tsup.config.ts
packages/providers build: CLI Target: esnext
packages/providers build: CLI Cleaning output folder
packages/providers build: CJS Build start
packages/providers build: ESM Build start
packages/providers build: ESM dist/index.js     11.29 KB
packages/providers build: ESM dist/index.js.map 43.05 KB
packages/providers build: ESM ⚡️ Build success in 122ms
packages/providers build: CJS dist/index.cjs     15.16 KB
packages/providers build: CJS dist/index.cjs.map 30.87 KB
packages/providers build: CJS ⚡️ Build success in 145ms
packages/providers build: DTS Build start
packages/providers build: DTS ⚡️ Build success in 1667ms
packages/providers build: DTS dist/index.d.cts 5.85 KB
packages/providers build: DTS dist/index.d.ts  5.85 KB
packages/providers build: Done
packages/instructor-stream build$ tsup
packages/instructor-stream build: CLI Building entry: src/index.ts
packages/instructor-stream build: CLI Using tsconfig: tsconfig.json
packages/instructor-stream build: CLI tsup v8.5.0
packages/instructor-stream build: CLI Using tsup config: /home/runner/work/instructor-stream-js/instructor-stream-js/packages/instructor-stream/tsup.config.ts
packages/instructor-stream build: CLI Target: es2020
packages/instructor-stream build: CLI Cleaning output folder
packages/instructor-stream build: CJS Build start
packages/instructor-stream build: ESM Build start
packages/instructor-stream build: DTS Build start
packages/instructor-stream build: CJS dist/index.cjs     43.66 KB
packages/instructor-stream build: CJS dist/index.cjs.map 113.04 KB
packages/instructor-stream build: CJS ⚡️ Build success in 466ms
packages/instructor-stream build: ESM dist/index.js     37.07 KB
packages/instructor-stream build: ESM dist/index.js.map 180.87 KB
  at async loadConfig (node_modules/.pnpm/c12@3.2.0_magicast@0.3.5/node_modules/c12/dist/shared/c12.DDjD4HmS.mjs:168:23)
  at async loadChangelogConfig (node_modules/.pnpm/changelogen@0.6.2_magicast@0.3.5/node_modules/changelogen/dist/shared/changelogen.D-9f3HTX.mjs:447:22)
  at async Module.defaultMain (node_modules/.pnpm/changelogen@0.6.2_magicast@0.3.5/node_modules/changelogen/dist/chunks/default.mjs:24:18)
  at async main (node_modules/.pnpm/changelogen@0.6.2_magicast@0.3.5/node_modules/changelogen/dist/cli.mjs:22:3)
           custom ...🚀 Let's release @cogniformai/instructor-stream-js (0.0.0...0.0.1)
Changelog:
* chore: Update release workflow (94ca235)
* feat: migrate from changesets to unjs release stack (bumpp + changelogen + release-it) (4200df1)
* feat: release v0.0.1 - first published version (a00a98c)
* feat: add README and fix GitHub Actions permissions (#5) (e0056f2)
* feat: setup release workflow and create initial changeset (4dfd67f)
* fix: resolve publishing workflow and complete release process (a3b70df)
* feat: implement local GitHub Actions testing and comprehensive CI/CD validation (d1e8a1e)
* fix: replace any types with unknown for linting compliance (31797b7)
* refactor: extract errors to separate module and fix providers build (e16533b)
* chore: update the zod deprecations to the latest version. (0138225)
* chore: run zod migration script to make sure we caught everything. (1d7c2bd)
* Test: Final Workflow Validation (fbc4a15)
* fix: update package names and lockfile (5b2f264)
* Fix: Correct Workflow Trigger (#1) (75e3967)
* chore: update GitHub Actions workflows to use Node.js 22.17.1 and clean up permissions (b99c55b)
* fix(workflows): correct repository name casing (f4436a0)
* refactor: update default values in schemas to use Zod 4's prefault method and adjust model version in tests (b9369b5)
* changeset: add initial release changeset for v0.0.1 (dc85071)
* ci: update GitHub Actions for pnpm and @cogniformai/instructor-stream publishing (be6a153)
* feat!: complete Phase 1 modernization with Zod 4, streaming data format, and validation system (92533f4)
* refactor: Complete the refactor of the main instructor.ts file and add mocks and tests. all tests passing (5f6044d)
* refactor: overhaul tests for `maybe` and `validator` - Moved the previous tests into end to end tests and will probably add an evals package for live api testing (7203fc5)
* refactor: Add tests for all util files - Added tests for all core utils - All main core functionality is covered - Move utils to a dedicated directory (511284e)
* chore: Major overhaul of project structure (7bf3c7d)
* chore: upgrade to oxlint (b12ba11)
* Migrate to ESLint 9 (590dc30)
* Update LICENSE attribution (1d3cab3)
* instructor-js v1.7.0 baseline (af8c92b)
- npm version
✔ npm version
Changeset:
 M package.json
- Git commit
✖ Git commit
ERROR Error: Author identity unknown
*** Please tell me who you are.
Run
  git config --global user.email "you@example.com"
  git config --global user.name "Your Name"
to set your account's default identity.
Omit --global to set the identity only in this repository.
fatal: unable to auto-detect email address (got 'runner@pkrvmjbmru5nbw0.(none)')
Rolling back changes...
Resetting local changes made
 ELIFECYCLE  Command failed with exit code 1.
Error: Process completed with exit code 1.
0s
0s
Post job cleanup.
Pruning is unnecessary.
1s
Post job cleanup.
/usr/bin/git version
git version 2.50.1
Temporarily overriding HOME='/home/runner/work/_temp/abe6883c-e2fb-4148-9c52-a133ae71fe8b' before making global git config changes
Adding repository directory to the temporary git global config as a safe directory
/usr/bin/git config --global --add safe.directory /home/runner/work/instructor-stream-js/instructor-stream-js
/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
http.https://github.com/.extraheader
/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"