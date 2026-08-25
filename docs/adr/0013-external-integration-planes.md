# ADR 0013: External Integration Planes

## Status

Accepted for planning on 2026-08-23. OBS Browser Source remains the only current
public integration. No OBS WebSocket, VTube Studio, VMC/OSC, Shoost, or Spout2
adapter is implemented by this decision.

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

- create or update an explicitly selected Browser Source;
- manage visibility or a user-authored scene cue after confirmation; and
- observe scene, streaming, and recording state.

It does not silently redesign scenes or enable an unauthenticated OBS endpoint.
OBS WebSocket 5 is built into OBS 28 and newer and recommends password
authentication. The candidate client is `obs-websocket-js`, wrapped behind the
adapter port rather than exposed to application code.

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

Direct `Utawakui -> Spout2 -> compatible receiver/OBS` is deferred until users
demonstrate a workflow that Browser Source or transparent capture cannot satisfy.
Receiver compatibility, including any proposed effects compositor, must be proven
before naming it as supported. Spout2 is a Windows GPU shared-texture path that
requires a native helper/addon, alpha/color-space handling, device compatibility,
context-loss recovery, packaging review, and measured GPU cost. It cannot be
introduced as a small JavaScript transport change.

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
- OBS and VTube Studio are the first plausible adapters, but neither blocks core
  Lyrics or Overlay use.
- VBridger works through coexistence rather than competing tracking ownership.
- Shoost parallel composition and a separate future Spout2 plane remain possible;
  native packaging cost stays isolated and evidence-gated.
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
