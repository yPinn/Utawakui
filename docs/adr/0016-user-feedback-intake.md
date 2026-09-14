# ADR 0016: User feedback intake via a bounded relay

## Status

Accepted and implemented (2026-09-13).

## Context

Utawakui had no channel for a user to reach the developer. The repo is
private (private dev, public binary release), so GitHub Issues and pull
requests are not reachable by ordinary users; users are also non-technical,
so any intake surface has to work with a single click rather than an account,
a git workflow, or hand-crafted repro steps.

ADR 0008 already gives the app a mature local diagnostics pipeline: a
structured `AppError` boundary, redaction, JSONL persistence, and an explicit
single-JSON support-bundle export. What it never had was the last mile — once
that bundle exists, getting it to the developer was entirely manual (save a
file, then separately figure out how to send it).

The product decision behind this feature is broader than error reporting: the
intake point is meant to cover bug reports, feature requests, general
experience feedback, and content/lyrics-source issues alike, sharing one
submission and consent flow. Utawakui is also local-first with no existing
backend of its own; this is the app's first user-initiated network upload.

## Decision

- Four feedback kinds — `bug`, `feature`, `experience`, `content` — share one
  payload shape and submission flow (`src/constants/feedback.js`,
  `electron/lib/feedback/constants.js`). Only `bug` may attach diagnostics,
  and only the last 50 recent events (`DIAGNOSTICS_EVENT_LIMIT`), not the
  500-event full export — attaching more than the user consciously intends to
  share for a feature request or opinion would be over-collection relative to
  what they asked for.
- Every submission requires an explicit, user-reviewed preview
  (`feedback:build-preview`) before `feedback:submit` can send it. There is no
  automatic or background upload of any kind.
- `electron/lib/feedback/payload.js` builds the payload in main, reusing the
  existing diagnostics primitives (`buildDiagnosticsSupportBundle`,
  `service.listRecent`) instead of re-implementing them. User-authored text
  (description/contact/track label) is length-bounded and stripped of control
  characters, but deliberately **not** run through `diagnostics.js`'s
  `redactText` URL/path scrubbing: that scrubbing exists to guard
  system-generated messages the user never sees before they're logged, while
  this text is something the user wrote and reviews in the preview step —
  and a `content` report routinely needs to cite a source URL to be
  actionable. Diagnostic _events_ attached to a `bug` report are already
  sanitized at write time by `diagnostics.js`, so they need no second pass.
- `electron/main/feedbackHandlers.js` exposes `feedback:build-preview` /
  `feedback:submit` / `feedback:export-fallback` over IPC, mirroring
  `diagnosticsHandlers.js`'s conventions: handlers return `{ok, errorCode}`
  result objects and never throw across the IPC boundary, and submissions are
  rate-limited per process window the same way renderer diagnostic events
  are.
- No new feature gate protects this flow. Every existing gate body
  (`shared/featureGates.json`) ends with language asserting confirmation
  stays local; a `report-flow` gate would falsify that for every other gate
  too unless `noticeVersion` bumps, which would re-prompt all four existing
  gates for every installed user just to add this one. A gate is also the
  wrong shape here: gates model "confirm once, reuse automatically after,"
  while a feedback submission is always a deliberate, one-off action the user
  just finished composing. The per-submission preview is the actual
  protection this needs, and unlike a gate it is re-shown every time rather
  than only once.
- `services/feedback-relay/` is a Cloudflare Worker deployed independently of
  the app — `electron-builder.yml`'s `files:` allowlist never references it,
  so it cannot end up in a packaged build regardless of this decision. It
  accepts only `POST /feedback/submit`, bounds the streamed request body,
  re-validates the payload from scratch (never trusts the app client),
  rate-limits by IP through a mandatory KV counter, and forwards the report
  to Discord as a formatted embed with mentions disabled. User-authored text
  is escaped at this final presentation boundary so Discord renders Markdown
  controls literally while leaving bare source URLs usable; this does not
  alter the app preview or the payload retained in an opted-in diagnostics
  attachment. The relay attaches that bundle only when present, and verifies
  its event count against the same 50-event ceiling as the app. Missing or
  failed KV access is a service failure; the relay never disables rate
  limiting and continues delivery anyway.
- The `X-Utawakui-Client` header the app sends contains the committed,
  versioned `utawakui-desktop-feedback-v1` marker. It is explicitly public,
  not authentication: any string embedded in a distributed desktop app can
  be extracted by anyone who decompiles it. It only raises the bar past
  drive-by scanners. The actual abuse defense is the relay's mandatory rate
  limiter; changing the marker contract requires compatible app and relay
  versions rather than secret rotation.
- `environment.locale` (from `app.getLocale()`) is captured on every report
  even though the app has no i18n today, because language is already part of
  a report's usage context and will matter once i18n exists — see
  `docs/spec.md` §3. Adding it now cost one field, not a schema migration;
  `payload.schemaVersion` exists for the case where a field's _meaning_ ever
  needs to change instead.
- `reportId` remains the complete main-generated UUID throughout the payload,
  relay response, renderer state, and diagnostics attachment filename. Human
  surfaces do not display all 36 characters: the App result state and Discord
  footer use the same grouped uppercase prefix (`XXXX-XXXX-XXXX`, the first
  12 UUID hex characters). This preserves a searchable 48-bit reference for
  conversation without weakening or changing the canonical identifier.

## Rejected for this phase

- GitHub Issues or pull requests as the intake surface — the repo is private,
  so ordinary users have no access to it regardless of how good the tooling
  is around it.
- Attaching the full diagnostics history, or attaching diagnostics by default
  for every kind — both would collect more than the product decision calls
  for.
- A dedicated `report-flow` (or similarly named) feature gate — see Decision.
- A Durable Object–backed atomic rate limiter. The relay's KV get-then-put
  counter is not atomic under concurrent requests from the same key; two
  requests can both read the same count and both proceed. Acceptable for a
  low-traffic personal relay backing abuse mitigation, not a hard cap — see
  `services/feedback-relay/README.md`. Worth revisiting only if real abuse
  shows up.
- Per-install signed tokens in place of the public `CLIENT_MARKER` —
  deferred; it would need its own provisioning flow and buys nothing while
  there is no evidence of abuse.

## Consequences

- The relay must actually be deployed at
  `https://api.utawakui.llazypilot.com/feedback/submit` with its KV namespace
  and `DISCORD_WEBHOOK_URL` secret before `feedback:submit` can succeed. The
  public `CLIENT_MARKER` remains ordinary committed Worker configuration, not
  a secret. The Wrangler contract disables the parallel `workers.dev` route
  and owns the Worker Custom Domain so production has one canonical origin.
  Until deployment every submission fails over to
  `feedback:export-fallback`'s local file save, which the user must send to
  the developer themselves.
- Splitting a feedback kind onto its own Discord channel is a relay-only
  change to `KIND_WEBHOOK_ENV` in `services/feedback-relay/src/index.js`; it
  never requires an app update or a payload-schema change.
- This is the app's first outbound network request initiated by the user
  rather than by a provider or lyrics feature. `index.html`'s CSP has no
  `connect-src` and defaults to `default-src 'self'`, so the renderer cannot
  make this request itself — it must originate from main, same as every
  other outbound HTTP call in this app.
- Domain migration onto `ipcErrorBoundary.js` for `library`/`playlists`/
  `import`/`provider`/`playback` (tracked separately, see
  `docs/operations/diagnostics-rollout.md`) is unrelated to this feature and
  was explicitly kept out of scope; `feedbackHandlers.js` only reuses the
  already-migrated diagnostics service, not that boundary.
