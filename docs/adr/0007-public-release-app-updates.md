# ADR 0007: Public app updates use a separate release repository

## Status

Accepted and implemented (2026-08-23; recheck interval, `autoCheckAppUpdates`
preference, download rate/ETA projection, and the passive navigation marker
added 2026-09-04). v0.3.0 completed packaged verification and became the first
published updater-enabled bundle on 2026-09-15. Current public versions and real
installed-upgrade acceptance are tracked in the [product spec](../spec.md#3-功能現況), separately from this accepted runtime decision. The runtime version boundary, main-process
update service, fixed IPC intents, Settings status/actions, public feed
configuration, release-only public repository, unsigned draft-release workflow,
and proprietary product license are implemented. The current product decision
accepts an unsigned automatic update channel instead of paying for a trusted
publisher identity.

Amended 2026-11-25: [ADR 0035](0035-product-site-and-download-entry.md) replaces
the public product site boundary, and [ADR 0018](0018-signed-update-manifest.md)
adds an independent signed update manifest on top of the integrity rules below.

## Context

Utawakui's source repository is private. A packaged Windows app still needs a
stable, unauthenticated endpoint from which it can discover and download public
releases without embedding a repository credential on user machines.

Version `0.1.0` was shared for limited testing without an official GitHub
Release. Version `0.1.1` established the public download path, but it shipped
without `latest.yml` or a blockmap and therefore cannot update itself. Existing
v0.1.1 users need one manual installation of the next updater-enabled version.
The Settings version row reads the running application version from Electron
main through `app.getVersion()` and a minimal preload IPC method instead of
importing `package.json` into the renderer.

The existing Windows target is assisted NSIS x64. electron-builder produces the
installer, blockmap, and `latest.yml` required by `electron-updater`. The build
is unsigned (`win.signExecutable: false`) and deliberately sets
`win.verifyUpdateCodeSignature: false`. This forfeits Authenticode publisher
identity, but retains the fixed HTTPS feed and electron-builder SHA-512 metadata
verification as the accepted current product boundary.

## Decision

### Version contract

- `package.json.version` is the single release version source.
- The packaged runtime reports that value through `app.getVersion()`.
- Stable tags use `v<semver>` and must exactly match `package.json.version`.
- While the product remains below `1.0.0`, patch versions are fixes and minor
  versions are feature milestones. A breaking pre-1.0 change must still be
  called out in release notes and migrations.
- The production updater uses only the stable `latest` channel. Draft and
  prerelease assets are never update candidates.
- Published versions are immutable and never reused. A broken release is fixed
  forward with a higher version; the updater does not allow downgrades.

### Repository boundary

- Private source and CI remain in `yPinn/Utawakui`.
- Public update artifacts use `yPinn/Utawakui-Releases`. Its identity is fixed
  in the builder configuration and embedded in packaged `app-update.yml`.
- The public repository contains only minimal release-repository content,
  release tags, release notes, and binary assets. GitHub automatically exposes
  source archives for its own tagged commit, so private application source must
  never be pushed into this repository.
- The app accesses public release assets without authentication. No GitHub
  token, signing credential, or CI credential is packaged or written to app
  config.
- Cross-repository publishing uses a short-lived GitHub App token when
  available, or a fine-grained token limited to `Contents: write` on the public
  release repository. The credential exists only in the private repository's
  protected CI environment.

### Public product site boundary

Superseded by [ADR 0035](0035-product-site-and-download-entry.md): the product
site is hosted on Cloudflare from private source, GitHub Releases stays the only
download and update source, and the public release repository hosts no Pages
site.

### Runtime update boundary

Use `electron-updater` in Electron main, not the renderer and not Electron's
built-in Squirrel updater.

The main process owns this state machine:

```text
idle -> checking -> available -> downloading -> downloaded
                 -> not-available
                 -> error
```

The implementation reports `disabled` when the build is not a packaged Windows
release or when `shared/appUpdateValues.json` closes the release gate. The gate
is enabled for the current packaged channel. Disabled builds do not load
`electron-updater`, schedule a timer, or contact GitHub. The dependency is
pinned to `electron-updater@6.8.11` to match electron-builder 26.

- Update support runs only in a packaged Windows build. Development mode
  returns an explicit unsupported state and never contacts the release server.
- A packaged app performs one delayed startup check and then a background
  recheck on a fixed multi-hour interval (`recheckIntervalMs` in
  `shared/appUpdateValues.json`), and also exposes a manual Settings action. The
  recheck runs only from the `idle`, `not-available`, or `error` phase so it can
  never reset visible download progress or a ready-to-install state. Every
  request goes only to the configured public GitHub release endpoint; no
  library, playback, lyrics, provider, or OBS state is transmitted.
- A persisted `autoCheckAppUpdates` preference (default on, in `config.json`)
  gates both automatic paths. Turning it off stops the startup check and the
  recheck; the manual Settings action still works. The setting applies live
  through a main-owned callback, without a relaunch.
- `autoDownload` is disabled. Discovering an update does not download it.
- Download and `quitAndInstall()` are separate user actions. No update forces a
  restart during playback or public output.
- `autoInstallOnAppQuit` is disabled initially so closing the app cannot apply
  an update the user deferred.
- `allowPrerelease` and `allowDowngrade` remain disabled for the stable channel.
- Main emits only a bounded status projection to renderer: phase, current and
  available versions, percent progress, a whole-second download rate and
  remaining-time estimate, release date, and a user-safe error. Renderer
  receives no local installer path, provider credentials, request headers, or
  updater object.
- Renderer IPC carries only fixed intents: get status, check, download, install,
  and get/set the `autoCheckAppUpdates` preference. It cannot supply a feed URL,
  file path, version, command argument, interval, or arbitrary updater option.
- Release notes are remote content. The first implementation either omits them
  or sends bounded plain text rendered through Vue interpolation; it never
  renders release HTML with `v-html`.

### Integrity and accepted unsigned boundary

- The current public channel does not provide Authenticode publisher identity.
  `win.verifyUpdateCodeSignature: false` is explicit and must not be described as
  publisher verification in UI, documentation, or release notes.
- The installer, blockmap, and electron-builder-generated `latest.yml` are
  uploaded from the same CI run. The SHA-512 recorded in `latest.yml` remains
  mandatory and is verified before installation.
- The feed identity stays fixed to `yPinn/Utawakui-Releases`, stable-only, with
  prereleases and downgrades disabled. Renderer cannot provide URLs, request
  headers, paths, versions, or updater options.
- Public-repository credentials remain protected CI secrets and are never
  packaged. A compromised repository or publishing credential could still
  replace both payload and metadata; SHA-512 integrity does not authenticate the
  publisher. This is the explicitly accepted residual risk.
- Trusted signing can be added later by re-enabling signature verification and
  verifying the expected publisher without changing renderer IPC.

### Release workflow

Normal `npm run package`, `npm run package:unpacked`, and release builds explicitly pass
`--publish never`. Pushing a stable version tag runs the release workflow, which
stops at a public draft; a manual rerun of an existing tag uses the same path
(amended 2026-11-25, replacing a separate private test build and a manual-only
dispatch):

1. Build the stable `v<semver>` tag in the private source repository.
2. Verify the tag, `package.json`, lockfile root version, and versioned release
   notes are present and consistent.
3. Run secret scan, dependency audit, license inventory, lint, format,
   markdownlint, tests with coverage, and Vite build.
4. Build the unsigned NSIS x64 installer on a Windows runner.
5. Verify the executable and installer remain unsigned, and verify packaged
   version, required notices, blockmap, and generated update metadata.
6. Upload a draft release to the public release repository containing
   `Utawakui-Setup-<version>.exe`, its blockmap, `latest.yml`, and release notes.
7. Publish only after an installed-package smoke test. Stable clients must not
   observe draft or prerelease artifacts.

Cross-repository upload is an explicit GitHub CLI step after verification. It
uses a credential scoped only to the public release repository and creates or
updates a draft. It refuses to modify an already published release. Publishing
the reviewed draft remains a separate human action.

### Bootstrap, migration, and recovery

- A build with the runtime gate disabled cannot update itself. Published v0.1.1
  users need one manual installation of the first updater-enabled version.
- Updates replace application files only. `%APPDATA%\Utawakui`, app-managed
  workflow dependencies, and the selected media library remain outside the
  installer payload and are preserved.
- Data migrations must be backward-compatible across one released version
  boundary and tolerant of interruption. An update must not make uninstall
  cleanup options run.
- Differential download is an optimization, not a guarantee. Publish the
  blockmap and test it, but allow electron-updater to fall back to the complete
  installer.
- Rollback is fix-forward: keep earlier release assets available for manual
  recovery, but publish a higher patched version for automatic recovery.

## Rejected options

- **Use the private source repository as the update feed:** general users would
  need a GitHub credential on their machine. That is unsuitable for public
  distribution and creates a credential support/security problem.
- **Embed a read token in the app:** packaged credentials are recoverable and
  cannot be treated as secrets.
- **Publish from ordinary `main` pushes:** a passing CI build is not necessarily
  a release decision. Versioned tags, signing, artifact checks, and draft review
  form the release boundary. A tag push only creates a draft; publishing stays a
  human action.
- **Download and restart silently:** Utawakui can be active during playback or
  OBS output; an unexpected restart is operationally unsafe.
- **Require paid publisher signing for the current channel:** rejected for the
  current product stage because its recurring cost does not fit the product
  position. The lost publisher-authentication guarantee is documented and
  accepted rather than silently implied.
- **Implement a custom downloader/installer:** electron-updater already models
  NSIS metadata, signatures, progress, caching, and differential fallback. A
  custom privileged installer path would add avoidable security surface.

## Consequences

The public release repository can expose binaries without exposing private
source. The cost is an additional repository, protected publishing credentials,
and a real two-version installed update test for every release workflow change.

The first updater-enabled public version cannot be considered complete until
both per-user and per-machine installs have been tested, including UAC,
shortcut retention, download interruption, invalid metadata/checksum rejection,
full-download fallback, explicit restart, and preservation of app data and the
media library.

Unsigned installers may trigger SmartScreen warnings or be blocked by managed
enterprise policy. More importantly, checksum verification detects corruption
or mismatch against `latest.yml` but cannot prove the publisher when the feed
and payload are compromised together.

The delayed startup check and the background recheck are necessary network
requests to GitHub and should be disclosed as update checking, not telemetry.
Both stop when `autoCheckAppUpdates` is turned off. No analytics or user media
data is added by this design.

## References

- [Electron `app.getVersion()`](https://www.electronjs.org/docs/latest/api/app#appgetversion)
- [electron-builder auto update](https://www.electron.build/docs/features/auto-update/)
- [electron-builder publish configuration](https://www.electron.build/docs/publish/)
- [electron-builder Windows configuration](https://www.electron.build/docs/win/)
- [GitHub release model and source archives](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- [GitHub App authentication in Actions](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow)
- [GitHub Actions secrets](https://docs.github.com/en/actions/concepts/security/secrets)
