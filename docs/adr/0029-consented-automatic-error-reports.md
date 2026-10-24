# ADR 0029: Consented automatic reports for severe errors

## Status

Accepted; implementation in progress (2026-10-24). Supersedes the "no
automatic or background upload" rule of ADR 0016 and the "upload
automatically" rejection of ADR 0008, only for the bounded report defined
here. User-initiated feedback is unchanged.

## Context

Severe failures (a main-process exception, a fatal renderer exit, a broken
preload bridge, a failed startup migration) usually happen when the user is
mid-session and cannot write a report. Local diagnostics keep the evidence,
but it only reaches the maintainer if the user exports or reports it later,
which rarely happens. ADR 0008 deferred uploads until a consent, privacy and
retention contract existed; this ADR is that contract for one narrow report.

## Decision

### Severity

`electron/lib/autoReport/severity.js` is the single classification table:

- **S1** reports on first occurrence: `UNCAUGHT_EXCEPTION`, fatal
  `RENDER_PROCESS_GONE`, `PRELOAD_FAILED`, `STARTUP_DEFERRED_MIGRATION_FAILED`.
- **S2** reports only after three occurrences of the same fingerprint within
  one hour: unhandled rejections, unresponsive or failed renderer loads, child
  process exits, Vue and window errors, Output automatic start failures.
- Every other code, `info` and `debug` stays local. New codes are local until
  this table lists them.

### Consent

The first eligible report asks: send this one, send automatically from now on,
or never. Closing the prompt sends nothing and keeps the setting. Settings
exposes the same choice (`autoErrorReporting`: `ask` default, `always`,
`never`). A report sent automatically shows a non-blocking notice with its
report reference.

### Content

A report is built only from an already redacted, stored diagnostic event:
schema version, `kind: 'auto'`, report id, time, severity and escalation,
code, source, operation, process, a generated one-line status summary, the
event message (at most 300 characters), at most ten `app:` stack frames,
the occurrence count and app／Electron／platform／locale. Non-app frames are
dropped. There is no user text, library, lyrics, track, path or event list.

### Frequency and retention

- One report per fingerprint (code plus top app frame without line numbers)
  per 24 hours, and at most three reports per local day.
- Throttle history and one pending report live in `userData`, bounded to
  recent fingerprints, so a crash loop cannot flood the channel.
- The pending report is written synchronously before sending; a failed or
  interrupted send is retried on the next launch and dropped after seven days.
- The relay accepts `kind: 'auto'` only in its fixed shape, under its own
  per-IP rate limit, and forwards it to Discord. Discord retention follows the
  maintainer's channel; the app keeps no copy after a successful send.

## Consequences

The maintainer sees severe failures without waiting for a manual report, at a
bounded volume. The cost is a consent setting and prompt, a persisted throttle
file, a relay schema and deploy, and keeping the severity table current. A
relay that predates this ADR rejects the new kind; the app keeps the report
pending and retries later instead of failing.
