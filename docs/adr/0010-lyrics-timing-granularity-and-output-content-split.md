# ADR 0010: Lyrics Timing Granularity and Output Content Split

## Status

Accepted and implemented through Batch 3 on 2026-08-23. Batch 1 canonical T0/T1
normalization and bounded T2 sidecars, Batch 2 segment import/authoring plus
reading v2, the negotiated Output content/state split, segment-aware rendering,
and a no-Pack bundled fallback cascade for the real Lyrics overlay are complete.
Human Workbench/OBS visual acceptance is still required; M1/M2 analysis and
reusable presentation recipes remain later work.

## Context

The original lyrics model was line-timed: each line had `text`, `startMs`, and
`endMs`, and Output republished the complete line list as part of each dynamic
snapshot. That was sufficient for a focus-line overlay, but not for reusable
word- or phrase-progress effects. The completed foundations now provide stable
segments and split immutable content from the clock. The real presentation now
consumes that contract without duplicating timing state.

Timing detail and musical choreography are related but independent. A lyric can
have segment timing without beat data, and a template can use a beat grid without
per-word lyrics. The architecture therefore needs two explicit axes rather than
one overloaded “lyrics level”.

## Decision

### Use two independent granularity axes

Text timing has four levels:

| Level | Meaning                                                 | Product status                                             |
| ----- | ------------------------------------------------------- | ---------------------------------------------------------- |
| T0    | Untimed document                                        | Supported by normalization                                 |
| T1    | Line timing                                             | Supported presentation fallback                            |
| T2    | Segment timing, where a segment may be a word or phrase | Import, authoring, transport, and presentation implemented |
| T3    | Grapheme or syllable timing                             | Schema-ready; editor and effects deferred                  |

Musical cues have four separate levels:

| Level | Meaning                                      | Product status             |
| ----- | -------------------------------------------- | -------------------------- |
| M0    | No music cues                                | Current baseline           |
| M1    | BPM, beat/downbeat grid, and bar position    | Planned after T2           |
| M2    | Section intervals and optional authored cues | Accepted endpoint after M1 |
| M3    | Song-specific choreography                   | Deferred                   |

The completed Batch 3 milestone is segment-aware presentation using the implemented
T2 storage, import, validation, editing, and Output transport contracts. It does
not include T3, automatic M1/M2 analysis, multi-lane duet editing, or
song-specific choreography. The accepted product endpoint nevertheless includes
optional M1 rhythm and M2 section cues so reusable Lyrics presentations can
change bounded style variants on beats and verse/chorus-like sections. T2 works
without those cues through imported or manual timing. The schema may reserve
optional `lane` and `role` metadata so these additions do not require replacing
stable line and segment identities.

### Keep music structure separate from lyric alignment

M1/M2 analysis produces source BPM, beat/downbeat timestamps, bar position,
section intervals, confidence, and analyzer provenance. It does not create T2
word timing. Imported timing, manual/tap authoring, and a future separately
approved alignment provider remain independent ways to produce T2.

All-In-One Infer is the first full M1/M2 candidate because it can cover the
accepted rhythm and section endpoint through one optional local capability. It
remains gated by packaged Windows inference, accuracy, confidence/fallback,
capacity, offline model loading, and model-license acceptance. It runs through
ADR 0014's `analysis-structure` or validated `combined-ml` environment and never
turns its four-stem Demucs intermediate into the Refined product default.

The versioned field, persistence, fallback, and rollout boundary lives in the
[Music Analysis Contract](../music-analysis-contract.md). Automatic analysis is
not a prerequisite for T2 implementation or normal playback.

### Keep timing as a derived sidecar

The imported LRC, VTT, or other source file remains the source artifact. Rich
timing is stored under:

```text
tracks/<trackId>/lyrics/timing/<sourceFilename>.json
```

The version 1 sidecar records a stable document id, normalizer profile,
granularity, source fingerprint, stable line/segment ids, and authoring
provenance. If the source fingerprint changes, the sidecar is retained but
marked stale; it is not silently applied to different text.

Reading aids remain separate derived data. They align through stable line and
segment ids rather than being embedded into timing records. This prevents a
romanization or furigana refresh from rewriting timing work.

The evolving field contract and validation rules live in
[`docs/lyrics-timing-contract.md`](../lyrics-timing-contract.md). The main-process
validator and co-located fixtures are the executable trust boundary.

### Split immutable lyric content from the playback clock at T2

Bundled overlays now negotiate Output contract version 3 because repeatedly
sending every segment on playback ticks wastes bandwidth and creates unnecessary
allocations inside OBS Browser Sources. Version 2 remains the compatibility
contract for the four existing routes' legacy clients and `/api/v1/state`.

The negotiated contract sends:

- an immutable `lyrics.document` message on connection and whenever the active
  lyric source or document revision changes; and
- a dynamic `state.snapshot` containing the canonical playback position, phase,
  rate, display compensation, and `documentId`.

The WebSocket remains read-only. The playback clock is authoritative; a template
may interpolate locally between corrections but may not create a second playback
source of truth. Existing version 2 clients and routes remain supported during a
defined migration window. Contract v3 uses ADR 0012's `bootId`, `sourceEpoch`,
stream-specific revisions, initial full handshake, and source-unavailable state;
Lyrics does not invent a parallel synchronization identity.

### Implement data foundations before visual templates

The dependency order is:

1. normalize T0 and T1 into stable document identities — complete;
2. implement and test the T2 sidecar contract — complete;
3. expose a minimal T2 editor and importer workflow — complete;
4. introduce the content/state Output protocol split — complete; and
5. make the real Lyrics presentation segment-aware — implementation complete;
   human Workbench/OBS visual acceptance pending.

M1/M2 begins only after T2 is stable and at least one accepted presentation
consumes the signal with an M0 fallback. Runtime-family implementation and
analysis package preparation remain a later, independently gated batch.

## Rejected options

- **Keep line timing and infer words inside each template.** Inference would be
  inconsistent across templates and cannot recover reliable timing.
- **Jump directly to syllable timing.** It expands language, editor, and import
  complexity before segment effects prove the need.
- **Rewrite the original lyrics file.** Not every source format can preserve the
  richer model, and user-provided source artifacts should remain recoverable.
- **Embed reading aids in timing data.** Their lifecycle and provenance differ.
- **Continue sending full lyrics on every tick after T2.** The immutable content
  is needlessly duplicated and increases combined OBS resource usage.
- **Bundle song-specific choreography into the base timing schema.** That is a
  separate M3 authoring problem and is outside the reusable-template goal.

## Consequences

- Template work gains a predictable, language-neutral segment model.
- The sidecar needs stale-data UX, provenance display, and atomic persistence.
- Output supports a versioned migration and reconnect ordering for document and
  state messages while preserving snapshot-v2 compatibility.
- Multi-lane, beat, and syllable features remain possible without being promised
  by the first implementation.
- T1 overlays remain the fallback while segment-aware rendering is verified in
  the real Workbench and OBS Browser Sources.

## References

- [Lyrics timing contract](../lyrics-timing-contract.md)
- [T2 implementation plan](../lyrics-t2-implementation-plan.md)
- [Music analysis contract](../music-analysis-contract.md)
- [ADR 0006: Loopback Output WebSocket Runtime](0006-loopback-output-websocket-runtime.md)
- [ADR 0012: State Convergence and Startup Phases](0012-state-convergence-and-startup-phases.md)
- [ADR 0014: Audio Python Runtime Family](0014-audio-python-runtime-family.md)
- [Product specification](../spec.md)
