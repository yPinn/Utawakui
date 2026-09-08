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
| Ready pull request, renderer-only      |          Yes          |      Yes      |    No    |        No        |       No        |
| Ready pull request, package-sensitive  |          Yes          |      Yes      |    No    |  As classified   |       Yes       |
| Unknown path                           |          Yes          |      Yes      |    No    |       Yes        |       Yes       |
| `main` push                            |          Yes          |      Yes      |   Yes    |  As classified   |  As classified  |
| Manual diagnostic                      |          Yes          |      Yes      |   Yes    |       Yes        |       Yes       |

Pull requests run the affected quality suite without coverage instrumentation.
`main` and manual runs retain the complete coverage gate. The Windows job runs
only after Ubuntu succeeds and only when the classifier requests it.

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
another. Ubuntu jobs time out after 15 minutes; Windows jobs time out after 20.

`npm audit --audit-level=critical` precedes `npm ci` when selected, so a critical
finding or registry failure stops before the more expensive install. The CI gate
blocks critical findings; GitHub dependency vulnerability alerts remain enabled to
surface lower severities for triage without consuming runner time. Public-test and
release workflows still audit every candidate.

## Artifact And Supply-Chain Policy

- Successful ordinary CI does not upload coverage. Failed coverage runs retain the
  report for 7 days.
- Public-test updater bundles are private review artifacts retained for 7 days.
- A successful release writes assets to the public draft and does not duplicate
  them in Actions storage. A failed release may retain a recovery bundle for 3 days.
- Ordinary Windows packages are verification-only and are neither uploaded nor
  published.
- Workflow permissions remain `contents: read`; public release credentials remain
  isolated behind the `release` environment.
- External Actions are pinned to full commit SHAs and Gitleaks is pinned to an image
  digest. Enable repository SHA-pinning enforcement only after these workflow
  revisions are present on the repository's default branch.

Existing artifacts are not deleted by this policy change. They expire according to
the retention configured on the run that created them.

## Release Dispatch Guard

For `.github/workflows/release.yml`, select the exact release tag in **Use workflow
from** and enter the same value in the `tag` input. A branch ref or mismatch fails
in the first step, before checkout, dependency installation and Windows packaging.

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
