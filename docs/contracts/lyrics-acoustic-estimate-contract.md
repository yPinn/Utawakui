# Lyrics Acoustic Estimate Contract

## Status and scope

Version 1, first phase implemented 2026-10-19, supporting
[ADR 0026](../adr/0026-t1-acoustic-estimates.md). Independent data validation,
storage, optional source loading and a local authoring-workspace preview use
synthetic fixtures without downloading models. Canonical T0/T1/T2 and other
surfaces retain the [current timing contract](lyrics-timing-contract.md).
Private Phase 2 research workers are versioned under
`scripts/research/lyricsAcoustic/`. Manual application environment lifecycle is
implemented, with production preparation blocked pending weight evidence;
song generation and Output transport remain later-stage gates. The research CLI does not
change the default loader, registry, IPC intents or download options.

The executable schema is `shared/lyricsAcousticEstimate.mjs`; persistence is
`electron/lib/library/lyricsAcousticEstimates.js`. Shared preview selection is
`shared/presentation/lyricsAcousticPreview.mjs`. It reuses the existing weighted
T1 selector rather than introducing another fallback algorithm.

An acoustic estimate improves chunk starts inside a matching finite T1 interval.
It does not transcribe lyrics, validate their content, locate repeated choruses,
establish sung ends, or create T2. The tested candidate covers Mandarin/Japanese;
unsupported lines retain the existing presentation.

## Storage and identity

Main derives the proposed path from a registered track and lyric source:

```text
tracks/<trackId>/lyrics/acoustic-estimates/<sourceFilename>.json
```

Reuse the existing source-filename/path boundary. Renderer never supplies paths,
audio hashes, worker/model selection or Python arguments. Atomic publication
rechecks the source and job generation; cancellation or changed input cannot
publish a completed-looking result. Preserve malformed files for diagnosis.
A failed regeneration must not overwrite a still-valid result with an empty file.

The document has these field groups. The validator requires their exact keys and
rejects unknown schema versions, extra fields and malformed ranges before storage.

| Field group     | Required identity or content                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| Header          | `schemaVersion: 1`, opaque `estimateId`, canonical `documentId`                                              |
| Lyrics input    | Source SHA-256, normalizer profile, hash of ordered line ids/text/effective T1 intervals, `offsetUsedMs`     |
| Audio input     | Content SHA-256, fixed mix/guide role, separation artifact/recipe identity when applicable, decode profile   |
| Method          | Model manifest hash, environment lock hash, decoder/G2P/chunker versions, relevant Node/ICU version          |
| Lines           | Stable canonical `lineId`, original text, exact parent `startMs`/`endMs`, per-line result and ordered chunks |
| Chunks          | Occurrence-scoped id, original-text `from`/`to` offsets, `startMs`; no inferred sung end                     |
| Per-line result | `ready` or `unsupported`, with bounded app-owned reason codes for missing/unusable evidence                  |

In the implemented schema, the header fields are `schemaVersion`, `estimateId`
and `documentId`; the nested records are `source`, `audio`, `method` and `lines`.
`source` contains `filename`, `sha256`, `normalizerProfileId`, `timingSha256`,
`intervalsSha256` and `offsetUsedMs`. `audio` contains `sha256`, `role` and
`decodeProfileId`. The first phase supports only `role: mix` and the fixed
`source-v1` decode profile; guide artifacts need a later identity/recipe extension.
`timingSha256` is null when no canonical timing sidecar exists, otherwise the hash
of its exact bytes. `intervalsSha256` hashes the JSON array of ordered
`[lineId, text, startMs, endMs]` tuples. Main checks source/timing/audio content;
the preview additionally requires every canonical line and interval to match.

`method` contains `kind`, `id`, `version`, `modelManifestSha256`,
`environmentLockSha256`, `decoderVersion`, `g2pVersion`, `chunkerVersion`,
`nodeVersion` and `icuVersion`. The active first-phase profile is `fixture` /
`synthetic-v1` / `1`, with null model/environment hashes, `fixture-v1` decoder and
chunker, `none-v1` G2P, and the actual Node/ICU versions. Structurally valid model
metadata is not an active product producer profile and loads stale by default.
The internal storage APIs accept an explicit expected `method` for isolated
research runs; main's read handler never accepts that option from renderer.
`createAcousticEstimate` builds validated documents; the fixture factory name
remains an alias. Per-line unsupported reasons may be supplied by the producer.
`estimateId` is
`acoustic_` plus SHA-256 of the normalized JSON array
`[documentId, source, audio, method, lines]`, so changed cuts cannot retain an old
content identity. The internal fixture factory/save API is not exposed over IPC.

Audio/model/environment hashes and dependency records stay local. Existing
canonical source identity follows the current timing/Output contract. The estimate
extension carries only bounded validated display information, canonical identity
and estimate provenance. Reasons are descriptive, never trust signals or arbitrary
model strings.

Load status is separate from stored per-line results: `missing`, `ready`, `stale`,
`corrupt`, `unsupported` and `unavailable` describe the sidecar; working, cancelled
and failed describe a job. Only ready data may be applied. The first preview enables a result only through
an explicit session choice for that source; switching identity clears that choice.
No default bulk analysis or application is introduced.

## Text and time invariants

Use original-text UTF-16 offsets at grapheme boundaries. Chunks partition the full
line without overlap or gaps; slicing and concatenating exactly reproduces its
text, including whitespace, punctuation, original kana script and surrogate pairs.
Reading text/phones are separate inputs, not replacements for display text.
Equal strings at different positions have different occurrence identities.

Times are finite integer milliseconds, nonnegative, monotonic and within the
finite parent T1 interval. The first chunk starts at the canonical T1 start.
Internal cuts must have usable model evidence. Missing or out-of-range internal
cuts merge with the previous chunk; an entirely unusable line uses the existing
T1 fallback. Do not clamp a corrupt document into validity or interpolate missing
model cuts and call them acoustic evidence.

`startMs` is in the canonical lyric time domain. Current lyric selection uses
`lyricPositionMs = audioPositionMs + offsetMs`. Therefore analysis of an audio
timestamp converts back as `sourceStartMs = audioStartMs + offsetUsedMs`, and
playback compares that source time to the existing lyric clock. Apply offset only
once. A fixture with nonzero positive and negative offsets must catch sign errors.
`offsetUsedMs` follows the existing integer ±3,600,000 ms source-offset boundary.

Changing offset invalidates v1 estimates because it changes analysis windows.
Changing source text, effective T1 intervals, audio/separation artifact or method
identity also invalidates them. Seeking, pausing and playback rate do not. Open
line ends must first resolve through the existing parent/end policy; include the
resolved end and relevant media duration identity, or decline that line.

Start with the existing timing size budgets: 2,097,152 serialized bytes, 5,000
lines, 1,000 chunks per line, 20,000 chunks total, 2,000 UTF-16 units per line,
128-unit ids and maximum time 604,800,000 ms. The validator and shared projection
must use common constants. An Output envelope including canonical content must
also satisfy its own combined size limit; estimates may be omitted to preserve
valid canonical playback instead of enlarging that limit silently.

## Presentation and transport

Canonical T2 always takes precedence per line, including partially authored
documents. An acoustic estimate never enters canonical `line.segments`, changes
document granularity or updates the T2 editor/reading sidecar. A distinct optional
estimate projection selects the same starts for every supporting surface.

The first supported behavior is start-triggered chunk emphasis held until the
next start or parent end. That display interval is not a sung-end measurement.
A template that only supports continuous sweep must add an explicit compatible
mode or use its existing T1 fallback. Do not fabricate `endMs` to satisfy that
template's T2 path. Initial lyric entry remains determined by T1.

Chinese display conversion may apply only with verified original-to-display
range mapping. An unsafe mapping declines the estimate for that display variant;
it does not rewrite canonical text or guess a mapping by equal character count.

The canonical lyrics owner loads the sidecar under the same request-identity
protection as source documents. Late results from a different track/source cannot
enter the active preview. Method/estimate changes create a distinct immutable
content revision; pause/seek/ticks do not retransmit the full estimate.

The first-phase preload operation is `getLyricsAcousticEstimate(trackId, filename)`
over `lyrics:get-acoustic-estimate`. Main resolves only registered sources; this
local read does not require a processing consent gate. Its optional result is a
bounded status with a sanitized preview for ready data. No sidecar means no audio
hash read. Loading a present estimate runs asynchronously after canonical lyrics
are published; failures and late results do not block or replace them. Operational
failures are recorded privately in main and return unavailable; corrupt/stale data
is expected state and remains preserved. Saving rechecks file stamps and generation
after hashing; source deletion removes only that source's estimate.

The local preview shows canonical original text, explicitly distinguishes synthetic
validation data from private research model estimates and starts disabled. It never changes the primary lyric display,
Self-View or Output. Original-text ranges do not claim a converted-text mapping.

Before Output integration, add an explicit validator shape and negotiate the
extension or a new contract version. Preserve content-before-state ordering,
`bootId`/`sourceEpoch`, reconnect and older-client fallback. A missing/rejected
extension leaves the valid canonical document and normal playback available.

## Job and capability boundary

The private CLI owns bounded 30-second encoder windows, T1 lines of at most
20 seconds, two seconds of context where media bounds permit, and 350 ms decoder
padding. It serializes jobs with the existing scheduler class, validates local
asset hashes and method identity, closes both workers before publication, and
checks the deadline again after asset verification and in the final save guard.
Research profile storage is independent of application activation or runtime
installation. The [Phase 2 report](../research/lyrics-alignment/lyrics-acoustic-phase2-2026-10-19.md)
records actual quality, fallback, resource and cancellation evidence.

The application now separately allowlists capability `lyrics-acoustic`, environment
`lyrics-alignment` and model kind `alignment`. Main owns the pinned catalog,
immutable artifact paths, shared Audio Python host and application heavy-job
scheduler. Provider Python is never reused. Settings mounts only read status;
restart means unverified until a manual real Python/ONNX load probe succeeds.
Six zero-argument `lyrics-acoustic:` operations cover status, prepare, verify,
repair, remove and cancel. Mutations recheck `audio-processing-flow`; cancellation
remains available to finish owned work. No intent accepts paths, models or URLs.

Prepare/repair materializes fixed bytes/SHA into isolated staging without pip,
checks the complete environment fingerprint, runs bounded Python dependency and
ONNX CPU warmup probes, then publishes activation. Existing valid artifacts can be
copied locally. A failed or cancelled probe preserves prior activation and all
lyrics/estimates. Publication checks cancellation and every live generation lease;
transient directory locks have bounded retries. Rollback failures preserve backups
and remain diagnostic errors even when cancellation triggered them. Removal first
writes a validated bounded journal, deactivates only this capability and cleans its
environment/model/staging, keeping a runtime referenced by another capability.
The journal is deleted last, so interrupted cleanup can resume after restart.
A corrupt shared activation or invalid removal journal fails closed, without
overwriting other capabilities; this requires diagnostic recovery outside these
automatic repair controls.

The shipped catalog remains `productUse: blocked` with
`weights-evidence-pending`; the settings row offers no preparation download while
this gate is closed. A prepared environment does not enable the research method
in the default sidecar loader or add a song producer. Model use, song-job admission
and Output still require their separate gates. See the
[lifecycle verification](../research/lyrics-alignment/lyrics-acoustic-lifecycle-2026-10-19.md).

The following song-generation boundary remains required before product integration.

Main accepts only registered track/source identity plus bounded start, cancel and
preview intents. It rechecks the feature gate and input identity. The new
capability requires a complete lock, verified activation and a leased job binding;
no existing M1 environment is modified with pip.

One heavy job owns FFmpeg decode, isolated Node model inference and isolated
Python decoding. Both subprocesses share cancellation, deadlines, byte budgets,
generation leases and cleanup. The exact inference window, overlap, contextual
padding and deduplication recipe must be fixed and benchmarked before a real
worker is enabled. Research window-context results do not validate arbitrary
per-line crops or unlimited whole-song tensors.

Reject all-silent input with a separately tested low-volume policy. Unsupported
mixed-language lines fall back. Model confidence is not a content verifier;
non-silent accompaniment, wrong text/version and duplicate occurrences remain
negative tests, and matching content remains a user-confirmed input assumption.
Keep full lyrics, paths and stderr out of public errors; main retains bounded
private diagnostics with existing deduplication behavior.

## Acceptance matrix

| Layer               | Required checks                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Validator           | Unknown versions, size/count limits, duplicate ids, invalid ranges, grapheme splits, nonfinite/out-of-parent times, full-text preservation                         |
| Identity/storage    | Changed T1/audio/text/offset/method, repeated same-text lines, corrupt preservation, failed/cancelled/stale generation cannot replace valid data                   |
| Shared projection   | T2 precedence, valid estimate selection, missing-cut merging, plain/T1 fallback, converted-text mapping, nonzero offsets, pause/seek/rate                          |
| Source owner/Output | Late request rejection, one lyrics authority, immutable revisions, content-before-state, reconnect, rejected extension and legacy fallback                         |
| Worker/lifecycle    | Fixed local model/hash, absent runtime, unsupported text, silence/music-only/wrong version, bounded windows, both processes cancelled, lease and temporary cleanup |
| Preparation/release | Use/redistribution evidence, bytes/SHA, fresh install, interruption, repair, offline inference, update rollback, removal, packaging inventory/smoke                |
| Visible surfaces    | Lyrics/Self-View/Workbench/OBS: no lost text or wrong repeated occurrence, readable starts on fast singing/holds/rests, one clock, disable/restore, reduced motion |

Quality evaluation freezes text-only chunk selection and uses all requested cuts
as the denominator, reporting unavailable cuts rather than deleting them. Report
per-song results, oracle T1 versus provider T1, mix versus guide, and independent
human labels versus external/model references separately. The existing benchmark
is a regression reference, not a universal production SLA. Release defaults require
new-song checks and visible acceptance; rest/sung-end or Korean claims require
separate evidence.

## Opt-in experimental post-separation generation

`experimentalLyricsAfterSeparation` defaults to false. Explicit enablement plus the
existing audio-processing gate permits successful accompaniment publication to
enqueue an independent lyrics job. Failed/cancelled/skipped separation does not
enqueue; enabling does not scan old tracks, download assets or apply estimates.
Admission, execution and publication recheck permission. Disabling cancels analysis;
lyrics failure/cancellation never changes a completed accompaniment result.

Reuse the fixed research environment. Missing/damaged environments skip with a
status; installed but unverified environments receive a real load probe inside the
shared scheduler before inference. No formal catalog or runtime activation changes.
Unresolved weight/dictionary use and redistribution evidence remains unresolved;
the experimental label is not permission evidence.

Whole-song inference uses the original mix, existing 30-second bounded windows and
occurrence IDs, at most 1,000 lines/windows and a 30-minute source. HubertFA and small
subprocess groups each have a 20-minute deadline. Separation completion is a trigger,
not evidence for guide-vocal input. Native T2 bypasses alignment; contradictions
decline chunks, missing evidence stays unknown, unsupported/missing boundaries
retain T1. Human timing acceptance remains pending for this experimental trial.

Main stores validated estimates in
`tracks/<trackId>/lyrics/experimental-estimates/<sourceFilename>.json`, separate from
canonical timing and the formal loader. Bind source/audio/timing/offset/canonical
identity, asset/environment pins, recipe and Node/ICU versions. Recheck inputs and
selection before atomic publication; cancelled/failed/stale runs preserve earlier
estimates. Reads are bounded and validated. Queue status is session-local, bounded
to 100 tracks; estimates survive restart, application does not.

Explicit lyrics-page application affects the local authoring/performance
reader's starts-only frame and supporting Output templates. Source/document/offset/estimate reload clears application.
Canonical documents and Self-View projections stay unchanged. The explicit manual
application also reaches supporting Output templates through the optional starts-only
extension below. T2 and declined T1 retain their behavior. Chinese conversion reuses segment text projection; text
mismatches retain normal display. Furigana retains its existing reading layout.
No estimated singing-end/progress is exposed.

### Experimental Output application

The existing apply/disable intent controls local lyrics and Output together; there
is no new visual mode, template, or second application flag. `useExperimentalLyrics`
builds a complete clock-independent presentation document, retaining canonical
granularity, native segments and text conversion. Only applied, identity/offset-matched
ready lines supply model starts. Offset/source/document invalidation or disable
immediately removes that projection; cancellation/failure retains canonical lyrics
and accompaniment. Prior valid estimates may still be manually applied.

Output v3 lines may contain `estimatedStarts: { version: 1, segments: [...] }`;
each entry contains exactly `segmentId`, `text`, `startMs`. Main validates version,
keys, bounded nonempty arrays/text, unique IDs, monotonic integer onsets within a
finite parent interval, full text reconstruction, document bytes and the shared
total segment budget. Native segments and model starts cannot coexist on one
published line. Canonical granularity is still derived only from native segments.
Private filenames, paths, model pins and inferred singing ends are not transmitted.
Older v3 parsers/clients strip the unknown optional field and retain T1; the new
parser rejects unsupported versions/malformed evidence without replacing accepted
content. The existing legacy v2 compatibility projection remains T1-only.

The publisher uses existing content revisions and content-before-state ordering,
including reconnect. Browser Source assembly preserves the validated extension.
Shared presentation frames use internal `model-starts` provenance but feed the
existing T2 node/layout paths: focus-line and karaoke-stack use binary onset
highlight with no active continuous progress or sweep duration; manga-frame,
kinetic-pop and live-stage use existing source-mapped bubble/phrase/page layouts.
Offsets inside one model chunk map to its onset, never a linearly invented time.
Ornate-vertical does not consume native T2 and keeps its existing presentation.
Schedulers use the same player clock, offset, rate and display delay; no second
clock, automatic Output start, gate/default download change, or timing acceptance.

Five main-frame-only IPC actions are `lyrics-experimental:status`, `enable`, `cancel`,
`retry`, `estimate`. Enable accepts one boolean, cancel one bounded track ID;
retry accepts one bounded track ID plus an optional `auto | zh | ja | en` analysis language,
and optionally a bounded subtitle filename after that language. The filename is an
expected current selection, not a source-selection command: the producer checks it
before model loading and before publication. A changed selection skips or rejects
publication without switching sources. Automatic separation jobs retain the existing
main-owned source derivation without a renderer filename.
estimate a bounded ID and existing subtitle filename. Main derives all paths,
executables, models and download pins; renderer cannot write estimate data.

Unknown source languages use conservative script/grammar evidence from lyric body text;
insufficient or mixed evidence stays unknown. Explicit unsupported metadata is not
silently replaced. A manual language is a single-job intent, preserved only on its
session-local queue item for retry, and never writes source metadata, preference or offset.
Skip reasons distinguish absent lyrics, unknown/unsupported language, absent T1 timing
and existing native T2. Native T2 bypasses inference. Version-two estimate envelopes bind
the resolved `analysisLanguage` with the existing input identity; version-one and
version-two envelopes remain parseable. Version three additionally validates a bounded
content summary (supported, uncertain, contradictions, possible missing lyrics and
silent lines); it does not add or certify word timing. The normal lyrics-page loader needs no language override or model load.

`LyricsSourceManagerModal` composes a current-source `LyricsSourceAnalysis` panel;
language, retry, cancellation and manual apply/disable reuse the existing queue and
`useLyrics` application owner. It polls only while the source view is open; completion
invalidates the estimate read once, stable status polls do not clear application.
Authoring drafts and pending/failed offset saves block analysis/application. Source
rows retain canonical T1/T2 provenance; a ready model estimate is labelled T1+ with
separate application state and usable-line count, never persisted as native T2.
Mixed documents retain native T2 per line and fall back to T1 where needed.

Analysis windows use `line.startMs - offsetMs`, and model starts map back with
`windowStartMs + modelStartMs + offsetMs`. Playback compares against its existing
offset-adjusted lyrics clock. Changing offset immediately clears application and
requires regeneration; validated stale envelopes expose only `reason: offset-changed`
when their bound offset differs, including after restart. There is no global offset
estimation or duration/time-warp correction. Human timing acceptance stays pending.

### Mixed long-line display phrases

`shared/presentation/lyricsPhraseBreaks.mjs` proposes at most two lossless source
ranges for long Latin/CJK mixed text. Punctuation and substantial script-transition
boundaries are candidates; a short borrowed word, matched quotation interior or
ambiguous monolingual line does not force a split. These are conservative text
rules, not a semantic model, language-identification result or breath detector.

A timed plan requires full source reconstruction and an exact native T2 segment
start at the chosen boundary, or an exact applied T1+ chunk start when native T2
is absent. There is no interpolation within a word/chunk and no word-weighted
substitute. Invalid/coarse/overlapping timing or less than 1.2 seconds for either
display phrase preserves the whole line. The minimum is a display stability rule,
not evidence of a sung pause. Native T2 takes priority even when its coarse timing
cannot support the proposed split. Repeated occurrences use their own clocks.

The available-lyrics modal exposes a collapsed `LyricsPhrasePreview`, with up to
20 candidate lines from the selected document. It consumes the existing lyrics
clock and the existing applied Output projection; source/offset invalidation drops
model timing through the same owner. Untimed candidates are visibly text-only.
Kinetic Pop is the first consuming template: it switches the two complete phrases
at their exact onsets and uses the same timeline in its boundary scheduler.
Other templates keep their existing layout contracts. Canonical text, timings,
source preference, public snapshot shape and apply/disable state are unchanged.

This display path does not add mixed-language HubertFA inference, support for
over-20-second model windows, new weights or new default downloads. Mixed T1
without accepted word onsets remains T1. Human phrase-quality and timing acceptance
remain pending; the current formal gates remain unchanged.

### English and content validation

Pure English uses the existing ONNX model, bundled pinned CMU dictionary and multilingual
small. No new weight or environment download is added. Words retain original UTF-16
ranges, punctuation and display spelling; comparison alone expands common contractions
and cardinal digits 0–20. Ambiguous numbers, dictionary-outside words and mixed-script
lines retain T1 rather than inventing pronunciations. Latin script alone is insufficient
for automatic English routing; explicit English metadata or one-job selection is supported.

English content checking transcribes each bounded line crop with 500 ms context on each
side, without expected lyrics. This avoids treating coarse 30-second ASR token clocks as
accurate word boundaries. Positive matching must have timed evidence; weak evidence
retains T1, strong contradictions reject model starts, and uniquely located adjacent-word
anchors may warn of omitted words without retiming or rewriting text. Each repeated
occurrence is checked in its own audio crop. Chinese/Japanese retain the existing
conservative content policy. A near-digital-silence check rejects starts even if a decoder
hallucinates matching text; this is not a general vocal-activity detector.

The validation recipe is versioned, so prior estimates require regeneration. Source T2,
canonical T1, offset and manual application ownership are unchanged. The source modal
shows one main status, keeps explanatory copy collapsed, and projects actual stage
progress using the shared progress primitive. Preparation is indeterminate; alignment
counts audio windows, English content checking counts line crops, and Chinese/Japanese
content checking counts windows. These are stage work counts, never a whole-song ETA
or a claim that human timing review passed. Main allowlists and bounds progress fields;
only the running queue owner exposes them, and cancellation/completion clears them.

## Isolated in-App research intent

Settings groups research environment readiness and the experimental automatic-analysis preference in one section. Environment management and fragment research tools start collapsed; status reads do not download or load models. Cancellation and queue retry stay accessible when those tools are closed. Collapsing fragment tools invalidates the preview without cancelling ongoing work. Apply/disable remains on the lyrics page.

The research entry exposes only `lyrics-research:status/prepare/verify/remove/cancel/inspect/preview` to the trusted main-window frame. Environment operations have no arguments; inspect/preview accept exactly `{ trackId, language: 'zh' | 'ja' | 'en', lineIndex }`. Main derives the preferred/fallback language source, source/audio/timing identity, executable paths, fixed official download pins and isolated userData storage. No formal gate, catalog or default preparation changes.

One shared heavy-job scheduler owns research download/load/inference through cancellation and cleanup, including app quit. Complete install trees are checked against shipped hashes; both HubertFA and small must load before ready. Restart requires explicit verification. A replacement is probed in staging before exchange, failure preserves the previous installation, and retry/removal target only research-owned paths.

Preview copies audio/text into an owned workspace; the library is read-only. It selects at most ten lines over a roughly 30-second acoustic window. Original T2 segments remain authoritative, usable HubertFA T1 chunks may be shown with the frozen small content mask, and declined lines retain T1. Missing content evidence remains unknown; insertion warnings never retime or insert lyrics. The source/audio/timing/offset identity must still match after inference. Cancellation or failure publishes no preview; renderer selection/library changes invalidate displayed results. Previews are session-only and never reach canonical sidecars, Self-View or Output. Playback uses the existing HTML-audio player clock. Human timing acceptance remains pending.
