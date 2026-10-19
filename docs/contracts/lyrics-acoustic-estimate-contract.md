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
installation. The [Phase 2 report](../research/lyrics-acoustic-phase2-2026-10-19.md)
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
[lifecycle verification](../research/lyrics-acoustic-lifecycle-2026-10-19.md).

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
