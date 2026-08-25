# ADR 0012: State Convergence and Startup Phases

## Status

Accepted and implemented at the core boundary. Projection Hub, `bootId` /
`sourceEpoch` identity, revision convergence, liveness/readiness separation,
startup tracing, and measured startup budgets are in production code. Further
activation hardening remains incremental work.

## Context

The current foundation has useful boundaries: the renderer audio element remains
the playback source of truth, main validates published snapshots, and the
loopback Browser Source channel is read-only. The current startup sequence,
however, starts the Output server before creating the renderer window. A Browser
Source may therefore connect while main still holds the empty revision-zero
snapshot. Renderer initialization reads settings and status but does not guarantee
an immediate full publish after discovering an already-running server.

Startup also runs synchronous migrations and a filesystem-truth `listTracks()`
pass before creating the window. This becomes a visible cold-start risk as the
library grows or moves to slower storage. Future Presentation Packs, fonts,
animation engines, native visual transports, and third-party SDKs would amplify
both problems if loaded on the same critical path.

Finally, `listening`, WebSocket client count, source hydration, template asset
readiness, and first rendered frame are different states. Treating them as one
“connected” signal makes diagnosis and safe activation impossible.

## Decision

### Preserve renderer authority and add a main-owned Projection Hub

Player, queue, and lyrics state remain authoritative in the renderer. A
main-process **Projection Hub** accepts validated, versioned projections and
serves independent consumers such as Browser Source Output, Performer Self-View,
taskbar metadata, and future adapters. It caches display-safe projections only;
it does not become a second player or persist live state across app restarts.

Consumers depend on canonical product projections, not Vue composables or vendor
schemas. High-frequency playback clock data, immutable lyric content, queue data,
and readiness data may use separate streams and revision counters.

Every projection envelope contains at least:

- `contractVersion` for parsing compatibility;
- `bootId` identifying one app-process lifetime;
- `sourceEpoch` identifying a continuous playback/source timeline;
- a stream-specific monotonic revision;
- `generatedAt` for the same-machine clock projection; and
- the validated payload.

Track replacement, media reload, seek discontinuity, renderer restart, or another
operation that invalidates interpolation advances `sourceEpoch`. A new `bootId`
allows a still-running OBS Browser Source to accept low revisions after the app
restarts without mistaking them for stale messages.

### Model desired, observed, and effective state separately

- **Desired state** is persisted intent: service auto-start, port, Output
  Instances, selected templates, resolved variants, and enabled adapters.
- **Observed state** reports what exists now: process alive, port listening,
  canonical source hydrated, pack resolved, client connected, renderer ready,
  adapter authenticated, or error.
- **Effective state** records the compatible pack/template/settings/version
  actually serving an instance after fallback and constraints.

Main process owns one reconciler that moves observed/effective state toward
desired state. Renderer UI sends intents and displays observed results; it does
not run a second auto-start controller.

### Keep readiness facets orthogonal

The runtime exposes distinct facets instead of one overloaded boolean:

- process liveness;
- service lifecycle (`stopped`, `starting`, `listening`, `stopping`, `error`);
- source synchronization (`unavailable`, `syncing`, `ready`, `stale`);
- content readiness per referenced document or pack;
- Output Instance client and render readiness; and
- external adapter lifecycle.

An overall user-facing state may be derived as `starting`, `ready`, `degraded`, or
`error`, but the underlying facets remain available to diagnostics. Client count
continues to mean only transport connections. Template-ready/error telemetry is
bounded, non-authoritative diagnostics on a separate path and never permits
playback commands.

### Use a startup phase DAG

Startup work is classified by dependency and user-visible criticality:

1. **Bootstrap:** app identity, privileged schemes, single-instance lock, minimal
   config, security policy, diagnostics, and required IPC registration.
2. **Interactive shell:** create and load the main window as early as safely
   possible; show a stable shell while domain data hydrates.
3. **Core convergence:** start the loopback listener concurrently when enabled,
   load the active Output configuration, and wait for the renderer's complete
   initial projection before marking source ready. A listener may serve an
   explicit `sourceUnavailable` state but never stale live content.
4. **Deferred work:** library scan, non-blocking migrations, backfill, update
   checks, Presentation Pack refresh, catalog previews, and adapter discovery.
5. **On-demand work:** language analyzers, animation/render engines, third-party
   SDKs, native visual helpers, and assets for the selected template only.

Version-gated migrations that must precede a write check their version cheaply
before loading dependent collections. Long filesystem work moves off the main UI
critical path and reports progress or degraded availability rather than freezing
the window.

### Require a complete initial source handshake

After renderer hydration, it publishes a complete canonical projection for the
current `bootId`/`sourceEpoch`. Main only then marks source synchronization ready.
Subsequent deltas or clock corrections cannot make an unknown epoch ready.

On renderer reload, crash, or IPC disconnect, main marks the source unavailable,
hides live Output content through a defined projection, and waits for a new full
handshake. External commands are rejected with `source_not_ready`; they are not
queued for later execution.

### Add transport backpressure and immutable caching

Dynamic clock/state delivery is latest-wins per client. Before sending, the server
checks transport backlog; it drops replaceable corrections above a bounded high
water mark and disconnects persistently unhealthy clients. Immutable documents
are content-addressed and resent only when their revision changes.

Runtime HTML, manifests, and active pointers remain revalidated. Verified assets
with immutable digest-based URLs use long-lived immutable caching. Static routes
stream or cache bounded data rather than reading unlimited files into memory for
every Output Instance.

### Measure before setting absolute budgets

The implementation adds correlated main/renderer milestones and development-only
Electron tracing. Baselines cover cold and warm starts, representative low/high
hardware, empty/medium/large libraries, and local/slow storage. Required
milestones include process start, Electron ready, config ready, window created,
first paint, interactive shell, Output listening, source synchronized, first
instance ready, and first rendered frame.

No arbitrary absolute startup promise is accepted before the baseline. Once
measured, p50 and p95 budgets become regression gates. Every new pack engine or
adapter must demonstrate that it is absent from the startup critical path when
disabled.

The executable checklist lives in
[`docs/contracts/output-runtime-hardening.md`](../contracts/output-runtime-hardening.md).

## Rejected options

- **Move playback authority into main.** It would duplicate the audio element's
  state and reintroduce desynchronization.
- **Persist and replay the last live snapshot on startup.** Showing yesterday's
  song is worse than an explicit unavailable state.
- **Treat a listening socket or client count as ready.** Neither proves source,
  assets, renderer, or first frame readiness.
- **Keep renderer and main as competing auto-start reconcilers.** Lifecycle needs
  one owner and observable intent results.
- **Add heavier engines and optimize later.** Startup coupling and backpressure
  must be bounded before pack and renderer cardinality grows.
- **Acknowledge rendering over the command plane.** Template telemetry is
  diagnostic and must not grant control capability.

## Consequences

- The current Output status and protocol require a versioned readiness extension.
- Lyrics T2 gains the boot/epoch/content separation needed for deterministic
  segment progress.
- The main window can appear independently of slow library or content work.
- Diagnostics become more detailed than a single running/client count.
- Projection and command paths remain separate, allowing external integrations
  without weakening playback authority.
- Performance claims become measured regression gates rather than assumptions.

## References

- [Output runtime hardening contract](../contracts/output-runtime-hardening.md)
- [ADR 0010: Lyrics Timing Granularity](0010-lyrics-timing-granularity-and-output-content-split.md)
- [ADR 0011: Overlay Instances and Presentation Packs](0011-overlay-instances-and-presentation-pack-delivery.md)
- [Electron performance guidance](https://www.electronjs.org/docs/latest/tutorial/performance)
- [Electron content tracing](https://www.electronjs.org/docs/latest/api/content-tracing/)
- [Electron BrowserWindow startup guidance](https://www.electronjs.org/docs/latest/api/browser-window)
- [Kubernetes probe concepts](https://kubernetes.io/docs/concepts/workloads/pods/probes/)
