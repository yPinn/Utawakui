# LRCLIB acquisition and storage contract

Status: accepted for implementation on 2026-08-23.

This contract defines the trust boundary between LRCLIB, Electron main, local
lyrics storage, and the renderer. It extends the existing lyrics timing contract;
it does not replace the released `lrclib-*.lrc` source format or the four Output
URLs.

## Product invariants

- LRCLIB is an optional provider behind the `lyrics-flow` confirmation gate.
  Gate denial, offline state, invalid provider data, or a parser failure must
  issue no hidden fallback request and must never fail an otherwise successful
  audio import.
- Electron main owns all provider requests, validation, scheduling, persistence,
  and projection. The renderer receives bounded summaries and typed public
  outcomes, never raw Lyricsfile, hashes, paths, response bodies, or exceptions.
- Existing `lrclib-*.lrc` sources remain readable, editable, deletable, and
  offline-capable. No network migration is required.
- A selected provider record is fetched again by id before save. Search results
  are discovery data, not authoritative save payloads.

## Provider record

Every accepted record is normalized to this complete shape:

```text
id: positive safe integer
name: string | null
trackName: string
artistName: string
albumName: string | null
duration: finite non-negative seconds | null
instrumental: boolean
plainLyrics: string | null
syncedLyrics: string | null
lyricsfile: string | null
```

Missing nullable fields are stored as `null`, not omitted. Invalid ids, title or
artist identity, field types, control-character metadata, or excessive field
sizes reject the record. Search may omit individual invalid records while
reporting a bounded invalid-record count; `/api/get/:id` must reject an invalid
record outright.

## HTTP client and scheduling

- Requests use `https://lrclib.net` unless a test injects another base URL.
- The User-Agent contains `Utawakui/<package version>` and the project URL.
- One main-owned scheduler serializes all LRCLIB traffic. Request starts are at
  least 250 ms apart, including calls from manual search, import fallback, and
  background repair.
- Each request has a bounded timeout and response-byte limit. JSON is decoded
  only after the byte bound succeeds.
- A bounded `Retry-After` value from 429 or eligible 503 responses delays the
  shared scheduler and permits at most one retry. Invalid or excessive retry
  values are not slept unboundedly.
- Public failure reasons are stable codes such as `offline`, `timeout`,
  `rate-limited`, `service-unavailable`, `http-error`, `response-too-large`,
  `invalid-json`, and `invalid-record`. Raw response or exception text is only
  diagnostic input.

## Query progression

1. When trusted title and artist are available, try one `/api/get` signature
   lookup with album and duration when known.
2. For discovery, send one structured `/api/search` request with editable
   `track_name` and `artist_name`; include album when known. Do not combine `q`
   with structured fields.
3. Only after weak or empty structured results may the user explicitly request
   one broadened search. There are no per-keystroke requests and no six-query
   fan-out.
4. Each candidate is evaluated once and grouped as `exact`, `strong`, or
   `related`. Title and artist identity outrank album, duration, version, and
   timing richness. Related results never auto-save.

## Lyricsfile trust boundary

- Preserve raw Lyricsfile exactly in the provider artifact, but parse only
  supported Lyricsfile 1.0 documents under byte, depth, node, line, and word
  limits.
- Reject multiple YAML documents, duplicate keys, aliases, custom tags, unsafe
  object shapes, invalid timestamps, and mismatched text structures.
- Unknown versions are preserved as unsupported; they are never interpreted as
  1.0.
- Provider `offset_ms` is provenance only and remains inert. Missing word or line
  ends remain `null` until a documented canonical rule supplies an end.
- Overlapping words or lines remain preserved provider data. They are not
  silently flattened into Utawakui timing segments.

Source capability and import compatibility are separate:

| Provider capability | Meaning                                 | Canonical import                          |
| ------------------- | --------------------------------------- | ----------------------------------------- |
| T0                  | Plain text only                         | Plain source                              |
| T1                  | Line timestamps                         | Compatibility LRC                         |
| T2                  | Complete word or segment timing         | Timing sidecar when valid                 |
| Partial T2          | Some lines have valid words             | Preserve and warn; no false full-T2 claim |
| Unsupported         | Unknown version or incompatible overlap | Preserve raw artifact only                |

## Local persistence

A new LRCLIB save is a small transaction inside the track lyrics tree:

1. Write a versioned provider artifact containing the complete refreshed record,
   raw Lyricsfile, retrieval time, content hashes, provider id, capability,
   compatibility, and bounded warnings.
2. Write or update the compatibility `.lrc` source when validated line, synced,
   or plain lyrics are compatible.
3. Write the existing canonical timing sidecar directly from compatible validated
   words; do not re-infer provider word boundaries.
4. Publish the lyrics manifest last.

Writes are atomic and idempotent by provider record id. A failed intermediate
write leaves the previous manifest authoritative. Deleting a new provider-backed
source removes its artifact and source-derived timing/reading data; legacy LRC
deletion behavior remains unchanged.

The provider artifact is stored at
`lyrics/providers/lrclib-<recordId>.json` with schema version 1. It contains the
normalized complete provider record, retrieval timestamp, source capability,
canonical compatibility, bounded warnings, and SHA-256 hashes for the record,
plain lyrics, synced lyrics, raw Lyricsfile, and projected compatibility source.
The corresponding manifest source carries validated internal provenance
`{ name: "lrclib", recordId, artifactFilename }`; normal lyrics-state projection
does not expose the artifact filename or raw provider body to the renderer.

For supported Lyricsfile 1.0, line timestamps are projected deterministically to
the compatibility LRC and complete non-overlapping words are projected directly
to the existing timing schema v1. Stable ids use `lrclib:<recordId>`,
`line:<index>`, and `line:<index>:word:<index>`. Provider `offset_ms` remains
artifact-only provenance. Unsupported or invalid Lyricsfile content can be
preserved as an artifact but cannot publish a falsely compatible source.

## Search/save consistency

Candidate summaries carry an opaque `previewFingerprint` through the
main/preload flow. Before saving, `/api/get/:id` is normalized and fingerprinted
again. If the
content changed since preview, main returns `record-changed` plus a refreshed
bounded summary and requires explicit confirmation; it never silently saves the
new body.

## Renderer contract

The modal edits query-only title and artist fields prefilled from the selected
track. These edits never mutate library metadata. Candidate rows expose only
decision-relevant data: identity, album/version, duration delta, timing
capability and coverage, bounded preview, match reasons/warnings, and saved or
update state. Provider id and detailed counts live behind an accessible details
disclosure. Scores, hashes, YAML terms, paths, and raw exceptions are not normal
UI.

All asynchronous renderer requests have an id or generation. Late responses are
discarded, saving is single-flight per modal, and every typed provider failure is
mapped to a bounded Traditional Chinese notice with an actionable retry only when
retry can help.

## Main ownership

`electron/main.js` creates one lyrics acquisition service after configuration is
loaded and injects it into lyrics, import, and library handlers. The service owns
one LRCLIB client and therefore one scheduler across manual search/save, label
repair, post-import fallback, and metadata backfill. Domain handlers do not import
one another.

Every service operation checks `lyrics-flow` before its first external request.
The local already-saved check may return without consulting the gate because it
performs no provider work. A denied gate therefore makes zero LRCLIB requests;
optional post-import and metadata-backfill callers catch that denial or any
provider failure so successful audio/library work remains successful. Creating
the service performs no request, and automatic lookup starts only from deferred
library backfill or an explicit import action; HTTP timeout/abort and the shared
sequential scheduler bound its work.

## Verification gates

- Unit: record normalization, hostile Lyricsfile fixtures, query planning,
  matching bands, fingerprints, and canonical projection.
- Integration: headers, timeout/body limits, serial spacing, Retry-After,
  gate-off zero requests, save re-fetch, atomic/idempotent writes, recovery, and
  deletion.
- Renderer: editable dual fields, explicit submit, stale response rejection,
  grouped candidates, typed error mapping, changed-record confirmation, keyboard
  and focus behavior, and 0/1/20-result layouts.
- Packaging: production dependency presence, packaged loading, legacy offline
  source reading, production build, and bounded Electron/LRCLIB smoke checks.
