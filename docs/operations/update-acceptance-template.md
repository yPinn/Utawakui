# Consecutive Update Acceptance Evidence

Use one copy of this template for each public update, starting with v0.3.0 →
v0.4.0, until two consecutive updater-enabled public versions have passed.
Regenerate the evidence JSON from the public assets; a local build's hashes differ
from the published installer.
A draft, local feed or manual installer cannot substitute for the production-feed
update result.

## Candidate Identity

| Field                         | Evidence |
| ----------------------------- | -------- |
| From version                  | `0.3.0`  |
| To version／tag               |          |
| Source commit                 |          |
| Release workflow run          |          |
| Public release URL            |          |
| Test machine／Windows version |          |
| Evidence JSON                 |          |

Download all public release assets into one otherwise empty directory, check out
the matching release tag, then collect the automatic evidence:

```text
node scripts/update-acceptance-evidence.mjs --from-version 0.3.0 --to-version <version> --directory <asset-directory> --out tasks/update-acceptance-v<version>.json
```

The command verifies the installer／blockmap／`latest.yml` contract,
`SHA256SUMS.txt`, and—when enabled in that tag—the active and required retiring
manifest signatures. It leaves every installed-behavior result pending. The output
path must not already exist so previous evidence cannot be overwritten silently.

## Automatic Evidence

- [ ] Evidence command completed without error from the matching release tag.
- [ ] Installer, blockmap, `latest.yml` and `SHA256SUMS.txt` came from the same
      public release; their names, sizes and hashes match the JSON evidence.
- [ ] If the signed-manifest gate is enabled, `update-manifest.json` is present and
      the JSON records `signedManifest: verified` plus the expected key ids.
- [ ] If the gate is disabled, no stale `update-manifest.json` is present and the
      JSON records `signedManifest: disabled`.

## Installed Baseline

- [ ] Install the public v0.3.0 release from the official release repository.
- [ ] Record the actual installer Authenticode result. `NotSigned` is the accepted
      current boundary, not a failure; any different result needs investigation.
- [ ] Create a small local library, playlist, settings change and optional
      dependency state that can be checked after both update paths.
- [ ] Record the baseline app-data backup or recovery point without copying secrets
      into this document.

## Manual Installer Parity

- [ ] Run the candidate installer over the baseline installation.
- [ ] Confirm version, launch, shortcuts, library, playlist, settings and optional
      dependency state are preserved as specified.
- [ ] Confirm uninstall retention／cleanup choices and rollback guidance remain
      understandable and usable.
- [ ] Record pass／fail, timestamps and evidence locations:

Result:

## Production Feed Update

- [ ] After the target release is public, reinstall or restore the untouched
      v0.3.0 baseline and use Settings to check for the update.
- [ ] Confirm available, explicit download, progress, install／restart and final
      running-version states. Do not count a draft or redirected local feed.
- [ ] Confirm the same library, playlist, settings and optional dependency state
      survive the in-app update.
- [ ] Confirm offline／retry behavior and document the manual-installer recovery
      path if the update fails.
- [ ] Record pass／fail, timestamps and evidence locations:

Result:

The v0.3.0 client predates signed-manifest enforcement, so its first update uses
the existing `latest.yml` SHA-512 path. If the target release enables the manifest
gate, enforcement is demonstrated only by updating from that target release to the
following public release.

## Decision

| Check                       | Result                         | Evidence／notes |
| --------------------------- | ------------------------------ | --------------- |
| Automatic release contracts | Pending                        |                 |
| Authenticode expectation    | Pending (`NotSigned` accepted) |                 |
| Manual installer parity     | Pending                        |                 |
| Production feed update      | Pending                        |                 |
| Data retention              | Pending                        |                 |
| Rollback／recovery          | Pending                        |                 |

Final decision: Pending

Reviewer／date:
