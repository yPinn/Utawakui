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

| Surface                 | Current state                                                    | Coverage boundary                                                                 |
| ----------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Main persistence        | `electron/lib/diagnostics.js`                                    | JSONL, redaction, 5 MiB plus five rotations, recent read, clear, fail-open        |
| Main startup            | `electron/main.js`                                               | One session-scoped service using `app.getPath('logs')`                            |
| Electron lifecycle      | `electron/main/diagnosticsLifecycle.js`                          | Fatal monitor, process gone, load/preload failure, unresponsive                   |
| Renderer global capture | `src/utils/rendererDiagnostics.js`                               | Vue, browser `error`, and `unhandledrejection`                                    |
| IPC boundary            | `electron/main/diagnosticsHandlers.js` and `electron/preload.js` | Record, recent read, clear, open folder, export; renderer writes are rate-limited |
| In-memory public errors | `src/composables/useAppDiagnostics.js`                           | Shared bounded public projection; never uses plain caught error text              |
| Settings                | `src/views/SettingsView.vue`                                     | Persistent count plus clear/open-folder/export controls; no raw event list        |
| Domain handlers         | Existing `electron/main/*Handlers.js` files                      | No shared diagnostics wrapper yet                                                 |
| Export                  | `electron/lib/diagnosticsExport.js`, `diagnostics:export`        | Main-owned save dialog, single JSON support bundle, atomic write, cancel-safe     |

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

### Batch 5: Explicit redacted export — implemented

Implemented as planned, with one simplification: export reuses
`service.listRecent()` (already fully normalized/sanitized by
`electron/lib/diagnostics.js`'s own read path) rather than re-parsing raw
JSONL lines a second time in the export module itself.

- `electron/lib/diagnosticsExport.js` — pure `buildDiagnosticsSupportBundle()`,
  shapes events into a single JSON support bundle (`bundleVersion`,
  `schemaVersion`, `exportedAt`, `appVersion`, `electronVersion`,
  `eventCount`, `levelCounts`, `events`).
- `electron/main/diagnosticsHandlers.js` — `diagnostics:export` handler.
  Injected `dialog`/`getMainWindow` (main.js composition root); a cancelled
  save dialog returns `{ ok: true, cancelled: true }` and is never recorded
  as a failure; write uses the existing `atomicWriteJson` from
  `electron/lib/atomicWrite.js`.
- `electron/preload.js` — `exportDiagnostics()`, not dev-gated (a product
  feature).
- `src/composables/usePersistentDiagnostics.js` — `exportBundle()`.
- `src/components/settings/DiagnosticsSettingsBlock.vue` — export is the one
  primary visible action; refresh/open-folder/clear moved behind an
  `Ellipsis` + `UiContextMenu` overflow menu (matching
  `SettingsDependencyActions.vue`'s existing primary+menu convention — the
  four-icon-button layout this replaced was this file's only departure from
  that convention).

The exported bundle includes `stack` and `sessionId` (unlike the Settings
list-recent public projection, which strips both) — this is an explicit,
user-initiated export, not the ambient count-only surface, so ADR 0008's
"must not turn Settings into a developer log viewer" constraint does not
apply to it.

### Batch 5b: Dev-only structured reader (F6) and standalone viewer — implemented

Two reader surfaces beyond the ADR's original batch list, added to answer
"how does a developer read this without the Settings UI becoming a log
viewer":

- `src/composables/useDiagnosticsWorkbench.js` +
  `src/components/settings/DiagnosticsWorkbench.vue` +
  `src/views/DiagnosticsWorkbenchView.vue` — an F6, dev-build-only workbench
  (same `import.meta.env.DEV` tree-shake mechanism as the F5/F7/F8 internal
  workbenches in `src/App.vue`). Reads the full event list via the existing
  `listRecentDiagnostics` IPC — no new IPC channel, no new preload method.
  Level filter, text search, per-level counts, native `<details>` disclosure
  per row for full JSON (including `stack`, which the Settings projection
  never exposes).
- `scripts/diagnostics-viewer.html` — a single static HTML file, no
  dependencies, no build step, never packaged (electron-builder's `files:`
  allowlist does not list `scripts/`) and invisible to ESLint/Vitest/
  markdownlint (none of their include globs match a bare `.html` file
  outside `docs/`). Opened directly in a browser; drag-and-drop or file-picker
  loads an exported support bundle and renders the same
  summary/filter/disclosure UI as the F6 workbench. Deliberately reads only
  the export bundle format (`buildDiagnosticsSupportBundle`'s shape) — it
  does not parse raw `diagnostics.jsonl`. Exists specifically so a
  developer can also open a bundle a _user_ emailed in, which the in-app F6
  workbench cannot do (accepting a renderer-supplied file path is the ADR's
  own stop condition — see below).

### Batch 6: Domain IPC wrapper and first migrations — complete for the listed domains

The implemented helper is `electron/main/ipcErrorBoundary.js`. It must:

- preserve handler success values and Electron invoke semantics;
- assign operation/correlation metadata in main;
- record the original failure privately through `DiagnosticsService`;
- return or throw only the existing structured `AppError` public projection;
- avoid recording expected cancellation, disabled gates, and other documented
  control flow as errors;
- prevent duplicate records when a worker and its parent handler describe the
  same failure.

Dependency handlers, separation, reading, library, and playlists are migrated
(2026-09-13):

1. `electron/main/separationHandlers.js`
2. `electron/main/lyrics/readingHandlers.js`
3. `electron/main/libraryHandlers.js`
4. `electron/main/playlistsHandlers.js`

No renderer composable required any change: `useAppDiagnostics.recordError()`
already skips re-forwarding to main whenever `context.diagnosticRecorded ===
true`, and `runDiagnosticIpcOperation` already embeds that flag once main
successfully records — this suppression was already in place before Batch 6
resumed, just unexercised until a handler set the flag.

Each migration draws the same line: throws that mean "the renderer's view of
this id/identity/state no longer matches main" (unknown track, stale reading
identity, "already generating", read-only album) are expected control flow —
thrown as a direct `createAppError`, outside the wrapper, never recorded.
Only throws that mean a real operation failed (disk I/O, corrupt sidecar,
worker crash) go through `runDiagnosticIpcOperation`.

**`electron/main/importHandlers.js` (`import:resolve-source`, `yt:*`) is
deliberately NOT wrapped in `runDiagnosticIpcOperation`.** It already has a
bespoke, pre-existing classified-error contract
(`electron/lib/downloadFailure.js`'s `toClassifiedDownloadError()`, keyed by
`shared/downloadFailureValues.json`'s `DOWNLOAD_FAILURE_PREFIX` — a different
sentinel scheme than `UTAWAKUI_APP_ERROR:`) that the renderer parses for a
richer age-restricted/region-restricted/members-only download-failure UI.
Wrapping it in the generic boundary would silently replace that classified
error and break the renderer's UI. Instead, `classifyingFailures`'s
catch-all fallback branch now also calls `recordSearchDiagnostic` (the same
helper `classifyingProviderSearchFailures` already used) before rethrowing
the classified error unchanged — recording gained, public contract
untouched. Do not "fix" this into a full `runDiagnosticIpcOperation` wrap
without first migrating the renderer off the classified-error contract.

Provider is otherwise already fully migrated
(`providerDiscoveryHandlers.js`, `lyricsProviderCorpusReviewHandlers.js`).
Playback has no invoke-based IPC domain to migrate — `player:state`/
`player:command` are fire-and-forget `ipcMain.on`/`webContents.send`, not
`ipcMain.handle`, so `runDiagnosticIpcOperation` does not apply; this is
structurally not applicable, not deferred.

Remaining: `config`, output/update, and the remaining lyrics paths
(document/acquisition handlers).

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
