# ADR 0015: Recording-first provider discovery

## Status

Accepted and implemented (2026-09-02; YT Music-first discovery update
2026-09-03).

## Context

Provider import previously required a YouTube or YouTube Music URL. A pasted
YouTube Music URL was also treated as if it already identified an audio-native
recording. That assumption is too strong: the URL host describes the product
surface the user copied from, while the resolved YouTube id may still represent
an MV, live performance, lyric video, remix, or another recording variant.

Utawakui needs music-oriented discovery without making an embedded provider page,
private web endpoint, or account session part of the application trust boundary.
The selected media duration also matters to later lyrics matching, so discovery
metadata must not become the final timing authority.

## Decision

- Accept bounded free-text queries, YouTube／YouTube Music video URLs, and fixed
  playlist／album URLs through one `import:resolve-source` IPC intent.
- Classify renderer input in main. Only allowlisted YouTube ids, playlist ids and
  main-derived search inputs reach provider operations. Text produces one fixed,
  bounded `https://music.youtube.com/search?...#songs` input plus bounded
  `ytsearch` fallbacks; arbitrary renderer-provided URLs are never forwarded to
  yt-dlp.
- Keep the provider flow behind `provider-flow` and the app-managed yt-dlp runtime.
  Local file import remains independent and always available.
- Keep native recording-first results as the primary discovery surface. Prefer the
  YT Music Songs section for structured track／artist／album／duration evidence and
  retain ordinary YouTube search for coverage and alternate versions. Resolve
  at most three full YT Music song entries and eight flat entries per YouTube
  query; enforce those limits again after provider output, merge the same media id
  while retaining both provider observations, then rank the complete bounded pool
  before exposing at most twelve candidates. When the operator wants broader
  manual exploration, Main derives one fixed
  `https://music.youtube.com/search` URL from a bounded query and opens it in the
  system browser. The renderer cannot provide a URL; the user explicitly copies a
  song／album／playlist URL back through the existing classifier.
- Treat YouTube and YouTube Music as discovery surfaces over YouTube media ids,
  not as proof that two results are the same recording.
- Rank candidates using bounded yt-dlp metadata signals. YT Music Songs,
  Topic／auto-generated tracks with structured music fields and official audio rank
  above lyric videos, MVs, live performances, and named variants. Explicit
  live／cover／remix／speed／acoustic evidence overrides YT Music Songs provenance.
  A valid `view_count` contributes a logarithmic bonus from zero to six points,
  deliberately below the seven-point gap between YT Music Songs and Topic audio;
  popularity may reorder comparable recordings but cannot replace recording-kind
  evidence. Text search automatically chooses only a finite-duration
  `release-recording`; every other result remains available for explicit review.
- Keep candidate UI disclosure operational and familiar. Show provider, concise
  version type, duration and compact views. Internal confidence, score and
  recording-fit vocabulary remain implementation details rather than badges.
- Require explicit user confirmation before download. Download continues to
  re-resolve the selected id through the existing yt-dlp metadata phase; metadata
  read from the downloaded sidecar, including duration, is authoritative for
  library indexing and optional lyrics acquisition.
- Recognize Spotify and Apple Music URLs only as deferred provider inputs. No
  metadata fetch, redirect traversal, account access, or conversion is performed
  until a separate adapter decision is accepted.

## Rejected for this phase

- Embedding YouTube Music as the primary search UI or persisting a Google account
  session inside Electron. A signed-out, memory-partitioned `WebContentsView` may
  be reconsidered only as a removable technical spike, not as an acquisition UI.
- DOM scraping, private Innertube endpoints, or renderer-owned authenticated
  provider sessions.
- Requiring YouTube Data API credentials or an Utawakui backend for first-party
  discovery.
- Automatically downloading the first result without operator review.
- Treating a provider title or hostname as conclusive recording identity.

## Consequences

The first release has no API-key quota and reuses the already optional yt-dlp
runtime. This is not an official YouTube Music API integration: search availability
follows the yt-dlp extractor and upstream site behavior. Full YT Music metadata
resolution costs more latency than flat YouTube search, so the YT Music result set
is smaller and both sources run concurrently. View counts are optional, changing
provider snapshots and therefore only weak ranking evidence, not identity or
availability guarantees. Candidate duration is provisional; downloaded metadata
is the stable local reference. System-browser exploration adds
no Electron cookie／account boundary and has no access to the browser result;
paste-back remains an explicit operator action. Account playlists and cross-platform
track mapping remain separate future capabilities with their own authentication,
terms, and failure boundaries.
