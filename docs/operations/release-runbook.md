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
diagnostics. Its Ubuntu `build` job is the ordinary quality gate: secret scan,
critical dependency audit, license inventory, commit lint where an event supplies
a commit range, ESLint, formatting, Markdown, complete coverage ratchets, and the
production renderer build.

After that job passes, `windows-package` uses a GitHub-hosted Windows runner to
build the full NSIS/update bundle with `npm run dist`. It calls
`scripts/verify-unsigned-windows-package.ps1`, which fails unless the installer
and packaged executable are both `NotSigned`, the packaged version matches,
required legal notices are in ASAR, and the installer/blockmap/`latest.yml`
contract is valid. The job has a 30-minute timeout and does not read secrets,
upload its package, contact the public release repository, or retain a
downloadable PR installer.

This gate does not require an Authenticode certificate, signing account, or a
project-managed Windows machine. The hosted runner is CI infrastructure only;
public installers remain unsigned and Windows may show **Unknown publisher**.
If a self-hosted runner is introduced later, its operating-system licensing is a
separate infrastructure responsibility and does not change the signing policy.

Repository branch protection must require both `CI / build` and
`CI / windows-package`; workflow source can define the checks but cannot make
them required in repository settings.

## Prepare A Version

1. Update `package.json` and `package-lock.json` to the same new stable version.
2. Add `docs/releases/v<version>.md` with user-facing changes, unsigned-publisher
   disclosure, official download location, update behavior, and data-retention note.
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
   checksum and release notes.
7. Does not contact or modify the public release repository.

Use this artifact for installed-package, startup, data-retention and update-metadata
review before creating a public draft.

## Public Draft Workflow

`.github/workflows/release.yml` is manual-only and uses the GitHub Actions `release`
environment. It requires one secret:

| Name                   | Scope                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `PUBLIC_RELEASE_TOKEN` | Fine-grained token limited to `yPinn/Utawakui-Releases` with repository contents read/write. |

The workflow repeats validation, creates the same unsigned updater bundle, verifies
all artifacts, and creates or updates a **draft** stable release containing:

- `Utawakui-Setup-<version>.exe`;
- installer blockmap;
- `latest.yml`;
- `SHA256SUMS.txt`.

It refuses to modify a published release or use a prerelease as the stable updater
feed. The workflow never publishes the draft automatically.

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
