# Local Diagnostics Operations And Maintenance

This is the current operating and maintenance guide for local diagnostics.
[ADR 0008](../adr/0008-local-diagnostics-and-error-handling.md) owns the privacy
and error-handling decisions; [the spec](../spec.md#3-功能現況) owns product status.
The former P1E pause and completed implementation batches are no longer a work queue.

## Read, Export And Clear

In Settings → 支援與維護, 錯誤紀錄 shows a bounded recent-record count, not the
total number of records on disk. Export is the primary action; the overflow menu
offers refresh, open folder, clear and issue reporting. Clear requires confirmation.
`usePersistentDiagnostics.js` reduces recent events to a count without retaining
their bodies in Settings reactive state. The composition owner is
`src/components/settings/SettingsSupportSection.vue`; its control is
`src/components/settings/DiagnosticsSettingsRow.vue`.

- Export opens a main-owned save dialog and writes one JSON support bundle.
  Cancelling is expected control flow, not a diagnostic failure.
- The export contains at most 500 normalized/redacted recent events, plus bundle
  and application metadata. It can include sanitized stack and session identifiers;
  users should inspect it before choosing to share it.
- Opening the folder uses the main-owned logs location; renderer never supplies
  or receives its filesystem path. Clearing affects managed diagnostic files.
- Export and the standalone viewer do not transmit a bundle. Issue reporting is
  a separate, explicit preview-and-send flow defined by
  [ADR 0016](../adr/0016-user-feedback-intake.md).

Development builds expose F6 Live Diagnostics in Internal Tools → Operations.
`useDiagnosticsWorkbench.js` reads up to 500 events through the same
`diagnostics:list-recent` public projection: stack and session identifiers are
removed by main. The workbench is not a private-log reader and does not own export.

Open [the standalone viewer](../../scripts/diagnostics-viewer.html) in a browser
to inspect an explicitly exported bundle through a file picker or drag and drop.
It accepts the support-bundle JSON shape, not raw `diagnostics.jsonl`; it has no
build step and is not part of the packaged App. No renderer-supplied path is
added to IPC for this workflow.

## Runtime Owners

| Owner                                                       | Responsibility                                                                                                                                      |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `electron/lib/diagnostics.js`                               | Schema v1 normalization/redaction, JSONL persistence/recovery, 5 MiB per file plus five rotations, recent read, managed clear and fail-open results |
| `electron/main.js`, `electron/main/diagnosticsLifecycle.js` | One service using `app.getPath('logs')`; fatal monitor and Electron lifecycle capture                                                               |
| `src/utils/rendererDiagnostics.js`                          | Vue, browser error and unhandled-rejection capture through bounded intents                                                                          |
| `electron/main/diagnosticsHandlers.js`                      | Renderer-write validation/rate limit, public recent-event projection, clear, open folder and export                                                 |
| `electron/lib/diagnosticsExport.js`                         | Shape normalized service events into a support bundle; main owns the save destination and atomic write                                              |
| `src/composables/useAppDiagnostics.js`                      | Bounded public errors in renderer memory; suppress re-forwarding when `diagnosticRecorded` is true                                                  |

Persistent private evidence and renderer public errors remain separate. Do not
expose caught error text, paths, provider bodies, raw stacks or private sessions
as ordinary interface copy. The exported support bundle is an explicit user action,
not permission for background collection or upload.

## Domain IPC Boundary — Batch 6

`electron/main/ipcErrorBoundary.js` records original operational failures privately,
then returns the existing structured public `AppError`. Diagnostic failure is
fail-open and cannot replace the original operation's public error. The
`diagnosticRecorded` flag prevents a renderer from recording the same failure again.
Expected cancellation, disabled gates and validation/stale-state control flow stay
outside operational-error recording.

Adoption is incremental and must be checked per operation. Current consumers
include dependency, separation, library/playlist, reading, configuration and
selected feature, storage, artwork/artist, lyrics-research
handlers. Importing the helper does not mean every operation in a file is covered;
use the handler and its adjacent tests as the source of truth.

`electron/main/importHandlers.js` deliberately preserves the classified download
error contract from `electron/lib/downloadFailure.js` and
`shared/downloadFailureValues.json`. Its catch-all fallback records through
`recordSearchDiagnostic`, then rethrows the classified error unchanged. Do not
wrap it mechanically in `runDiagnosticIpcOperation`: the renderer relies on its
age/region/members-only classifications. Playback's fire-and-forget
`player:state`／`player:command` channels are also not invoke handlers to migrate.

## Remaining Verification And Scoped Follow-Up

Playback now records bounded `PLAYER_AUDIO_BUFFERING`, `PLAYER_AUDIO_CONTEXT_STATE`,
`PLAYER_AUDIO_PROCESSOR_ERROR` and numeric `PLAYER_AUDIO_MEDIA_ERROR` evidence.
Buffering evidence starts only after confirmed playback; state changes distinguish
monitor from capture, and processor evidence observes the corresponding worklet.
Each event kind/reason is limited to once per 30 seconds in the renderer. Context
contains source category and runtime state only, never media identity, device id,
path or URL. These events do not prove audible distortion occurred, and clean
offline decoding does not verify the live Windows output path.

These are acceptance requirements, not claims that a current installed build has
passed them. Record dated package/version and evidence separately; never commit
an absolute user-profile path.

- In an isolated packaged profile, trigger a safe event, restart, confirm it can
  be read, and verify open-folder reveals the same managed logs directory.
- Exercise Settings refresh, clear confirmation, explicit export/cancellation and
  viewer loading, including empty and failure states. Scan every exported field
  for redaction; check that ordinary recent reads omit stack/session identifiers.
- Verify rotation with an injected small threshold, plus disk-full/read-only
  fail-open behavior without blocking startup or playback.
- Add missing domain/recovery evidence alongside a concrete recovery change or a
  reproducible support case. Keep context categorical and bounded; do not log
  every successful operation, raw document bodies or media metadata.

Use the [manual acceptance checklist](manual-acceptance.md) for release journeys.
Additional coverage of corrupt documents, missing media, worker exits and
Output/update failures must preserve each domain's existing recovery behavior.

Update ADR 0008 before changing schema/retention, accepting renderer paths or
arbitrary context, weakening Electron isolation, changing fatal-process semantics,
or adding native crash dumps, remote telemetry or automatic uploads.
