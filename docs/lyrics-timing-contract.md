# Lyrics Timing Contract

## Status and scope

Draft planning contract, 2026-08-23. It describes the target data boundary from
[ADR 0010](adr/0010-lyrics-timing-granularity-and-output-content-split.md);
current production lyrics remain line-timed and this document is not yet an
implemented file format.

Implementation must also satisfy ADR 0012's minimum pre-Lyrics gate: initial full
source handshake, `bootId`/`sourceEpoch`, explicit unavailable behavior, and a
startup plan that does not add lyrics/pack work to the first-window critical path.

The contract normalizes untimed and line-timed sources and adds reusable segment
timing without requiring templates to parse LRC, VTT, or provider-specific data.
It does not define a complete lyrics editor, automatic alignment engine, beat
analysis, or song-specific choreography.

## Granularity model

Text timing and musical cues are separate axes:

- `T0`: untimed lines;
- `T1`: timed lines;
- `T2`: timed segments within lines;
- `T3`: timed graphemes or syllables, reserved;
- `M0`: no music cues;
- `M1`: beat grid, reserved;
- `M2`: sections or authored cues, reserved; and
- `M3`: song-specific choreography, deferred.

The first implementation target accepts T0 and T1 and persists T2. Unsupported
levels must not be silently downgraded and overwritten.

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

The field names below are a planning example. Implementation must first add an
executable JSON Schema and fixture tests rather than treating this prose as the
only validator.

```json
{
  "schemaVersion": 1,
  "documentId": "lyr_01J...",
  "granularity": "T2",
  "source": {
    "filename": "main.ja.lrc",
    "sha256": "<lowercase hex digest>",
    "format": "lrc"
  },
  "provenance": {
    "kind": "imported",
    "tool": "utawakui",
    "manuallyEdited": true
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

Optional future metadata may include `lane` or semantic `role`. It must not change
timing meaning or become a template-specific CSS class.

## Validation invariants

- Times are finite integer milliseconds and never negative.
- `startMs <= endMs`; timed lines and segments are ordered monotonically.
- A T2 segment stays within its parent line's time interval.
- Segment ids are unique within a document and line ids are document-unique.
- Concatenated segment text preserves the authored line text. Normalization may
  define Unicode-equivalent comparison, but cannot silently discard characters.
- Unknown schema versions fail closed and are not rewritten by older apps.
- Size, line-count, segment-count, and text-length limits are shared between the
  main-process parser and renderer projection.
- Provenance is descriptive only; it never grants trust or code execution.

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
- M1/M2 detection and storage; and
- compatibility-window length for version 2 Output clients.

## Related decisions

- [ADR 0010: Lyrics Timing Granularity](adr/0010-lyrics-timing-granularity-and-output-content-split.md)
- [ADR 0012: State Convergence and Startup Phases](adr/0012-state-convergence-and-startup-phases.md)
- [Output Runtime Hardening Contract](output-runtime-hardening.md)
