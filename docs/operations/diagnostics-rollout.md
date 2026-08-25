# Local Diagnostics Rollout

## Status

Renderer recovery, Settings controls, and the first main-owned IPC error boundary
are implemented. Packaged location smoke, explicit export, additional domain
wrappers, and recovery evidence remain tied to the release/support triggers below.

The pause is intentional, not a technical blocker. ADR 0008 remains the
architecture and privacy contract; this document records the implementation
route so later work does not need another repository-wide audit.

## Decision

Do not expand diagnostics into export or every main domain handler now.
The existing foundation already provides restart-persistent evidence for
uncaught renderer errors and Electron/process lifecycle failures. The remaining
work changes user journeys and public error semantics across many domains, so it
should be implemented alongside the recovery UI that consumes it.

Reasons to pause:

- P1E Performer Self-View is the current product phase and should remain the
  only new product implementation before Phase 1 closeout.
- A generic IPC wrapper touches many main handlers and must be migrated by
  domain, not applied as a repository-wide mechanical rewrite.
- Settings detail and export need final interaction copy, empty/loading/error
  states, and a user-selected destination contract.
- Packaged log-location and open-folder verification should use the actual
  installer/runtime rather than infer success from the development build.
- No remote telemetry, support upload endpoint, or crash-dump consent contract
  exists; none is needed for the local foundation.

## Current baseline

| Surface                 | Current state                                                    | Coverage boundary                                                          |
| ----------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Main persistence        | `electron/lib/diagnostics.js`                                    | JSONL, redaction, 5 MiB plus five rotations, recent read, clear, fail-open |
| Main startup            | `electron/main.js`                                               | One session-scoped service using `app.getPath('logs')`                     |
| Electron lifecycle      | `electron/main/diagnosticsLifecycle.js`                          | Fatal monitor, process gone, load/preload failure, unresponsive            |
| Renderer global capture | `src/utils/rendererDiagnostics.js`                               | Vue, browser `error`, and `unhandledrejection`                             |
| IPC boundary            | `electron/main/diagnosticsHandlers.js` and `electron/preload.js` | Record, recent read, clear, open folder; renderer writes are rate-limited  |
| In-memory public errors | `src/composables/useAppDiagnostics.js`                           | Shared bounded public projection; never uses plain caught error text       |
| Settings                | `src/views/SettingsView.vue`                                     | Persistent count plus clear/open-folder controls; no raw event list        |
| Domain handlers         | Existing `electron/main/*Handlers.js` files                      | No shared diagnostics wrapper yet                                          |
| Export                  | Not implemented                                                  | Must remain explicit, redacted, and user-selected                          |

The two record surfaces are deliberately still separate:

- Persistent diagnostics are private operational evidence owned by main.
- `useAppDiagnostics` contains user-safe, renderer-memory presentation records.

Do not merge them by returning private stacks or sessions to renderer. Settings
reduces `diagnostics:list-recent` to a count and never stores the returned event
bodies in reactive View state.

## Resume triggers

Resume the route when any one of these becomes true:

1. P1E and the Phase 1 definition of done are complete and Phase 2 error
   recovery starts.
2. A signed packaged release enters manual verification and needs an inspect,
   clear, open-folder, or export support journey.
3. A real failure cannot be reproduced from existing records and identifies a
   missing domain event.
4. A listed domain handler is already being materially changed; migrate that
   domain in the same scoped change instead of opening a diagnostics-only
   repository-wide refactor.

Do not resume merely to increase event volume or to log every successful
operation.

## Target data flow

```text
Domain operation
  -> diagnostic IPC wrapper in main
     -> private normalized event -> DiagnosticsService -> rotating JSONL
     -> safe AppError projection -> renderer recovery UI

Settings diagnostics
  -> named preload intent
     -> diagnostics handler
        -> public event projection only -> bounded Settings list
        -> clear/open/export action owned by main
```

The OBS overlay remains outside this command flow. It does not gain a writable
diagnostics channel.

## Ordered implementation batches

### Batch 3: Packaged location smoke

Perform this before adding more diagnostics features:

1. Launch a packaged Windows build and trigger one synthetic safe event.
2. Confirm records land under Electron's logs directory, not the media library
   or repository.
3. Restart and confirm `listRecent` can read the prior session.
4. Verify open-folder reveals the same managed directory without returning its
   path through IPC.
5. Exercise rotation with a temporary small injected threshold; do not create
   30 MiB of fixture data in the real user profile.
6. Verify read-only/full-disk behavior does not block startup or playback.

Record the package/version and observed directory category, but do not commit a
developer's absolute profile path.

### Batch 4: Settings controls and public error projection — implemented

Files expected to change:

- Add `src/composables/usePersistentDiagnostics.js` for loading, clearing, and
  opening the folder through the existing preload methods.
- Add co-located composable tests with a stubbed `window.Utawakui` bridge.
- Update `src/views/SettingsView.vue` with loading, failure,
  clear-confirmation, and open-folder states while keeping the ordinary UI
  count-only for non-technical users.
- Add or extend Settings view tests for keyboard access, safe fields, clear,
  and open-folder failure.

Keep `useAppDiagnostics.js` in place for transient user-facing errors during
this batch. Naming the persistent composable separately prevents an accidental
private/public merge.

The ordinary UI must not show stack, session id, absolute path, URL, command
line, provider output, track title, lyrics, or caught `Error.message` text.
Renderer Views use explicit concise Traditional Chinese messages through
`UiNotice`; structured application errors remain the only IPC-provided public
message source.

### Batch 5: Explicit redacted export

Expected main path:

1. Add `diagnostics:export` to `electron/main/diagnosticsHandlers.js`.
2. Inject a main-owned save-dialog function; renderer never supplies an
   arbitrary destination path.
3. Re-parse and normalize every persisted line before export rather than
   copying managed JSONL files byte-for-byte.
4. Write a new export file atomically and leave source logs untouched.
5. Expose only `exportDiagnostics()` from `electron/preload.js`.
6. Add the explicit export action and local-only explanation to Settings.

Test cancellation as expected control flow, unsafe persisted legacy lines,
partial final lines, destination write failure, and absence of private fields.

### Batch 6: Domain IPC wrapper and first migrations — started

The implemented helper is `electron/main/ipcErrorBoundary.js`. It must:

- preserve handler success values and Electron invoke semantics;
- assign operation/correlation metadata in main;
- record the original failure privately through `DiagnosticsService`;
- return or throw only the existing structured `AppError` public projection;
- avoid recording expected cancellation, disabled gates, and other documented
  control flow as errors;
- prevent duplicate records when a worker and its parent handler describe the
  same failure.

The dependency handler migration is complete. Separation and reading remain the
next scoped migrations because they already have structured renderer diagnostics:

1. `electron/main/separationHandlers.js`
2. The reading-related paths in `electron/main/lyricsHandlers.js`

Update their matching renderer composables so `useAppDiagnostics` remains the
safe recovery/presentation surface and does not submit a duplicate persistent
event after main has already recorded the operation.

Stop and review public error codes, duplicate rate, and recovery actions before
migrating output/update, library/playlists/config, import/provider, or the
remaining lyrics paths.

### Batch 7: Corruption and recovery evidence

Add low-volume warning/error events at existing fallback points without
changing persistence behavior:

- corrupt user-authored documents and backup creation;
- corrupt derived indexes/manifests that fall back to empty state;
- missing selected media and orphan references;
- worker abnormal exit, optional fallback failure, and recovery attempt result;
- output or update automatic-start failure where an injected logger already
  exists.

Context must stay categorical: document kind, error code, stage, count, and
recovery result. Do not record filenames, collection names, media metadata, raw
provider output, or the corrupt document body.

### Batch 8: Remaining domains and release acceptance

Migrate a domain only when its error/recovery contract is understood. Complete
with:

- packaged restart persistence and open-folder checks;
- Settings inspect/clear/export walkthrough;
- representative domain recovery journeys;
- disk-full/read-only fail-open verification;
- redaction fixture scan over every exported field;
- focused coverage of at least 80% for each new diagnostics module.

Native crash dumps, automatic upload, Sentry, OpenTelemetry, and remote support
bundles remain separate product/privacy decisions.

## Stop conditions

Pause and update ADR 0008 before continuing if implementation would require:

- relaxing `contextIsolation`, renderer sandboxing, or Node integration;
- accepting a renderer-supplied filesystem path;
- adding arbitrary context keys or raw logging objects;
- changing the JSONL schema or retention limits;
- automatic network transmission or a stable analytics identifier;
- installing `uncaughtException` or main `unhandledRejection` handlers that
  change fatal-process semantics.

## Completion criteria

The rollout is complete only when users can inspect, clear, open, and
explicitly export safe local records; supported domain failures create one
private diagnostic event and one actionable public error; packaged behavior is
verified; and no diagnostics action weakens the current Electron security or
privacy boundary.
