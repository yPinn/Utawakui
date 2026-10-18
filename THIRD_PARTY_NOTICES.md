# Third-Party Notices

> This inventory is for Utawakui 0.4.0 release preparation. It summarizes
> third-party software distributed in the packaged app or used by app-managed
> feature downloads. It is not legal advice.

## Complete License and Attribution Texts

The complete collected texts and author notices are in
[`third-party/NOTICES.txt`](third-party/NOTICES.txt), with exact package versions,
source references and checksums in `third-party/manifest.json`.
In the Windows installation these readable files are delivered outside ASAR at
`resources/third-party/NOTICES.txt` and `resources/third-party/manifest.json`.
The tables below are a navigation inventory; they do not replace those full texts.

The collection covers the Windows production dependency closure and a conservative
browser-root dependency closure, which also includes some build-time packages.
Upstream aggregate notices can mention additional platforms or components;
retaining them does not assert that all of those components are distributed.
Electron/Chromium and bundled fonts retain their original separate notice files.
App-managed provider/audio runtimes and models are separate downloads; this
installer notice repair does not resolve their outstanding source or service rights.

Regenerate offline with `npm run license:write` after reviewing changed versions,
then run `npm run license:verify`. Windows packaging and the unsigned-package
verifier reject stale collections, omitted texts and mismatched covered binaries.

## Project License Status

Utawakui is proprietary software distributed under the terms in `LICENSE.md`.
`package.json` remains private and uses `UNLICENSED` to prevent the application
source from being treated as an open-source or publishable npm package. This
does not change the licenses of the third-party components listed below.

## Packaged Runtime Dependencies

These packages are part of the production dependency closure in
`package-lock.json` and may be packaged into `app.asar` or
`app.asar.unpacked`.

License metadata summary from `node scripts/license-inventory.mjs` (not a substitute for the actual embedded-component terms):

| License                      | Count |
| ---------------------------- | ----: |
| MIT                          |    64 |
| MIT AND Apache-2.0           |     1 |
| ISC                          |     4 |
| Apache-2.0                   |     2 |
| BlueOak-1.0.0                |     1 |
| BSD-2-Clause                 |     1 |
| BSD-3-Clause                 |     2 |
| MIT OR CC0-1.0               |     2 |
| Python-2.0                   |     1 |
| Standard 'no charge' license |     1 |

Direct runtime dependencies:

| Package                        | Version | License                                                            | Release note                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------ | ------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@napolab/texture-bridge-core` | 0.15.0  | MIT                                                                | Experimental Windows x64 Spout2 shared-texture sender, loaded only by the isolated helper and unpacked with its native platform binding and notices.                                                                                                                                                                                                                              |
| `electron-updater`             | 6.8.9   | MIT                                                                | Main-process Windows update client; runtime network access remains release-gated until signing and update-channel verification are complete.                                                                                                                                                                                                                                      |
| `gsap`                         | 3.15.0  | [Standard 'no charge' license](https://gsap.com/standard-license/) | Browser Source timeline runtime; served only through the loopback Output allowlist. Retain the GSAP standard-license reference in release notices.                                                                                                                                                                                                                                |
| `js-yaml`                      | 5.4.3   | MIT                                                                | Main-process parser for local LRCLIB lyric files.                                                                                                                                                                                                                                                                                                                                 |
| `kissfft-js`                   | 0.1.8   | MIT AND BSD-3-Clause                                               | MIT wrapper plus BSD-3-Clause KissFFT implementation. Keep the complete upstream COPYING, reproduced in the full-text collection.                                                                                                                                                                                                                                                 |
| `koroman`                      | 1.0.16  | MIT                                                                | Korean romanization runtime. The complete LICENSE from the npm gitHead is retained verbatim, including upstream merge-conflict markers; source/version/checksum are recorded in the full-text collection.                                                                                                                                                                         |
| `kuromoji`                     | 0.1.2   | Apache-2.0                                                         | Japanese tokenizer; keep Apache license and bundled `NOTICE.md`.                                                                                                                                                                                                                                                                                                                  |
| `music-metadata`               | 12.2.0  | MIT                                                                | Main-process parser for validating user-selected local audio and deriving duration, bounded common tags, and embedded artwork. Its pure-JavaScript parser closure is packaged in `app.asar`.                                                                                                                                                                                      |
| `onnxruntime-node`             | 1.30.0  | MIT (core); see note                                               | Native ONNX Runtime binding. Complete v1.30.0 MIT and upstream ThirdPartyNotices texts are included. The win32/x64 DirectML.dll is separately covered by Microsoft's DirectML 1.15.4 EULA, LICENSE-CODE and ThirdPartyNotices from the official NuGet package. Those complete texts and the packaged DLL hash are recorded in the full-text collection; DirectML is not MIT-only. |
| `obs-websocket-js`             | 5.0.8   | MIT                                                                | Lazy-loaded main-process client for the optional read-only OBS status／timestamp integration.                                                                                                                                                                                                                                                                                     |
| `opencc-js`                    | 1.4.2   | MIT AND Apache-2.0                                                 | Pure-JavaScript OpenCC renderer bundle with generated `opencc-data` dictionaries; retain its MIT license and Apache-2.0 third-party notices.                                                                                                                                                                                                                                      |
| `sax`                          | 1.6.1   | BlueOak-1.0.0                                                      | Main-process XML parser for bounded provider TTML.                                                                                                                                                                                                                                                                                                                                |
| `signalsmith-stretch`          | 1.3.2   | MIT                                                                | Renderer AudioWorklet dependency for pitch transpose.                                                                                                                                                                                                                                                                                                                             |
| `wanakana`                     | 5.3.1   | MIT                                                                | Kana/romaji conversion runtime.                                                                                                                                                                                                                                                                                                                                                   |
| `ws`                           | 8.22.0  | MIT                                                                | Loopback WebSocket server for OBS Browser Source output.                                                                                                                                                                                                                                                                                                                          |

Notable transitive runtime dependencies:

| Package                                  | Version               | License        | Reason to track                                                                    |
| ---------------------------------------- | --------------------- | -------------- | ---------------------------------------------------------------------------------- |
| `adm-zip`                                | 0.6.1                 | MIT            | Direct release tooling dependency and transitive ONNX Runtime archive helper.      |
| `argparse`                               | 2.0.1                 | Python-2.0     | Transitive parser dependency used by the update runtime closure.                   |
| `global-agent`                           | 4.1.3                 | BSD-3-Clause   | Transitive dependency in the production closure.                                   |
| `file-type`／`strtok3`／`token-types`    | 22.1.1／10.4.1／6.1.2 | MIT            | Pure-JavaScript format sniffing and bounded tokenization used by `music-metadata`. |
| `ieee754`                                | 1.2.1                 | BSD-3-Clause   | Numeric decoding helper in the local-audio metadata parser closure.                |
| `web-worker`                             | 1.5.0                 | Apache-2.0     | Transitive dependency in the production closure.                                   |
| `type-fest`                              | 0.20.2 / 3.13.1       | MIT OR CC0-1.0 | Dual-licensed transitive dependency, including the OBS client branch.              |
| `@napolab/texture-bridge` / `neverthrow` | 0.15.0 / 8.2.0        | MIT            | Native Spout binding and bounded result helper used by the experimental sender.    |

The Windows texture-bridge binding incorporates Spout2／SpoutDX under the
BSD-2-Clause license and ships its full `THIRD-PARTY-NOTICES` beside the native
module in `app.asar.unpacked`. The package notice identifies Lynn Jarvis as the
Spout2 copyright holder. Utawakui does not bundle Shoost or an OBS Spout plugin.

## Browser-Delivered Dependencies

These dependencies are delivered to a browser context. Vue and the renderer
dependencies are bundled into `dist/` by Vite. GSAP is a production dependency
served to OBS only through one exact loopback Output allowlist route.

| Package family        | Version                 | License                                                            | Release note                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | ----------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vue` / `@vue/*`      | 3.5.43                  | MIT                                                                | Renderer framework bundle.                                                                                                                                                                                                                                                                                                                                                                                |
| `@lucide/vue`         | 1.52.0                  | ISC                                                                | Renderer icon components.                                                                                                                                                                                                                                                                                                                                                                                 |
| `signalsmith-stretch` | 1.3.2                   | MIT                                                                | Transpose (pitch-shift) AudioWorklet bundle. The exact npm gitHead matches the published JS and supplies the complete MIT text. Supplementary Linear/Emscripten/libc notices are preserved; upstream does not pin the compiler/native revisions, which remain a provenance limitation. Replaces the prior `@soundtouchjs/*` engine. See [ADR 0019](docs/adr/0019-signalsmith-stretch-pitch-transpose.md). |
| `gsap`                | 3.15.0                  | [Standard 'no charge' license](https://gsap.com/standard-license/) | Loopback-served Browser Source animation runtime.                                                                                                                                                                                                                                                                                                                                                         |
| `opencc-js`           | 1.4.2                   | MIT AND Apache-2.0                                                 | Offline Simplified-to-Taiwan-Traditional renderer conversion; generated dictionary data is bundled into `dist/` and performs no runtime download.                                                                                                                                                                                                                                                         |
| jf open-huninn        | 2.1                     | SIL Open Font License 1.1                                          | justfont Traditional Chinese rounded TTF bundled for the Classic KTV lyrics template; the exact source, checksum, and complete upstream license ship under `shared/assets/fonts/`.                                                                                                                                                                                                                        |
| M PLUS Rounded 1c     | ExtraBold               | SIL Open Font License 1.1                                          | Japanese rounded TTF bundled for the Kinetic Pop lyrics template; the exact source, checksum, and complete upstream license ship under `shared/assets/fonts/`.                                                                                                                                                                                                                                            |
| Keifont               | 2023-03-20 distribution | Apache License 2.0                                                 | Heavy Japanese pop-display TTF used by Kinetic Pop's gradient material; the pinned archive/font checksums, official source, and complete license ship under `shared/assets/fonts/`.                                                                                                                                                                                                                       |
| GenEi Antique         | 6.0a                    | SIL Open Font License 1.1                                          | Normal-width Japanese manga-dialogue TTF bundled for Japanese Manga Frame lyrics and ruby; the pinned source, checksum, reserved font name, and complete upstream license ship under `shared/assets/fonts/`.                                                                                                                                                                                              |

| Hina Mincho | Regular | SIL Open Font License 1.1 | Japanese Mincho display TTF bundled for the Ornate Vertical lyrics template; the official source, checksum, and complete upstream license ship under `shared/assets/fonts/`. |

The renderer dependency closure also includes MIT/BSD/ISC packages such as
`@babel/*`, `@jridgewell/sourcemap-codec`, `entities`, `estree-walker`,
`magic-string`, `nanoid`, `picocolors`, `postcss`, and `source-map-js`.
Regenerate the exact list with:

```bash
npm run license:inventory
```

## App-Managed Feature Dependencies

These items are not bundled into the installer by default. Utawakui prepares
them under user data only after the corresponding feature is enabled and the
user chooses to prepare the dependency.

| Feature dependency                   | License / notice boundary                                                                                                                                                          | Source / license reference                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Python 3.14.7 embeddable runtime     | Python-2.0 (PSF License Version 2). Keep Python source/license reference with the prepared runtime.                                                                                | <https://docs.python.org/3.14/license.html>                                    |
| `yt-dlp` 2026.08.19 Python wheel     | Unlicense. The tool license does not grant rights to downloaded media.                                                                                                             | <https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/LICENSE>                     |
| `ytmusicapi` 1.12.3                  | MIT; anonymous private-Innertube artist-photo worker dependency.                                                                                                                   | <https://github.com/sigma67/ytmusicapi/blob/1.12.3/LICENSE>                    |
| `requests` 2.34.2                    | Apache-2.0; HTTP client used by ytmusicapi.                                                                                                                                        | <https://github.com/psf/requests/blob/v2.34.2/LICENSE>                         |
| `urllib3` 2.8.0                      | MIT; Requests transport dependency.                                                                                                                                                | <https://github.com/urllib3/urllib3/blob/2.8.0/LICENSE.txt>                    |
| `certifi` 2026.7.22                  | MPL-2.0; CA bundle used by Requests.                                                                                                                                               | <https://github.com/certifi/python-certifi/blob/2026.07.22/LICENSE>            |
| `charset-normalizer` 3.5.2           | MIT; Requests text-decoding dependency.                                                                                                                                            | <https://github.com/jawah/charset_normalizer/blob/3.5.2/LICENSE>               |
| `idna` 3.20                          | BSD-3-Clause; Requests internationalized-domain dependency.                                                                                                                        | <https://github.com/kjd/idna/blob/v3.20/LICENSE.md>                            |
| `bgutil-ytdlp-pot-provider-rs` 0.8.1 | GPL-3.0-or-later for the local sidecar and yt-dlp plugin pair.                                                                                                                     | <https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs/blob/v0.8.1/LICENSE> |
| FFmpeg Gyan essentials build         | Manifest currently treats the managed build as GPL-3.0. FFmpeg licensing depends on build configuration; re-check the resolved build and its bundled license files before release. | <https://ffmpeg.org/legal.html>                                                |
| UVR MDX-Net ONNX models              | Manifest currently marks selected models as MIT with UVR credit. Re-check model source, license, and attribution before release.                                                   | <https://github.com/TRvlvr/model_repo/releases/tag/all_public_uvr_models>      |

Audio analysis also uses the separately managed Python 3.14.7／Beat This 1.1.0 environment, including soxr 1.1.0 (LGPL-2.1-or-later). Its complete native dependency/source obligations remain separate from this base installer collection; see [the versioned review](docs/governance/release-license-review-2026-10-18.md).

The app writes `SOURCE.txt`, `LICENSE.txt`, and `manifest.json` beside each
prepared managed dependency. Those files should be treated as the per-install
record of source URL, download URL, checksum, version, and license metadata.

## Release Checklist

Before publishing a binary release:

- Run `npm run license:inventory` and compare the report with this file.
- Confirm `LICENSE.md` and `THIRD_PARTY_NOTICES.md` are included in the
  packaged app.
- Run `npm run license:verify` and verify the delivered full texts, Electron notices, fonts and covered binaries using `node scripts/third-party-notices.mjs --app-out-dir <unpacked-directory>`.
- Preserve `kuromoji`'s Apache-2.0 license and `NOTICE.md`, including the
  `mecab-ipadic-2.7.0-20070801` notice.
- Preserve `opencc-js`'s MIT license and its Apache-2.0
  `THIRD_PARTY_LICENSES.md` notice for generated OpenCC dictionary data.
- Preserve the texture-bridge MIT license and its native binding's complete
  Spout2／SpoutDX BSD-2-Clause `THIRD-PARTY-NOTICES` file.
- Confirm the `signalsmith-stretch` version and MIT notice text stay in sync
  with the exact bundled version.
- Re-check app-managed FFmpeg, yt-dlp, ytmusicapi／Requests closure, bgutil,
  Python, and UVR model license
  metadata at the resolved version used for that release.
- Do not describe third-party provider tools or media workflows as granting any
  rights to songs, lyrics, artwork, recordings, streams, or VODs.
