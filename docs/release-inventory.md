# Release Inventory

> This document maps product features to package/runtime dependencies and
> packaging locations. Keep it in sync when adding IPC handlers, native binaries,
> feature gates, or electron-builder packaging rules.

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
- Worker/runtime JS that must resolve outside asar: `electron/lib/**/*`,
  unpacked through `asarUnpack`.
- Uninstaller data cleanup: optional NSIS checkboxes from `build/installer.nsh`
  clean `%APPDATA%\Utawakui` and the legacy `%APPDATA%\Electron` folder.
  They do not touch the user's music library under `<Music>\Utawakui`.

The `electron.exe` filename is intentional. See
`docs/adr/0002-packaged-exe-kept-as-electron-exe.md`.

## Installer Profile Boundary

The installer names the shipped payload as **核心安裝** and describes
feature-gated capabilities as **工作流程擴充**.

This is intentionally not a selectable "Basic vs Ext" component split yet:

- `electron-builder`'s assisted NSIS flow installs the generated application
  payload as one app section; its supported hooks are better suited to extra
  pages or post-install work than to surgically splitting `app.asar` and
  unpacked native modules into optional component payloads.
- Current extension-like dependencies are not all installer payloads. FFmpeg is
  app-managed and downloaded only after `audio-processing-flow` is enabled;
  model files are also prepared from Settings before use.
- A checkbox in the installer would therefore over-promise a real packaging
  distinction and move license/source disclosure away from the feature gate that
  actually triggers the download.

Use this naming until a release truly ships separate artifacts:

- **核心安裝**: the Electron app, local library/playback/import surfaces,
  Settings, feature gate UI, and packaged runtime needed for the app to start.
- **工作流程擴充**: provider/network flows, lyrics sources, audio processing, and
  future public-output workflows that are enabled from inside the app and may
  download, connect to, or generate additional data after confirmation.

If a future installer really needs selectable payloads, split the release into
separate artifacts or replace the generated NSIS template with a maintained
component-aware template, then re-verify AUMID, update behavior, uninstall data
cleanup, and license notices end to end.

## Feature Inventory

| Feature area                | Gate                                       | Renderer entry                                            | Main / worker entry                                                                                                 | Runtime packages                                                        | Packaging notes                                                                                                                                                       |
| --------------------------- | ------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local library               | Ungated core                               | `useLibrary`, Setlist/Lyrics track pools                  | `library:*`, `utawakui-media:`                                                                                      | None beyond Electron/Node built-ins                                     | Local media stays outside the app under the selected library root.                                                                                                    |
| Local import                | Ungated core                               | `useLocalImport`, Import view                             | `library:import-audio-files`                                                                                        | None beyond Node built-ins                                              | Copies user-picked audio into managed track folders.                                                                                                                  |
| Playback / queue            | Ungated core                               | `usePlayer`, `usePlaybackQueue`, `PlayerBar`              | media protocol only                                                                                                 | Renderer bundle; `@soundtouchjs/audio-worklet` is build-time only       | Pitch preview worklet is emitted into `dist/assets/` by Vite; it should not be packaged as runtime `node_modules`.                                                    |
| Windows shell integration   | Ungated core                               | `useTaskbarControls`, `useMediaSession`, `useWindowTitle` | `windowState`, `thumbarIcons`                                                                                       | Electron runtime only                                                   | App icon is packaged in both `dist/assets/` and `public/assets/icons/app-icon.ico`; ICO is unpacked for shell APIs.                                                   |
| Provider import             | `provider-flow`                            | `useImportSession`                                        | `yt:fetch-playlist`, `yt:fetch-metadata`, `yt:resolve-import-source`, `yt:download-audio`, `playlists:upsert-album` | `youtube-dl-exec` plus bundled `yt-dlp.exe`                             | `yt-dlp.exe` is unpacked and copied to writable `userData/bin` in packaged mode.                                                                                      |
| Provider metadata backfill  | `provider-flow` for automatic network pass | `useLibrary`, `useLyrics` backfill status                 | `library:list` conditionally starts `runBackfillPass`                                                               | `youtube-dl-exec` plus bundled `yt-dlp.exe`                             | Backfill runs only after provider-flow is enabled.                                                                                                                    |
| Lyrics provider search/save | `lyrics-flow`                              | `useLyrics`, LRCLIB search panel                          | `lyrics:search-candidates`, `lyrics:save-candidate`, `lyrics:backfill-source-labels`, `lyrics:probe-musixmatch`     | No packaged native dependency                                           | Manual lyrics import/edit/delete stays ungated because it only edits local user data.                                                                                 |
| Vocal separation            | `audio-processing-flow`                    | `useSeparation`, Lyrics workspace separation controls     | `separation:run`, `vocalSeparationWorker.js`                                                                        | `kissfft-js`, `onnxruntime-node`; FFmpeg and UVR models are app-managed | FFmpeg and UVR ONNX models download to `userData/dependencies` from Settings after gate enablement; ONNX Runtime `.dll`/`.node` and `electron/lib/**/*` are unpacked. |
| Separation result selection | Existing generated media                   | Lyrics workspace preset select                            | `separation:select`                                                                                                 | None beyond library modules                                             | Metadata-only selection of already-created results; no DSP run.                                                                                                       |
| Public output / OBS         | `public-output-flow` planned               | OBS Setlist/Lyrics scaffold views                         | Not implemented                                                                                                     | None yet                                                                | No local HTTP/WebSocket overlay server is packaged yet.                                                                                                               |
| Recording / VOD mode        | Planned                                    | None                                                      | None                                                                                                                | None                                                                    | No release dependency today.                                                                                                                                          |

## Dependency Classes

Production dependencies are packages required by Electron main, worker threads,
or spawned binaries after the Vite build has already produced `dist/`.

| Class               | Packages                                                                             | Reason                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Packaged runtime    | `kissfft-js`, `onnxruntime-node`, `youtube-dl-exec`                                  | Used by main/worker code at runtime.                                                                               |
| App-managed runtime | FFmpeg Gyan essentials build; UVR ONNX separation models                             | Downloaded to `userData` only after `audio-processing-flow` is enabled and the user prepares the item in Settings. |
| Renderer build-time | `vue`, `@lucide/vue`, `@soundtouchjs/audio-worklet`                                  | Imported by renderer source and bundled into `dist/` by Vite.                                                      |
| Tooling build-time  | Electron, electron-builder, Vite, Vitest, ESLint, Prettier, commitlint, markdownlint | Needed to develop, test, build, and package; not app runtime dependencies.                                         |

When adding a dependency, classify it before installing:

- If main/preload/worker code `require()`s it at runtime, keep it in
  `dependencies`.
- If only renderer source imports it and Vite emits it into `dist/`, put it in
  `devDependencies`.
- If it is spawned as an executable or loaded as a native module, add or confirm
  an `asarUnpack` rule.
- If it is only for tests/lint/build scripts, put it in `devDependencies`.

## Packaging Locations

| Artifact                                                                                               | Contents                                                                                 |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `release/win-unpacked/electron.exe`                                                                    | Electron host executable. Kept with this filename due ADR 0002.                          |
| `release/win-unpacked/resources/app.asar`                                                              | `dist`, `electron`, `shared`, root `package.json`, and production JS dependency closure. |
| `release/win-unpacked/resources/app.asar.unpacked/electron/lib`                                        | Worker and runtime JS needed outside asar.                                               |
| `release/win-unpacked/resources/app.asar.unpacked/node_modules/youtube-dl-exec/bin/yt-dlp.exe`         | Bundled provider-flow downloader binary.                                                 |
| `release/win-unpacked/resources/app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v6/win32/x64` | ONNX Runtime / DirectML native files for vocal separation.                               |
| `release/win-unpacked/resources/app.asar.unpacked/public/assets/icons/app-icon.ico`                    | Shell-facing icon path used by Windows app details.                                      |
| `%APPDATA%\Utawakui\dependencies\ffmpeg\<version>\bin\ffmpeg.exe`                                      | App-managed FFmpeg binary downloaded after audio-processing-flow is enabled.             |
| `%APPDATA%\Utawakui\dependencies\models\<dependencyId>\<version>\*.onnx`                               | App-managed UVR model files downloaded after audio-processing-flow is enabled.           |

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
- Launch the packaged `release/win-unpacked/electron.exe`.
- Confirm provider, lyrics, and audio-processing gates prompt before their
  first external or generated-media action.
- Confirm `yt-dlp.exe` is copied to writable `userData/bin` in packaged mode.
- Confirm audio-processing-flow can prepare/download/verify FFmpeg and UVR
  models from Settings, then load the prepared model and spawn its worker.
- For installer verification, use `npm run dist`; `dist:dir` does not create
  Start Menu shortcuts, so it cannot verify installed AUMID / SMTC app name.
- For uninstaller verification, run the installed uninstaller interactively and
  confirm the component page offers optional cleanup for `%APPDATA%\Utawakui`
  and legacy `%APPDATA%\Electron`.
