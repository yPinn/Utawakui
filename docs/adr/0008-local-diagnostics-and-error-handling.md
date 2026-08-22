# ADR 0008: Main-owned local diagnostics and error handling

## Status

Accepted and partially implemented (updated 2026-08-23). The current renderer
error surface has been audited and migrated to a shared public-message boundary.
The dependency-free main-owned core implements event
normalization, redaction, JSONL persistence/recovery, rotation, recent reads,
managed-file clearing, and fail-open results. Main startup, Electron lifecycle,
bounded preload/IPC intents, Vue/renderer global capture, and Settings
count/open/clear controls are wired. Explicit export and main domain-handler
wrappers remain incremental work.

## Context

Utawakui currently handles many operational failures, but it does not yet have
one durable diagnostic pipeline.

- Main-process domain handlers generally throw ordinary `Error` values through
  `ipcMain.handle`. Provider downloads are an important exception: raw yt-dlp
  output stays in main and only a classified sentinel reaches renderer.
- `electron/lib/appError.js` and `src/utils/appErrors.js` define an
  IPC-compatible structured application-error format.
- `useAppDiagnostics.js` keeps at most 100 normalized public records in renderer
  memory and submits a separate bounded diagnostic intent to main. Renderer
  domains use it for concise recovery messages rather than caught exception
  text.
- Settings shows only the persistent record count plus clear/open-folder
  controls. It does not render diagnostic event bodies or raw errors.
- Separation and reading workers correctly report explicit error and exit
  paths, and main releases their in-progress locks in `finally`, but worker
  stacks and stage details are not retained.
- Output and updater services already accept an injected logger, while most
  other main modules use no logger. The remaining direct console output is not
  a durable packaged-runtime record.
- Small JSON documents use atomic temp-file rename. Some user-authored files
  are backed up when corrupt, while several derived manifests and metadata
  indexes silently fall back to empty state. Data integrity is stronger than
  observability.
- At audit time there was no Vue global error handler, renderer `error` or
  `unhandledrejection` capture, main-process fatal monitor, Electron process
  lifecycle capture, or native crash reporter. This ADR's first two
  implementation batches now cover all except native crash dumps.

The product is local-media-first and has no analytics or telemetry contract.
Diagnostics therefore must be useful without turning local playback, lyrics,
provider data, or filesystem paths into an implicit collection surface.

## Decision

### Ownership and process boundary

One main-process diagnostics service owns persistence. Renderer and workers do
not open log files.

```text
Renderer/Vue ---- bounded IPC event ----+
Workers -------- structured result -----+--> main DiagnosticsService --> JSONL
Electron/main -- direct logger call -----+
```

The preload bridge exposes named intents, not a generic filesystem or logger
object. Main validates renderer events again and assigns authoritative fields
such as timestamp, session id, process, app version, and correlation id.
Renderer-originated writes are rate-limited at this boundary so a renderer
failure loop cannot continuously churn the bounded log rotations.

The OBS overlay WebSocket remains read-only. Overlay pages do not gain a
diagnostic command channel. Main may record server-side connection, rejection,
asset-serving, and heartbeat failures; client-side reconnect remains local to
the overlay runtime.

### Public message projection

Every caught renderer exception is developer input, not interface copy.
`normalizeAppError` accepts public text only from an explicit call-site message
or the structured `UTAWAKUI_APP_ERROR` projection. Plain `Error.message`, string
rejections, stacks, paths, URLs, IPC details, device ids, provider output, and
worker details never become View text.

Public messages use concise Traditional Chinese: identify the unfinished task
and, when useful, give one next action. Titles, messages, and action labels are
bounded. Views use the shared `UiNotice` component for error presentation;
dense toolbars do not hide the message behind an icon-only tooltip.

### Event model

Persist one versioned JSON object per line. Required fields are deliberately
small and stable:

```json
{
  "schemaVersion": 1,
  "timestamp": "2026-08-22T00:00:00.000Z",
  "level": "error",
  "process": "main",
  "source": "library",
  "operation": "list",
  "code": "FS_READ_FAILED",
  "message": "Unable to read the library",
  "sessionId": "session-id",
  "correlationId": "operation-id",
  "context": { "errno": "EACCES", "retryable": true }
}
```

- Levels are `debug`, `info`, `warning`, and `error`. Fatal is represented by
  `level: error` plus `context.fatal: true`; it is not a promise that the
  current process can safely continue.
- `source`, `operation`, and `code` are bounded identifiers, not arbitrary user
  text.
- `message` is an internal, redacted diagnostic summary. User-facing
  `title/message/actionLabel` remain a separate `AppError` projection.
- Context is an allowlisted shallow scalar object with bounded keys, values,
  and total serialized size. Unknown keys are dropped.
- Error name, code, and a bounded redacted stack may be retained locally.
  Stack and internal message never cross back to renderer as the public error.
- An operation correlation id follows renderer intent through IPC, main, and a
  worker where applicable. High-frequency playback time updates and output
  snapshots are not logged.

### Privacy and redaction

Logs must not contain these values by default:

- absolute paths or home/user profile names;
- provider URLs, request headers, cookies, tokens, raw stdout/stderr, or
  command lines;
- lyrics text, filenames, playlist names, track titles, artist names, or user
  search/input text;
- media URLs, device ids, network interface details, or arbitrary renderer
  objects.

Safe context uses categorical or technical values such as an error code,
feature id, dependency id, preset id, stage, retryable flag, duration bucket,
HTTP status, or bounded item count. Track/playlist identity is omitted by
default; a future support bundle may use a per-export salted hash if a concrete
correlation need justifies it.

Redaction is centralized and defense-in-depth:

1. Call sites submit structured safe context rather than raw objects.
2. The diagnostics service allowlists keys and bounds values.
3. A final string scrub removes Windows/UNC/POSIX absolute paths and URL
   credential/query material from error messages and stacks.
4. Export repeats normalization instead of trusting already persisted lines.

### Storage, rotation, and recovery

- Store diagnostics under Electron's `app.getPath('logs')`, not the selected
  media library and not `overlays.json`, `library.json`, or `config.json`.
- Use append-only UTF-8 JSONL. Readers skip malformed lines, including a
  partial final line after a crash, and report a bounded parse-warning event in
  memory without recursively logging that warning.
- Rotate before append when the active file would exceed 5 MiB. Keep the
  active file plus five rotations. Exact limits remain constants covered by
  tests, not user settings in the first release.
- Keep only the current and recent local sessions. There is no automatic
  upload, remote transport, analytics identifier, or background network call.
- Logger initialization and every write/rotate/clear failure are fail-open:
  return a failure result and optionally use stderr, but never block playback,
  app startup, shutdown, or a user data write.
- Clearing diagnostics removes only files resolved inside the configured logs
  directory. Export writes a new user-selected archive or JSONL file and never
  deletes the source logs.

### Error capture and recovery boundary

- Vue `app.config.errorHandler`, browser `error`, and `unhandledrejection`
  produce bounded renderer events. A diagnostics bridge rejection or throw is
  swallowed so recording cannot become a second application failure.
- Main uses `uncaughtExceptionMonitor` for last-chance synchronous recording;
  it does not install an `uncaughtException` handler that resumes an undefined
  process state.
- Main deliberately does not install an `unhandledRejection` listener because
  that would suppress Node's default throw/termination behavior. Under Node's
  default mode, an unhandled rejection promoted to an uncaught exception is
  observed by `uncaughtExceptionMonitor`. Main also observes Electron
  `render-process-gone`, `child-process-gone`, `did-fail-load`, `preload-error`,
  and `unresponsive` events. Recovery UI/reload decisions are separate from
  recording.
- Workers return `{ type: 'error', error: { code, message, stage } }`; main
  logs private details and rejects IPC with a safe structured `AppError`.
- Expected control flow such as a cancelled file picker, disabled feature gate,
  404 media lookup, stopped output server, or stale output revision is not an
  error. It is either unlogged or a low-volume debug event.
- Corrupt user-authored documents, missing selected media, worker abnormal
  exits, failed optional fallbacks, and recovery attempts are warning/error
  events even when the app safely degrades.

### IPC error wrapper rollout

Do not replace all domain handlers in one change. Introduce a small wrapper
that records channel, operation, duration, correlation id, and normalized
failure, then migrate domain-by-domain.

The wrapper must preserve each handler's return value and Electron invocation
semantics. It never forwards the private logged error. Unknown failures become
a generic public `UNKNOWN_ERROR` while the original redacted detail remains in
the local diagnostic record.

Recommended rollout order:

1. diagnostics read/write/clear/open/export handlers themselves;
2. feature dependencies, separation, and lyrics reading, which already use
   structured renderer diagnostics;
3. output runtime and updater, which already inject loggers;
4. library/playlists/config and corruption recovery;
5. import/provider and remaining lyrics handlers;
6. playback and renderer-only operational errors.

### Settings surface

The `使用記錄` row is a deliberately non-technical local diagnostics surface:

- persistent record count only in the ordinary UI;
- clear records and open logs folder;
- an explanation that records stay on this device unless the user exports
  them;
- no raw stack, path, stderr, lyrics, media metadata, or arbitrary context in
  the ordinary UI.

A future explicit redacted export may expose bounded support fields, but it
must not turn Settings into a developer log viewer.

### Testing and acceptance

TDD applies to runtime implementation. Tests are written and observed failing
before production code.

Required unit cases include:

- normalization of Error, string rejection, structured AppError, and nested
  `cause` without exposing private fields;
- path, URL, credential, query, lyrics-like/user text, and oversized-context
  redaction;
- deterministic JSONL serialization and malformed/partial-line recovery;
- rotation ordering, retention, concurrent queued writes, clear target
  containment, and file-write/rename failure fail-open behavior;
- renderer payload validation and rejection/drop of unknown context keys;
- IPC wrapper preservation of success values and safe error projection;
- fatal monitor records without overriding Node's exit behavior;
- Electron/renderer lifecycle event mapping and listener cleanup.

New diagnostics modules require at least 80% statement, branch, function, and
line coverage. Focused integration tests use injected temporary directories,
clock, id generator, and logger. Packaged verification confirms the Windows
log location, rotation, open-folder action, restart persistence, read-only or
full-disk degradation, and absence of sensitive content.

## Tool choice

Start with a small project-owned diagnostics service using Node filesystem
primitives and an injected logger interface. Do not add a dependency until the
tests make the missing transport behavior concrete.

`electron-log` is the preferred dependency if project-owned rotation or
Electron event plumbing becomes disproportionate: it already provides Electron
main/renderer integration, file transport, unhandled error capture, and
critical Electron event logging. It must still sit behind Utawakui's schema and
redaction boundary.

Pino is the alternative only if structured remote ingestion becomes a concrete
product requirement. Winston is not selected because its transport flexibility
does not remove the Electron lifecycle, privacy, IPC, or schema work. Sentry,
Electron crash uploads, and OpenTelemetry are deferred until public release has
an explicit diagnostics consent and privacy contract.

## Rejected options

- **Keep renderer-only `useAppDiagnostics`:** it loses the failures needed to
  diagnose restart, startup, worker, and packaged-runtime incidents.
- **Write Markdown or human-formatted bullet logs:** they are harder to parse,
  validate, redact, stream, and migrate than versioned JSONL.
- **Let renderer write files:** this weakens the existing sandbox and
  context-isolation model.
- **Override every console method globally:** it captures arbitrary data with
  no event schema and encourages sensitive-value leakage.
- **Log all state changes:** playback time and output snapshots are noisy,
  high-volume, and unnecessary for error recovery.
- **Upload automatically:** the product has no telemetry consent, privacy, or
  retention contract, and local media workflows can contain sensitive data.
- **Install an `uncaughtException` handler and continue:** an uncaught fatal
  error leaves process state undefined; diagnostics must not masquerade as
  recovery.

## Consequences

Support and development gain restart-persistent, queryable evidence without
making cloud telemetry a product prerequisite. Users gain explicit control
over local records and export. The cost is a new main-owned service, IPC
surface, schema/version discipline, redaction maintenance, rotation tests, and
incremental migration of existing error sites.

The current structured `AppError` work is retained, but it becomes the public
projection rather than the complete diagnostic record. Existing graceful
fallback and atomic-write behavior stays intact; diagnostics records what
happened without turning expected cancellation or recovery into alarming UI.

## Implementation sequencing

After foundation Batch 2, expansion is intentionally deferred until Phase 2
error recovery or a packaged-release/support trigger. The ordered file-level
route, resume triggers, stop conditions, and acceptance checks are recorded in
[Local diagnostics rollout route](../diagnostics-rollout.md).

## References

- [Electron app log paths](https://www.electronjs.org/docs/latest/api/app#appsetapplogspathpath)
- [Electron webContents lifecycle events](https://www.electronjs.org/docs/latest/api/web-contents)
- [Electron crashReporter](https://www.electronjs.org/docs/latest/api/crash-reporter)
- [Vue application error handler](https://vuejs.org/api/application.html#app-config-errorhandler)
- [Node.js process error events](https://nodejs.org/api/process.html)
- [electron-log](https://github.com/megahertz/electron-log)
- [Pino redaction](https://github.com/pinojs/pino/blob/main/docs/redaction.md)
