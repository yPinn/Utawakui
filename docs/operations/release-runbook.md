# Windows Release Runbook

This runbook describes the current unsigned Windows public-test channel. Normal
local packaging always uses `--publish never` and cannot modify the public release
repository.

Package contents and dependency locations are documented separately in
[release-inventory.md](release-inventory.md). Versioned files under `releases/`
describe already published artifacts and may differ from the current source tree.

## Current Release Boundary

- Windows target: assisted NSIS x64.
- Current channel: unsigned; Windows may show Unknown publisher.
- Public feed: `yPinn/Utawakui-Releases`, fixed in electron-builder metadata.
- Update integrity: HTTPS plus the installer SHA-512 recorded in `latest.yml`.
- Missing guarantee: no Authenticode publisher identity or signature verification.
- Update UX: packaged Windows builds check after startup, but download and install
  both require explicit user actions.

This unsigned boundary is an explicit product decision, not equivalent to a signed
release. Release notes must disclose it and direct users to the official repository
and `SHA256SUMS.txt`.

Published v0.1.1 predates the updater metadata bundle. Existing v0.1.1 users need
one manual installation of the first updater-enabled release; only later versions
can prove the in-app update path.

## Pull Request And Main CI

`.github/workflows/ci.yml` runs for pull requests, pushes to `main`, and manual
diagnostics. The Ubuntu `build` job always performs checkout, secret scanning and
changed-path classification. Draft pull requests and documentation-only ready
pull requests stop after that preflight. Other ready pull requests run the quality
checks and tests without coverage; `main` pushes and manual diagnostics retain the
coverage ratchets. Dependency audit runs only for dependency／CI control changes,
manual diagnostics and release workflows, with repository vulnerability alerts as
the continuous dependency signal.

After that job passes, `windows-package` uses a GitHub-hosted Windows runner only
for manual diagnostics or changes that can affect the packaged application. It
builds the full NSIS/update bundle with `npm run dist` and calls
`scripts/verify-unsigned-windows-package.ps1`, which fails unless the installer
and packaged executable are both `NotSigned`, the packaged version matches,
required legal notices are in ASAR, and the installer/blockmap/`latest.yml`
contract is valid. The job has a 20-minute timeout and does not read secrets,
upload its package, contact the public release repository, or retain a
downloadable PR installer.

This gate does not require an Authenticode certificate, signing account, or a
project-managed Windows machine. The hosted runner is CI infrastructure only;
public installers remain unsigned and Windows may show **Unknown publisher**.
If a self-hosted runner is introduced later, its operating-system licensing is a
separate infrastructure responsibility and does not change the signing policy.

`CI / build` is the stable ordinary check. `CI / windows-package` is conditional
and must not be configured as an independently required check. On the current
private GitHub Free repository these checks are visible signals rather than
platform-enforced merge gates; a failed executed check must not be merged.

## Prepare A Version

1. Update `package.json` and `package-lock.json` to the same new stable version.
2. Copy the [release-notes template](release-notes-template.md) to
   `docs/releases/v<version>.md`. Keep matching Chinese／English change categories,
   write for broad readers without assumed engineering knowledge, remove empty
   optional sections, and retain concise unsigned-publisher, official-download,
   update-behavior, and data-retention guidance.
3. Run the normal CI checks and Windows package/startup acceptance.
4. Commit the release source on `main`, then create the exact tag `v<version>`.
5. Never reuse a published version. Correct a failed release with a higher version.

`package.json.version` is the release source of truth. The tag, lockfile, release
note filename, packaged executable version, installer name and update metadata must
all agree.

## Public Test Build

Pushing a stable tag starts `.github/workflows/public-test-release.yml`.
Manual dispatch may rebuild an existing tag without publishing it.

The workflow:

1. Confirms the tag commit is reachable from `main`.
2. Runs secret, dependency, license, lint, formatting, Markdown, test and build checks.
3. Builds the unsigned installer and verifies installer／executable status and version.
4. Verifies packaged notices plus installer, blockmap and `latest.yml` contracts.
5. Produces `SHA256SUMS.txt`.
6. Uploads a private CI artifact containing the installer, blockmap, update metadata,
   checksum and release notes for 7 days.
7. Does not contact or modify the public release repository.

Use this artifact for installed-package, startup, data-retention and update-metadata
review before creating a public draft.

## Public Draft Workflow

`.github/workflows/release.yml` is manual-only and uses the GitHub Actions `release`
environment. It requires one secret:

| Name                   | Scope                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `PUBLIC_RELEASE_TOKEN` | Fine-grained token limited to `yPinn/Utawakui-Releases` with repository contents read/write. |

In the workflow dispatch form, select the exact release tag in **Use workflow
from** and enter that same tag in the `tag` input. The first validation step rejects
`main`, a branch, or a mismatched tag before checkout, dependency installation or
packaging consumes additional runner time.

The workflow repeats validation, creates the same unsigned updater bundle, verifies
all artifacts, and creates or updates a **draft** stable release containing:

- `Utawakui-Setup-<version>.exe`;
- installer blockmap;
- `latest.yml`;
- `SHA256SUMS.txt`.

It refuses to modify a published release or use a prerelease as the stable updater
feed. The workflow never publishes the draft automatically. A successful public
draft is not duplicated in Actions artifact storage. If public draft creation or
upload fails after packaging, a recovery bundle is retained for at most 3 days.

## Acceptance Before Publish

Before manually publishing the draft:

Complete the cross-feature
[manual acceptance checklist](manual-acceptance.md) in addition to the release
boundary checks below.

- verify installer, Start Menu identity, optional desktop shortcut and uninstall
  retention／cleanup choices;
- verify cold and warm installed startup with startup trace and no orphan process;
- verify local library, playback, Output server and core-gate behavior without any
  optional dependency installed;
- verify prepared Provider, FFmpeg and model units remain independent and repairable;
- verify Settings shows the running version and correct updater phase;
- verify installer SHA-256 against `SHA256SUMS.txt` and `latest.yml` artifact contract;
- for the second and later updater-enabled versions, verify check, explicit download,
  explicit install/restart, data retention and rollback guidance from the previous
  public version.

Two consecutive updater-enabled public versions must pass this installed matrix
before the update path is treated as fully accepted.

## Future Authenticode Signing

`npm run dist:release` exposes the signing-capable package configuration, but the
current public workflow deliberately builds unsigned artifacts. Adopting a trusted
certificate requires a separate credential, timestamp, subject-verification and
rotation design. Self-signing is not a substitute for a publicly trusted publisher
identity.
