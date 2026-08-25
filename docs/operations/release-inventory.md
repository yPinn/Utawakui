# Release Inventory

> This document maps product features to package/runtime dependencies and
> packaging locations. Keep it in sync when adding IPC handlers, native binaries,
> feature gates, or electron-builder packaging rules.

This is the live packaging inventory, not the product roadmap. Product status
belongs in [spec.md](../spec.md), and release operations belong in
[release-runbook.md](release-runbook.md).

## Current Build Shape

Windows packaging is configured in `electron-builder.yml`.

- Installer target: NSIS x64.
- Unpacked target: `release/win-unpacked/`.
- Packaged executable filename: `electron.exe`.
- Default per-user install directory: `%LOCALAPPDATA%\Programs\Utawakui`.
- User-facing product name: `Utawakui`.
- App id / AUMID: `com.utawakui.app`.
- Renderer output: `dist/`, loaded by `electron/main/windowState.js`.
- Main/preload/runtime JS: `electron/`, packaged into `app.asar`.
- Cross-runtime JSON contracts and pure presentation projections: `shared/`,
  packaged into `app.asar`; Browser Source access is limited to exact loopback
  routes declared by `outputServer.js`.
- Worker/runtime JS that must resolve outside asar: `electron/lib/**/*`,
  unpacked through `asarUnpack`.
- Repository boundary: fixed worker scripts and runtime catalogs under
  `resources/audio-processing/` are source-controlled and packaged explicitly;
  build/test outputs plus local Python environments and caches (`dist/`,
  `release/`, `coverage/`, `.venv/`, `venv/`, `uv-cache/`, `.pytest_cache/`,
  `*.pyc`) are ignored. Downloaded runtimes, models, and activation state belong
  under app `userData`, never in the repository or installer payload.
- Installer shortcuts: Start Menu is always created because it carries the
  AUMID / SMTC app identity; the desktop shortcut is shown as a checked
  optional installer checkbox in `build/installer.nsh`.
- Uninstaller data cleanup: optional NSIS checkboxes from `build/installer.nsh`
  can clean app-managed dependencies under `%APPDATA%\Utawakui\dependencies`,
  app settings under `%APPDATA%\Utawakui`, and the selected library root only
  when the normalized `library-path.txt` target is below a filesystem root,
  differs from protected Windows/user folders, and contains the app-written
  `.utawakui-library` marker. Invalid targets hide the library cleanup option.
  All cleanup checkboxes default to unchecked. Cleanup uses
  `RMDir /r /REBOOTOK`, so locked folders may finish deleting after a reboot.
- Installer copy discloses that advanced features are enabled and prepared from
  Settings. The uninstaller welcome page explains that data cleanup is opt-in.

The `electron.exe` filename is intentional. See
`docs/adr/0002-packaged-exe-kept-as-electron-exe.md`.

## Application Update Boundary

ADR 0007 defines the app-update channel. It is separate from Settings
updates for app-managed provider, FFmpeg, and model dependencies.

- `package.json.version` is the release version source; packaged UI reads the
  running version from main-process `app.getVersion()` over preload IPC.
- Private source remains in `yPinn/Utawakui`; public downloads use the separate
  `yPinn/Utawakui-Releases` repository.
- Stable clients use only published `latest` releases. Draft/prerelease assets
  are not update candidates.
- Stable unsigned releases publish the installer, blockmap, `latest.yml`,
  SHA-256 checksum, release notes, and minimal release-repository content from
  one verified CI run. No source repository or client credential is copied into
  the app.
- `electron-updater` is enabled only in packaged Windows builds. Renderer gets
  bounded status plus fixed check/download/install intents only.
- Update discovery may check automatically in packaged mode, but download and
  restart remain explicit user actions. Development builds never contact the
  release feed.
- App-data, app-managed workflow dependencies, and the selected media library
  remain outside the installer payload and survive updates.
- Local `npm run dist` and `dist:dir` never publish. The unsigned tag workflow
  uploads a complete private review artifact; the protected manual release
  workflow creates a public draft that still requires human publication.

The public repository may later host a GitHub Pages product site. It is a
curated human-facing surface, not an update server: downloads link to the
stable GitHub Release asset, while `latest.yml`, installer, and blockmap remain
canonical Release assets. Use a separate least-privilege Pages workflow and
`github-pages` environment so site deployment cannot publish or mutate an app
release. Initial Pages scope is static product identity, screenshots, system
requirements, release/legal/privacy links, and download navigation; accounts,
forms, user uploads, third-party embeds, and analytics remain out of scope until
separately reviewed.

Planned stable release assets:

| Artifact                                | Purpose                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------- |
| `Utawakui-Setup-<version>.exe`          | Unsigned assisted NSIS installer/update payload.                            |
| `Utawakui-Setup-<version>.exe.blockmap` | Differential-download map; full installer is the fallback.                  |
| `latest.yml`                            | Stable update version, URL, size, and SHA-512 metadata.                     |
| GitHub Release notes                    | Human-reviewed release summary; remote HTML is not rendered in app.         |
| GitHub Pages artifact (future)          | Curated static product site; contains no updater payload or private source. |

The current channel deliberately sets `win.verifyUpdateCodeSignature: false`.
`latest.yml` SHA-512 verification detects mismatched/corrupt payloads but does
not authenticate the publisher if release access is compromised. Do not claim
publisher verification; preserve the fixed feed, stable-only policy, protected
draft workflow, and explicit download/restart actions.

## Installer Profile Boundary

The installer names the shipped payload as **核心安裝** and describes
feature-gated capabilities as **工作流程擴充**.

This is intentionally not a selectable "Basic vs Ext" component split yet:

- `electron-builder`'s assisted NSIS flow installs the generated application
  payload as one app section; its supported hooks are better suited to extra
  pages or post-install work than to surgically splitting `app.asar` and
  unpacked native modules into optional component payloads.
- Current extension-like dependencies are not all installer payloads. The
  provider runtime (Python embed, yt-dlp wheel, bgutil PO-token provider, and
  bgutil plugin) is one app-managed atomic unit downloaded only after
  `provider-flow` is enabled and prepared;
  FFmpeg is app-managed and downloaded only after `audio-processing-flow` is
  enabled; model files are also prepared from Settings before use.
- A component/payload checkbox in the installer would therefore over-promise a
  real packaging distinction and move license/source disclosure away from the
  feature gate that actually triggers the download.
- Shortcut selection is intentionally narrow: Start Menu stays mandatory for
  Windows identity/AUMID behavior, while the custom NSIS page only lets users
  opt out of the desktop shortcut.

Use this naming until a release truly ships separate artifacts:

- **核心安裝**: the Electron app, local library/playback/import surfaces,
  Settings, feature gate UI, and packaged runtime needed for the app to start.
- **工作流程擴充**: provider/network flows, lyrics sources, audio processing, and
  public-output workflows that are enabled from inside the app and may download,
  connect to, or generate additional data after confirmation.

If a future installer really needs selectable payloads, split the release into
separate artifacts or replace the generated NSIS template with a maintained
component-aware template, then re-verify AUMID, update behavior, uninstall data
cleanup, and license notices end to end.

## Compliance Boundary

Feature gates follow the operation being enabled, not only whether code is
present in the installer. This distinction matters because some local-only
capabilities need packaged runtime code to work offline, while higher-risk
sources, generated media, and public output still require explicit user
confirmation before use.

| Boundary                           | Legal/compliance driver                                                                   | Gate / packaging decision                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Local library and playback         | User-selected local files; app does not provide music, lyrics, artwork, or licenses.      | Ungated core; media stays outside the app under the user-selected library root.                                   |
| Provider-backed acquisition        | Platform terms, reproduction/cache/offline playback, source legitimacy, technical rules.  | `provider-flow`; provider runtime is app-managed under user data, not bundled as an installer payload.            |
| External lyrics/subtitle sources   | Lyrics/subtitles are separate protected text; public display may require permission.      | `lyrics-flow` for external search/save; manual local lyrics editing stays ungated.                                |
| Reading aids                       | Local text analysis/romanization of existing lyrics; no external source is contacted.     | Ungated local processing; `kuromoji`, `wanakana`, and `koroman` are packaged and unpacked for worker-thread use.  |
| Pitch/tempo and vocal separation   | Processing can create transformed previews, stems, cache files, or other local copies.    | `audio-processing-flow`; ONNX Runtime is packaged, while FFmpeg and UVR model files are app-managed after opt-in. |
| OBS Browser Source and public view | Lyrics, artwork, metadata, and state may enter a livestream, recording, VOD, or clip.     | `public-output-flow` gates start/publish; `ws` and overlay templates ship as core output infrastructure.          |
| Recording / VOD session            | Recording, archived live, clips, and later reposts add reproduction/synchronization risk. | Planned separate gate/session confirmation; no packaged dependency today.                                         |

China-source songs are not a separate technical module. They are a source-risk
classification handled by the same gates above: provider download, lyrics or
subtitle save/display, artwork/MV/thumbnail output, audio processing, and
recording/VOD all remain rights-neutral and require the user to confirm the
specific source, platform, and use permissions. See
`docs/legal-compliance.md`.

## Feature Inventory

| Feature area                | Gate                                       | Renderer entry                                            | Main / worker entry                                                                                                 | Runtime packages                                                             | Packaging notes                                                                                                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local library               | Ungated core                               | `useLibrary`, Setlist/Lyrics track pools                  | `library:*`, `utawakui-media:`                                                                                      | None beyond Electron/Node built-ins                                          | Local media stays outside the app under the selected library root.                                                                                                                                                                                                                       |
| Local import                | Ungated core                               | `useLocalImport`, Import view                             | `library:import-audio-files`                                                                                        | None beyond Node built-ins                                                   | Copies user-picked audio into managed track folders.                                                                                                                                                                                                                                     |
| Playback / queue            | Ungated core                               | `usePlayer`, `usePlaybackQueue`, `PlayerBar`              | media protocol only                                                                                                 | Renderer bundle; `@soundtouchjs/audio-worklet` is build-time only            | Pitch preview worklet is emitted into `dist/assets/` by Vite; it should not be packaged as runtime `node_modules`.                                                                                                                                                                       |
| Windows shell integration   | Ungated core                               | `useTaskbarControls`, `useMediaSession`, `useWindowTitle` | `windowState`, `thumbarIcons`                                                                                       | Electron runtime only                                                        | App icon is packaged in both `dist/assets/` and `public/assets/icons/app-icon.ico`; ICO is unpacked for shell APIs.                                                                                                                                                                      |
| App version / update        | Packaged Windows only                      | `useAppInfo`, `useAppUpdate`                              | `app:get-version`, `app-update:*`, `appUpdateService`                                                               | Electron runtime; `electron-updater@6.8.9`                                   | Main-owned stable-feed check/download/install is enabled; SHA-512 metadata stays mandatory while Authenticode publisher verification is explicitly disabled.                                                                                                                             |
| Provider import             | `provider-flow`                            | `useImportSession`                                        | `yt:fetch-playlist`, `yt:fetch-metadata`, `yt:resolve-import-source`, `yt:download-audio`, `playlists:upsert-album` | App-managed Python `yt-dlp`; Rust bgutil provider sidecar                    | Settings prepares Python embed, yt-dlp wheel, bgutil provider exe/plugin, and an EJS cache under `%APPDATA%\Utawakui\dependencies\ytdlp\current`.                                                                                                                                        |
| Provider metadata backfill  | `provider-flow` for automatic network pass | `useLibrary`, `useLyrics` backfill status                 | `library:list` conditionally starts `runBackfillPass`                                                               | App-managed Python `yt-dlp`; Rust bgutil provider sidecar                    | Backfill runs only after provider-flow is enabled and uses the same prepared provider runtime as user-initiated import.                                                                                                                                                                  |
| Lyrics provider search/save | `lyrics-flow`                              | `useLyrics`, LRCLIB search panel                          | `lyrics:search-candidates`, `lyrics:save-candidate`, `lyrics:backfill-source-labels`, `lyrics:probe-musixmatch`     | No packaged native dependency                                                | Manual lyrics import/edit/delete stays ungated because it only edits local user data.                                                                                                                                                                                                    |
| Lyrics reading aids         | Ungated local processing                   | `useLyricsReading`, Lyrics workspace reading controls     | `lyrics:generate-reading`, `readingWorker.js`                                                                       | `kuromoji`, `wanakana`, `koroman`                                            | Local Japanese/Korean text analysis only; packages are in `dependencies` and unpacked because worker threads and dictionary reads need real filesystem paths.                                                                                                                            |
| Vocal separation            | `audio-processing-flow`                    | `useSeparation`, Lyrics workspace separation controls     | `separation:run`, `vocalSeparationWorker.js`                                                                        | `kissfft-js`, `onnxruntime-node`; FFmpeg and UVR ONNX models are app-managed | FFmpeg and UVR ONNX models download to `userData/dependencies` from Settings after gate enablement; ONNX Runtime `.dll`/`.node` and `electron/lib/**/*` are unpacked. Refined's Audio Python host is probe-only: its first lock is license-blocked and no runtime/model is downloadable. |
| Separation result selection | Existing generated media                   | Lyrics workspace preset select                            | `separation:select`                                                                                                 | None beyond library modules                                                  | Metadata-only selection of already-created results; no DSP run.                                                                                                                                                                                                                          |
| Public output / OBS         | `public-output-flow` on start and publish  | `useOutputRuntime`; Gallery mockups; Workbench iframe     | `outputHandlers`; `outputSlots`; `outputServer`; `outputRuntime`; root-level plain overlay package                  | `ws`; browser-native WebSocket and Web Animations                            | Versioned snapshots, four fixed overlay routes, independent portable slot settings, allowlisted appearance controls, URL copy, and the real Workbench preview are packaged.                                                                                                              |
| Recording / VOD mode        | Planned                                    | None                                                      | None                                                                                                                | None                                                                         | No release dependency today.                                                                                                                                                                                                                                                             |

## Dependency Classes

Production dependencies are packages required by Electron main, worker threads,
or spawned binaries after the Vite build has already produced `dist/`.

| Class               | Packages                                                                             | Reason                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Packaged runtime    | `kissfft-js`, `onnxruntime-node`, `ws`, `kuromoji`, `wanakana`, `koroman`            | Used by main/worker code at runtime after packaging.                                                               |
| Packaged seed       | None for provider import                                                             | Provider import now prepares verified downloads instead of copying a packaged `yt-dlp.exe` seed.                   |
| App-managed runtime | Python provider runtime; FFmpeg Gyan essentials build; UVR ONNX separation models    | Prepared to `userData` only after the matching feature gate is enabled and the user prepares the item in Settings. |
| Renderer build-time | `vue`, `@lucide/vue`, `@soundtouchjs/audio-worklet`                                  | Imported by renderer source and bundled into `dist/` by Vite.                                                      |
| Tooling build-time  | Electron, electron-builder, Vite, Vitest, ESLint, Prettier, commitlint, markdownlint | Needed to develop, test, build, and package; not app runtime dependencies.                                         |

Notable transitive production dependencies can still appear in packaged
`node_modules` when required by a packaged runtime dependency. Current example:
`adm-zip` is pulled in by `onnxruntime-node`; keep it in the security/dependency
follow-up until the ONNX Runtime dependency choice or upstream dependency tree
changes.

The Utawakui product license is maintained in `LICENSE.md`. Third-party license
inventory is maintained in `THIRD_PARTY_NOTICES.md` and can be regenerated for
review with `npm run license:inventory`. Keep both files in the package so the
application terms and the licenses for bundled or app-managed dependencies
remain visible in release artifacts.

When adding a dependency, classify it before installing:

- If main/preload/worker code `require()`s it at runtime, keep it in
  `dependencies`.
- If only renderer source imports it and Vite emits it into `dist/`, put it in
  `devDependencies`.
- If it is spawned as an executable or loaded as a native module, add or confirm
  an `asarUnpack` rule.
- If it is loaded from a worker thread or reads data files with `fs`, verify it
  from a real packaged build; worker threads cannot rely on every Electron ASAR
  patch that normal `require()` paths get.
- If it is only for tests/lint/build scripts, put it in `devDependencies`.

## Packaging Locations

| Artifact                                                                                               | Contents                                                                                                                         |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `release/win-unpacked/electron.exe`                                                                    | Electron host executable. Kept with this filename due ADR 0002.                                                                  |
| `release/win-unpacked/resources/app.asar`                                                              | `dist`, `electron`, `shared`, root `package.json`, `LICENSE.md`, `THIRD_PARTY_NOTICES.md`, and production JS dependency closure. |
| `release/win-unpacked/resources/app-update.yml`                                                        | Public GitHub feed identity generated for an NSIS build; no token or signing credential. `dist:dir` alone does not generate it.  |
| `release/win-unpacked/resources/app.asar/THIRD_PARTY_NOTICES.md`                                       | Release third-party license and notice inventory.                                                                                |
| `release/win-unpacked/resources/app.asar/LICENSE.md`                                                   | Utawakui proprietary software use terms.                                                                                         |
| `release/win-unpacked/resources/app.asar/node_modules/ws`                                              | Pure JavaScript WebSocket server used by the loopback output runtime.                                                            |
| `release/win-unpacked/resources/app.asar/overlay`                                                      | Plain HTML/CSS/JS Browser Source pages and shared `--ovl-*` tokens/runtime.                                                      |
| `release/win-unpacked/resources/app.asar/shared/presentation`                                          | Pure renderer/Browser Source presentation contracts, served to OBS only through exact allowlisted loopback routes.               |
| `release/win-unpacked/resources/app.asar.unpacked/electron/lib`                                        | Worker and runtime JS needed outside asar.                                                                                       |
| `release/win-unpacked/resources/app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v6/win32/x64` | ONNX Runtime / DirectML native files for vocal separation.                                                                       |
| `release/win-unpacked/resources/app.asar.unpacked/node_modules/kuromoji`                               | Japanese tokenizer and dictionary files used by reading workers.                                                                 |
| `release/win-unpacked/resources/app.asar.unpacked/node_modules/wanakana`                               | Kana/romaji conversion package used by reading workers.                                                                          |
| `release/win-unpacked/resources/app.asar.unpacked/node_modules/koroman`                                | Korean romanization package used by reading workers.                                                                             |
| `release/win-unpacked/resources/app.asar.unpacked/public/assets/icons/app-icon.ico`                    | Shell-facing icon path used by Windows app details.                                                                              |
| `release/win-unpacked/resources/audio-processing/audio_python_worker.py`                               | App-owned shared runtime-host protocol/probe bootstrap; contains no Python runtime, capability package, or model.                |
| `%APPDATA%\Utawakui\dependencies\ytdlp\current\python\python.exe`                                      | Private Python runtime used only for provider import.                                                                            |
| `%APPDATA%\Utawakui\dependencies\ytdlp\current\python\Lib\site-packages\yt_dlp`                        | App-managed yt-dlp Python package.                                                                                               |
| `%APPDATA%\Utawakui\dependencies\ytdlp\current\bgutil\bgutil-pot.exe`                                  | Rust bgutil PO-token provider sidecar.                                                                                           |
| `%APPDATA%\Utawakui\dependencies\ytdlp\current\plugins\bgutil-ytdlp-pot-provider-rs`                   | yt-dlp plugin package loaded through `--plugin-dirs`.                                                                            |
| `%APPDATA%\Utawakui\dependencies\ffmpeg\<version>\bin\ffmpeg.exe`                                      | App-managed FFmpeg binary downloaded after audio-processing-flow is enabled.                                                     |
| `%APPDATA%\Utawakui\dependencies\models\<dependencyId>\<version>\*.onnx`                               | App-managed UVR model files downloaded after audio-processing-flow is enabled.                                                   |

## Verification Checklist

After changing gates or dependencies:

- Run unit tests for touched composables and pure modules.
- Run `npm run build` and confirm Vite emits `dist/assets/soundtouch-processor-*.js`.
- Run `npm run dist:dir` and inspect:
  - `release/builder-effective-config.yaml`
  - `release/win-unpacked/resources/app.asar`
  - `release/win-unpacked/resources/app.asar.unpacked`
- Confirm `app.asar` no longer contains renderer-only packages as runtime
  `node_modules` after moving them to `devDependencies`.
- Confirm `LICENSE.md` and `THIRD_PARTY_NOTICES.md` are present in `app.asar`, and rerun
  `npm run license:inventory` after dependency changes.
- Confirm `app.getVersion()` matches `package.json`, installer metadata, and the
  release tag; never publish a reused or mismatched version.
- Confirm `app.asar.unpacked` contains `electron/lib`, ONNX Runtime native
  files, `kuromoji`, `wanakana`, `koroman`, and the shell-facing ICO.
- Confirm `resources/audio-processing/audio_python_worker.py` exists outside
  ASAR, answers the host-only versioned probe under a test Python runtime, and
  that the package contains no Audio Python `python.exe`, `site-packages`,
  PyTorch, environment archive, or model weight.
- Launch the packaged `release/win-unpacked/electron.exe`.
- Confirm provider, lyrics, and audio-processing gates prompt before their
  first external or generated-media action.
- Confirm public-output start and publish remain gated, while status/stop remain
  available for recovery.
- Confirm provider-flow can prepare the Python provider runtime into
  `%APPDATA%\Utawakui\dependencies\ytdlp\current`, run
  `python.exe -m yt_dlp --version`, confirm the bgutil provider sidecar answers
  `/ping`, and smoke-test a PO-token-blocked YouTube video with Electron-as-Node
  EJS enabled.
- Confirm audio-processing-flow can prepare/download/verify FFmpeg and UVR
  models from Settings, then load the prepared model and spawn its worker.
  Removing a dependency must clear its app-owned family root, including stale
  versions/caches and the verified legacy model location, without touching
  tracks or generated separation results.
- Confirm packaged reading-aid workers can generate Japanese and Korean reading
  output without loading missing modules or dictionary files from inside ASAR.
- For installer verification, use `npm run dist`; `dist:dir` does not create
  Start Menu shortcuts, so it cannot verify installed AUMID / SMTC app name.
- Before publishing the first updater-enabled baseline, verify `latest.yml`
  SHA-512 rejection, blockmap/full-download fallback, explicit restart, and
  app-data/library preservation across two installed versions. Record that
  publisher identity is not verified.
- Verify `app-update.yml` from a full NSIS build, not `dist:dir`; electron-builder
  does not generate updater metadata for the unpacked-directory-only target.
- For uninstaller verification, run the installed uninstaller interactively and
  confirm the component page separately offers optional cleanup for app-managed
  dependencies, `%APPDATA%\Utawakui`, and the selected library when its recorded
  path is normalized, marker-backed, and not a root or protected system/user
  folder. All three options must default to unchecked; when selected, verify
  only the expected target is removed or scheduled for removal if Windows has
  it locked. Tampering `library-path.txt` to a root, one-level root child, or
  unmarked folder must hide the library option.
