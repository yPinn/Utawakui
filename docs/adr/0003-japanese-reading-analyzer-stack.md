# ADR 0003: Japanese reading-aid stack — kuromoji + wanakana, not kuroshiro

## Status

Accepted and implemented (2026-08-21). Stage 5a
(`electron/lib/lyricsReading.js`) was built against an injected fake analyzer with
this exact interface shape; Stage 5b swapped in the real `kuromoji`/
`wanakana` inside `electron/lib/lyricsReadingWorker.js` with no changes to the
IPC shape, sidecar format, or renderer code, confirming the drop-in design
worked as intended.

Re-evaluation milestone A landed on 2026-09-10 without changing the production
choice. Raw kuromoji fields now terminate at a package adapter and the pure
builder consumes analyzer-neutral tokens. A bounded local benchmark and
correction-shadow contract can therefore compare challengers without changing
saved readings or applying correction data to production.

## Context

The Lyrics Workspace needs a reading-aid: furigana over kanji and a romaji
line, so a performer can sing a Japanese song they can't fully read. This
requires a Japanese morphological analyzer (to split text into tokens with
per-token phonetic readings) plus a kana→romaji converter.

Checked npm registry state directly (2026-08-21, not from training data —
see the session that produced this ADR for the raw download-count/version
lookups) rather than assuming what's "the standard choice":

| package           | role                                                   | latest | published | downloads/mo | license    |
| ----------------- | ------------------------------------------------------ | ------ | --------- | ------------ | ---------- |
| `kuromoji`        | morphological analyzer, bundles IPADIC                 | 0.1.2  | 2022-06   | 1.37M        | Apache-2.0 |
| `kuroshiro`       | furigana/romaji conversion layer on top of an analyzer | 1.2.0  | 2021-06   | 102K         | MIT        |
| `wanakana`        | kana↔romaji/latin conversion only                      | 5.3.1  | 2023-11   | 348K         | MIT        |
| `@sglkc/kuromoji` | browser-compat fork of kuromoji                        | 1.1.0  | 2023-09   | 40K          | Apache-2.0 |

`kuromoji` is the dependency every JS-side option is built on — there is no
alternative that doesn't require a system install or native build (MeCab,
Sudachi), which this project's zero-install distribution model rules out
(same reasoning as [ADR 0001](0001-standalone-ytdlp-no-plugin-support.md)
for yt-dlp plugins).

## Decision

Use `kuromoji` (tokenizer + per-token katakana reading) plus `wanakana`
(katakana→romaji) plus a hand-written okurigana-alignment function
(`alignOkurigana` in `electron/lib/lyricsReading.js`), instead of `kuroshiro`.

Rejected `kuroshiro`:

- Its furigana mode returns an **HTML string**
  (`<ruby>漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby>`), but this codebase
  renders ruby exclusively via literal `<ruby>`/`<rt>` elements and never
  uses `v-html`, so injecting markup as a string would break that pattern. Using kuroshiro
  would mean re-parsing its HTML output back into structured
  `{ text, reading }` segments — strictly more code than aligning the
  kuromoji token directly, for a worse starting shape.
- Per-line manual correction (the Lyrics Workspace's existing edit-in-place
  pattern, see `LyricsSourceManagerModal.vue`) needs structured segments to
  edit, not a string to re-parse and re-serialize.
- It has had no release since 2021-06 (1.2.0), one more unmaintained layer
  between the app and `kuromoji` for no benefit once its only real feature —
  HTML formatting — isn't the shape this app wants.

Rejected MeCab / Sudachi for the bundled baseline: both need a system install or
native compilation, which conflicts with the zero-install, single-executable
distribution model this app already commits to elsewhere (yt-dlp standalone
binary, app-managed FFmpeg/UVR downloads — never "install X first"). This does
not approve an app-managed Sudachi runtime. It only leaves that isolated,
removable shape available as a future challenger after the quality, packaging,
offline, capacity, and rollback gates in the
[Lyrics Reading Quality Contract](../contracts/lyrics-reading-quality-contract.md)
pass.

Distribution: `kuromoji` and `wanakana` will be added as ordinary npm
`dependencies` and packaged with the app (like `onnxruntime-node`,
`kissfft-js`), not gated behind a Settings-triggered download like
FFmpeg/UVR models. Reasoning: this is bundled code + a bundled dictionary
file, resolved at build time — there is nothing to fetch at runtime, so the
app-managed-dependency machinery (`shared/featureDependencies.json`,
sha256-verified downloads) doesn't apply. The IPADIC dictionary kuromoji
bundles adds real installer weight — measured at ~18 MB unpacked after
excluding kuromoji's `test`/`demo`/`example`/`build` directories (its npm
package has no `files` field, so the full repo, including an unzipped
22 MB `test/`, ships by default; `electron-builder.yml`'s `files` negation
patterns strip those four before packaging). `wanakana` adds another
~0.5 MB. Same order of magnitude as the UVR models already shipped this
way — accepted for the same reason: an optional feature the user
explicitly generates, not overhead on every launch.

**Runtime license ≠ dictionary license, same split as `onnxruntime-node`**
(`docs/governance/legal-compliance.md`'s existing row: "Runtime 授權不等於模型授權；模型檔需另行列示來源與 license。"):
`kuromoji`'s own code is Apache-2.0/MIT dual-licensed, but the bundled
IPADIC dictionary carries its own separate license terms. When Stage 5b
lands, `docs/governance/legal-compliance.md`'s dependency table gets both rows, not
one collapsed row.

## Consequences

`electron/lib/lyricsReading.js`'s injected interface consumes analyzer-neutral
`{ surface, reading, partOfSpeech?, lemma?, outOfVocabulary? }` tokens plus
wanakana's `toRomaji()` signature. The kuromoji adapter owns the raw
`surface_form`, POS, lemma, and `word_type` mapping inside the worker boundary
(never on the main process or at app startup — dictionary load is CPU/memory
heavy, same isolation reasoning as `onnxruntime-node` in
`vocalSeparationWorker.js`). The adapter extraction changed no IPC shape,
sidecar format, analyzer id, or renderer code.

**Packaging risk found and confirmed fixed, not assumed away**: worker
threads don't get Electron's asar `fs` patch (same limitation
`electron-builder.yml` already documents for `electron/lib/**/*` itself —
`new Worker()`'s entry path isn't asar-transparent), so anything the worker
`require()`s or `fs.readFile()`s — the whole `kuromoji` package including
its dictionary, and `wanakana` — had to be added to `asarUnpack`, not just
the dictionary files. Verified empirically against a real `dist:dir`
build, not just reasoned about: (1) confirmed the unpacked files physically
exist under `app.asar.unpacked`, correctly missing the excluded
`test`/`demo`/`example`/`build` directories; (2) spawned
`lyricsReadingWorker.js` directly from its `app.asar`-internal path via
`ELECTRON_RUN_AS_NODE=1 electron.exe <script>` (the same asar-internal path
`electron/main/lyrics/readingHandlers.js` uses in production) and got back a
correct real furigana result for `歌う声` (`歌`→`うた`, `声`→`こえ`), proving
the worker's own `require('kuromoji')`/`require('wanakana')`/dictionary
read all resolve correctly once physically unpacked.

If `kuromoji` stops working on a supported Node/Electron version, an
API-compatible maintained fork remains the lowest-risk replacement candidate.
A different analyzer such as Sudachi must instead pass the same representative
corpus and packaged Windows gates before promotion; upstream freshness alone is
not a reason to rewrite existing sidecars or change the default.
