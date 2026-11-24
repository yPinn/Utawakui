# CI Usage And Verification Policy

Utawakui is a private repository on GitHub Free. GitHub-hosted Actions minutes and
artifact storage are shared with the account's other private repositories, so the
operational target is to reduce total runner-minutes without weakening the checks
that guard merges and releases.

## Budget And Baseline

The internal soft quota for Utawakui is 300 GitHub-hosted runner-minutes per month.
This is an operational target, not a repository quota enforced by GitHub.

The 2026-09-08 baseline showed 97 rounded job-minutes in September: 74 Ubuntu and
23 Windows minutes including reruns. That was about 32% of the monthly soft quota.
Active Actions artifacts were approximately 774.8 MB, above the account's 500 MB
included storage. The largest avoidable costs were repeated dependency installs,
Windows packaging on every ordinary change, coverage uploads after successful
runs, and release dispatches from the wrong ref.

Use the following monthly thresholds:

| Quota used | Operational response                                                               |
| ---------- | ---------------------------------------------------------------------------------- |
| 0–50%      | Run the normal event matrix.                                                       |
| 50–75%     | Review per-run duration, reruns and artifact growth.                               |
| 75–90%     | Stop nonessential manual diagnostics and investigate the largest jobs.             |
| 90–100%    | Preserve ready pull request, `main` and release validation only.                   |
| 100%       | Wait for reset or use a separately approved credential-free self-hosted CI runner. |

GitHub's account alert is not a substitute for repository-level observation.
Review Billing and Actions data locally at the 50% and 75% thresholds so the
monitor itself does not depend on remaining hosted-runner minutes.

## Ordinary CI Event Matrix

The ordinary workflow uses one Ubuntu job for checkout, Gitleaks, setup and the
tested changed-path classifier. It does not use workflow-level `paths` filters,
so the `CI / build` check remains visible for every configured event.

| Event or change                        | Secret scan and scope | Quality tests | Coverage | Dependency audit | Windows package |
| -------------------------------------- | :-------------------: | :-----------: | :------: | :--------------: | :-------------: |
| Draft pull request                     |          Yes          |      No       |    No    |        No        |       No        |
| Ready pull request, documentation only |          Yes          |      No       |    No    |        No        |       No        |
| Ready pull request, renderer-only      |          Yes          |      Yes      |   Yes    |        No        |       No        |
| Ready pull request, package-sensitive  |          Yes          |      Yes      |   Yes    |  As classified   |       Yes       |
| Unknown path                           |          Yes          |      Yes      |   Yes    |       Yes        |       Yes       |
| `main` push                            |          Yes          |      Yes      |   Yes    |  As classified   |  As classified  |
| Manual diagnostic                      |          Yes          |      Yes      |   Yes    |       Yes        |       Yes       |

Every run that selects quality tests also runs the coverage gate, so a floor
fails on the pull request instead of after merge. Floors stay at or below
80/70/80/80 (statements／branches／functions／lines). Ubuntu quality runs
include the real FFmpeg cases and the tracked Python test scripts. The Python
suite uses the Requests version from the provider manifest for the loopback
HTTP test.

When quality checks are selected, the Windows job runs the Windows-specific
Vitest files and the Electron Settings layout probe after Ubuntu succeeds. The
Windows package column governs the installer build and upgrade acceptance.

## Windows Package And Installed Acceptance

`windows-package` runs on a GitHub-hosted Windows runner only for manual
diagnostics or changes that can affect the packaged app. It builds the full
NSIS/update bundle with `npm run package`, then
`scripts/verify-unsigned-windows-package.ps1` fails unless the installer and
executable are both `NotSigned`, the packaged version matches, required notices
are in ASAR, and the installer/blockmap/`latest.yml` contract is valid.

`scripts/windows-installed-acceptance.ps1` then runs once per entry in
`scripts/release-baselines.json`: it verifies the pinned public installer
checksum, installs it into an isolated root, upgrades it to the candidate, checks
version, registry, shortcut and data-retention evidence, traces cold and warm
startup, and uninstalls. Entries not older than the candidate are skipped;
`everyRun: false` entries run only on manual diagnostics. Add each newly
published version to the baselines. The job has a 30-minute timeout, reads no
secrets, publishes nothing and keeps only bounded JSON／startup evidence for
7 days.

The script mutates the machine only when `CI=true` and `GITHUB_ACTIONS=true`.
Locally it needs `-AllowLocalMachineMutation` and still fails closed on any
existing Utawakui process, uninstall entry, data or install directory, or
shortcut; `-PlanOnly` shows the resolved plan without changes. A CI install
proves installer parity and same-root data retention, not a production-feed
update.

`CI / build` is the stable ordinary check; `CI / windows-package` is conditional
and must not be a required check. On the private GitHub Free repository these
checks are signals, not enforced merge gates, and a failed executed check must
not be merged.

## Cross-Platform Tests

The product ships for Windows, but CI runs every Vitest file on Ubuntu. Only the
files listed in the Windows job's runtime test step also run on Windows, so a
test that passes locally can still fail in CI.

- Pick path rules from the data, not the host. Code that handles a Windows-only
  path (System32, drive roots, PowerShell, `taskkill`) uses `path.win32`. Code
  that accepts either kind of absolute path chooses `path.win32` or
  `path.posix` from the path itself.
- Tests compare Windows paths with `path.win32` (`basename`, `join`) or with
  literal backslash strings, never with the host `path`.
- Normalize separators before comparing path strings that may come from either
  platform.
- A test that needs real Windows behavior, such as PowerShell extraction or NTFS
  name rules, uses `it.skipIf(process.platform !== 'win32')` and is added to the
  Windows job's runtime test step in `.github/workflows/ci.yml`.
- Before pushing Windows path changes, run the affected tests on Linux with
  `npm run test:linux -- <test files>`. It streams the working tree's tracked
  and untracked, non-ignored files into a `node:24-bookworm` container (Docker
  required) at the runner's checkout path, creates a git index, runs `npm ci`,
  and then runs Vitest with the given arguments. With no arguments it runs the
  full suite. FFmpeg-backed cases skip there; CI installs FFmpeg for them.

Past Linux-only failures followed the same pattern: provider runtime roots
(`2dfaf7337`, `55cc63381`), the NetEase `taskkill` path and benchmark templates
(`c59a50df9`), diagnostics stack roots and pinned-artifact extraction
(`37b329bc2`), and the System32 PowerShell path (`c36f855d8`).

## Test Fixture Isolation

Use a unique directory under `os.tmpdir()` for writable test fixtures and clean
it up when the test finishes. If a test must write inside the repository, such as
when exercising the release bundler, explicitly create its scratch parent before
calling `mkdtemp`. Run new or changed fixture tests in isolation from a clean
checkout without precreating `tasks/` or `.tmp/`. Other test files can create
these ignored directories during a full run and hide missing setup.

## Changed-Path Contract

`scripts/ci-changed-paths.mjs` owns classification, and
`scripts/ci-changed-paths.test.mjs` locks the matrix with table-driven tests.

- `docs/**` plus the root `AGENTS.md`, `CLAUDE.md`, `DESIGN.md` and `README.md`
  stop after preflight on a ready pull request.
- `src/**`, `public/**` and root lint／Vite／Vitest configuration require the
  Ubuntu quality suite.
- `electron/**`, `overlay/**`, `resources/**`, `shared/**`, packaging files,
  legal notices and release-contract scripts also require Windows packaging.
- `package.json`, `package-lock.json`, workflows and CI classifier contracts
  require dependency audit, quality checks and Windows packaging.
- Empty, malformed or unrecognized path input fails safe to the full path policy.
- Manual dispatch always selects all checks. A `main` push always selects quality
  plus coverage, while audit and Windows packaging still follow path sensitivity.

When adding a new top-level source, build, packaging or CI-control path, update the
classifier and its table before relying on the cheaper route.

## Cancellation, Timeouts And Failure Order

Concurrency cancels only an older run for the same pull request. `main` pushes and
manual diagnostics include the run id in their group and do not cancel one
another. Ubuntu jobs time out after 15 minutes. The ordinary Windows job times
out after 30 minutes.

Audits precede `npm ci`. Every run gates shipped dependencies with
`npm run audit:prod` (high and above) regardless of scope, so a new advisory
blocks even a docs-only change; dependency changes and every release
candidate also run `npm run audit:all`. Lower severities stay with
GitHub dependency alerts.

The weekly `dependency-security.yml` catches advisories against an unchanged
lockfile. It blocks on the app and `services/feedback-relay`, and only reports
the NetEase evaluation runtime and `npm run audit:runtime` (OSV for the pinned
PyPI wheels; Python, bgutil and FFmpeg are listed for manual review).

## Artifact And Supply-Chain Policy

- Successful ordinary CI does not upload coverage. Failed coverage runs retain the
  report for 7 days.
- A release passes its updater bundle between jobs as a 3-day artifact and writes
  the final assets only to the public draft. A failed release may retain a
  recovery bundle for 3 days.
- Ordinary Windows packages are verification-only and are neither uploaded nor
  published.
- Workflow permissions remain `contents: read`; public release credentials remain
  isolated behind the `release` environment.
- External Actions are pinned to full commit SHAs and Gitleaks is pinned to an image
  digest. Enable repository SHA-pinning enforcement only after these workflow
  revisions are present on the repository's default branch.
- Every checkout sets `persist-credentials: false`, so install scripts cannot read
  the job token from `.git/config`; `gh` steps receive their token explicitly.
  `scripts/dependency-security-workflow.test.mjs` enforces both rules.
- After editing a packaged notice such as `THIRD_PARTY_NOTICES.md`, run
  `npm run license:write` and `npm run license:verify` from a clean Windows
  checkout after `npm ci` and `npm run electron:install`. Notice hashes cover exact
  bytes, including line endings. Commit the generated changes with the notice
  edit.

Existing artifacts are not deleted by this policy change. They expire according to
the retention configured on the run that created them.

## Release Trigger Guard

`.github/workflows/release.yml` runs on stable `v*.*.*` tag pushes. A manual rerun
must select the exact tag in **Use workflow from** and enter the same value in the
`tag` input; a branch ref or mismatch fails in the first step, before checkout,
dependency installation and Windows packaging.

## Rollback And Observation

If path classification skips a necessary check, immediately treat the affected
change as unknown, run the manual diagnostic workflow, and update the classifier
plus its test before merging. To temporarily restore conservative behavior, make
the classifier return dependency audit, quality and Windows packaging for every
non-draft event; do not weaken release validation or workflow permissions.

After one week, compare average rounded job-minutes per successful and failed run,
the number of cancelled pull-request runs, Windows job frequency, artifact storage,
and the month-to-date total against this baseline. Investigate repeated failures
before raising timeouts or adding jobs. Parallel GitHub-hosted jobs add rounded
setup cost and are not a default optimization.
