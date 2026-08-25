# ADR 0004: Korean romanization — koroman

## Status

Accepted and implemented (2026-08-22). Stage 5c, following the same
injected-dependency shape ADR 0003 established for Japanese: `koroman` is
wired into `electron/lib/lyricsReadingWorker.js` as an alternative branch, not a
new machinery layer.

## Context

Stage 5c extends the Lyrics Workspace's reading-aid to Korean lyrics. Unlike
Japanese, 한글 is already phonetic — there is no furigana/ruby equivalent to
build. The only thing Korean needs is a romanization line, but a _correct_
one: a naive per-syllable transliteration is actively misleading for a
performer trying to sing the line. Standard Korean orthography applies
pronunciation-assimilation rules that change how adjacent syllables actually
sound — e.g. 유음화 (lateralization): 신라 is pronounced "silla", not the
letter-for-letter "sinla". Shipping a reading aid that gets this wrong is
worse than shipping none, same reasoning ADR 0003 gave for rejecting a
lower-quality Japanese analyzer.

Checked npm registry state directly (2026-08-22, not from training data):

| package               | latest | published | license | downloads/mo | pronunciation rules?                                 |
| --------------------- | ------ | --------- | ------- | ------------ | ---------------------------------------------------- |
| `hangul-romanization` | 1.0.1  | 2022-09   | MIT     | 12,427       | not documented; examples too trivial to confirm      |
| `@romanize/korean`    | 0.1.3  | 2025-05   | MIT     | 6,345        | not documented                                       |
| `koroman`             | 1.0.16 | 2026-05   | MIT     | 1,140        | **yes** — 연음화/비음화/유음화/격음화 simplification |

`koroman` (<https://github.com/gerosyab/koroman>) is the only candidate that
explicitly documents implementing 국립국어원 (National Institute of Korean
Language) pronunciation rules, and it was confirmed against real output, not
taken on faith:

```text
romanize('신라')  -> 'silla'    // lateralization
romanize('학문')  -> 'hangmun'  // nasal assimilation
romanize('좋아요') -> 'joayo'   // liaison
```

## Decision

Use `koroman` (`romanize(text, { usePronunciationRules: true })`), added as
an ordinary `dependencies` entry — same distribution posture as
`kuromoji`/`wanakana` in ADR 0003 (bundled at build time, resolved at build
time, nothing fetched at runtime). Zero runtime dependencies, ~40 KB
unpacked; no dictionary-weight tradeoff like kuromoji's IPADIC.

Rejected `hangul-romanization` and `@romanize/korean`: neither documents or
demonstrates applying assimilation rules; both read as syllable-by-syllable
jamo lookup tables, which is exactly the "technically runs, actually wrong"
outcome this ADR exists to avoid.

**Mixed-script behavior, verified against the actual source
(`koroman.core.js`), not assumed:** characters outside the combined-hangul-
syllable range (U+AC00–U+D7A3) — Latin letters, digits, punctuation,
whitespace, line breaks, bare jamo like ㅋㅋㅋ — hit an explicit
`code < 0xAC00 || code > 0xD7A3` branch and are pushed through unchanged;
pronunciation rules are only ever applied to the decomposed hangul-jamo
sequence, so they never reach across a non-hangul character. This matters
because Korean lyrics frequently code-switch into English mid-line
(`너의 baby` → `neoui baby`) — confirmed empirically, not just read from the
source, and covered by `electron/lib/koromanIntegration.test.js`.

Because 한글 needs no ruby step at all, Stage 5c does **not** reuse
`buildReadingDoc`/`alignOkurigana`. `electron/lib/lyricsReading.js` gets a
parallel, much simpler `buildRomanizationDoc(lines, { romanize, analyzer,
onProgress })`: no tokenizer, no okurigana alignment, no kanji word-gap
heuristic (한글 already carries 띄어쓰기 spacing) — each line becomes a
single plain `{ t: text }` segment plus a `romaji` string. The existing
`<ruby>`-based rendering path in `LyricsWorkspace.vue` naturally renders
Korean lines as plain text, since no segment ever carries an `r`.

`electron/lib/lyricsReadingWorker.js` dispatches on `workerData.script` before
doing any script-specific work — in particular, kuromoji's `buildTokenizer()`
(the ~1-3s IPADIC dictionary load) must never run for a Korean request.

`detectLyricsScript()` (`src/utils/lyrics.js`) changed from "first script
match wins" to a character-count majority between hangul and kana. This
matters specifically because of Stage 5c: before Korean had any reading-aid
UI at all, a stray hangul character in an otherwise-Japanese lyric was
harmless (nothing was offered either way). Once Korean gets its own toolbar
variant, first-match would flip an entire Japanese lyric's reading-aid mode
off — and lose furigana entirely — over one borrowed Korean word, and the
reverse for a Korean song with an English/Japanese hook line. Latin
characters count toward neither side, so Korean/English code-switching
(which is common in K-pop) doesn't skew the comparison.

## Consequences

`electron/lib/library/lyricsReadings.js`'s `setReadingLine` (the manual
per-line correction path) branches on the doc's own stored `script`: `'ja'`
keeps the existing `alignOkurigana` re-derivation from a supplied kana
string; anything else (Korean) treats the supplied value as the corrected
romaji string directly, with segments staying the single plain form
`buildRomanizationDoc` always produces. No IPC-level `script` argument is
needed on that call — the doc already carries it from generation time.

**Packaging note, not yet independently re-verified against a real
`dist:dir` build the way ADR 0003 was** (do so before shipping, not
optional): `koroman` is `require()`'d from inside the worker thread, so it
needs the same `asarUnpack` treatment as `kuromoji`/`wanakana` — added to
`electron-builder.yml`. One real difference from kuromoji: `koroman` ships
an `exports` map with no `./package.json` entry, so
`require('koroman/package.json')` (the pattern ADR 0003's implementation
used for kuromoji) throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. The analyzer
version is instead read via `require.resolve('koroman')` resolved back to
the package root — see the comment at that call site in
`lyricsReadingWorker.js`; don't "simplify" it back to a bare subpath require.

**Known risk, accepted deliberately**: `koroman` has a much smaller
install base (1,140 downloads/month vs. 6-12K for the rejected
alternatives) and its latest release is only a few months old at the time
of this decision — a newer, less battle-tested project than kuromoji was
when ADR 0003 picked it. Accepted for the same reason ADR 0003 accepted
kuromoji's dictionary weight: correctness for the stated purpose
(a performer singing the actual pronunciation) outweighs popularity when
the popular alternatives don't demonstrate the one property that matters.
If `koroman` turns out unreliable in practice, the fallback path is either
re-evaluating the ecosystem again or hand-implementing the Revised
Romanization assimilation rules directly against
`docs/spec.md`-referenced 국립국어원 orthography — not silently downgrading
to a rules-free package, which would reintroduce the exact problem this ADR
exists to avoid.
