# Release Runbook

This runbook covers unsigned public test builds and future signed Windows
releases from the private source repository. Normal local packaging never
publishes.

## Unsigned Test Builds

Until a trusted Authenticode certificate is available, stable version tags run
the `Public Test Build` workflow. It repeats release checks, builds an unsigned
installer, verifies that the files remain unsigned, and uploads a private CI
artifact containing the installer, release notes, and `SHA256SUMS.txt`.

After an installed-package smoke test, download that CI artifact and manually
create a prerelease in `yPinn/Utawakui-Releases` using the authenticated local
GitHub CLI. Publish only the installer and `SHA256SUMS.txt`; use the versioned
release note as the GitHub Release description. Do not publish `latest.yml` or
the blockmap for an unsigned test build.

Unsigned releases must keep the production updater disabled. Windows may show
an unknown publisher, so the release note must direct users to the official
Releases page and disclose manual installation and updates. Self-signing is not
a substitute for a publicly trusted certificate.

## Signed Release Setup

Create a GitHub Actions environment named `release` in the private source
repository. Configure these values there:

| Name                           | Type     | Purpose                                                      |
| ------------------------------ | -------- | ------------------------------------------------------------ |
| `WINDOWS_CERTIFICATE`          | Secret   | Base64-encoded Authenticode PFX used by electron-builder.    |
| `WINDOWS_CERTIFICATE_PASSWORD` | Secret   | Password for the signing certificate.                        |
| `PUBLIC_RELEASE_TOKEN`         | Secret   | Fine-grained token limited to the public release repository. |
| `WINDOWS_SIGNING_SUBJECT`      | Variable | Exact certificate subject expected on the app and installer. |

Limit `PUBLIC_RELEASE_TOKEN` to `yPinn/Utawakui-Releases` with repository
`Contents: Read and write`. Do not grant source-repository access. Prefer a
short-lived GitHub App token when that automation is available; keep the same
least-privilege boundary.

Add an environment reviewer when the repository plan supports it. The workflow
still creates only a draft release; environment approval does not publish it.

## Prepare A Version

1. Update `package.json` and `package-lock.json` to the same stable version.
2. Add user-facing notes at `docs/releases/v<version>.md`.
3. Complete the normal `main` CI checks and installer-specific manual checks.
4. Create and push the exact tag `v<version>` from a commit reachable from
   `main`. This automatically starts the unsigned public test workflow.

Both workflows can rebuild an existing tag by manual dispatch. The signed
workflow remains manual-only until signing credentials and the installed update
matrix are ready.

## Unsigned Workflow Result

The public test workflow:

1. Repeats the complete CI checks on the tagged source.
2. Requires exact tag, package, lockfile, and release-note agreement.
3. Builds the assisted Windows installer without a signing credential.
4. Verifies unsigned status, packaged version, notices, and generated metadata.
5. Creates the installer SHA-256 and uploads a private CI artifact for review.
6. Does not contact or modify the public release repository.

## Signed Workflow Result

The workflow:

1. Repeats the complete CI checks on the tagged source.
2. Requires exact tag, package, lockfile, and release-note agreement.
3. Builds the Windows installer with Authenticode signing enabled.
4. Verifies the installer and packaged executable signer, timestamp, and
   version.
5. Recomputes installer size and SHA-512 and compares them with `latest.yml`.
6. Uploads the signed bundle as a private CI artifact for inspection.
7. Creates or updates a draft release in the public release repository.

The workflow refuses to modify a published release. Release versions are never
reused; correct a failed build with a higher version.

## Publish And Enable Updates

Install and smoke-test the draft installer before publishing the draft in the
public repository. Verify shortcuts, installation modes, uninstall retention,
application data, local library data, and update metadata.

Keep the in-app updater disabled until two consecutive signed versions complete
the packaged update matrix in ADR 0007. The first signed version becomes the
update baseline; the following signed version proves the update path. Their
version numbers are chosen when signing is adopted, not reserved in advance.
