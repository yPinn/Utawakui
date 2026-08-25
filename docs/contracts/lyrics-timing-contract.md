# Lyrics Timing Contract

## Status and scope

Version 1 contract, implemented 2026-08-23. It defines the data boundary from
[ADR 0010](../adr/0010-lyrics-timing-granularity-and-output-content-split.md).
Canonical T0/T1 normalization, stable ids, bounded sidecar validation, source
fingerprints, stale/corrupt status, additive load/save IPC, the visible T2
importer/editor, reading v2 identity, negotiated Output v3 projection, and
segment-aware rendering in the real Lyrics overlay are implemented. Human
Workbench/OBS visual acceptance remains a release check, not a contract gap.

Implementation must also satisfy ADR 0012's minimum pre-Lyrics gate: initial full
source handshake, `bootId`/`sourceEpoch`, explicit unavailable behavior, and a
startup plan that does not add lyrics/pack work to the first-window critical path.

The contract normalizes untimed and line-timed sources and adds reusable segment
timing without requiring templates to parse LRC, VTT, or provider-specific data.
It does not define a complete lyrics editor, automatic alignment engine,
M1/M2 music analysis, or song-specific choreography. Those cues are an accepted
later endpoint, but remain a separate derived document and optional capability.

## Granularity model

Text timing and musical cues are separate axes:

- `T0`: untimed lines;
- `T1`: timed lines;
- `T2`: timed segments within lines;
- `T3`: timed graphemes or syllables, reserved;
- `M0`: no music cues;
- `M1`: BPM plus beat/downbeat grid and bar position, planned after T2;
- `M2`: section intervals or authored cues, planned after M1; and
- `M3`: song-specific choreography, deferred.

The first implementation target accepts T0 and T1 and persists T2. Unsupported
levels must not be silently downgraded and overwritten.

T2 segment timing and M1/M2 music cues are independent. Segment timing may be
imported or manually authored with no analyzer installed. Music cues live in the
separate [Music Analysis Contract](music-analysis-contract.md) and do not infer
word boundaries or silently trigger vocal separation.

## Storage and identity

For an imported source at `tracks/<trackId>/lyrics/<sourceFilename>`, the derived
timing sidecar is stored at:

```text
tracks/<trackId>/lyrics/timing/<sourceFilename>.json
```

The source filename is validated by the existing lyrics path boundary. Absolute
paths never appear in renderer or Output payloads. Writes are atomic and a
corrupt document is preserved for diagnosis rather than replaced with an empty
file.

`documentId`, `lineId`, and `segmentId` are opaque stable identifiers. Array
position is display order, not identity. Reading-aid sidecars and future manual
corrections refer to these ids.

## Illustrative T2 document

The field names below match the persisted version 1 shape. The authoritative
executable validator and fixture tests live in
`electron/lib/library/lyricsTiming.js` and its co-located test; this prose is not
used as the trust boundary.

```json
{
  "schemaVersion": 1,
  "documentId": "lyr_01J...",
  "normalizerProfileId": "lyrics-source-v1",
  "granularity": "T2",
  "source": {
    "filename": "main.ja.lrc",
    "sha256": "<lowercase hex digest>"
  },
  "lines": [
    {
      "lineId": "line_01",
      "text": "example lyric",
      "startMs": 12500,
      "endMs": 14800,
      "segments": [
        {
          "segmentId": "seg_01",
          "text": "example",
          "startMs": 12500,
          "endMs": 13600
        },
        {
          "segmentId": "seg_02",
          "text": " lyric",
          "startMs": 13600,
          "endMs": 14800
        }
      ]
    }
  ]
}
```

Provenance/manual-edit metadata, `lane`, and semantic `role` remain optional
future schema additions. They must not change timing meaning or become
template-specific CSS classes.

## Validation invariants

- Persisted finite times are integer milliseconds and never negative; JSON never
  contains `NaN` or `Infinity`.
- A T0 line has `startMs: null` and `endMs: null`. A timed line has a finite
  `startMs`; `endMs` may be `null` only for an open final interval resolved from
  the next boundary, parent interval, or playable duration at runtime.
- A segment has a finite `startMs`; its `endMs` follows the same bounded open-end
  rule. Unresolved finite progress falls back to active/inactive presentation.
- Where both ends are finite, `startMs <= endMs`; timed lines and segments are
  ordered monotonically.
- A T2 segment stays within its parent line's time interval.
- Segment ids are unique within a document and line ids are document-unique.
- Concatenated segment text preserves the authored line text. Normalization may
  define Unicode-equivalent comparison, but cannot silently discard characters.
- Unknown schema versions fail closed and are not rewritten by older apps.
- Size, line-count, segment-count, and text-length limits are shared between the
  main-process parser and renderer projection.
- Any future provenance is descriptive only; it never grants trust or code
  execution.

A document may be partially authored. Missing/empty `segments` means that line
uses its T0/T1 fallback; non-empty segments must satisfy all T2 invariants.
Document granularity reports the highest validated detail present rather than
claiming every line has the same completion level.

## Source changes and stale state

On load, the application hashes the current source bytes and compares the digest
with `source.sha256`:

- matching digest: the timing document may be used;
- missing source: retain the sidecar and report the source as unavailable; and
- mismatched digest: retain the sidecar, mark it stale, and require explicit
  realignment, review, or discard.

The app does not heuristically attach edited timing to different text. A future
guided rebase may offer suggestions, but the user confirms the resulting mapping.

## Reading data

Furigana, romanization, translation, and manual reading corrections remain in
their own derived documents. They may align at line or segment granularity using
stable ids. Timing updates must not erase readings, and reading regeneration must
not rewrite timing. If ids change through an explicit re-alignment, the operation
reports which reading references could not be preserved.

## Output projection

Output contract version 2 remains unchanged until T2 lands. The next contract
projects the timing model as two message families:

```text
lyrics.document  -> immutable content, identity, revision, lines, segments
state.snapshot   -> playback phase, position, rate, offset, documentId
```

Connection order is deterministic: the server sends the referenced document
before, or in the same ordered stream immediately ahead of, a snapshot that uses
its `documentId`. A source change publishes a new document before dynamic state
can reference it. Clients discard snapshots for unknown document ids and request
nothing over the read-only socket; reconnect supplies a complete current pair.

Templates derive current line, current segment, and fractional progress from the
canonical playback clock. Local interpolation is corrected by later snapshots and
must stop during paused, buffering, seeking, ended, or disconnected phases.

## Deferred decisions

- authoring UX and keyboard interaction for segment boundaries;
- automatic alignment provider and confidence representation;
- T3 language-specific semantics;
- duet and multi-lane editing behavior;
- M1/M2 analyzer implementation and authoring UX; and
- compatibility-window length for version 2 Output clients.

## Related decisions

- [ADR 0010: Lyrics Timing Granularity](../adr/0010-lyrics-timing-granularity-and-output-content-split.md)
- [ADR 0012: State Convergence and Startup Phases](../adr/0012-state-convergence-and-startup-phases.md)
- [ADR 0014: Audio Python Runtime Family](../adr/0014-audio-python-runtime-family.md)
- [Music Analysis Contract](music-analysis-contract.md)
- [T2 implementation plan](../archive/lyrics-t2-implementation-plan.md)
- [Output Runtime Hardening Contract](output-runtime-hardening.md)
