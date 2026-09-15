# Lyrics T2 Implementation Plan

## Status and objective

Implementation baseline, 2026-08-23. Batches 1 and 2, the Output transport
prerequisite, and the Batch 3 segment-aware overlay implementation are complete.
Human visual acceptance in Workbench and OBS remains before the presentation is
treated as release-approved; later analysis work remains independently gated.
That acceptance work is tracked as a live near-term item in
[docs/spec.md §6.1](../spec.md#61-近期穩定公開測試核心), not in this archived
implementation plan.
This document converts ADR 0010 and the Lyrics Timing Contract into ordered,
testable work without pulling M1/M2 analysis, automatic alignment, or
Presentation Packs into the base T2 path.

The first usable endpoint is line-focused T2 authoring and import:

- existing T0/T1 lyrics normalize into one canonical document with stable ids;
- imported or manually authored word/phrase segments can be saved incrementally;
- playback can derive the active line, segment, and segment progress from the
  existing player clock;
- source changes never silently apply timing to different text; and
- current T1 Lyrics and Output behavior continue to work until their planned
  migrations are complete.

## Current implementation facts

- `electron/lib/library/lyrics.js` owns source listing, raw-text persistence,
  selection-safe path resolution, and source deletion. The focused
  `lyricsTiming.js` module owns its timing derivative and source fingerprint.
- `src/utils/lyrics.js` parses VTT, LRC, and the supported A2 Enhanced LRC subset.
  The legacy projection still uses seconds, `NaN`, and `Infinity`; canonical
  documents contain nullable integer milliseconds and optional T2 segments.
- `useLyrics.js` owns selected track/source, raw text, timing status, the canonical
  document, the transient offset, and player-aware active-line identity. It is
  the long-lived singleton consumed by Lyrics and Output.
- `LyricsWorkspace.vue` composes focused document, timing-toolbar, and segment
  editor components. `useLyricsTimingEditor.js` owns only the unsaved line draft;
  `useLyrics.js` remains the sole canonical document/player projection owner.
- Lyrics rows use stable canonical `lineId` identity.
- reading sidecar v1 remains readable by index plus exact text. Explicit new
  generation/edit writes v2 `documentId`/`lineId` identity after main verifies
  the current source fingerprint.
- Bundled overlays negotiate Output v3: immutable `lyrics.document` and
  `queue.document` streams are referenced by dynamic `state.snapshot`; legacy
  no-subprotocol clients and `/api/v1/state` retain snapshot v2.

The visible line-focused segment editor, active segment/progress derivation,
Enhanced LRC import, reading v2 identity, and Output v3 content/state transport
are implemented. The real Lyrics overlay now consumes segment timing from that
contract with a T1 fallback and local boundary scheduling. Automatic alignment and
M1/M2 remain separate later work.

## Canonical document rules

### Preserve source text and represent timing in milliseconds

The source LRC/VTT remains unchanged. A canonical in-memory document contains
escaped plain text, stable ids, and nullable integer millisecond boundaries.
No `NaN`, `Infinity`, DOM markup, CSS class, or analyzer-specific object crosses
IPC or persistence.

Boundary semantics are:

- T0 line: `startMs` and `endMs` are both `null`;
- timed line: `startMs` is an integer and `endMs` is an integer or `null`;
- `endMs: null` means an open final interval resolved at runtime from the next
  sibling boundary, known parent end, or playable duration when available;
- a segment has a finite `startMs`; its `endMs` may be `null` only when runtime
  resolution has the same safe next-boundary/parent-duration fallback; and
- fractional progress is unavailable when an effective finite end cannot be
  resolved. Presentation falls back to active/inactive state rather than
  fabricating progress.

This replaces the current non-JSON `NaN`/`Infinity` convention at the canonical
document boundary while preserving the legacy parser API during migration.

### Use stable deterministic identity before first edit

Viewing lyrics must not create files. For a source without a saved timing
sidecar, normalization derives deterministic opaque ids from:

- source-content SHA-256;
- normalizer profile id;
- source cue/line ordinal and original timing/text evidence; and
- segment ordinal when imported segment timing exists.

Repeated lyric text therefore remains distinguishable. A renamed or moved copy
with identical bytes can normalize consistently, while changed bytes produce a
new source identity. The normalizer profile prevents a parser change from being
mistaken for the same derived representation.

On first edit/import save, the sidecar persists those ids. Later timing edits
change boundaries without changing identity. Editing the lyric text remains a
source operation and marks the old timing sidecar stale rather than rewriting it.

### Allow partial T2 authoring

T2 is incremental. A document may contain T0, T1, and T2 lines at the same time:

- an absent or empty `segments` array falls back to its line timing;
- a non-empty segment array must concatenate exactly to the authored line text;
- templates and the workspace use segment timing only for the lines that have a
  valid T2 representation; and
- completion counts are derived, not persisted as a second source of truth.

Document granularity reports the highest validated detail present; it is not a
claim that every line is complete.

## Persistence and trust boundary

Add a focused `electron/lib/library/lyricsTiming.js` domain module; do not grow
the existing source/manifest module into another mixed responsibility.

It owns:

- `lyrics/timing/<sourceFilename>.json` allowlisted path resolution;
- chunked SHA-256 of the exact source bytes;
- schema/limit/invariant validation at the main-process trust boundary;
- load status: `missing`, `current`, `stale`, `corrupt`, or `unsupported`;
- atomic save that recomputes the source hash before publication;
- preserving previous valid data when validation/write fails; and
- deliberate deletion cleanup for timing and reading sidecars.

A source unexpectedly missing from disk retains its sidecar and returns
`unavailable`, matching the recovery contract. A user-confirmed source deletion
removes that source's timing and reading derivatives because the action is
intentional, scoped, and recoverable only from the user's own backup.

Use a small shared JSON values file for schema version, id/text/count limits, and
normalizer profile id. Main remains the authoritative validator; renderer
normalization is pure display/authoring logic and never gains path access.

`lyrics:get-track` additively returns raw text plus source fingerprint, normalizer
profile, timing status, and a validated current document when present. Save IPC
accepts only track id, allowlisted source filename, expected source fingerprint,
and a bounded document. Main derives all paths and rejects a save when the
current source bytes no longer match the expected hash. Deliberate source
deletion removes its timing derivative through the existing source-delete IPC;
there is no renderer-supplied path or standalone timing-delete path in Batch 1.

## Renderer state and component boundaries

The project uses Vue 3 Composition API with JavaScript. T2 should follow the
existing language rather than turn the feature into an unrelated TypeScript
migration.

`useLyrics.js` remains the single long-lived owner of selected track/source,
canonical lyrics document, timing status, and transient offset. It currently
derives active line identity from `usePlayer`'s existing authoritative clock;
segment/progress derivation and explicit timing save now use that same clock and
owner. Output continues consuming this same owner; no editor or template creates a
second playback clock.

Editor draft state may live in a focused `useLyricsTimingEditor.js`, but it owns
only an unsaved draft keyed by track/source/document identity. It cannot replace
the persisted canonical document. Every completed edit goes through the
`useLyrics` save action and atomically replaces the canonical document only after
main accepts it.

Recommended component map:

| Component                 | Single responsibility                                     | Input / output                                            |
| ------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| `LyricsWorkspace.vue`     | Compose workspace surfaces and modals                     | Reads composables; no segment mutation logic              |
| `LyricsDocumentPanel.vue` | Render canonical lines/readings/segments and active state | Document/readings/status props; select/seek/edit events   |
| `LyricsTimingToolbar.vue` | Enter authoring mode and expose save/stale/error status   | Status/capability props; mode/review/import events        |
| `LyricsSegmentEditor.vue` | Edit one line's exact text slices and segment boundaries  | Immutable line/draft props; boundary/commit/cancel events |

The first batch keeps tap/undo/save controls in `LyricsTimingToolbar.vue`; a
separate `LyricsTapController.vue` is unnecessary until a full-song or dedicated
keyboard-capture workflow exists.

Props are read-only and mutations travel upward as explicit events. Text renders
through Vue interpolation, never `v-html`. Stable `lineId` and `segmentId` are
the only list keys.

## First authoring and import UX

Use a line-focused authoring workflow before building a DAW-like full-song
timeline:

1. select a timed line;
2. accept the first whitespace-aware exact text slices;
3. start playback from the line;
4. press Space or the visible tap action to commit the next segment boundary;
5. undo/nudge a boundary or finish the line; and
6. validate and atomically save that line into the sidecar.

Suggestions preserve every code point, whitespace, and punctuation so segment
concatenation equals line text. Whitespace-aware tokenization may suggest Latin
or Korean boundaries. Japanese/Chinese text starts conservatively as one segment
unless an existing reading/tokenization result can provide a non-destructive
suggestion; no language analyzer becomes required for T2.

T0 lines must first receive line timing. The initial editor may tap line start/end
before segment boundaries rather than inventing segment progress without a parent
interval.

The first rich source import target is enhanced LRC with inline word/phrase
timestamps, added without changing the existing `.lrc` source allowlist. Import
normalizes inline timing into the canonical document, persists it only on an
explicit save, and preserves the original LRC.
WebVTT inline karaoke timestamps and new formats such as TTML/KRC remain separate
follow-ups; the current VTT parser strips tags and must not pretend that lost tags
were imported timing.

## Reading compatibility

Reading v1 remains readable by its existing index-plus-text check. T2 rendering
aligns that legacy result to canonical lines without rewriting it on load.

The next reading schema stores `documentId` and `lineId`; newly generated or
explicitly edited readings use stable identity. Legacy documents upgrade only on
an explicit regeneration/edit path with a matching source fingerprint. A source
change keeps the old document stale/unmatched. Segment timing edits never erase
readings because line ids and lyric text remain unchanged.

## Output compatibility

Batches 1 and 2 keep Output contract v2 operational by projecting canonical
lines back to its existing line-only shape. Segment data is not squeezed into v2.

After T2 load/edit behavior is verified, the separate Output v3 batch publishes:

- immutable `lyrics.document` on connect or document/source revision; and
- dynamic `state.snapshot` with playback phase, position, rate, offset,
  `documentId`, and active references.

That migration follows ADR 0010/0012 and includes reconnect ordering, old-client
compatibility, latest-wins backpressure, and real OBS verification.

## Ordered implementation batches

### Batch 1: canonical T0/T1 foundation (complete)

- [x] Add shared limits/profile values and main-side timing storage/validation.
- [x] Extend lyrics load response with source fingerprint and timing status.
- [x] Add pure canonical normalization with deterministic ids and nullable ms
      times.
- [x] Make `useLyrics` own the canonical document and derive active line by id.
- [x] Adapt current workspace/readings and Output v2 to canonical lines without a
      visible T2 editor.
- [x] Add deliberate-delete derivative cleanup and stale/corrupt recovery
      behavior.

This batch is complete only when existing T0/T1 behavior is unchanged to the
user and stable ids survive reloads.

### Batch 2: minimal T2 import and authoring (complete)

- [x] Import the supported Enhanced LRC segment timestamps into the canonical
      validated document; persist only through an explicit sidecar save.
- [x] Add partial-T2 segment display and active segment/progress derivation.
- [x] Split the Lyrics document panel, timing toolbar, and segment editor out of
      the existing workspace.
- [x] Add line-focused exact splitting, tap, undo, nudge, cancel, and explicit
      atomic save.
- [x] Introduce reading v2 identity while preserving legacy v1 reads.

### Batch 3: segment-aware Output presentation (implemented; visual acceptance pending)

- [x] Add the versioned immutable Lyrics document message and dynamic state
      reference.
- [x] Keep Output v2 during the migration window.
- [x] Update the real Lyrics overlay to segment-aware rendering with a T1
      fallback.
- [x] Derive active segment, fractional progress, and the next segment boundary
      from the canonical playback clock without waiting for another snapshot.
- [x] Verify reconnect, seek, pause, rate, offset, source change, reduced motion,
      malicious literal text, snapshot-v2 compatibility, and runtime startup with
      automated tests and an Electron dev launch.
- [x] Ship an explicit app-bundled fallback cascade on all four fixed routes and
      keep segment glyphs visible while progress uses a non-text-clipping indicator.
- [ ] Complete human visual acceptance for wrapping, progress animation, seek/pause,
      reduced motion, and reconnection in Workbench and a real OBS Browser Source.

### Later independent batches

- M1/M2 All-In-One structure analysis and cue document;
- automatic word/syllable alignment and confidence UX;
- T3 language-specific syllable/grapheme semantics;
- duet/multi-lane editing; and
- Presentation Pack recipes, GSAP choreography, and GPU adapters.

## Red-test matrix before implementation

### Pure normalization and validation

- identical source bytes/profile produce identical ids across reload and rename;
- source or normalizer-profile change produces a different derived identity;
- duplicate lyric text receives distinct stable line ids;
- T0, open-ended T1, mixed T1/T2, and enhanced LRC fixtures normalize correctly;
- segment concatenation preserves exact line text and Unicode;
- duplicate ids, negative/non-integer times, non-monotonic intervals, overflow,
  unknown schema, and out-of-line segments fail closed;
- nullable end resolution never creates `NaN`/`Infinity` in IPC/JSON.

### Main persistence and recovery

- traversal/absolute source names and oversized documents are rejected;
- save recomputes the source hash and rejects a concurrent source change;
- atomic failure leaves the old valid sidecar unchanged;
- missing source retains timing as unavailable, while deliberate deletion removes
  only that source's timing and reading derivatives;
- corrupt and unknown-version sidecars remain on disk and are reported, not
  replaced with empty data.

### Renderer and workspace

- rapid track/source switching cannot apply an older timing response;
- browse mode never applies player time to a non-playing selected track;
- active line/segment/progress handle play, pause, seek, rate, offset, open ends,
  and no-signal fallback;
- list keys remain id-based for repeated lines;
- switching views cannot lose an already committed edit or mutate the source;
- legacy reading v1 and new id-based reading data render against the right line;
- keyboard tap/undo/finish remains accessible without relying on animation.

### Compatibility and Output

- existing LRC/VTT parsing, line seek, source management, and reading tests stay
  green;
- Output v2 receives the same bounded line-only projection through Batch 2;
- no T2 action enables Lyrics/provider/audio-processing gates implicitly; and
- no raw path, source markup, invalid number, or segment object crosses an older
  contract.

## Accepted Batch 2 decisions

The architecture recommends these defaults but keeps them explicit for product
implementation:

1. line-focused tap editor before a whole-song timeline;
2. enhanced LRC as the first T2 import format;
3. exact-text slices, including whitespace/punctuation, as segment identity;
4. immediate atomic save per completed line instead of a large unsaved document;
5. partial T2 allowed with line-level fallback; and
6. automatic alignment remains a later optional capability.

## References

- [ADR 0010: Lyrics timing granularity](../adr/0010-lyrics-timing-granularity-and-output-content-split.md)
- [ADR 0012: State convergence and startup](../adr/0012-state-convergence-and-startup-phases.md)
- [Lyrics Timing Contract](../contracts/lyrics-timing-contract.md)
- [Music Analysis Contract](../contracts/music-analysis-contract.md)
