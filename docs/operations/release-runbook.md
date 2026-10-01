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
- Missing guarantee: no Authenticode publisher identity verification.
- Update UX: packaged Windows builds check after startup, but download and install
  both require explicit user actions.

This unsigned boundary is an explicit product decision, not equivalent to a signed
release. Release notes must disclose it and direct users to the official repository
and `SHA256SUMS.txt`.

Published v0.1.1 predates the updater metadata bundle. v0.3.0 is the first
published updater-enabled release, so existing v0.1.1 users need one manual
installation of v0.3.0. v0.4.0 is the first version that can prove the in-app
update path from a published updater-enabled release; its production-feed update
evidence is still pending (see the acceptance template).

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
contract is valid. It then calls `scripts/windows-installed-acceptance.ps1` on
the ephemeral runner. Once per entry in
`scripts/release-baselines.json` (add each newly published version there; entries
not older than the candidate are skipped, and entries with `everyRun: false`
run only on manual diagnostics), it verifies the pinned public installer
checksum, installs it into an isolated temporary root, upgrades the same install
to the current candidate, checks version／registry／shortcut／data-retention
evidence, runs cold and warm installed startup traces, and uninstalls it. The job
has a 30-minute timeout, does not read secrets or publish anything, and retains
only bounded JSON／startup evidence for 7 days; it never uploads a downloadable
PR installer.

The installed-acceptance script runs by default only when both `CI=true` and
`GITHUB_ACTIONS=true` identify an ephemeral runner. Local mutation requires the
explicit `-AllowLocalMachineMutation` switch and still fails closed if it finds
an existing Utawakui process, uninstall entry, data directory, install directory,
or shortcut. Use `-PlanOnly` to inspect the resolved candidate, baseline and
guards without installing or deleting anything. A CI-installed smoke proves
candidate installer parity and same-root data retention, but it does not prove a
production-feed update until the candidate is published on the stable feed.

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

For a local read-only preview of the ordinary CI installation plan:

```powershell
npm run release:verify-installed -- -ToVersion <version> -PlanOnly
```

Do not add `-AllowLocalMachineMutation` on a developer workstation that contains
real Utawakui state. The ordinary CI runner is the supported mutation surface.

## Public Draft Workflow

`.github/workflows/release.yml` is manual-only. It separates validation, packaging,
optional manifest signing and publishing so one job never receives both a signing
key and the public-repository token.

| Name                   | Scope                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `PUBLIC_RELEASE_TOKEN` | Fine-grained token limited to `yPinn/Utawakui-Releases` with repository contents read/write. |

In the workflow dispatch form, select the exact release tag in **Use workflow
from** and enter that same tag in the `tag` input. The first validation step rejects
`main`, a branch, or a mismatched tag before checkout, dependency installation or
packaging consumes additional runner time.

The no-secret Windows package job repeats validation, creates the same unsigned
updater bundle and uploads it as a 3-day workflow artifact. The protected `release`
job downloads and re-verifies that exact bundle, then creates or updates a **draft**
stable release containing:

- `Utawakui-Setup-<version>.exe`;
- installer blockmap;
- `latest.yml`;
- `SHA256SUMS.txt`.

When `signedManifestEnabled` is true, a separate protected `update-signing` job
adds `update-manifest.json` before publish. The current registry has no production
key and the flag is false, so this job is skipped and the existing unsigned draft
path remains operational.

It refuses to modify a published release or use a prerelease as the stable updater
feed. The workflow never publishes the draft automatically. Package-transfer and
failed-recovery artifacts are retained for at most 3 days.

## Signed Manifest Activation And Rotation

Production activation is a separate credential operation. Do not generate or commit
a production private key as part of an ordinary source change.

1. Create an Ed25519 active key and preferably a separate offline recovery key in
   the chosen custody system. Add only their SPKI public keys and SHA-256 fingerprint
   ids to `shared/updateSigningKeys.json`.
2. Set the active entry to `production`／`active`, set
   `activeProductionKeyId`, and keep any recovery entry as
   `production`／`recovery`.
3. Create a protected GitHub `update-signing` environment restricted to release
   tags, require review and prevent self-review. Store the Base64 PKCS#8 active key
   as `UPDATE_MANIFEST_PRIVATE_KEY_B64`. This environment must not contain
   `PUBLIC_RELEASE_TOKEN`.
4. Change `signedManifestEnabled` to true in the reviewed release source. The
   validation job refuses activation unless the active public-key contract is valid.
5. Confirm the draft contains `update-manifest.json`, then run
   `node tools/update-signing/verify-manifest.mjs` against the downloaded installer,
   committed registry, expected version and active key id before publication. During
   rotation, also pass the declared retiring key with `--required-key-id`.

For normal rotation, commit the new key as `active`, mark the old key `retiring`,
and temporarily store the old private key as
`UPDATE_MANIFEST_RETIRING_PRIVATE_KEY_B64`. The sign job emits both signatures.
Keep the retiring signature until the minimum supported updater version already
trusts the new key; otherwise users who skipped the transition release cannot update.
If the active private key is lost, promote a pretrusted recovery key to `active`,
revoke the lost key, and use the promoted recovery key for a recovery release that
embeds a replacement public key. Promote that replacement in the following release
and dual-sign with the recovery key as `retiring`. If no trusted
active／retiring／recovery private key remains, recovery requires a manual installer.

The first version that enables this gate can be downloaded by v0.3.0 and v0.4.0
only through the existing `latest.yml` SHA-512 path because neither contains a
manifest verifier. That newly installed version enforces the signed manifest on
its next update.

## Acceptance Before Publish

Before manually publishing the draft:

Complete the cross-feature
[manual acceptance checklist](manual-acceptance.md) in addition to the release
boundary checks below. Use the
[consecutive update acceptance template](update-acceptance-template.md) and its
read-only evidence collector for the installed update path; do not treat a draft or
local feed as production-feed evidence.

- verify installer, Start Menu identity, optional desktop shortcut and uninstall
  retention／cleanup choices;
- review the ordinary CI installed-acceptance evidence for the pinned public
  baseline, same-root candidate upgrade, retained sentinels, installed startup,
  and cleanup;
- verify cold and warm installed startup with startup trace and no orphan process;
- verify local library, playback, Output server and core-gate behavior without any
  optional dependency installed;
- verify prepared Provider, FFmpeg and model units remain independent and repairable;
- verify Settings shows the running version and correct updater phase;
- verify installer SHA-256 against `SHA256SUMS.txt` and `latest.yml` artifact contract;
- when the production manifest gate is enabled, verify the public manifest signature,
  active key fingerprint and exact installer name／size／SHA-512 binding;
- for the second and later updater-enabled versions, verify check, explicit download,
  explicit install/restart, data retention and rollback guidance from the previous
  public version.

Two consecutive updater-enabled public versions must pass this installed matrix
before the update path is treated as fully accepted.

## Authenticode Policy

`npm run dist:release` exposes the signing-capable package configuration, but the
current public workflow deliberately builds unsigned artifacts. The owner accepts
this as the current product boundary and has no plan to purchase a trusted
Authenticode certificate; it is not a release blocker or an incomplete roadmap
item. Release notes must continue to disclose Unknown publisher behavior and point
users to the official repository and checksum. Any later reconsideration requires a
separate product and credential decision. App-level signed update manifests are a
different integrity layer and do not change Windows publisher identity.
