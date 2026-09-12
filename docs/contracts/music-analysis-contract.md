# Music Analysis Contract

## Status and scope

Executable contract v1, implemented 2026-08-24. The bounded values live in
`shared/musicStructureContractValues.json`; the main-process trust boundary is
the pure validator in `electron/lib/musicStructureContract.js`, exercised by
fixed JSON fixtures. Additive Output v3 cue transport and a bounded
template-neutral Lyrics rhythm consumer are implemented. Atomic sidecar persistence/loading and
current-track renderer wiring are also implemented. The main-owned producer job,
shared concurrency-one scheduling, fixed decode, bounded Python worker,
cancellation, cleanup, and atomic publication are implemented. A real unpacked
Windows x64 CPU/local-model smoke passed with the packaged worker and its
worker-level network/cache policy. Beat This! 1.1.0 `small0` and `final0` both
satisfy the M1 transport contract; `small0` is the provisional product-default
candidate because its checkpoint, memory, and installation cost are lower. This
is not an accuracy claim: labeled beat/downbeat fixtures and OS-level network
denial remain unproven. Settings now provides state-driven preparation, progress,
repair, removal, and an enabled-by-default `匯入後自動分析` preference for the
fixed product choice; ordinary Settings exposes neither model identity nor model
selection. Successful
provider downloads and local imports enqueue main-owned, currentness-aware,
non-blocking analysis only when the gate and capability are ready. The internal
F5 workbench remains the owner of explicit reruns and exposes a main-owned
sequential batch queue: renderer input is limited to at most 500
validated track ids plus one force boolean, current M1/M2 sidecars are skipped
by default only when their analyzer profile is still supported; source-current
Beat This! v2 sidecars are reanalyzed by the normal v3 batch path. Per-track
failures do not stop the batch, and cancellation covers the current inspection
or inference plus all remaining items. Automatic queue failures never turn a
successful import into a failed import. Public product
release remains gated on labeled accuracy, OS-level offline, license notice,
disk-capacity, failure recovery, and manual UI acceptance.

The M2 acceptance path is executable independently of model activation. Fixed
fixtures distinguish schema validity from semantic M2 eligibility, the main
producer removes rejected section evidence before publication, and the sidecar
consumer applies the same fail-safe rule to older documents. F5 shows accepted
canonical sections and explains low-confidence, incomplete, unknown, or missing
section fallbacks while keeping valid M1 tempo/beats visible.

The M2.1 real-song evaluation path is also executable without activating the
benchmark model in F5. A bounded, path-free labeled manifest reports macro
boundary F1 at ±500 ms and ±3000 ms, duration-weighted canonical-role accuracy,
contract-eligible M2 yield, BPM octave/missing rates, inference failures, and
required song-group summaries. Until the minimum 30-song J-pop/K-pop/karaoke
corpus is populated, its result must remain `insufficient-data`; synthetic
fixtures prove evaluator behavior, not analyzer quality.

F5 also has an independent **人工標註** mode for building that manifest. Main
owns the run-config picker and an opaque annotation session, reads or atomically
writes only `<outputRoot>/reference-worklist.json`, and never opens benchmark
predictions on this path. Renderer state owns selection, dirty state, BPM,
boundary and role edits while the existing player remains the sole playback
clock. Draft references do not publish or upgrade track sidecars.

The independent [BPM quality gate](music-analysis-bpm-quality-gate.md) now owns
the M1 global-tempo acceptance boundary. It separates locked private ground truth
from corpus-fingerprinted path-free predictions, treats half／double-time estimates
as errors, and keeps beat-evidence confidence diagnostic-only. The locked tuning
and holdout evidence selected the four-beat estimator without automatic
half／double-time normalization. That decision is promoted as
`beat-this-small0-cpu-v3`; the evaluator and historical v2 evidence remain
unchanged.

The isolated real-song runner now accepts a separate schema-v2 BPM config that
maps opaque corpus ids to current local-library track ids. It can execute only the
fixed checked-in `small0` or `final0` manifest contract and emits
corpus-fingerprinted, path-free BPM predictions for that evaluator. This CLI-only
comparison does not expose model selection through renderer／IPC, publish sidecars,
or alter the active product profile.

Schema v3 is the explicitly non-scoring companion for runtime breadth before
annotation. It executes the same fixed model and cache boundaries but accepts no
reference BPM, emits `bpm-runtime-smoke` evidence without a corpus fingerprint,
and cannot pass the scored prediction validator. Runtime completion or high beat
confidence from this path is never an accuracy claim.

The accepted product endpoint is:

- T2 word/phrase lyrics can display progressive text;
- M1 beat/downbeat timing can drive bounded rhythmic presentation changes; and
- M2 section intervals can select reusable verse, chorus, bridge, intro, outro,
  or unknown visual variants.

Every bundled Lyrics template receives the same bounded `lyricsRhythm`
presentation projection. The projection uses actual beat timestamps only when a
local four-beat window is consecutive, each cue has confidence at or above 0.5,
and its intervals remain within 75%–125% of the local median. It then exposes only
the current／next beat, line-relative beat index／count, beat progress, beat
duration, and a motion scale clamped to 0.75–1.35. Line-relative counting is
omitted when one lyric line spans more than 128 beat records, so runtime work
remains bounded. If the grid check fails, a
confident bounded BPM may provide cadence and an estimated line beat count, but
never beat phase. Missing or low-confidence evidence produces no rhythm
projection and preserves the existing template fallback.

The template capability registry controls whether beat boundaries cause a fresh
presentation frame. Classic KTV currently consumes beat phase and sections;
Focus Line and Quiet Caption consume bounded cadence without per-beat wakes; the
remaining templates keep their timing-only fallback. A music wake never changes
the lyric identity and therefore does not replay line-entry motion.
Playback rate changes the wall-clock delay to the next source cue; lyrics offset
maps source beat timestamps into the lyrics clock without mutating either source.

T2 remains the first implementation milestone and works through imported or
manual timing without Music Analysis. Automatic music analysis is an optional,
removable capability and failure never blocks Lyrics editing or playback.

## Signal boundaries

The contract keeps these values distinct:

- estimated source BPM;
- beat timestamps;
- downbeat timestamps and inferred bar position;
- section intervals and canonical section role;
- confidence and analyzer provenance;
- user-authored BPM, beat anchor, meter, or section overrides; and
- player tempo/playback rate.

Changing player tempo does not rewrite analyzed source BPM. Runtime presentation
maps source-time cues through the canonical playback clock and rate.

Music structure analysis does not create word timing. T2 word/phrase alignment
continues to come from imported timing, manual authoring, or a separately
approved alignment provider. A future alignment job may reuse already-authorized
vocals, but Lyrics does not silently start source separation.

## Storage and identity

The target derived sidecar is:

```text
tracks/<trackId>/analysis/music-structure.json
```

Electron main is the only reader/writer. Save validates the complete document,
verifies the main-derived audio SHA-256, writes bounded compact JSON through
temporary-file replacement, and keeps the matching duration identity inside the
validated document. Load
reads at most the contract byte limit and recomputes the audio SHA-256 through a
chunked stream only when a sidecar exists. Hashing therefore runs on track or
library revision changes, never on playback ticks. A renderer request supplies
only the canonical track id and receives the public M0/M1/M2 projection; raw
analyzer provenance, sidecar bytes, and paths remain in main.

It is atomically written, versioned, and linked to a SHA-256 fingerprint of the
source audio. Analyzer id, profile id, environment lock, model ids, completion
time, and confidence are provenance rather than executable input. A changed or
missing source preserves the sidecar but marks it stale or unavailable; stale
cues are never silently applied to different audio.

Analyzer output v1:

```json
{
  "schemaVersion": 1,
  "source": {
    "sha256": "<lowercase hex digest>",
    "durationMs": 180000
  },
  "analyzer": {
    "contractVersion": 1,
    "id": "all-in-one-structure",
    "profileId": "all-in-one-cpu-v1",
    "environmentLock": "<sha256>",
    "modelIds": ["<model id>"],
    "completedAt": "2026-08-23T00:00:00.000Z"
  },
  "tempo": {
    "bpm": 128.0,
    "confidence": 0.82
  },
  "beats": [{ "timeMs": 500, "positionInBar": 1, "confidence": 0.9 }],
  "sections": [
    {
      "sectionId": "section_01",
      "startMs": 0,
      "endMs": 15400,
      "role": "intro",
      "rawLabel": "<bounded analyzer label>",
      "confidence": 0.76
    }
  ]
}
```

`tempo` is either the shown object or `null`. `beats` and `sections` are always
arrays, including for a valid M0/no-signal result. Confidence is optional and is
never defaulted to certainty. M1 is present when source tempo or beats exist.
M2 is exposed only when every section has accepted semantic evidence and the
sections form a complete song partition. These levels describe available
signals rather than a requirement that M2 also contain M1.

Analyzer provenance is document-scoped: `analyzer.id`, `profileId`,
`environmentLock`, `modelIds`, `contractVersion`, and `completedAt` are the
source/version for every section in that document. A section repeats only its
canonical role, bounded raw label, interval, id, and confidence; it does not
duplicate model metadata or accept a renderer-supplied source.

Authored overrides are a separate v1 document and never rewrite analyzer output:

```json
{
  "schemaVersion": 1,
  "source": {
    "sha256": "<lowercase hex digest>",
    "durationMs": 180000
  },
  "updatedAt": "2026-08-23T01:00:00.000Z",
  "tempoOverride": {
    "bpm": 121.5,
    "anchorTimeMs": 250,
    "beatsPerBar": 4
  },
  "sectionOverrides": [
    {
      "sectionId": "authored_01",
      "startMs": 0,
      "endMs": 14000,
      "role": "intro"
    }
  ]
}
```

`tempoOverride` may be `null`, and `sectionOverrides` may be empty. Analyzer
provenance, confidence, raw labels, paths, commands, player rate, and Lyrics
timing do not belong in the authored document.

## Canonical section roles

Templates consume the app-owned v1 allowlist: `intro`, `verse`, `pre-chorus`,
`chorus`, `bridge`, `instrumental`, `outro`, and `unknown`. Raw analyzer labels
remain bounded provenance and never become CSS classes, template ids, commands,
or trusted selectors.

An analyzer document may contain bounded low-confidence, unknown, or incomplete
section evidence, but it is not an M2 result. The public projection removes the
whole section list and retains any valid tempo/beats as M1. The producer applies
the same rule before atomic publication so a newly generated sidecar is safe for
older consumers. The application must support user correction without
overwriting the analyzer result; manual overrides are a separate authored layer
so analysis can be regenerated.

## Analyzer and runtime selection

All-In-One Infer is the first full structure-analysis candidate because one
pipeline can provide BPM, beat/downbeat, and section evidence needed by M1/M2.
It is not a released dependency. The fixed All-In-One 3.1.0 / Demucs Infer 4.2.2
Windows CPU graph and packaged worker have completed a real local-model smoke
through the immutable runtime paths. Product acceptance still requires an
OS-level network-denied smoke, an auditable wheel-only environment lock,
acceptable model terms, capacity measurements,
fixed-song utility benchmarks, repair/removal, and real presentation acceptance
for the immutable
`analysis-structure` and `combined-ml` paths from
[ADR 0014](../adr/0014-audio-python-runtime-family.md). The current package code is
MIT and PyPI publishes a platform-independent wheel. The current Hugging Face
repository labels the model MIT, but the pinned checkpoint manifest reviewed by
the project declares the Harmonix artifact CC-BY-NC-SA-4.0, while the HTDemucs
checkpoint still lacks a standalone reviewed product-use grant. Conflicting or
missing weight evidence fails closed; package metadata does not authorize model
distribution or product enablement.

Lightweight libraries may still be used for tap/manual assistance or a bounded
fallback, but the product does not install multiple analyzers merely because the
Python environment already exists. Every added dependency needs a consumer,
measured benefit, replaceable analyzer interface, and removal path.

All-In-One's internal four-stem Demucs output is analysis intermediate data. It
does not replace ADR 0009's Refined RoFormer route and is deleted with the job.

## Decode and execution

Main derives one source fingerprint and requests a versioned FFmpeg decode
profile through the shared Audio Python runtime family. The heavy-job scheduler
owns queueing and defaults ML concurrency to one. The analysis worker receives
only app-derived absolute paths, selected profile/model ids, and bounded
operation input; renderer and templates cannot start downloads or select Python
arguments.

Analysis progress, cancellation, error normalization, app shutdown, job cleanup,
repair, and rollback follow ADR 0014. Successful analysis publishes the sidecar
only after validation and atomic replacement. Failure leaves any previous valid
sidecar intact.

Beat This! profiles `beat-this-small0-cpu-v3` and
`beat-this-final0-cpu-v3` derive one global tempo from the median per-beat
duration across bounded windows of up to four beats. This preserves smoothing
across the 50 fps beat grid while tracking the modal local tempo instead of
smearing missing／extra-beat regions across 32 beats. Beat and downbeat timestamps
are unchanged. Renderer copy labels BPM as an estimate, displays at most one
decimal place, and identifies the accompanying confidence as beat confidence
rather than measured tempo certainty.

The fixed `tempo-octave-evaluation.json` cases classify direct, half-time,
double-time, and unrelated estimates against a labeled BPM with a four-percent
tolerance. This evaluation never silently multiplies or divides a stored BPM:
beat spacing alone cannot prove which metrical level is musically intended.

Batch execution remains main-owned and in-memory. One retained bounded snapshot
supports F5 remount/reconnect without introducing a second job owner. The batch
uses the existing single-track analysis service for every runnable item, so the
shared heavy scheduler, source resolution, worker policy, validator, and atomic
publication remain unchanged. The renderer may select library ids and request
normal or forced analysis, but it cannot supply paths, model ids, worker
arguments, concurrency, or retry policy. Public status exposes only bounded
counts, allowlisted stages and reasons, progress, and per-track state; raw worker
errors and paths stay in main.

Batch freshness compares source validity and a main-owned supported-profile
allowlist. The private storage inspection returns only the validated profile id
needed for that decision; the renderer-facing music-structure projection does not
expose analyzer provenance. A valid v2 sidecar therefore remains readable until
the track is analyzed, but normal F5 batch execution does not misclassify it as a
current v3 result.

## Validation invariants

- Analyzer and authored documents accept only their declared fields. Paths,
  commands, executable arguments, player rate, and Lyrics timing fail closed.
- Times are finite non-negative integer milliseconds and remain within source
  duration plus the v1 tolerance of 1,000 ms.
- Beats and sections are monotonic; section intervals do not overlap unless a
  later schema explicitly models hierarchy.
- An M2 projection starts at 0 ms, has exactly contiguous adjacent intervals,
  and ends within 1,000 ms of the source duration. A gap or incomplete tail is a
  valid analyzer document but downgrades to M1/M0 rather than exposing partial
  semantic structure.
- Every M2 section uses a non-`unknown` canonical role and explicit confidence
  at or above `0.5`. One rejected section downgrades the entire partition; the
  app does not fill gaps or infer neighboring roles.
- BPM is finite and bounded to 20–400. Confidence is finite and bounded to 0–1;
  missing confidence is not interpreted as certainty. These bounds come from
  the shared scalar JSON rather than renderer or template policy.
- Section roles come only from the canonical allowlist; unknown raw labels map to
  `unknown`.
- Beat count, section count, model-id count, string lengths, source duration, and
  serialized document size use the bounds in the shared scalar JSON. Main
  validates them before renderer or Output projection.
- Unknown document or analyzer contract versions fail closed and are not
  rewritten by older applications.
- Provenance, raw labels, and model metadata never grant code execution or path
  access.

The source SHA-256 and duration must match the current audio revision exactly.
Missing, invalid, unsupported, or stale analysis resolves to an explicit M0
fallback with no tempo, beats, or sections; the invalid sidecar is not repaired
or rewritten by this validator.

## Lyrics and Output consumption

Lyrics owns the user's timing and correction workflow. Music Analysis supplies
optional cues through an app-owned interface. Presentation packs declare which
signals they can consume and always provide M0/T2 fallbacks.

Output v3 projects current M1/M2 signals as an additive immutable
`music-structure.document` stream. Its document id is keyed by the validated
audio SHA-256 revision and contains only public source identity, duration, tempo,
beat/downbeat cues, canonical section intervals, and bounded confidence. Raw
labels, analyzer provenance, paths, and executable fields do not cross into the
Browser Source contract.

Dynamic snapshots carry only a nullable `{ documentId, documentRevision }`
reference; they do not resend the complete beat grid or section list on every
clock tick. Missing, invalid, stale, M0, or track-mismatched signals publish the
null reference and preserve the existing presentation. Templates interpolate
against the canonical clock and stop during pause, buffering, seek, end,
unavailable, or disconnect states.

The beat-phase and section consumer is intentionally bounded to the Lyrics
`karaoke-stack` template. Current beat and section state is derived locally from the canonical
playback clock. Only canonical cues with confidence at or above `0.5` may select
the section variant or downbeat pulse; missing/low confidence, `unknown`, reduced
motion, and M0 retain the normal static presentation. T2 word progress remains a
separate layer and is neither created nor shifted by these cues.

## Rollout order

1. Implement and verify T0/T1 normalization plus T2 import/manual editing.
2. Accept the executable music-analysis schema and fixed fixtures.
3. Add immutable cue transport and one segment-aware visual recipe with an M0
   fallback — implementation and automated verification complete; human
   Workbench/OBS visual acceptance pending.
   Main-owned atomic sidecar storage/loading and current-track wiring are also
   complete; real M1/M2 acceptance still requires an analyzer-produced sidecar.
4. Generalize Stage A into `AudioPythonRuntimeHost`; do not install into the
   provisional community environment.
5. Resolve and package-smoke `analysis-structure` — Beat This! `small0` and
   `final0` Windows CPU smoke complete; fixed `small0` install, repair, removal,
   activation, and installed-environment inference complete in the internal F5
   workbench. Resolve `combined-ml` only when Refined and analysis are both
   requested.
6. Benchmark BPM, beat/downbeat, and section utility against fixed songs and
   record false/low-confidence behavior.
7. Promote the optional analysis capability beyond the internal gate only after
   labeled accuracy, release license notice, disk capacity, OS-level offline,
   recovery, and real presentation acceptance pass.
8. Evaluate automatic word/syllable alignment separately; do not treat music
   structure inference as lyric alignment.

## Deferred decisions

- automatic word/syllable alignment provider and confidence UX;
- manual correction UI;
- meter changes and hierarchical or overlapping song sections;
- longer-term compatibility window beyond the additive Output v3 cue stream;
- whether decoded-audio cache reuse justifies retained disk space; and
- GPU acceleration, which remains separate from the CPU-completable product
  path.

## Related decisions

- [ADR 0009: Tiered audio-processing recipes](../adr/0009-tiered-audio-processing-runtime.md)
- [ADR 0010: Lyrics timing granularity](../adr/0010-lyrics-timing-granularity-and-output-content-split.md)
- [ADR 0014: Audio Python Runtime Family](../adr/0014-audio-python-runtime-family.md)
- [Lyrics timing contract](lyrics-timing-contract.md)
