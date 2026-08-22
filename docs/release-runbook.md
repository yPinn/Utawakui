# Release Runbook

This runbook covers signed Windows releases from the private source repository
to `yPinn/Utawakui-Releases`. Normal local packaging never publishes.

## Unsigned Test Builds

Until a trusted Authenticode certificate is available, `npm run dist` may be
used for limited testing through a controlled delivery channel. Record the
installer SHA-256, tell testers that Windows will show an unknown publisher,
and do not present the file as an official public release. Self-signed builds
are not a substitute for a publicly trusted certificate.

Unsigned builds do not use the release workflow and must not enable the
production updater. The first formal candidate is `0.1.1`; `0.1.2` is reserved
for the required two-version packaged update test.

## One-Time Setup

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
   `main`.

The release workflow can also be started manually with an existing tag. Manual
dispatch rebuilds that tag; it does not release an arbitrary branch or version.

## Workflow Result

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
the packaged update matrix in ADR 0007. Publishing one successful installer is
not sufficient to enable automatic update checks.
