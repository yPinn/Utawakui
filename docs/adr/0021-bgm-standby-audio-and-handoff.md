# ADR 0021: BGM standby audio owner and cancellable performance handoff

## Status

Accepted; first monitor slice implemented (2026-10-02), with inactive preflight audition clarified on 2026-10-03. The implementation covers one persisted local-library BGM source, a single looping monitor deck, a logical BGM gain bus, OBS-derived session projection, cancellable handoff, and one shell-owned standalone BGM player. OBS capture routing, confirmed-performance history commit, and audible timeline acceptance remain follow-up gates.

## Context

Utawakui already has one renderer-owned performance player. `usePlayer.js` owns its HTML audio element and playback events, while `usePlayerAudioGraph.js` owns accompaniment／guide-vocal routing, monitor output, optional capture output, pitch processing, and graph teardown. PlayerBar, Queue, Lyrics, Output, SMTC, taskbar controls, playback history, and resume all consume that single owner.

The BGM standby lane serves a different workflow: during an OBS live or recording session it can fill breaks while the operator speaks, rests, or finds the next song. It must continue looping for an unbounded break, but it must never overlap a performance track. BGM may fade itself; the boundary between BGM and a performance track must be BGM-at-zero, a complete silence window, and only then performance playback. The reverse direction must preserve a complete post-roll before BGM returns.

Putting a second source inside `usePlayer`, switching PlayerBar semantics by mode, or reusing playback Queue would couple unrelated clocks, history, media-session commands, and navigation. Starting a second audio element without a shared coordinator would also leave every existing `playTrack()` caller able to bypass mutual exclusion.

The BGM contract additionally requires restart-safe scalar preparation but no restart-safe audible intent. The selected source and its position may return after restart; an armed or playing state may not.

## Decision

### Separate owners, one logical arbitration boundary

Keep the existing performance player unchanged as the timing authority for performance audio. Add three focused BGM owners:

1. A main-owned BGM plan store persists one bounded track id, position, volume, mute, fade, Dim, pre-roll, and post-roll settings. Loop is a fixed deck contract, not a renderer setting. Main derives library metadata and availability; one atomic `set-track` intent replaces the source and resets its position. Legacy multi-track documents collapse to their selected id, or their first valid id. Renderer never sends paths, media URLs, copied metadata, or arbitrary IPC channels.
2. A renderer BGM audio deck owns one HTML audio element plus a lazy Web Audio graph. The element owns source timing and play／pause／playing／ended／error state. A dedicated GainNode is the logical BGM bus and owns mute, master volume, Talk attenuation, fade, and Emergency Cut. Base BGM volume defaults to `0.25`; Talk starts disabled on each complete app launch and, when enabled, applies `-12 dB` relative attenuation to the latest effective target. It remains a manual operator control and does not imply microphone detection.
3. A renderer handoff coordinator owns only cross-lane intent, transition generation, and silence deadlines. It does not own either element's playback clock, BGM source selection, Queue navigation, public projection, or session history.

`useBgmSession.js` is the module-scope composition facade. It resolves the persisted track id through `useLibrary`, projects OBS session mode through `useObsIntegration`, connects the BGM deck and coordinator, and exposes readonly state plus explicit actions to the UI.

### Every performance start receives one pre-start hook

Add a single registered pre-start hook inside `usePlayer`. Both new-source `playTrack()` requests and existing-source `play()`／toggle resumes must pass it before the performance audio element can start. Setlist, Lyrics, Queue, recent-history, PlayerBar, keyboard and Windows media commands therefore share one boundary instead of coordinating BGM in individual callers.

For a new track, the current performance is paused immediately; the hook then runs before the new `state.track`, `audio.src`, or Output identity is installed. Whenever BGM may still be audible or requested, the BGM coordinator:

1. invalidates the previous transition generation;
2. snapshots any future restore as a separate deferred intent, clears the current BGM request, and resets the BGM primary control to disabled Play;
3. fades or cuts the BGM bus to exact zero;
4. pauses the BGM deck and confirms the deck is no longer active;
5. waits the complete monotonic pre-roll deadline;
6. returns permission to the still-current performance-start request.

When no BGM handoff is needed, the hook returns immediately in every session mode and adds neither fade nor pre-roll to ordinary playback. Explicit inactive audition uses the same stop／silence／restore path as a live session, so offline verification cannot create two audible lanes. `usePlayer` keeps one start-request generation across new tracks and resumes, so a newer start makes an older delayed hook or `play()` promise a no-op. A normal resume with no BGM intent returns immediately; if the operator explicitly started BGM while the performance was paused／ended／restored, resume must first stop BGM and complete the configured pre-roll. A confirmed performance pause never starts BGM automatically, but it releases the performance lane and restores the operator's manual BGM Play action. Buffering, seeking, and stalled remain locked because they may recover without another operator action.

The performance player's confirmed `playing`, explicit `pause`, `ended`, and terminal-stop events are exposed as subscriptions. Confirmed playing moves the coordinator to `track-active`; explicit pause moves it to `track-paused` without consuming the deferred restore intent. Ended or explicit stop after confirmed playing starts a cancellable post-roll and may restore BGM only when the separate deferred restore intent still allows it. Playback failure before confirmed playing skips post-roll and restores that deferred request directly; buffering, seeking, and stalled events remain non-terminal and do not unlock BGM. The current `bgmRequested` projection is false throughout performance handoff／active／post-roll, so latent restore state cannot leave the transport showing Pause or cancel the performance timer when operated again.

### Exact-zero fade gate

BGM fade uses linear AudioParam ramps with an explicit terminal `setValueAtTime(0, endTime)`. The deck resolves fade-out only after the AudioContext deadline, then reasserts zero and pauses the media element. Emergency Cut cancels scheduled automation, sets zero synchronously, and pauses.

Timer delay may lengthen a silence window but may never shorten it. The coordinator compares a monotonic deadline after every wait. A newer performance request or confirmed session exit increments the relevant generation; old fade, timer, and play promises may only settle as cancelled and must not start either lane. BGM control and source actions cannot cancel a performance handoff that has already obtained lane priority. Emergency Cut may make the BGM stop immediate, but the full pre-roll still applies.

The v2 defaults are a `0.6s` BGM fade-out followed by a complete `0.75s` pre-roll, and a `1.0s` post-roll followed by a `1.0s` BGM fade-in. These are sequential windows, not a crossfade. Persisted v1 data migrates to the new tuple only when all four values still equal the old defaults; customized timing survives the version upgrade.

The deck starts from bus gain zero, waits for the audio element's confirmed `playing` event, then fades to the effective target. Effective target is `0` when muted, otherwise `master volume × Dim attenuation`. Changing volume while Dim is active updates the current target; releasing Dim returns to the latest master volume rather than a stale snapshot.

A terminal BGM media error invalidates the deck transition, cancels gain automation, reasserts exact zero, and pauses the element before exposing a bounded error. The controller then clears the requested／audible BGM projection; an unexpected terminal end enters manual hold even though the deck is configured to loop. Late BGM terminal events cannot replace an active performance projection.

### Session projection and confirmed exit

Session mode is derived in this priority: `live > record > inactive`. A previously confirmed active session may latch `reconnecting` when OBS lifecycle stops being ready. App startup while status is unknown or disconnected cannot create that latch.

Inactive mode permits explicit monitor preflight through the real deck and handoff coordinator. Entering live or record changes the status projection and keeps the compact controls visible, but does not start either lane. Live↔record changes do not rebuild the deck or cancel audio. Confirmed exit cancels pending transitions and fades BGM out; it does not stop a performance track already owned by the existing player. Repeated inactive status refreshes are not session exits and do not interrupt an explicit offline audition.

### First-slice routing

The first slice routes BGM only to the system-default monitor destination. It does not modify the existing performance capture graph and does not claim that BGM reaches an app-selected OBS capture device. Operators who capture desktop audio may hear it through that external configuration, but Utawakui does not treat that as verified app-owned routing.

This is deliberate staging, not the permanent routing decision. A later ADR amendment must select and verify `shared-capture` or `separate-bgm-capture`, including sink loss, monitor／capture gain equality, OBS ducking, and recording-track behavior. The UI must not describe monitor-only playback as an independent OBS track.

### UI placement

One shell-owned `BgmPlayer.vue` owns BGM identity, transport, error states, progress, volume, and a local-library source picker. It follows a desktop MiniPlayer model: a compact 18–22rem horizontal photo-object keeps artwork, current-source identity, progress, volume, and fixed transport slots visible while the operator works elsewhere. Short icon badges add session and handoff state without replacing the transport; controls unavailable in a phase remain mounted and disabled. Track identity is single-line truncated, session／phase／deferred-restore／time slots have stable dimensions, and Play／Pause share one primary action node. Errors reuse the phase slot with a short visible badge plus a complete tooltip／accessible name instead of inserting a notice that changes card geometry. The bounded player expands from a dedicated Titlebar BGM disclosure and exposes the same transport before and during a session. A confirmed live／record session keeps its compact form visible automatically; inactive audition, handoff, deferred restore, and error states also keep a compact form visible when the picker is closed so audio never becomes hidden. Pause appears only while BGM owns the current transport. Performance handoff resets the primary control to disabled Play and exposes deferred restore as a short status badge instead of a false playing state; explicit performance pause uses the reserved phase slot for `track-paused` and re-enables that same Play node. The player starts in the right-side workspace safe boundary but is neither the performance-session panel nor a shared Right Dock surface. The boundary uses the same Shell panel inset at its block-start and block-end while keeping inline Dock avoidance separate. As a photo-object-like surface it can be moved within that boundary and pinned in place; pinning changes only movement, never playback or disclosure. BGM and Right Dock presentation states are independent: opening either one never closes or folds the other, and the shell boundary prevents overlap. Session UI supplies only mode and handoff signals; it does not own BGM entry, source, actions, copy, or visual shell.

PlayerBar, keyboard Space, media keys, SMTC, taskbar thumbar, public Output, Recently Played, and performance Queue continue to refer only to the performance player.

## Rejected alternatives

- **Add BGM fields and a second audio element to `usePlayer`.** Rejected because it gives one facade two clocks, two histories, and mode-dependent semantics, while existing consumers assume one performance track.
- **Reuse playback Queue or create a BGM queue.** Rejected because Queue owns membership, ordering, automatic next／previous, and interruption semantics. BGM is one continuously looping source; changing it is an atomic replacement and must not mutate Queue or previous-stack state.
- **Let every UI caller coordinate BGM before starting performance audio.** Rejected because any missed new-track or resume caller can create audible overlap, and future callers would inherit a hidden safety obligation.
- **Place BGM controls in PlayerBar or the shared Right Dock surface stack.** Rejected because PlayerBar must retain one transport meaning and the live safety controls must remain visible when the Dock changes surface or folds.
- **Use CSS or renderer timers to simulate fade state.** Rejected because visual completion is not proof that the AudioParam reached zero; exact bus state gates the performance start.
- **Implement an A／B deck now.** Rejected because the first product need is safe standby playback. The logical bus and coordinator contracts leave deck count internal so an A／B implementation can be added later without weakening cross-lane mutual exclusion.
- **Silently reuse the existing capture sink in this slice.** Rejected until monitor／capture routing, failure behavior, and default profile receive explicit product acceptance and real OBS verification.

## Consequences

- Pure coordinator tests cover every state transition, monotonic silence deadline, manual hold, and stale generation before Web Audio integration is trusted.
- The persisted BGM document is library-local and scalar-only. Library deletion removes its BGM references without affecting performance-session authored labels.
- `usePlayer` gains a narrow pre-start registration plus confirmed-playing／ended／terminal-stop subscriptions. It remains the sole owner of performance audio state and does not import BGM modules.
- BGM playback is intentionally excluded from playback history, usage LRU, Queue, resume snapshot, Output projection, and Windows media integration.
- Restart restores the selected source, settings, and position only, keeps the deck paused, and returns Talk to disabled without starting audio.
- Automated tests can prove state, IPC boundaries, and scheduled gain calls, but cannot prove click／pop quality, real acoustic silence, or capture routing. Those remain explicit manual acceptance items.
- The first slice is not production-complete for app-owned OBS capture. Its monitor-only limitation must remain visible in status copy and documentation until the routing amendment ships.

## Manual verification checklist

1. Open the dedicated BGM entry before a session and confirm the expanded standalone player exposes the real transport and labels the result as monitor preflight, not verified OBS capture. Move and pin the player, then confirm pinning only locks its position. Connect OBS, begin recording or streaming, and confirm the compact player remains visible without starting audio. Confirm LIVE takes precedence when live and record are both active.
2. Select a local-library track, replace it with another, and confirm there is never more than one persisted BGM source. While inactive, confirm base volume starts at 25% and Talk starts disabled; then explicitly press play and verify fixed loop, progress seeking, volume, mute, Talk attenuation, pause, and Emergency Cut affect only BGM. Close the picker while playing and confirm the compact controls remain visible. Toggle idle／playing／deferred-restore／error projections and confirm the player bounds and neighboring control positions remain stable.
3. Start a performance track. Confirm the BGM button immediately resets from Pause to disabled Play while status continues to identify the fading BGM lane; after the deck actually pauses, confirm the status changes to silence, stays silent for the configured pre-roll, and only then the performance track starts. Confirm a repeated BGM control action cannot cancel that start. Listen specifically for residual tail and click／pop.
4. Pause and seek the performance track; confirm BGM does not return automatically. While paused, explicitly start BGM, then resume through PlayerBar／Space and confirm BGM fades to pause before pre-roll and performance playback. Repeat without BGM and confirm ordinary resume has no added wait.
5. Let the performance track end; confirm the complete post-roll remains silent before BGM starts from zero and fades in.
6. Trigger several BGM play／pause, source-replacement, and performance-start actions quickly; confirm no stale action starts late and no two lanes are audible together.
7. Hide and restore the main window; confirm active transport continues. Fully restart the app; confirm the selected source and settings return but audio does not start.
8. Confirm PlayerBar, Space, media keys, SMTC, taskbar controls, Recently Played, Queue, Now Playing, and session chapters never identify or control BGM.
9. Treat OBS capture as unverified in this slice. Do not approve release routing until the selected capture profile is tested in an actual recording.

## References

- [BGM standby lane contract](../contracts/bgm-standby-lane.md)
- [Performance session preparation contract](../contracts/performance-session-preparation.md)
- [Architecture map](../architecture.md)
- `src/composables/usePlayer.js`
- `src/composables/player/usePlayerAudioGraph.js`
