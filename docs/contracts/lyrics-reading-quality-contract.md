# Lyrics Reading Quality Contract

## Status and scope

Version 1 benchmark and correction-shadow contract, implemented on 2026-09-10.
It establishes an analyzer-neutral token boundary, a reproducible local quality
evaluation, and a fail-closed schema for song-scoped correction candidates.

This milestone does not apply third-party corrections to production reading
documents, change the reading sidecar schema, install Sudachi, or change the
default analyzer. Production generation remains kuromoji plus its bundled
IPADIC dictionary, with wanakana used only for kana-to-romaji conversion.

## Product invariants

- Canonical lyric text is immutable. Every generated segment list must satisfy
  `segments.map(({ t }) => t).join('') === line.text`.
- Existing manual reading corrections remain authoritative. A future analyzer
  or data-pack update must not overwrite an edited line.
- Reading generation and evaluation stay local. Lyrics, recording metadata,
  and local library identities are not sent to a third-party lookup service.
- Paid sources and sites without a published reusable-data license or stable API
  are outside this contract. Website HTML is not a production data interface.
- Missing, malformed, ambiguous, or conflicting correction data fails closed to
  the analyzer result. It must not block lyrics display, playback, or Output.
- Evidence metadata is for maintainer review only. A URL or provider name never
  grants runtime trust and is never fetched by the correction resolver.

## Analyzer-neutral token boundary

`electron/lib/lyricsReading.js` consumes tokens with this shape:

```js
{
  surface: '東京',
  reading: 'トウキョウ',
  partOfSpeech: ['名詞', '固有名詞', '地域', '一般'],
  lemma: '東京',
  outOfVocabulary: false,
}
```

Only `surface` and the nullable `reading` participate in current production
generation. The remaining fields are descriptive benchmark inputs for future
conservative lexical validation. An analyzer adapter owns package-specific field
names; the pure reading builder does not accept raw kuromoji fields.

The kuromoji adapter must preserve token order and surface text, omit `*` POS
placeholders, report an absent reading and lemma as `null`, and map
`word_type === "UNKNOWN"` to `outOfVocabulary: true`. Malformed analyzer output
is rejected at the adapter boundary.

## Benchmark corpus

The committed synthetic corpus lives at
`scripts/fixtures/lyrics-reading-evaluation/synthetic-baseline.json`. It proves
the evaluator and safety boundaries only; it is not representative evidence of
real-song accuracy. A promotion decision requires a reviewed 100–300-case local
corpus kept in the current user's private, non-roaming application-data area.

Every benchmark case contains only bounded fields:

- an opaque case id, cohort, and recording identity;
- one to 100 canonical lines plus a target line index;
- whether the expected reading is analyzer-addressable or song-specific;
- expected whole-line kana and exact ruby segments; and
- expected correction ids for shadow evaluation.

Committed cases use constructed, public-domain, or otherwise reusable minimal
text. Full third-party lyrics, local paths, provider payloads, credentials, and
arbitrary source URLs are not accepted benchmark fields.

The local corpus preparation step reads existing Japanese reading sidecars
only. It hashes recording identity with a private run-specific salt that is not
written to the artifact, keeps at most one bounded lyric line per unique text,
limits the combined selection and the number of lines selected from one
recording, and never copies title, artist, provider metadata, full source
documents, adjacent lyric text, filesystem paths, or saved romaji. An
`edited: true` line is preserved as a gold seed because it records an explicit
local correction. Conflicting edited readings for the same text fail closed and
are counted without export. Every automatic line remains a review candidate
with empty expected-reading and classification fields; analyzer output must
never be treated as its own ground truth.

The minimum cohorts are:

- standard vocabulary, inflection, and okurigana;
- modern vocabulary and proper nouns;
- kana, Latin, punctuation, and mixed-script text;
- jukujikun and other lexical readings; and
- song-specific ateji or performed readings.

Analyzer-addressable and song-specific cases are scored separately. A reading
such as `宇宙 -> そら` is not counted as a general analyzer failure when its case
is explicitly classified as song-specific.

## Metrics and baseline gate

`scripts/lyrics-reading-evaluation.mjs` delegates bounded schema validation,
scoring, and analyzer execution to focused modules under
`scripts/lib/lyricsReadingEvaluation/`. It reports:

- whole-line exact kana accuracy;
- analyzer-addressable exact kana accuracy;
- exact ruby-segment accuracy;
- reading character error rate using Unicode code points;
- canonical-text integrity and analysis failure rate;
- out-of-vocabulary token count;
- correction-shadow matches, false positives, misses, and precision; and
- tokenizer load time, first and warm pass time, RSS before and after, peak
  process RSS, and raw installed dependency bytes.

Metrics are reported for the entire corpus and for each required cohort. Failed
analysis remains a distinct failure rate; a failed case has `null` per-case
accuracy and does not invent a reading or segment result.

The baseline is valid only when all configured safety gates pass. The initial
contract requires 100% canonical integrity, zero analysis failures, and zero
shadow false positives. These gates validate the harness, not challenger
promotion.

The report is a baseline report only when its evaluated analyzer id exactly
matches the fixture's `baselineAnalyzerId`. A different analyzer must use a
future comparison report rather than being mislabeled `baseline-ready`.

A future analyzer becomes preferred only after a representative corpus proves:

- 100% canonical-text integrity and manual-edit preservation;
- at least five percentage points higher whole-line accuracy;
- at least 25% fewer errors in analyzer-addressable cases;
- no major cohort regresses by more than two percentage points;
- zero false-positive song-scoped corrections; and
- accepted Windows packaged latency, memory, download, installed-size, offline,
  repair, removal, and rollback results.

Newer package or dictionary versions never bypass the same corpus and packaged
acceptance checks.

## Correction shadow contract

The shadow resolver validates and reports candidate matches but returns no
modified lyric, token, reading document, or sidecar. Production generation does
not call it in version 1.

A correction pack contains a fixed schema version, pack id, version, license,
and bounded entries. Each entry contains:

- a unique correction id and opaque recording identity;
- an exact SHA-256 of the canonical line and its zero-based occurrence;
- optional previous and next canonical line hashes;
- an exact target surface, its zero-based occurrence, and a kana reading; and
- bounded evidence kind plus an optional HTTPS review URL.

Matching requires exact recording identity, exact line hash and occurrence,
matching optional context, and an existing target occurrence. Regex, markup,
script, replacement text, executable data, filesystem paths, and arbitrary
arguments are not part of the schema. Duplicate ids or canonical duplicate
scopes reject the pack before matching, independent of JSON property order.
Resolved target ranges that overlap are all reported as conflicts and skipped.

The intended future precedence is:

```text
manual line correction
  > exact song-scoped correction
  > unique context-compatible lexical correction
  > selected analyzer result
  > plain lyric fallback
```

This precedence is documented for later milestones; only analyzer output and
manual line correction affect production sidecars today.

## CLI and artifacts

Run the synthetic baseline with:

```text
npm run lyrics:evaluate-readings -- scripts/fixtures/lyrics-reading-evaluation/synthetic-baseline.json .benchmarks/lyrics-reading/synthetic-baseline-report.json
```

Prepare a private local review corpus from an explicitly selected Utawakui
library with:

```powershell
$readingCorpusPath = Join-Path $env:LOCALAPPDATA 'Utawakui\private-benchmarks\lyrics-reading\local-corpus-v1.json'
npm run lyrics:prepare-reading-corpus -- <library-directory> $readingCorpusPath --limit 200
```

The output file must not already exist, must be outside the library, and must be
under the current user's non-roaming private corpus root. On Windows its parent
ACL is rebuilt and read back before any lyric text is written; only the current
user, System, and Administrators may remain. One no-clobber JSON artifact
contains the review queue, gold seed, and text-free summary. The requested
combined size must be between 100 and 300 short, de-duplicated lines; the
default per-recording cap is four. It is private review material and must not be
committed or shared. The gold seed still requires cohort and
analyzer-addressable classification before it can be compiled into a benchmark.

Review the private corpus without editing JSON by hand:

```text
npm run lyrics:review-readings
```

The first run creates `local-reviews-v1.json` beside the immutable source corpus
and resumes at the first pending case. Each case displays only its selected line,
current reading, and numbered segments in the local terminal. Use `a` to accept
the current segmented reading, `e 1=そら,3=きょう` to replace one or more
numbered segment readings, `s` when the answer cannot be established confidently,
or `q` to stop. Accepted and corrected cases then require one cohort:

1. `standard`: ordinary morphology and okurigana;
2. `proper-noun`: names, places, and modern named terms;
3. `mixed`: Japanese combined with Latin script or numbers;
4. `jukujikun`: established irregular lexical readings; or
5. `song-specific`: a lyric- or performance-specific borrowed reading.

Only `song-specific` is classified as not analyzer-addressable. Do not accept an
analyzer result merely because it looks plausible. If the recording context or a
trusted reference is unavailable, skip the case rather than guessing. Progress is
saved atomically after each decision. A short-lived single-writer lock plus a
predecessor comparison rejects a stale concurrent session instead of overwriting
newer decisions. On Windows, a deterministic OS named mutex is held for the whole
review, undo, or export session; a second session is rejected before it reads or
displays a case, and the OS releases the mutex when its helper exits. The inner
file lock records a bounded PID, creation time, and random owner token; an expired
lock is recovered only after its owner process is confirmed absent, while a live
or unverifiable owner remains fail-closed. Before any case is displayed or
artifact is written on Windows, the protected three-principal directory ACL is
rebuilt and read back again. The following non-interactive commands emit counts
only and do not print lyric text:

```text
npm run lyrics:review-readings -- status
npm run lyrics:review-readings -- undo
npm run lyrics:review-readings -- export
```

`undo` returns the most recently decided case to pending. `export` writes the
no-clobber `local-benchmark-v1.json` only after at least 100 cases are approved
and the four analyzer-addressable cohorts are represented. A `song-specific` case
is included and becomes a required report cohort only when the reviewer has
independent recording context or a trusted reference; the isolated local sample
never requires one and must not be used to invent that evidence. The export is
compiled through the existing lyrics-reading benchmark validator; pending and
skipped cases are excluded. This local export alone therefore does not complete
Checkpoint A's separate song-specific evidence requirement. The source digest
binds the mutable review manifest to the exact immutable corpus, so regenerating
or editing the source invalidates the review rather than silently reusing labels.

Source scanning is bounded to 64 MiB, 100,000 raw directory entries, 10,000
reading documents, and 250,000 source lines before the much smaller corpus is
selected. Matching fails closed after 5,000,000 candidate-slot edge visits.
Each source document is projected immediately to the fields needed by the
selector. The final private artifact is capped at 2 MiB and published from a
fully written temporary file through a no-clobber hard link.

The input is limited to 8 MiB and 500 cases, with additional aggregate-text and
edit-distance computation budgets. Output is linked atomically from a unique
temporary file with no-clobber semantics; the CLI refuses to overwrite its input
or any existing output. Generated reports remain in ignored `.benchmarks/`;
durable product status must cite a reviewed report rather than committing
machine-specific timing as architecture.

The built-in timing and memory values describe the development evaluator. After
building `dist` and `dist:dir`, run the packaged worker benchmark from PowerShell:

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
./release/win-unpacked/electron.exe scripts/lyrics-reading-packaged-evaluation.cjs release/win-unpacked <benchmark.json> <report.json> release/Utawakui-Setup-0.2.0.exe
```

The packaged runner loads the production worker from `app.asar`, verifies the
analyzer identity and canonical text, then records cold-worker latency,
cold-batch target-lines per second, peak process RSS, physical unpacked bytes,
and optional installer bytes. It accepts only the package beside the invoking
executable, bounds artifact scanning, and writes an atomic no-clobber report.
Run it only against a trusted package built locally from this repository.
Checkpoint A remains pending until these repeatable measurements run against a
representative local corpus.

## Sidecar and Output compatibility

This milestone does not change reading sidecar version 3, renderer IPC, or Output
projection. The analyzer id remains `kuromoji-wanakana` so existing provenance
semantics and saved documents remain compatible. Output continues to load only a
complete identity-matched sidecar and never starts an analyzer or correction
resolver.

Before any correction becomes active, a later contract revision must define
round-trip provenance and prove that explicit regeneration preserves every
manual line while updating automatic lines only.

## Deferred decisions

- JMdict, JMnedict, and JmdictFurigana snapshot generation and redistribution;
- a stable production recording-identity profile;
- correction-pack contribution governance and release channel;
- sidecar v3 optional provenance versus a new schema version;
- explicit regenerate-unedited-lines product intent; and
- Sudachi runtime preparation, selection, fallback, and promotion.
