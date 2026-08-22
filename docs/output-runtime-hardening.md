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

## Implementation sequence and compatibility boundary

The current-code audit on 2026-08-23 found four concrete gaps rather than only
future scaling concerns:

- `electron/main.js` synchronously runs `runStartupMigrations()`, including an
  unconditional filesystem-truth `listTracks()` pass, and then awaits Output
  auto-start before it creates the main window;
- `useLibrary.js` and `usePlaylists.js` start IPC hydration as module-load side
  effects, before the Vue shell has mounted;
- `useOutputRuntime.js` does not publish a complete snapshot when initialization
  discovers that main already started the listener, and its feature-gate watcher
  is a second auto-start controller; and
- the renderer-side IPC publisher coalesces pending state, but `outputServer.js`
  still calls `send()` for every open WebSocket client without a per-client
  backlog policy.

Implementation is divided into three independently reviewable batches. H1 is the
next batch and the direct prerequisite for further Output work. H2 and H3 remain
separate so initial convergence does not silently become a complete Output v3
rewrite.

### H1: source convergence and interactive startup

- Keep the existing snapshot-v2 payload and four compatibility URLs. Add a
  validated projection envelope with `contractVersion`, main-issued `bootId`,
  renderer-issued `sourceEpoch`, projection kind (`full` or `update`), monotonic
  revision, and the complete v2 payload. This envelope is the forward-compatible
  seam for Output v3; it does not make the v2 snapshot itself authoritative.
- Main owns projection readiness independently of whether the HTTP listener is
  already running. A listener starts with a typed unavailable source and an empty
  display-safe snapshot. Only a valid full envelope for the current boot enters
  `ready`; an update for an unknown epoch fails closed.
- Main marks the source unavailable when the renderer starts loading again,
  exits, or crashes. The next renderer lifetime uses a new source epoch and must
  complete another full handshake. Browser Source revision comparison resets on
  a new boot id while legacy snapshot-v2 parsing remains supported.
- Expose additive desired, observed, and effective facets in runtime status.
  Main serializes start, stop, and port reconfiguration. Remove the renderer
  feature-gate auto-start watcher; UI actions remain intents and never infer that
  a listening socket means the source is ready.
- Replace renderer module-load library and playlist fetches with idempotent
  initialization started after the shell mounts. The initial Output full publish
  waits for the relevant player, queue, library, playlist, and selected-lyrics
  hydration to settle, without moving their authority into main.
- Make startup migration checks version-first. Do not enumerate tracks unless a
  pending migration actually needs the track map. Create the BrowserWindow
  without awaiting Output listener startup, and run listener convergence and
  deferred hydration independently of first paint.

H1 tests must prove: disabled and enabled startup, listener-before-renderer and
renderer-before-listener ordering, exactly one accepted initial full handshake,
update-before-full rejection, stale boot/epoch rejection, renderer reload/crash
unavailability, lower revisions accepted after a new boot, no unconditional
startup `listTracks()`, no module-import fetch, and unchanged snapshot-v2 OBS
rendering.

Implementation status (2026-08-23): H1 is complete. Main now owns the projection
hub and serialized lifecycle reconciliation; renderer hydration begins after App
mount and completes one full handshake; and first-window creation no longer waits
for listener startup or unconditional track enumeration. The compatibility and
ordering cases above are covered by automated tests. H2 and H3 remain separate
follow-up batches.

### H2: transport and content delivery hardening

- Add per-client latest-wins state delivery using bounded queued bytes, replace
  pending clock corrections before semantic state, and disconnect persistently
  unhealthy clients.
- Separate content and dynamic-state revisions, serialize immutable documents
  once per revision, and add digest-addressed immutable asset caching while
  runtime HTML and active manifests continue to revalidate.
- Prove slow-client, multiple-client, reconnect, delay-change, and content
  revision behavior without logging projected content.

### H3: measured startup and runtime budgets

- Add correlated main, renderer, Output, and first-frame milestones without
  putting tracing on the production hot path by default.
- Capture the documented cold/warm packaged matrix and record CPU, memory,
  backlog, and GPU baselines.
- Set p50/p95 regression budgets only from those measurements; do not claim an
  absolute startup target from development-mode timing.

## Pre-Lyrics implementation gate

Before Lyrics T2 code begins, the team must agree which hardening work is a direct
prerequisite. At minimum, the contract requires an implementation plan and tests
for initial full publish, boot/epoch identity, source-unavailable behavior, and
removal of unconditional library enumeration from the first-window critical path.
Content/state split implementation may proceed together with T2 as already defined
by ADR 0010.
