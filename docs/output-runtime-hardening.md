# Output Runtime Hardening Contract

## Status and scope

Draft planning contract, 2026-08-23. It turns
[ADR 0012](adr/0012-state-convergence-and-startup-phases.md) into checkable
requirements. It does not describe current completed behavior and does not start
the Lyrics T2 implementation.

## Authority and ownership

- The renderer audio element remains authoritative for playback state and timing.
- Renderer queue and selected-track lyrics remain their existing authoritative
  sources.
- Main owns service lifecycle, projection validation/cache, Output clients,
  Presentation Pack resolution, external connections, and diagnostics.
- Main never reconstructs playback state from vendor events or persisted live
  snapshots.
- One main-owned reconciler applies persisted desired service/adapter state.
  Renderer sends intents and observes results; it does not run a competing
  auto-start loop.

## Projection envelope

The exact executable schema will be added with implementation. A planning example
is:

```json
{
  "contractVersion": 3,
  "stream": "playback.clock",
  "bootId": "boot_01J...",
  "sourceEpoch": "epoch_01J...",
  "revision": 42,
  "generatedAt": "2026-08-23T12:00:00.000Z",
  "payload": {
    "phase": "playing",
    "positionMs": 12500,
    "rate": 1
  }
}
```

Invariants:

- `bootId` changes for every main-process lifetime.
- `sourceEpoch` changes when local interpolation continuity becomes invalid.
- Revisions increase independently per `bootId`, `sourceEpoch`, and stream.
- A delta or clock correction cannot initialize an unknown epoch.
- Main validates every renderer projection again before caching or broadcasting.
- An unknown contract version fails closed without overwriting newer state.
- Payloads contain canonical ids and scalar display data, never absolute paths,
  credentials, or vendor-native objects.

## Projection streams

The target model separates at least:

| Stream               | Character                    | Delivery                     |
| -------------------- | ---------------------------- | ---------------------------- |
| Playback clock       | Small and replaceable        | Latest-wins correction       |
| Playback/track state | Discrete snapshot/event      | On semantic change           |
| Lyrics document      | Immutable, potentially large | Connect/source revision      |
| Queue projection     | Ordered bounded content      | On queue revision            |
| Output configuration | Desired/effective settings   | On config revision           |
| Runtime health       | Diagnostic facets            | On transition/slow heartbeat |

One transport may carry multiple stream types, but their revision and backpressure
semantics stay independent.

## Runtime state facets

### Service lifecycle

`stopped -> starting -> listening -> stopping -> stopped`, with `error` reachable
from an operation. `listening` only means the loopback socket accepts requests.

### Source synchronization

`unavailable -> syncing -> ready`, with `stale` when the renderer disconnects or
an epoch cannot be completed. Only a validated full handshake enters `ready`.

### Content readiness

Each referenced lyrics document, template runtime, pack version, and asset set is
`unknown`, `resolving`, `ready`, `fallback`, or `error`. Fallback records the
effective version and reason.

### Output Instance observation

Each instance separately records configured template/version, connected transport
clients, optional renderer-ready/error telemetry, last delivered state revision,
and last rendered/diagnostic timestamp. None of these fields claims the client is
OBS unless an OBS adapter independently proves that identity.

### Adapter lifecycle

Each external adapter is `disabled`, `disconnected`, `connecting`,
`authenticating`, `ready`, `degraded`, or `error` and reports negotiated
capabilities separately.

## Startup phase requirements

### Phase A: synchronous bootstrap

Allowed work:

- app name, log path, single-instance lock, privileged scheme registration;
- minimal config parse and safe defaults;
- security/permission policy;
- diagnostics session and boot id; and
- registration required to load the shell safely.

Disallowed work:

- full library enumeration;
- provider/model/font/pack discovery;
- network update checks;
- loading optional SDKs or render engines; and
- reading every asset in an Output pack.

### Phase B: interactive shell

- Create the BrowserWindow without awaiting optional services.
- Use a stable background/skeleton so data hydration does not flash or reflow.
- Load the current route eagerly only when it belongs to the persistent shell;
  other views use lazy chunks.
- Record window-created, DOM-loaded, first-paint, and interactive milestones.

### Phase C: core convergence

- Output listener may start concurrently when desired and feature-gated.
- Before source handshake, Browser Sources receive a valid unavailable projection
  and render nothing stale.
- Load only the active Output configuration and active pack index required to
  resolve current instances.
- Renderer publishes one complete initial projection after player, queue, and
  active lyrics hydration.

### Phase D: deferred and on-demand work

- Cheap version checks precede migrations; expensive passes run only when needed.
- Library maintenance and backfill yield progress and do not block the main thread.
- App/pack update checks begin after the shell is interactive.
- Adapter discovery starts only for enabled adapters.
- Font binaries, GSAP recipes, PixiJS, Three.js, and native helpers load only for
  the selected active surface that requires them.

## Reconnect and failure rules

- A Browser Source reconnect receives the effective configuration, referenced
  immutable documents, then the latest state for one known boot/epoch.
- A new boot id resets client revision comparison safely.
- Renderer disconnect marks source unavailable and cancels interpolation timers.
- A content revision mismatch hides only the affected content/template and exposes
  fallback diagnostics; it does not corrupt unrelated instances.
- Port conflict is an observed error and never silently changes the configured
  port.
- External commands while source is not ready return a typed rejection.
- Pack, adapter, and renderer failures cannot stop local audio playback.

## Backpressure requirements

- Serialize immutable content once per revision, not once per client or tick.
- Check each client's queued bytes before enqueueing replaceable state.
- Drop older clock corrections before dropping discrete semantic state.
- Use bounded high-water, timeout, retry, and disconnect policies.
- Record aggregate dropped/replaced messages without logging lyrics or other
  payload content.
- Tests include a deliberately slow client, reconnect during delay compensation,
  boot-id reset, epoch change, and simultaneous clients.

## Static and pack asset delivery

- Runtime HTML and active manifests revalidate rather than becoming immutable.
- Digest-addressed verified assets use immutable cache headers.
- Routes resolve ids through activated manifests and never accept filesystem paths.
- Large assets are streamed or served through bounded caches, not unconditionally
  loaded into memory for every request.
- Workbench and OBS share the same runtime asset resolution but have independent
  client/readiness diagnostics.
- Gallery uses static previews and does not load every live renderer.

## Performance measurement matrix

Capture cold and warm runs for:

- empty, representative, and large libraries;
- local SSD and a deliberately slow/unavailable library location;
- Output disabled and enabled with zero/multiple clients;
- no active pack, DOM/SVG pack, and one GPU template;
- adapters disabled and enabled-but-unavailable; and
- packaged Windows build, not only Vite development mode.

Record p50 and p95 for:

- process start to Electron ready;
- process start to window creation, first paint, and interactive shell;
- Output start request to listening;
- renderer load to source synchronization ready;
- Browser Source navigation to first valid frame;
- active pack resolve and asset decode; and
- adapter enable to ready/degraded.

Also record idle CPU, main/renderer/OBS memory, WebSocket backlog, first-template
GPU memory, and aggregate cost with all default instances active. Performance
budgets are fixed only after this baseline and then enforced as regression gates.

## Pre-Lyrics implementation gate

Before Lyrics T2 code begins, the team must agree which hardening work is a direct
prerequisite. At minimum, the contract requires an implementation plan and tests
for initial full publish, boot/epoch identity, source-unavailable behavior, and
removal of unconditional library enumeration from the first-window critical path.
Content/state split implementation may proceed together with T2 as already defined
by ADR 0010.
