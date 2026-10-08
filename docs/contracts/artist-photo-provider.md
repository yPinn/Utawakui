# Artist photo provider contract

## Scope

This contract defines artist-photo acquisition after local selection and the
official YouTube channel avatar leave an artist without a photo. It covers the
anonymous YT Music candidate path, its Provider runtime worker, Main／Renderer
boundary, persistence and rollout gate.

It does not authorize account access, cookies, OAuth, browser-session reuse,
background artist-name queries, arbitrary provider URLs, album-cover fallback,
automatic Output publication or a general Innertube adapter.

## Source order

1. A user-selected local image is authoritative.
2. A removal marker blocks every automatic source.
3. The existing official non-Topic YouTube channel resolver may apply its avatar
   automatically from first-credit channel evidence.
4. Only while the artist still has no photo, the artist page may expose an
   explicit YT Music candidate search.
5. Without an accepted photo, Renderer shows the generic person glyph.

The YT Music path is candidate-only. Every result requires a visible validated
preview, native selection and explicit confirmation. The production policy may
compute strict automatic eligibility for evaluation, but the application must
not apply it until the drift gate in this document passes and the product
decision is updated.

## Runtime and request boundary

The YT Music worker is app-owned and shipped at the fixed
`provider/artist_photo_ytmusic_worker.py` resource path. Main derives that path
for development and packaged builds and runs it with the Python executable from
the prepared `yt-dlp-provider-tool` runtime. The worker is one-shot and is not
part of the persistent yt-dlp／bgutil child-process lifecycle.

The Provider runtime atomically contains the pinned Python embed, yt-dlp,
ytmusicapi, Requests, urllib3, certifi, charset-normalizer, idna and bgutil
artifacts. Every artifact has a version, hash, expected size, source and license
entry in `shared/featureDependencies.json`. Provider Python remains independent
from Audio Python.

Renderer sends only an artist id for search／cancel and an artist id plus opaque
candidate id for preview／apply. Main derives the library path, current tracks,
artist display name, at most three first-credit recordings and their valid
video／channel ids. The worker request contains only that bounded context. It
must not accept a caller URL, filesystem path, cookies, headers, authentication,
locale override or arbitrary ytmusicapi option.

The worker creates its own Requests session with a reject-all cookie policy for
both storage and return, clears ytmusicapi's client cookie projection and never
imports browser state. Ambient netrc authentication and environment／system proxy
state are disabled. An app-owned response hook rejects redirects before Requests
can replay response cookies and classifies HTTP error status before the pinned
ytmusicapi exception path discards it; response bodies and exception text remain
private.

## Worker output

The worker performs one anonymous artist-filtered search, hard-caps provider
results to three and emits one JSON line. An observation may contain only:

| Field    | Bound                                                                 |
| -------- | --------------------------------------------------------------------- |
| rank     | Positive integer within the three-result response                     |
| name     | Bounded display name                                                  |
| browseId | Main-private provider identity used only inside the candidate session |
| portrait | HTTPS URL plus bounded square width／height                           |
| evidence | Exact-name flag and bounded matched channel／video counts             |

Portraits may come only from `yt3.googleusercontent.com`, `yt3.ggpht.com` or
`lh3.googleusercontent.com`. Missing portraits are normal misses. Unknown fields
are ignored at the worker input boundary and rejected by the Node output
validator when they would expand the public contract. Raw provider responses,
exception messages and stderr never cross into Renderer or persistence.
The worker writes its single JSON line as UTF-8 bytes rather than inheriting the
Windows console code page, so CJK provider names cannot corrupt or terminate the
protocol.

When no bounded recording evidence exists, the worker does not request artist
details or playlists. If a lower-ranked result drifts after at least one valid
candidate was normalized, the worker preserves those prior candidates as a
bounded partial result instead of discarding the entire response.

## Scheduling and failure policy

Main serializes the complete artist-photo lookup, including library track listing
and search-context derivation, with a 750 ms minimum start interval and at most
four running／queued requests. Excess work fails as a bounded busy result instead
of growing an unbounded queue; cancelling queued work releases its admission slot
immediately. A request has a 15-second process deadline, bounded
stdin／stdout／stderr and cancellation that terminates the worker. App shutdown
permanently closes the runner manager before aborting active one-shot workers, so
queued work cannot spawn afterward. Termination waits for the child close event,
then uses a bounded force-kill fallback if needed, before stopping the shared
provider sidecar. The first `before-quit` event is held while tracked worker tasks
settle, then Main reissues quit; the repeated event is allowed through. Timeout
and provider-unavailable may retry once.
Provider rejection and schema drift do not retry. HTTP 429 opens the global
cooldown immediately; three consecutive operational failures open the shorter
operational cooldown. A partial result caused by rate limiting still opens the
global cooldown; other normal ok, partial or no-match responses reset the
consecutive-failure count, while cancelled work does not change it.

Preview and apply share a separate fail-fast admission cap of eight active
candidate intents. A candidate accepts only one apply at a time, and repeated
preview copies for the same candidate are rejected while active and for 250 ms
after completion. Busy work is never queued, so a valid opaque candidate id
cannot fan out unbounded fresh sidecar reads or cached image copies.

Public results use fixed status and reason values. No-match is a quiet empty UI.
Disabled, unavailable, timeout, rate-limit and schema failures map to bounded
Traditional Chinese guidance without provider body, URL, path, command or
stderr. The existing official-channel resolver and local image actions remain
available while this breaker is open.

## Candidate and image lifecycle

Search creates a short-lived, bounded Main-only session tied to the resolved
library root, artist id and a SHA-256 fingerprint of the derived search context.
Renderer receives only random opaque candidate ids and display names. Sessions
expire after ten minutes and the process keeps at most 32.

Preview downloads the selected remote image through the shared validated artwork
pipeline. Every redirect rechecks the exact host allowlist; MIME, magic bytes,
the 2 MiB byte cap and 2048×2048 pixel cap must pass. Identical candidate loads
share one in-flight request, no more than three distinct image downloads run at
once and validated session images use a 16 MiB process cache cap with oldest
session eviction. Renderer receives only validated bytes and a MIME type and
creates a revocable blob URL. Closing, retrying, changing artist or disposing the
composable invalidates revisions and revokes all owned blobs.

Apply uses a Main-owned track supplier to re-read the current library and derive
its fingerprint before and after image acquisition. The final read bypasses
cached channel sidecar facts as well as re-listing tracks. After that asynchronous
context read, Main synchronously re-lists and fingerprints the complete track
snapshot, then rechecks session identity／TTL, search fingerprint and existing
photo immediately before the synchronous write. A stale or evicted session is
rejected, and a concurrent local or official image wins. Validated preview bytes
are reused instead of downloaded again. A successful explicit apply may replace
a prior removal marker and writes `source: youtube-music` plus
`selection: user-confirmed`.

## Persistence

New `photo.json` writes use schema version 2. Allowed sources are
`local-file`, `youtube-channel` and `youtube-music`; acceptance is
`automatic-evidence` or `user-confirmed` as appropriate. The sidecar stores the
local filename, acceptance time and only source-specific bounded evidence. It
does not store artist names, remote URLs, YT Music browse／entity ids or raw
provider data. Schema version 1 remains readable.

Renderer reads the image only through the allowlisted
`utawakui-media://artist-photo/<artistId>/<filename>` route after Main verifies
the sidecar filename. Artist photos are not automatically projected to public
Output.

## Drift and release gates

Candidate-first delivery does not wait for a week-long observation. Before
strict automatic apply can be proposed, the private Phase 0 corpus must run at
least three times over 48–72 hours and in two locales. Each run records Top-3
coverage, normal miss rate, operational failure rate, P95 latency, observed image
hosts, schema validity and the production-owned strict policy decision.

The auto gate requires zero wrong automatic decisions at every timepoint. Any
login／cookie／CAPTCHA requirement, an image host outside the narrow allowlist,
unbounded provider results, schema ambiguity or a wrong eligible match keeps
automatic apply off. A seven-day observation remains a non-blocking pre／post
release stability check. Candidate search may remain available when its bounded
manual path passes verification even if automatic apply never ships.

## Verification

Release verification includes focused Node and Python tests, preload／IPC
allowlist tests, artist-photo sidecar migration and race tests, runtime manifest
and license inventory, production build, `dist:dir`, packaged worker path／spawn
smoke, and a full Electron restart after Main／preload changes. Manual acceptance
covers missing-photo entry visibility, keyboard and focus behavior, deep／light
themes, candidate selection, apply refresh, no-match, gate-disabled, offline and
rate-limited states.
