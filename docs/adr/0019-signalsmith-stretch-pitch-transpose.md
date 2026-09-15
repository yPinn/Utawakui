# ADR 0019: Signalsmith Stretch replaces SoundTouchJS for pitch transpose

## Status

Proposed (2026-09-15). Code and unit-test coverage for the parts that can be
automated are implemented; **audio-quality verification is not automatable
and has not been done by the assistant** — see Consequences. Whether this
lands as the shipped engine depends on the user actually listening to it.

## Context

`docs/spec.md` §7.1 recorded this as an open decision after competitor
research (`docs/research/competitive-research.md`) found that 歌回救星 bundles
both SoundTouchJS and Signalsmith Stretch, and its public benchmarking
suggested the frequency-domain algorithm sounds better than WSOLA under
extreme speed changes.

**That premise does not actually apply to Utawakui, and the user confirmed
this correction before work continued.** Reading
`src/composables/player/usePlayerAudioGraph.js` shows Utawakui's tempo
control (`setTempoRate`) sets the native `<audio>.playbackRate` directly —
it never goes through SoundTouch. `@soundtouchjs/audio-worklet`'s
`SoundTouchNode` was only used for one independent feature: deliberate manual
**transpose** (`transposeSemitones`, ±12 semitones) combined with a fine
**pitch cents** trim (±50 cents) — not tempo/speed change at all. The user's
explicit scope for this round: continue, but purely as a transpose-quality
evaluation, not the "extreme speed change" argument from the original
research (which doesn't apply here).

### Package verification

`signalsmith-stretch` is the official npm-published WASM/AudioWorklet release
of Signalsmith Audio's Stretch library (published by the author, Geraint
Luff; MIT; zero runtime dependencies; `1.3.2` at time of writing). Its default
export `SignalsmithStretch(audioContext, options) => Promise<AudioWorkletNode>`
registers its own AudioWorklet module internally and resolves to a node
extended with `.schedule({ active, semitones, ... })` — one call handles both
worklet registration and node construction, unlike `SoundTouchNode`, which
required a separate manual `SoundTouchNode.register(context, workletUrl)`
step before construction.

## Decision

Replace `@soundtouchjs/audio-worklet` with `signalsmith-stretch` for the
transpose feature only. Not a dual-engine setup — no evidence supports users
needing to switch engines, and since this round's work stays uncommitted
(per this session's standing "don't commit, v0.3.0 is in flight" instruction),
the user can discard the whole change if the sound quality isn't an
improvement.

### API shape change: two AudioParams → one `schedule()` field

`SoundTouchNode` exposed two independent `AudioParam`s that combined
additively: `pitchSemitones` (integer semitones) and `pitch` (a ratio,
`2 ** (cents / 1200)`). Signalsmith Stretch's `.schedule()` takes a single
`semitones` field instead, and is a discrete scheduled event, not a
continuously-automatable `AudioParam`. The two existing user-facing controls
collapse into one pure conversion function:

```js
export function combinedSemitones(transposeSemitones, pitchCents) {
  return transposeSemitones + pitchCents / 100;
}
```

This is the one piece of the pitch-processing code path that is
DOM-independent and can actually be unit-tested (see
`usePlayerAudioGraph.pitch.test.js`). `setTransposeSemitones()` and
`setPitchCents()` keep their existing public signatures and
`state.transposeSemitones`/`state.pitchCents` data model unchanged — only the
internal call into the pitch node changed, so `usePlayer.js` and every
Settings/PlayerBar UI component needed no changes.

The existing dry/wet gain crossfade bypass (`updatePitchBypass()` — when both
controls are at their defaults, ramp back to dry signal and skip creating a
pitch node at all) is unchanged; it's an existing performance design
independent of which engine sits behind it.

### Discovered issue: permanent registration-failure caching

Mid-implementation, reading `signalsmith-stretch`'s actual package source
(not assumed) surfaced a real behavioral regression: **the library caches its
AudioWorklet module-registration promise directly on the `AudioContext`
object, and never clears the cache entry on rejection.** Utawakui's own
`ensurePitchNode()`/`ensureCapturePitchNode()` do clear their own local
`pitchNodeReady`/`graph.pitchNodeReady` cache on failure (allowing a retry
call), but that retry calls into `signalsmith-stretch` again on the _same_
`AudioContext` — and the library's own cache returns the same
already-rejected promise every time. A transient worklet-registration failure
is therefore **permanent for that `AudioContext`'s lifetime**, whereas the
prior `SoundTouchNode`-based `ensureWorkletRegistered()` cleared its own
WeakMap entry on failure and could recover on retry against the same context.

This affects both pitch paths that existed before this change:

- **Monitor path** (`ensurePitchNode()`, `audioCtx`): `audioCtx` is created
  once per player session and never recreated, so a transient failure here
  breaks transpose for the rest of the session with no recovery path at all.
- **Capture path** (`ensureCapturePitchNode()`, `captureGraph.context`): a
  transient failure breaks transpose for that capture output selection, but
  is recoverable by reselecting the output device (`applyCaptureDevice`
  creates a brand-new `AudioContext`).

Three options were considered:

1. **Accept the regression, document it honestly, add a descriptive error
   message.** Lowest complexity; matches the actual blast radius (a
   worklet-registration-specific transient failure with the underlying
   device/sink still healthy — genuinely rare, and a real device
   disconnect/sink change already triggers full `AudioContext`
   invalidation via the existing `sinkchange`/`statechange` listeners,
   sidestepping this bug entirely).
2. **Force `AudioContext` recreation on worklet failure** to restore the old
   retry guarantee. Rejected for this round — meaningfully more complexity
   (main-graph recreation has no existing precedent; only capture graphs
   are ever recreated today) for a fix to a corner case, in code that is
   still an unverified quality experiment, not yet a committed change.
3. **Keep both engines, pick per-path.** Rejected — reintroduces the
   dual-maintenance cost this ADR's Decision explicitly avoids, for a
   narrow failure mode.

**Decision: Option 1.** `reportPitchProcessingError()` /
`reportCapturePitchProcessingError()` already route into this codebase's
existing `reportPlayerError`/diagnostics capture, so no new logging
infrastructure was added — just this honest documentation of the limitation.

## Rejected for this phase

- **A workaround that forces `AudioContext` recreation on worklet-failure
  retry** (Option 2 above). Left as a follow-up if real-world telemetry or
  user reports show this actually happens in practice.
- **Keeping SoundTouchJS as a fallback/alternate engine** (Option 3 above).
- **Changing `setTempoRate()`/`audio.playbackRate`.** Confirmed unrelated to
  SoundTouch; not touched.
- **Changing `TRANSPOSE_SEMITONES_RANGE`/`PITCH_CENTS_RANGE`.** Existing
  value ranges are unchanged.

## Consequences

- `THIRD_PARTY_NOTICES.md` and `docs/governance/legal-compliance.md`'s
  license tables now list `signalsmith-stretch` (MIT) in place of
  `@soundtouchjs/*` (MPL-2.0) — a simpler license posture (no file-level
  copyleft obligation).
- A worklet-registration failure during manual transpose/pitch-cents use now
  permanently disables that feature for the affected `AudioContext`'s
  lifetime (session-long for monitor; until device reselection for capture),
  instead of recovering on the next slider change. This is a real, accepted
  behavioral regression from the prior engine, not a hidden one.
- **No automated verification of actual transpose audio quality exists or
  is possible from this environment** — `usePlayerAudioGraph.js` has no Web
  Audio-level tests (jsdom has no real Web Audio implementation), and
  "does it sound better" is inherently a listening judgment. The only
  automated coverage here is `combinedSemitones()`'s arithmetic and the
  existing composable-level tests exercising call sequencing/error paths.
- `docs/spec.md`'s item 6 should read "implemented, pending listening
  verification" rather than "done" until the user has actually evaluated it
  by ear.

## Manual verification checklist (for the user — not verifiable by the assistant)

1. `npm run dev`, load a track, and exercise the transpose slider (±12
   semitones) alone.
2. Exercise the fine pitch-cents slider (±50 cents) alone.
3. Use both together and confirm the combined result sounds like the sum
   (e.g. +2 semitones and +50 cents together, versus +2.5 semitones alone).
4. If an OBS/capture output device is configured, repeat 1–3 on that path.
5. Return both controls to their defaults and confirm a clean, audible
   crossfade back to the unprocessed (dry) signal.
6. Subjective comparison: does this sound at least as good as the prior
   SoundTouch-based transpose, for typical karaoke use (small transpose
   amounts, sustained vocal-heavy material)?

## References

- `docs/research/competitive-research.md` (歌回救星's dual pitch-engine
  packaging that originally prompted this investigation)
- [ADR 0009: Tiered audio processing runtime](0009-tiered-audio-processing-runtime.md)
  (unrelated feature; same "accept and document a limitation rather than
  build unverified complexity" reasoning style)
- `src/composables/player/usePlayerAudioGraph.js`,
  `src/composables/player/usePlayerAudioGraph.pitch.test.js`
