# Windows Release Runbook

This runbook covers the unsigned Windows public-test channel. Local packaging
always uses `--publish never` and cannot modify the public release repository.
Package contents are listed in [release-inventory.md](release-inventory.md); CI
behaviour is in [ci-usage.md](ci-usage.md).

Files under `docs/releases/` are publication-ready announcement copy. Draft state
belongs to the GitHub Release, never to the file, and a file's existence is not
proof of publication. Past version scopes are in the [archive](../archive/README.md).

## Current Release Boundary

- Windows target: assisted NSIS x64, unsigned; Windows may show Unknown publisher.
- Public feed: `yPinn/Utawakui-Releases`, fixed in electron-builder metadata.
- Update integrity: HTTPS, the installer SHA-512 in `latest.yml`, and an
  Ed25519-signed `update-manifest.json` that builds with the verifier enforce
  ([ADR 0018](../adr/0018-signed-update-manifest.md)). Windows publisher identity
  is never verified.
- Update UX: packaged builds check after startup; download and install both need
  explicit user actions.

Release notes must disclose Unknown publisher behaviour and point users to the
official releases page and `SHA256SUMS.txt`. Record each real upgrade with the
[acceptance template](update-acceptance-template.md); current versions and open
acceptance live in [the product spec](../spec.md#3-功能現況).

## Local Packaging Commands

Starting with the v0.5.3 source tree, use `npm run package` to build the installer
and update files, `npm run package:unpacked` to build a runnable directory, and
`npm run package:signing` to enable optional Authenticode signing. The signing
option uses local credentials when available. See the [command guide](../../scripts/README.md)
for the development and verification commands.

## Prepare A Version

1. Update `package.json` and `package-lock.json` to the same new stable version.
2. Copy the [release-notes template](release-notes-template.md) to
   `docs/releases/v<version>.md`. Keep matching Chinese／English change categories,
   write for broad readers without assumed engineering knowledge, remove empty
   optional sections, and retain concise unsigned-publisher, official-download,
   update-behavior, and data-retention guidance. Keep the text ready for direct
   publication; track unfinished acceptance separately and do not insert draft
   status or planned-delivery wording into the announcement.
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
adds `update-manifest.json` before publish. The flag is true and the registry has
one production active key, so every release must pass this job and needs a reviewer
to approve the `update-signing` deployment.

It refuses to modify a published release or use a prerelease as the stable updater
feed. The workflow never publishes the draft automatically. Package-transfer and
failed-recovery artifacts are retained for at most 3 days.

## Signed Manifest Rotation And Recovery

Production signing is active: `shared/updateSigningKeys.json` holds one
production `active` key and one offline `recovery` key, and the private active key
exists only as `UPDATE_MANIFEST_PRIVATE_KEY_B64` in the protected `update-signing`
environment, which never contains `PUBLIC_RELEASE_TOKEN`. Never generate or commit
a production private key in an ordinary source change. Before publishing, run
`node tools/update-signing/verify-manifest.mjs` against the downloaded installer,
committed registry, expected version and active key id; during rotation also pass
the retiring key with `--required-key-id`.

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

## Acceptance Before Publish

Before manually publishing the draft:

Review the versioned announcement as the exact public copy, including its
agreement with the bundled summary. GitHub's draft flag carries the review state;
the body must not retain draft notices or internal acceptance instructions.

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

`npm run package:signing` exposes the signing-capable package configuration, but the
current public workflow deliberately builds unsigned artifacts. The owner accepts
this as the current product boundary and has no plan to purchase a trusted
Authenticode certificate; it is not a release blocker or an incomplete roadmap
item. Release notes must continue to disclose Unknown publisher behavior and point
users to the official repository and checksum. Any later reconsideration requires a
separate product and credential decision. App-level signed update manifests are a
different integrity layer and do not change Windows publisher identity.
