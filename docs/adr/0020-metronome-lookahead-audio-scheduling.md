# ADR 0020: Metronome click track — lookahead scheduling, synthesized audio, own AudioContext

## Status

Proposed (2026-09-15). Code and unit-test coverage for the parts that can be
automated are implemented; **audible timing accuracy and click quality are
not automatable and have not been verified by the assistant** — see
Consequences. Whether this ships as-is depends on the user actually
listening to it against a real external metronome.

## Context

The existing metronome (`src/composables/useMetronome.js`) was visual-only:
a `pulseId` counter and beat dots, driven by a recursive
`setTimeout(scheduleNextBeat, intervalMs)` loop. Each beat's time was derived
from when the previous `setTimeout` callback actually fired, not from a
fixed absolute anchor — `setTimeout` only guarantees a minimum delay, so
main-thread jitter compounds across beats with no self-correction. This was
tolerable while the only consequence was a slightly-late flash of a beat dot.

The user's stated need changes that: a performer playing manual accompaniment
(no backing track, no `<audio>` element necessarily loaded) wants to listen
to the metronome for tempo reference, with the conventional two-sound
pattern (an accented downbeat, a plain sound for the other beats). A click
track the listener can feel drift against a real metronome over a few
minutes defeats the purpose.

Before touching the metronome, every other timing/scheduling point in the
app was swept for the same class of bug (recursive-timer drift): player
position (native `<audio>` `currentTime`, hardware-clock-backed), Output
snapshot display-delay scheduling (`overlay/shared/runtime.mjs`), and the
performer-window lyrics-boundary timer (`usePerformerViewState.js`) all
already anchor to an absolute source timestamp and recompute fresh each
time — the correct pattern. The metronome was the one outlier still using
relative re-scheduling.

## Decision

### Lookahead scheduling, not a recursive timer

Replace the recursive `setTimeout` with the standard Web Audio "lookahead
scheduler" pattern (Chris Wilson, ["A Tale of Two
Clocks"](https://web.dev/articles/audio-scheduling)): a coarse `setInterval`
poll (25ms) that never triggers sound itself. Each tick asks a pure function,
`collectDueBeats()` in the new `src/utils/metronomeSchedule.js`,
which beats now fall inside a 100ms lookahead window, and hands each one's
**absolute** time to the audio clock. The schedule advances by addition
(`nextBeatTime += beatIntervalSeconds(bpm)`) from the last anchored beat, so
the poll timer's own jitter can never compound — a beat's scheduled time
depends only on arithmetic from where the schedule started, never on when a
callback happened to run.

The pure module also decides `isAccentBeat()` (fixed at beat 1 — the user
confirmed this rather than a configurable accent position, matching the
existing visual `--downbeat` styling in `PlayerToolsPanel.vue` that already
special-cases `beat === 1`) and a resync threshold: if the schedule is ever
found more than 1 second behind "now" (tab backgrounded, context stalled),
it snaps forward to now instead of firing a backlog of catch-up clicks.

Visual beat advancement is decoupled from audio scheduling: beats that have
been handed to the audio clock sit in a small pending queue until their own
time has actually arrived, so the beat dots never flash ahead of the sound
the performer hears. No `requestAnimationFrame` was introduced for this —
the existing 25ms poll tick does double duty, which also keeps the whole
scheduler fake-timer-testable (see Consequences).

### Independent AudioContext, not wired into the player's audio graph

The click engine (`src/utils/metronomeClickEngine.js`) owns
its own `AudioContext`, connected straight to `audioCtx.destination`. It is
deliberately **not** connected anywhere inside
`src/composables/player/usePlayerAudioGraph.js`. Reasons:

1. **Must work with no track loaded.** Manual accompaniment is the primary
   use case; the player's graph and `<audio>` element may not be in a
   playing state at all.
2. **Structural leak-proofing.** The app's capture/OBS output forks off
   `mergerInst`/`mergerVoc`/`sourceNode` — all upstream of `masterGain`
   (`usePlayerAudioGraph.js:64-71`). Never touching any of those nodes means
   a metronome click cannot reach the app's own capture (`sinkId`) output by
   construction, not by a runtime check. (This does not cover OBS capturing
   desktop audio directly instead of the app's dedicated capture output —
   that path is outside this app's control either way.)
3. **No inherited processing.** `masterGain` feeds the pitch-shift wet path;
   a click routed through it would be transposed along with the song, and
   would follow the player's volume/mute state — neither is metronome
   behavior.
4. **No disturbance to existing test assertions.** `usePlayer.test.js`
   asserts against `context.createdGains[2]`/`[3]` by creation-order index to
   check the dry/wet crossfade. Adding a node inside
   `usePlayerAudioGraph()`'s factory would shift those indices for no
   benefit.

The context is created lazily, on first real use (`start()` or enabling
sound), never at module load — the renderer test environment is
`environment: 'node'` (`vite.config.js`), which has no `AudioContext`, and a
module-scope construction would break every test importing the module via
`vi.resetModules()` + dynamic `import()`, the existing pattern
`useMetronome.test.js` relies on for its module-scope singleton state.

### Synthesized clicks, not a bundled sample

Both click sounds are `OscillatorNode` tones with a short `GainNode` decay
envelope (higher frequency for the accent, lower for the regular beat), not
a shipped audio file. `docs/governance/legal-compliance.md` §8.4 and §11
explicitly call out that any future bundled "sample media" needs per-asset
license/source/checksum documentation, the same treatment already given to
`shared/assets/fonts/*.ttf` (a `SOURCE-*.txt` per font: upstream URL,
download URL, SHA-256, full license text) plus a `THIRD_PARTY_NOTICES.md`
row and a §11 release-checklist judgment call. A synthesized tone needs none
of that — zero new governance surface for a feature this small.

### `soundEnabled` defaults to off

The metronome's audio is opt-in per session (`state.soundEnabled`, off by
default, toggled from the existing "演出" tab header row). The visual-only
behavior that existed before this change remains the default; sound is
additive.

## Rejected alternatives

- **Routing the click through `usePlayerAudioGraph`'s `masterGain`.**
  Rejected — see reasons 2–4 above.
- **A second recursive `setTimeout`/`setInterval` that directly triggers
  `AudioBufferSourceNode.start()` at fire time**, without the lookahead
  window. Rejected — this is exactly the bug being fixed; triggering
  `.start()` from inside a jittery callback still bakes the callback's own
  timing error into the audible click, even if the beat _counting_ logic is
  otherwise correct.
- **`requestAnimationFrame`-driven visual updates.** Rejected for this
  round — `environment: 'node'` in `vite.config.js` has no `rAF`, and the
  25ms poll tick already gives comparable visual responsiveness while
  keeping the whole scheduler unit-testable under fake timers.
- **Syncing metronome BPM to the analyzed music-structure BPM**
  (`docs/contracts/music-analysis-contract.md`). Out of scope for this
  round. The contract imposes real constraints a future sync feature would
  need to satisfy: a confidence gate of 0.5, a beat-grid consecutiveness
  check before any downbeat-phase claim, a ban on silently
  halving/doubling a detected BPM, and a hard rule that "changing player
  tempo does not rewrite analyzed source BPM" — the metronome's user-set BPM
  must stay a distinct, unpersisted value, never written back into the
  analyzer document.
- **Persisting `soundEnabled`/volume across app restarts.** Out of scope for
  this round, left as a follow-up; BPM/beats-per-bar already don't persist
  today (`reset()` always restores 120/4), so adding persistence for sound
  alone was judged premature without the user asking for it.
- **A volume control for the click.** Out of scope for this round; fixed at
  one level in `metronomeClickEngine.js`.

## Consequences

- `scripts/coveragePolicy.js` excludes
  `src/utils/metronomeClickEngine.js` as
  `untestable-web-audio` — the same posture as ADR 0019 for
  `usePlayerAudioGraph.js`'s Web-Audio-level code. All decision logic (which
  beat fires when, accent vs. regular) lives in the fully-tested pure module
  `metronomeSchedule.js` instead, including a 1000-beat regression test
  asserting the schedule's anchor time does not erode.
- `useMetronome()` gains `state.soundEnabled`, `setSoundEnabled()`, and
  `toggleSound()`. Existing consumers (`PlayerToolsPanel.vue`,
  `PlayerBar.vue`) are unaffected since these are additive.
- Fixed a latent bug in the same change: the old `setBpm()` called
  `scheduleNextBeat()` unconditionally, which restarted the timer from "now"
  — adjusting BPM while running discarded whatever remained of the current
  beat's interval. The new scheduler reads `state.bpm` fresh every tick and
  continues from the already-anchored `nextBeatTime`, so a BPM change takes
  effect starting at the next unscheduled beat without cutting off the
  current one.
- **No automated verification of actual audible timing accuracy or click
  tone quality exists or is possible from this environment** — `jsdom`/Node
  has no real Web Audio implementation, and "does this stay locked to an
  external metronome for several minutes" and "do the two clicks sound
  distinct and pleasant" are listening judgments. See the checklist below.

## Manual verification checklist (for the user — not verifiable by the assistant)

1. `npm run dev`, open 演出工具 → 演出, turn the sound toggle on.
2. Confirm beat 1's click is audibly distinct (accent) from beats 2–4.
3. **Run continuously for 2–3 minutes against an independent metronome**
   (a phone app is enough) and confirm no audible drift — this is the actual
   point of this change.
4. Adjust BPM while running; confirm no glitch/skipped beat and no restart
   of the current beat's timing.
5. Confirm the metronome produces sound with no track loaded at all.
6. If an OBS/capture output device is selected in Settings, confirm the
   click is **not** present in that captured output.

## References

- [ADR 0019: Signalsmith Stretch replaces SoundTouchJS](0019-signalsmith-stretch-pitch-transpose.md)
  (same "Web Audio quality/timing can't be automated, document and ask the
  user to listen" posture)
- [Music Analysis Contract](../contracts/music-analysis-contract.md)
  (constraints a future BPM-sync feature would need to satisfy)
- `docs/governance/legal-compliance.md` §8.4, §11 (bundled-sample-media
  governance burden that synthesis avoids)
- `src/utils/metronomeSchedule.js`,
  `src/utils/metronomeClickEngine.js`,
  `src/composables/useMetronome.js`
