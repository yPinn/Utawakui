# ADR 0005: Move provider import from standalone yt-dlp.exe to app-managed Python yt-dlp

## Status

Accepted and implemented (2026-08-22). Provider search, import, download, and
backfill now use the app-managed Python yt-dlp runtime. Its Python, yt-dlp,
bgutil provider, and plugin artifacts form one verified activation unit.

## Context

ADR 0001 intentionally stopped short of yt-dlp plugin support because the
current `youtube-dl-exec` standalone `yt-dlp.exe` is a PyInstaller-frozen
binary and did not load plugins even when `--plugin-dirs` pointed at a valid
directory. That was a correct decision for the previous zero-install tool
model, but the live failure mode has become too frequent: PO-token-protected
YouTube videos can still resolve to image-only formats or 403s after the
existing player-client/cookie/impersonation ladder.

The product requirement has changed from "keep the provider tool as a tiny
standalone executable" to "keep the user experience simple and reliable." The
user should not install Python, configure `PATH`, run Docker, or understand PO
tokens. Utawakui can own a private runtime under app data, just like it already
owns FFmpeg and UVR model preparation for optional workflows.

Current upstream facts checked on 2026-08-22:

- yt-dlp's current documentation recommends PO Token Provider plugins for this
  class of YouTube failures, with manual `youtube:po_token=...` treated as a
  lower-level escape hatch.
- yt-dlp's EJS documentation now matters for YouTube's JavaScript challenges:
  PO token generation alone is not enough when the `n` challenge also needs a
  supported JS runtime and solver distribution.
- Python.org's Windows embeddable distribution is specifically intended for
  applications that ship a private Python runtime. It is isolated from the
  user's system and excludes pip by default; third-party packages should be
  vendored by the application/installer.
- Python.org's latest Windows Python 3 release on 2026-08-22 is 3.14.7
  (released 2026-08-05). The 64-bit embeddable package is 12.1 MB with SHA-256
  `d297e5ff019966817ad8502465176139f2d3d840fa4ed84b13bed399a6ab1f15`.

## Decision

Replace the provider-flow download engine with an app-managed Python yt-dlp
runtime:

- Provision a private Windows x64 Python embeddable runtime under
  `%APPDATA%\Utawakui\dependencies\python\3.14.7-embed\`.
- Vendor/pin `yt-dlp` as Python package code, not as the standalone
  `yt-dlp.exe`. Initial verified version: `2026.08.19`.
- Use the Rust bgutil PO-token provider (`jim60105/bgutil-ytdlp-pot-provider-rs`)
  instead of Docker or the Node/Deno bgutil server as the default companion:
  - `bgutil-pot-windows-x86_64.exe` v0.8.1, 43.7 MB,
    SHA-256 `25d6b05c79176aa792454c3d1727922ca47e56cf11cb1e866615d751819b14a0`
  - `bgutil-ytdlp-pot-provider-rs.zip` v0.8.1, 6.11 KB,
    SHA-256 `99fd83b98fa93b193d6a3b69dc74410d76e7a2b889868c54d16121cac9060344`
- Launch the Rust provider as a loopback-only sidecar process on
  `127.0.0.1` with a selected free port, and pass that URL to yt-dlp via
  `--extractor-args youtubepot-bgutilhttp:base_url=http://127.0.0.1:<port>`.
- Reuse Electron's packaged binary as the Node runtime for EJS:
  set `ELECTRON_RUN_AS_NODE=1` for the yt-dlp child environment and pass
  `--js-runtimes node:<path-to-electron.exe>`.
- This dependency is the sole approved reason the packaged `RunAsNode` fuse
  remains enabled. Node options environment and Node CLI inspect stay disabled;
  a future dedicated app-managed Node runtime must replace this path before the
  Run-as-Node fuse can be disabled.
- Enable yt-dlp EJS remote components initially with
  `--remote-components ejs:github`, but cache them under Utawakui's managed
  provider runtime directory and surface failure as "線上來源工具需要更新/重新準備",
  not as a raw yt-dlp error.
- Preserve the current local-first product boundary: provider import remains
  gated by `provider-flow`; local audio import remains the default path.

The preferred YouTube attempt set changes from "anonymous clients, cookies,
impersonate" to "Python yt-dlp with mweb + bgutil PO token + EJS first, then
bounded fallback phases." Cookies stay as a later fallback, not the primary
reliability story, because browser cookie extraction is brittle on current
Windows browser encryption.

## Validation

The selected path was validated against the same previously PO-token-blocked
video used during the 403 investigation:

1. A clean temp venv installed only `yt-dlp==2026.08.19`.
2. The Rust provider binary v0.8.1 was downloaded, SHA-256 verified, and
   launched on `127.0.0.1:4417`; `/ping` returned version `0.8.1`.
3. The Rust yt-dlp plugin zip was downloaded and SHA-256 verified.
4. A first attempt using the Brainicism PyPI plugin against the Rust server was
   rejected because the plugin/server versions differed, proving the provider
   pair must be version-matched.
5. A first isolated Rust-plugin attempt failed with `Plugin directories: none`
   because yt-dlp's `--plugin-dirs` expects a parent directory containing one or
   more plugin packages; pointing directly at the package root is the wrong
   level. The runtime installer must preserve this shape.
6. The successful command used:
   - `--plugin-dirs <managed-provider-plugin-parent>`
   - `--extractor-args youtube:player_client=mweb`
   - `--extractor-args youtubepot-bgutilhttp:base_url=http://127.0.0.1:4417`
   - `--remote-components ejs:github`
   - `--js-runtimes node:<electron.exe>`
   - `ELECTRON_RUN_AS_NODE=1`

The verbose yt-dlp result showed:

- `Plugin directories: ...\bgutil-ytdlp-pot-provider-rs.zip\yt_dlp_plugins,
...\rust-plugin\yt_dlp_plugins`
- `PO Token Providers: bgutil:cli-0.8.1 (external, unavailable),
bgutil:http-0.8.1 (external)`
- `JS runtimes: node-24.18.1`
- `Retrieved a gvs PO Token for mweb client`
- `Solving JS challenges using node`
- `Downloading 1 format(s): 399+251`

## Rejected options

- **Keep standalone yt-dlp.exe and add plugin flags**: already rejected by
  ADR 0001 and re-confirmed by the failure mode. PyInstaller standalone builds
  do not preserve normal Python plugin discovery.
- **Docker provider server**: functionally works, but the local image was
  measured at 467 MB and requires Docker Desktop/WSL. That is too heavy and too
  engineer-shaped for the target user.
- **Node/Deno bgutil HTTP server as the default**: the official bgutil provider
  works, but the Node server pulls heavier dependencies, including native
  browser-like packages. It remains a fallback if the Rust provider becomes
  unmaintained or incompatible with future yt-dlp.
- **Ask the user to install Python and pip packages**: operationally fragile,
  exposes PATH/site-packages/version drift, and directly conflicts with the
  product goal that non-engineering users only click "準備".
- **Manual PO-token entry**: useful as an emergency dev override but not a
  product solution. Tokens are context/client/visitor-bound and expire or drift
  often enough that the user experience would be worse than the current wall.

## Implementation plan

1. Add a provider runtime module under `electron/lib/` that resolves managed
   Python, vendored yt-dlp, plugin parent, provider binary, EJS cache, and the
   Electron-as-Node runtime path.
2. Extend `shared/featureDependencies.json` from the single
   `yt-dlp-provider-tool` executable to a compound provider runtime with four
   verified artifacts: Python embed zip, yt-dlp wheel/vendor package, Rust
   provider exe, Rust plugin zip. The Settings row should still appear as one
   user-facing item: "線上來源工具".
3. Install by download/sha256/extract into a temp directory, smoke-test
   `python.exe -m yt_dlp --version`, smoke-test plugin discovery, then atomically
   promote the runtime directory and write one manifest.
4. Add a main-process sidecar manager for `bgutil-pot server`, bound only to
   `127.0.0.1`, with port selection, `/ping` readiness, restart on crash during
   provider operations, and clean shutdown on app quit.
5. Replace the `youtube-dl-exec` runner in provider import and metadata
   backfill paths with a Python-backed yt-dlp runner that maps the small option
   surface this app uses (`dumpSingleJson`, `skipDownload`, `flatPlaylist`,
   output, subtitles, thumbnails, cookies, impersonation, extractor args,
   format) into CLI args. Do not expose arbitrary renderer-provided yt-dlp
   flags.
6. Move the PO-token/EJS options into `youtubeAttempts.js` as first-class phases
   for the Python provider runtime.
7. Update Settings status and diagnostics so users see only "not prepared",
   "preparing", "ready", "repair", and "update available" states. Raw provider
   stderr must stay main-process diagnostic context, not renderer copy.
8. Verify with unit tests for dependency paths/manifests, CLI argument mapping,
   plugin-directory shape, sidecar lifecycle, and retry phase composition; then
   run a real-network smoke test against the known PO-token-blocked video.

## Consequences

Expected extra managed download/install size on Windows x64:

- Python embed zip: about 12 MB compressed, likely around 30-45 MB extracted
  depending on retained stdlib layout.
- yt-dlp Python package: about 3.2 MB wheel, about 20 MB installed from the
  local user-site measurement.
- Rust provider executable: about 44 MB.
- Rust plugin zip: about 6 KB.
- EJS cached components: small, but network-fetched on first prepare/run unless
  a later packaging pass vendors them.

The practical added footprint is likely around 90-120 MB managed app data,
well below the Docker path and acceptable for a reliability-critical optional
provider workflow. The installer can stay lighter if these artifacts remain
Settings-prepared downloads rather than bundled payload.

Licensing must be updated before release: Python Software Foundation License,
yt-dlp Unlicense, Rust provider GPL-3.0-or-later/GPL-family terms as published
by the provider project, plus any EJS component license notes. The provider
runtime is optional and app-managed, but it is still redistributable software
and must appear in `docs/governance/legal-compliance.md` and
`docs/operations/release-inventory.md`.

## References

- [yt-dlp wiki, PO Token Provider and EJS docs](https://github.com/yt-dlp/yt-dlp-wiki)
- [Python 3.14.7 Windows release](https://www.python.org/downloads/release/python-3147/)
- [Python Windows embeddable package docs](https://docs.python.org/3/using/windows.html#the-embeddable-package)
- [Rust bgutil provider releases](https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs/releases)
- [Rust bgutil provider README/docs](https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs)
