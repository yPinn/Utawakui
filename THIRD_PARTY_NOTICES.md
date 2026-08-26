# Third-Party Notices

> This inventory is for Utawakui 0.1.0 release preparation. It summarizes
> third-party software distributed in the packaged app or used by app-managed
> feature downloads. It is not legal advice.

## Project License Status

Utawakui is proprietary software distributed under the terms in `LICENSE.md`.
`package.json` remains private and uses `UNLICENSED` to prevent the application
source from being treated as an open-source or publishable npm package. This
does not change the licenses of the third-party components listed below.

## Packaged Runtime Dependencies

These packages are part of the production dependency closure in
`package-lock.json` and may be packaged into `app.asar` or
`app.asar.unpacked`.

Summary from `node scripts/license-inventory.mjs`:

| License                      | Count |
| ---------------------------- | ----: |
| MIT                          |    67 |
| ISC                          |     6 |
| Apache-2.0                   |     3 |
| BlueOak-1.0.0                |     1 |
| BSD-3-Clause                 |     1 |
| MIT OR CC0-1.0               |     2 |
| Python-2.0                   |     1 |
| Standard 'no charge' license |     1 |

Direct runtime dependencies:

| Package            | Version | License                                                            | Release note                                                                                                                                                          |
| ------------------ | ------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `electron-updater` | 6.8.9   | MIT                                                                | Main-process Windows update client; runtime network access remains release-gated until signing and update-channel verification are complete.                          |
| `gsap`             | 3.13.0  | [Standard 'no charge' license](https://gsap.com/standard-license/) | Browser Source timeline runtime; served only through the loopback Output allowlist. Retain the GSAP standard-license reference in release notices.                    |
| `kissfft-js`       | 0.1.8   | MIT                                                                | Packaged runtime dependency for DSP/audio analysis paths.                                                                                                             |
| `koroman`          | 1.0.16  | MIT                                                                | Korean romanization runtime; npm package has license metadata but no bundled license file. Re-check upstream before release.                                          |
| `kuromoji`         | 0.1.2   | Apache-2.0                                                         | Japanese tokenizer; keep Apache license and bundled `NOTICE.md`.                                                                                                      |
| `onnxruntime-node` | 1.27.0  | MIT                                                                | Native ONNX Runtime binding and Windows binaries; npm package has license metadata but no bundled license file. Keep upstream source/license link in release notices. |
| `wanakana`         | 5.3.1   | MIT                                                                | Kana/romaji conversion runtime.                                                                                                                                       |
| `ws`               | 8.21.3  | MIT                                                                | Loopback WebSocket server for OBS Browser Source output.                                                                                                              |

Notable transitive runtime dependencies:

| Package         | Version         | License        | Reason to track                                                      |
| --------------- | --------------- | -------------- | -------------------------------------------------------------------- |
| `adm-zip`       | 0.5.18          | MIT            | Pulled by `onnxruntime-node`; keep in dependency/security follow-up. |
| `argparse`      | 2.0.1           | Python-2.0     | Transitive parser dependency used by the update runtime closure.     |
| `global-agent`  | 4.1.3           | BSD-3-Clause   | Transitive dependency in the production closure.                     |
| `human-signals` | 5.0.0           | Apache-2.0     | Transitive dependency in the production closure.                     |
| `sax`           | 1.6.1           | BlueOak-1.0.0  | Transitive XML parser used by the update runtime closure.            |
| `web-worker`    | 1.5.0           | Apache-2.0     | Transitive dependency in the production closure.                     |
| `type-fest`     | 0.20.2 / 4.41.0 | MIT OR CC0-1.0 | Dual-licensed transitive dependency.                                 |

## Browser-Delivered Dependencies

These dependencies are delivered to a browser context. Vue and the renderer
dependencies are bundled into `dist/` by Vite. GSAP is a production dependency
served to OBS only through one exact loopback Output allowlist route.

| Package family    | Version | License                                                            | Release note                                                                                                                                                                       |
| ----------------- | ------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vue` / `@vue/*`  | 3.5.41  | MIT                                                                | Renderer framework bundle.                                                                                                                                                         |
| `@lucide/vue`     | 1.31.0  | ISC                                                                | Renderer icon components.                                                                                                                                                          |
| `@soundtouchjs/*` | 2.1.1   | MPL-2.0                                                            | Pitch/tempo worklet bundle. MPL is file-level copyleft; if Utawakui modifies these source files, publish the modified MPL-covered source and provide a source-code notice.         |
| `gsap`            | 3.13.0  | [Standard 'no charge' license](https://gsap.com/standard-license/) | Loopback-served Browser Source animation runtime.                                                                                                                                  |
| jf open-huninn    | 2.1     | SIL Open Font License 1.1                                          | justfont Traditional Chinese rounded TTF bundled for the Classic KTV lyrics template; the exact source, checksum, and complete upstream license ship under `shared/assets/fonts/`. |

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

| Feature dependency             | License / notice boundary                                                                                                                                                          | Source / license reference                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Python embeddable runtime      | Python Software Foundation License. Keep Python source/license reference with the prepared runtime.                                                                                | <https://docs.python.org/3/license.html>                                  |
| `yt-dlp` Python wheel          | GPL-3.0-or-later provider tool. The tool license does not grant rights to downloaded media.                                                                                        | <https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE>                    |
| `bgutil-ytdlp-pot-provider-rs` | Unlicense according to the project dependency manifest. Re-check upstream before release.                                                                                          | <https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs>                |
| FFmpeg Gyan essentials build   | Manifest currently treats the managed build as GPL-3.0. FFmpeg licensing depends on build configuration; re-check the resolved build and its bundled license files before release. | <https://ffmpeg.org/legal.html>                                           |
| UVR MDX-Net ONNX models        | Manifest currently marks selected models as MIT with UVR credit. Re-check model source, license, and attribution before release.                                                   | <https://github.com/TRvlvr/model_repo/releases/tag/all_public_uvr_models> |

The app writes `SOURCE.txt`, `LICENSE.txt`, and `manifest.json` beside each
prepared managed dependency. Those files should be treated as the per-install
record of source URL, download URL, checksum, version, and license metadata.

## Release Checklist

Before publishing a binary release:

- Run `npm run license:inventory` and compare the report with this file.
- Confirm `LICENSE.md` and `THIRD_PARTY_NOTICES.md` are included in the
  packaged app.
- Confirm `THIRD_PARTY_NOTICES.md` is included in the packaged app.
- Preserve `kuromoji`'s Apache-2.0 license and `NOTICE.md`, including the
  `mecab-ipadic-2.7.0-20070801` notice.
- Confirm MPL-covered SoundTouchJS source availability for the exact bundled
  versions, especially if any local modifications are made.
- Re-check app-managed FFmpeg, yt-dlp, bgutil, Python, and UVR model license
  metadata at the resolved version used for that release.
- Do not describe third-party provider tools or media workflows as granting any
  rights to songs, lyrics, artwork, recordings, streams, or VODs.
