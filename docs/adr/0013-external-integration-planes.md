# ADR 0013: External Integration Planes

## Status

Accepted on 2026-08-23; amended on 2026-09-08 and 2026-09-24. OBS Browser Source
remains the supported presentation baseline. A main-owned, read-only OBS WebSocket
adapter now observes streaming／recording state and timestamps for local session
history; no scene／source write or transport control capability is exposed. Windows
x64 also has an explicitly started experimental Spout2 Lyrics sender; receiver,
alpha, GPU, recovery, and installed acceptance remain required before support.

## Context

Utawakui may coexist with OBS, VTube Studio, VBridger, Shoost, VMC-compatible
tracking tools, Streamer.bot-like automation, and future compositors. These tools
do not share one kind of integration:

- OBS Browser Source consumes a web presentation;
- OBS WebSocket and VTube Studio expose authenticated control/event APIs;
- VBridger transports tracking through VTube Studio or VMC;
- Shoost captures windows or media and applies visual composition/effects; and
- VMC carries motion and avatar-related OSC messages.

Putting all of these behind the existing read-only Output WebSocket would mix
display data, privileged commands, tracking, credentials, and native GPU transport
into one trust boundary. Vendor payloads would also leak into core product state.

## Decision

### Use Ports and Adapters around canonical product semantics

The core exposes vendor-neutral outbound events and inbound command intents.
Vendor adapters translate only at the edge:

```text
renderer authoritative state -> Projection Hub -> canonical events -> adapters
external request -> adapter -> authenticated intent gateway -> renderer action
```

Examples of core events are `playback.track.changed`,
`playback.phase.changed`, `lyrics.line.changed`, `queue.changed`, and
`output.instance.ready`. Examples of intents are `player.play`, `player.pause`,
`player.next`, and an allowlisted Output Instance action.

Main validates authentication, capability, schema, rate, and current readiness,
then forwards an intent to the authoritative renderer action. “Accepted” means
the renderer accepted the intent; “applied” is reported only after an observed
projection confirms the requested state. Commands are never executed directly by
vendor adapters and are never silently queued while the renderer is unavailable.

### Separate four integration planes

1. **Presentation plane:** read-only HTTP/WebSocket content for Browser Sources.
2. **Automation plane:** authenticated commands, responses, and low-frequency
   events with per-client capabilities.
3. **Tracking plane:** optional VMC/OSC or vendor tracking observation; it does not
   carry lyrics documents or become playback state.
4. **Native video plane:** optional platform-specific alpha video/texture transport
   such as Spout2, isolated behind a helper or adapter process.

The presentation channel remains server-to-client state only. Automation uses a
separate namespace, authentication, schema, rate limits, and audit diagnostics.
Native visual transport is neither an HTTP route nor a command protocol.

### Keep vendor connections main-owned and lazy

Each adapter is a main-process service with explicit desired and observed state:
disabled, disconnected, connecting, authenticating, ready, degraded, or error.
It loads its SDK only when enabled, reconnects with bounded backoff, reports
capabilities, and cannot delay the interactive app shell or Output listener.

Secrets such as an OBS WebSocket password or VTube Studio plugin token are stored
using the platform-backed secure-storage boundary where available. They never
enter portable presets, Presentation Packs, renderer state, diagnostics export,
or Browser Source URLs.

### Keep OBS Browser Source as the baseline

Utawakui continues to send visual output to OBS through stable Browser Source
URLs. OBS WebSocket is an optional first-party automation adapter, not a
requirement for normal overlays. It may:

- observe OBS／obs-websocket versions and negotiated RPC version;
- observe streaming and recording state; and
- request a fresh stream／record timecode when a track or manual marker boundary
  needs to be recorded.

The adopted first slice is read-only. Scene enumeration, Browser Source creation／
update, visibility changes, scene cues, and player transport remain deferred
write capabilities that require separate capability and applied-state contracts.
The adapter never disables OBS authentication. `obs-websocket-js` is lazy-loaded
behind the main-owned port; its password is stored only through Electron
`safeStorage`, never in config, presets, renderer state, diagnostics, or URLs.
Track changes reuse the canonical Output projection, but their timestamp history
is a private local file rather than a new public projection stream.

### Add VTube Studio as a low-frequency cue/event adapter

The VTube Studio public API is an authenticated local WebSocket plugin API. The
first adapter scope is low-frequency hotkeys, items, expressions/cues, model
status, and subscribed events. Continuous tracking-parameter injection is off by
default because it can override active tracking values and conflict with
VBridger.

The candidate client is `VTubeStudioJS`, wrapped behind the same lifecycle and
capability contract. User approval and revocation remain visible VTube Studio
actions; Utawakui does not bypass them.

### Coexist with VBridger instead of integrating directly

VBridger already sends tracking to VTube Studio through its API or to compatible
apps through VMC. Utawakui therefore does not need a VBridger-specific adapter in
the first delivery. It uses a separate VTube Studio plugin identity, avoids
continuous ownership of tracking parameters, and does not occupy VMC's common
ports by default.

If a later use case needs a tracking signal, it is implemented as a narrow
read-only VTS/VMC observer, not a relay of full pose state through the Overlay
contract.

### Treat Shoost as visual composition, not a control API

The common baseline composition is parallel:

```text
VTube Studio / VBridger -> Shoost -> OBS
Utawakui Browser Source ----------> OBS
```

OBS remains the final compositor. This requires no direct Shoost integration and
lets users independently position karaoke UI and processed avatar video.

The accepted experimental workflow is receiver-neutral:

```text
Utawakui -> Spout2 -> compatible receiver/filter -> downstream compositor
```

Utawakui publishes one fixed, session-only `Utawakui.Lyrics` surface through an
isolated Electron helper. Main owns the gate, derived route, fixed configuration
and lifecycle; renderer intent is limited to 30／60 FPS, start and stop. Helper
failure cannot stop Browser Source, and ready state never claims receiver state.

Promotion requires real receiver verification of premultiplied alpha, sRGB SDR,
same/cross-GPU behavior, restart and device-loss recovery, installed cleanup and
measured cost. The native dependency remains pinned and unpacked for review.

### Keep VMC/OSC optional and semantically narrow

VMC is OSC/UDP for avatar motion, blendshapes, camera, light, and related signals.
It is not the canonical lyrics or playback protocol. A later adapter may observe
a bounded subset or expose a generic low-frequency OSC mapping, with configurable
ports and no automatic use of common VMC ports. Full pose forwarding is outside
Utawakui's karaoke scope.

The evolving port, lifecycle, event, and command contract lives in
[`docs/contracts/integration-adapter-contract.md`](../contracts/integration-adapter-contract.md).

## Rejected options

- **Reuse `/ws` for commands.** It would turn a safe presentation channel into a
  privileged local control surface.
- **Create one universal vendor payload.** OBS scenes, VTS hotkeys, VMC bones, and
  Spout textures have incompatible semantics and security needs.
- **Integrate directly with VBridger first.** VTS/VMC are its documented output
  boundaries and provide a more stable coexistence point.
- **Route every overlay through Shoost.** Parallel OBS composition is simpler and
  preserves independent placement and performance control.
- **Inject VTube Studio tracking continuously.** It risks taking ownership away
  from VBridger or another tracker.
- **Load all adapters at app startup.** Disabled integrations must have no startup
  or steady-state cost.
- **Develop an OBS native plugin now.** Browser Source plus optional OBS WebSocket
  covers the immediate presentation and automation needs.

## Consequences

- External integrations can expand without changing canonical playback/lyrics
  contracts.
- Automation requires explicit authentication, capability, and command-result
  semantics in addition to the existing feature gate.
- The read-only OBS adapter is optional and does not block core Lyrics or Overlay
  use; write-capable OBS and VTube Studio integrations remain deferred.
- VBridger works through coexistence rather than competing tracking ownership.
- Shoost parallel composition remains supported through OBS; the experimental
  Spout2 plane is isolated and evidence-gated until real receiver acceptance.
- SDK adoption is thin and replaceable; vendor types never cross the adapter
  boundary.

## References

- [Integration adapter contract](../contracts/integration-adapter-contract.md)
- [ADR 0012: State Convergence and Startup Phases](0012-state-convergence-and-startup-phases.md)
- [OBS Browser Source](https://obsproject.com/kb/browser-source)
- [OBS remote control guide](https://obsproject.com/kb/remote-control-guide)
- [obs-websocket 5 protocol](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md)
- [obs-websocket-js](https://github.com/obs-websocket-community-projects/obs-websocket-js)
- [VTube Studio public API](https://github.com/DenchiSoft/VTubeStudio)
- [VTubeStudioJS](https://github.com/Hawkbat/VTubeStudioJS)
- [VBridger](https://store.steampowered.com/app/1898830/VBridger/)
- [VMC Protocol](https://protocol.vmc.info/english.html)
- [Shoost features](https://www.patreon.com/MuRo_CG/posts/introducing-62585593)
- [Spout2](https://github.com/leadedge/Spout2)
