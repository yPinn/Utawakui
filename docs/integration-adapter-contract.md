# Integration Adapter Contract

## Status and scope

Draft planning contract, 2026-08-23. It elaborates
[ADR 0013](adr/0013-external-integration-planes.md). No external adapter is
currently implemented; OBS Browser Source remains the only supported integration.

## Architectural boundary

Core product code knows canonical Utawakui events, command intents, projections,
and capability ids. It does not import OBS, VTube Studio, VMC, Spout, or Shoost
types. An adapter translates between exactly one external protocol and those
ports.

```text
Canonical event port  -> vendor adapter -> external application
External application  -> vendor adapter -> command intent port
Native frame surface  -> native adapter -> texture/video receiver
```

Presentation, automation, tracking, and native video remain separate trust and
performance planes even if one vendor participates in more than one.

## Canonical outbound events

The first event vocabulary should remain small and semantic:

- `playback.track.changed`;
- `playback.phase.changed`;
- `playback.position.discontinuity`;
- `queue.changed`;
- `lyrics.document.changed`;
- `lyrics.line.changed` or future `lyrics.segment.changed`;
- `output.instance.ready` / `output.instance.degraded`; and
- explicit session lifecycle events when that product concept exists.

An illustrative event envelope is:

```json
{
  "contractVersion": 1,
  "eventId": "evt_01J...",
  "type": "playback.track.changed",
  "bootId": "boot_01J...",
  "sourceEpoch": "epoch_01J...",
  "occurredAt": "2026-08-23T12:00:00.000Z",
  "payload": {
    "trackId": "track-id",
    "title": "Display title"
  }
}
```

Events contain the smallest display/control-safe payload. High-frequency clock
samples are not exposed as a generic event flood; an adapter requests a specific
clock capability or reacts to semantic boundaries.

## Inbound command intents

Initial intents are allowlisted product actions, not arbitrary function names:

```json
{
  "contractVersion": 1,
  "commandId": "cmd_01J...",
  "type": "player.pause",
  "requestedAt": "2026-08-23T12:00:00.000Z",
  "expectedSourceEpoch": "epoch_01J..."
}
```

Validation includes authenticated client identity, granted capability, schema,
rate, source readiness, expected epoch, and idempotency where applicable. Main
forwards a validated intent through preload/IPC to the existing renderer action.

Result stages are distinct:

- `rejected`: validation, capability, readiness, or epoch failed;
- `accepted`: authoritative renderer accepted the action;
- `applied`: a later canonical projection confirms the expected result; and
- `timed_out`: no confirmation arrived within a bounded interval.

Adapters must not report success merely because a WebSocket write completed.
Destructive or scene-changing actions require stronger capabilities and explicit
user configuration than read-only events.

## Authentication and capability model

- Loopback binding is not authentication.
- Each automation client or vendor adapter receives only the capabilities the user
  enabled, such as `events.playback.read`, `player.transport.write`,
  `obs.source.write`, or `vts.hotkey.write`.
- Secrets are main-owned and platform-protected where available.
- Tokens/passwords are redacted from diagnostics and excluded from exports.
- Reauthentication, revocation, expiry, and unavailable vendor APIs produce
  observed adapter states, not silent fallback to unauthenticated access.
- Rate limits apply per identity and command type.

The first release does not expose a general remote/LAN API. Any future LAN access
needs a separate threat model, TLS/pairing, origin policy, and user-facing network
scope.

## Adapter lifecycle

Each adapter implements an equivalent lifecycle:

- `configure(desiredConfig)`;
- `connect()` and negotiate/authenticate;
- `capabilities()`;
- `subscribe(canonicalEvents)`;
- `handleExternalEvent()` or `invoke()` as applicable;
- `health()`;
- `disconnect()`; and
- `destroy()` with complete timer/socket/listener cleanup.

Reconnect uses bounded exponential backoff with jitter. Disabled adapters have no
open socket, timer, discovery scan, loaded SDK, or startup-critical work. Changes
to credentials or endpoint advance an adapter configuration epoch so stale
responses cannot update current state.

## Presentation plane

- Existing Browser Source routes remain read-only canonical projections.
- Browser Source clients cannot issue player or queue commands.
- Optional renderer ready/error telemetry is diagnostic-only, bounded, and unable
  to affect desired or authoritative state.
- Workbench is identified only as a local inspection client; transport client
  count alone never claims OBS identity.

## OBS adapter profile

Candidate transport: OBS WebSocket 5 through a thin `obs-websocket-js` wrapper.

Initial read capabilities:

- OBS/obs-websocket versions and negotiated requests;
- current program scene;
- streaming/recording state; and
- explicitly subscribed scene/source events.

Initial write capabilities, each opt-in:

- create or update a named Browser Source selected by the user;
- update its Utawakui URL and dimensions;
- show/hide a mapped source; and
- invoke an explicitly configured scene cue.

The adapter does not enumerate and rewrite an entire scene collection, disable OBS
authentication, store credentials in `overlays.json`, or make OBS mandatory.

## VTube Studio adapter profile

Candidate transport: VTube Studio Public API through a thin `VTubeStudioJS`
wrapper and the existing `ws` implementation supplied explicitly in Node.

Initial read/event capabilities:

- API/session authentication state;
- loaded-model state; and
- selected documented events such as model or hotkey events.

Initial write capabilities, each opt-in:

- trigger a user-selected hotkey/expression;
- operate a user-selected compatible item; and
- send a low-frequency authored song/session cue.

Continuous `InjectParameterDataRequest`, model movement, bulk parameter polling,
and automatic item loading are outside the first adapter. They can conflict with
tracking, prompt unexpectedly, or create high-frequency cost. The adapter uses its
own plugin identity so VBridger and other plugins remain independent.

## VBridger and VMC profile

- No VBridger-specific connection is planned initially.
- Utawakui does not intercept or proxy VBridger's VTS traffic.
- VMC ports are configurable and disabled by default; common ports are never
  claimed automatically.
- A future VMC adapter is read-only and field-allowlisted first.
- Lyrics, queue, and track metadata are not encoded as invented VMC messages.
- Generic OSC cue mapping, if added, uses a separate namespace and contract.

## Shoost and native video profile

Default supported topology is parallel composition in OBS. No Shoost control API
is assumed.

A future Spout2 sender is an optional Windows native-video adapter with a named
surface and explicit pixel format, alpha mode, color space, resolution, and frame
rate. It must define:

- GPU-adapter compatibility and cross-GPU fallback;
- context/device-loss recovery;
- one producer per named surface and collision handling;
- bounded frame queue and drop policy;
- helper crash isolation and lifecycle cleanup;
- signed/packaged native binary inventory and license review; and
- measured cost alongside OBS, VTube Studio/VBridger, and any verified receiver.

It is enabled only after a prototype proves that Browser Source or a transparent
capture surface cannot satisfy the accepted user workflow.

## Testing and diagnostics

Every adapter requires contract fixtures and simulations for:

- vendor unavailable, slow hello, authentication denied/revoked, and version
  incompatibility;
- reconnect, duplicate/out-of-order responses, configuration epoch change, and
  shutdown during connection;
- capability denial and command rate limiting;
- renderer unavailable and accepted-versus-applied command results;
- log redaction and diagnostics export; and
- proof that a disabled adapter adds no open handle or startup import.

Real-software verification is still required after mocks: authenticated OBS,
VTube Studio with another plugin such as VBridger connected, parallel Shoost/OBS
composition, and a verified Spout2 receiver if the native adapter reaches its gate.

## Deferred decisions

- generic local automation API transport and user pairing UX;
- Stream Deck/Streamer.bot-specific packaging;
- LAN or remote control;
- MIDI mappings;
- NDI/Syphon native-video adapters;
- high-frequency VTS parameter or VMC tracking use; and
- native OBS plugin development.
