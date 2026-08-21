# ADR 0007: Signed app updates use a separate public release repository

## Status

Accepted for implementation (2026-08-22). The runtime version boundary is
implemented; signing, update runtime, release repository, and release CI remain
pending.

## Context

Utawakui's source repository is private. A packaged Windows app still needs a
stable, unauthenticated endpoint from which it can discover and download public
releases without embedding a repository credential on user machines.

The current package version is `0.1.0`. `package.json` and `package-lock.json`
agree, and no Git release tag exists yet. The Settings version row now reads the
running application version from Electron main through `app.getVersion()` and a
minimal preload IPC method instead of importing `package.json` into the
renderer.

The existing Windows target is assisted NSIS x64. electron-builder can produce
the installer, blockmap, and `latest.yml` required by `electron-updater`. The
current build is unsigned (`win.signExecutable: false`), so it is not yet an
acceptable production update channel.

## Decision

### Version contract

- `package.json.version` is the single release version source.
- The packaged runtime reports that value through `app.getVersion()`.
- Stable tags use `v<semver>` and must exactly match `package.json.version`.
- While the product remains below `1.0.0`, patch versions are fixes and minor
  versions are feature milestones. A breaking pre-1.0 change must still be
  called out in release notes and migrations.
- The first implementation ships only the stable `latest` channel.
  Prerelease/beta channels remain deferred until there is a concrete testing
  audience and separate channel verification.
- Published versions are immutable and never reused. A broken release is fixed
  forward with a higher version; the updater does not allow downgrades.

### Repository boundary

- Private source and CI remain in `yPinn/Utawakui`.
- Public update artifacts are planned for `yPinn/Utawakui-Releases`. The exact
  repository must be created and confirmed before the first updater-enabled
  package because its identity is embedded in `app-update.yml`.
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

The same public release repository may host a GitHub Pages product site during
a later promotion phase. Pages and Releases have different responsibilities:

- GitHub Releases remains the updater's machine-readable source and the
  canonical binary download location. The Pages site must not mirror
  `latest.yml`, installers, or blockmaps into a second update feed.
- GitHub Pages is the human-facing entry point for product identity, curated
  screenshots, concise feature/status summaries, system requirements, release
  notes, legal/privacy links, and a stable download action that links directly
  to the signed GitHub Release asset.
- Only curated public site source and assets live in the release repository.
  Private application source, internal task notes, build logs, credentials,
  unpublished provider details, and user media never enter the Pages artifact.
- The initial site is static and has no account, comment, upload, form, or
  third-party analytics surface. Analytics, embeds, custom domains, or other
  promotion integrations require a later privacy/security review and necessary
  disclosure.
- Pages deploys through its own least-privilege GitHub Actions workflow and
  protected `github-pages` environment. A site-content change does not publish
  an app release, and an app release does not implicitly deploy arbitrary site
  changes.
- Product copy must keep the same rights-neutral boundary as the app: it must
  not imply affiliation with OBS, YouTube, Spotify, music rightsholders, or any
  provider, and it must not present provider-backed acquisition as a licensed
  music service.

### Runtime update boundary

Use `electron-updater` in Electron main, not the renderer and not Electron's
built-in Squirrel updater.

The main process owns this state machine:

```text
idle -> checking -> available -> downloading -> downloaded
                 -> not-available
                 -> error
```

- Update support runs only in a packaged Windows build. Development mode
  returns an explicit unsupported state and never contacts the release server.
- A packaged app performs at most one delayed startup check and also exposes a
  manual Settings action. The request goes only to the configured public GitHub
  release endpoint; no library, playback, lyrics, provider, or OBS state is
  transmitted.
- `autoDownload` is disabled. Discovering an update does not download it.
- Download and `quitAndInstall()` are separate user actions. No update forces a
  restart during playback or public output.
- `autoInstallOnAppQuit` is disabled initially so closing the app cannot apply
  an update the user deferred.
- `allowPrerelease` and `allowDowngrade` remain disabled for the stable channel.
- Main emits only a bounded status projection to renderer: phase, current and
  available versions, progress, release date, and a user-safe error. Renderer
  receives no local installer path, provider credentials, request headers, or
  updater object.
- Renderer IPC carries only fixed intents: get status, check, download, and
  install. It cannot supply a feed URL, file path, version, command argument, or
  arbitrary updater option.
- Release notes are remote content. The first implementation either omits them
  or sends bounded plain text rendered through Vue interpolation; it never
  renders release HTML with `v-html`.

### Signing and integrity

- Production app updates are blocked until the Windows executable and NSIS
  installer are Authenticode-signed by the expected publisher.
- Keep electron-updater's Windows signature verification enabled. Do not work
  around the current unsigned build by disabling verification in a public
  release.
- electron-builder-generated SHA-512 metadata remains mandatory in
  `latest.yml`; the signed installer and matching blockmap are uploaded from the
  same CI run.
- Signing credentials are CI secrets, never files committed to either
  repository. Logs and uploaded diagnostic artifacts must not contain secret
  values.

### Release workflow

Normal `npm run dist` and `dist:dir` remain local build commands and must never
publish. A separate Windows release workflow performs these steps:

1. Trigger from a stable `v<semver>` tag in the private source repository.
2. Verify the tag, `package.json`, and lockfile root version are identical.
3. Run secret scan, dependency audit, license inventory, lint, format,
   markdownlint, tests with coverage, and Vite build.
4. Build and Authenticode-sign the NSIS x64 installer on a Windows runner.
5. Verify executable/installer signature, packaged version, expected AUMID,
   required notices, and generated update metadata.
6. Upload a draft release to the public release repository containing
   `Utawakui-Setup-<version>.exe`, its blockmap, `latest.yml`, and release notes.
7. Publish only after an installed-package smoke test. Stable clients must not
   observe draft or prerelease artifacts.

Publishing must be explicit (`--publish always` in the release job only) and
the GitHub provider must specify the public owner/repository instead of relying
on private source-repository auto-detection.

### Bootstrap, migration, and recovery

- A build without updater code cannot update itself. If `0.1.0` is distributed
  first, users need one manual install of the first updater-enabled signed
  version. If it has not been distributed, updater support should be included
  before the first public release.
- Updates replace application files only. `%APPDATA%\Utawakui`, app-managed
  workflow dependencies, and the selected media library remain outside the
  installer payload and are preserved.
- Data migrations must be backward-compatible across one released version
  boundary and tolerant of interruption. An update must not make uninstall
  cleanup options run.
- Differential download is an optimization, not a guarantee. Publish the
  blockmap and test it, but allow electron-updater to fall back to the complete
  signed installer.
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
  form the release boundary.
- **Download and restart silently:** Utawakui can be active during playback or
  OBS output; an unexpected restart is operationally unsafe.
- **Disable Windows signature verification:** checksum metadata alone does not
  provide the publisher identity expected from a production update channel.
- **Implement a custom downloader/installer:** electron-updater already models
  NSIS metadata, signatures, progress, caching, and differential fallback. A
  custom privileged installer path would add avoidable security surface.

## Consequences

The public release repository can expose binaries without exposing private
source and can later provide a coherent public product/download page. The cost
is an additional repository, separate Pages and release deployment boundaries,
protected publishing credentials, code-signing setup, and a real two-version
installed update test for every release workflow change.

The first updater-enabled public version cannot be considered complete until
both per-user and per-machine installs have been tested, including UAC,
shortcut retention, download interruption, invalid metadata/signature
rejection, full-download fallback, explicit restart, and preservation of app
data and the media library.

The delayed startup check is a necessary network request to GitHub and should be
disclosed as update checking, not telemetry. No analytics or user media data is
added by this design.

## References

- [Electron `app.getVersion()`](https://www.electronjs.org/docs/latest/api/app#appgetversion)
- [electron-builder auto update](https://www.electron.build/docs/features/auto-update/)
- [electron-builder publish configuration](https://www.electron.build/docs/publish/)
- [electron-builder Windows configuration](https://www.electron.build/docs/win/)
- [GitHub release model and source archives](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- [GitHub App authentication in Actions](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow)
- [GitHub Actions secrets](https://docs.github.com/en/actions/concepts/security/secrets)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
