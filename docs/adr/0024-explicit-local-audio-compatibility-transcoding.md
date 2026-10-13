# ADR 0024: Explicit local audio compatibility transcoding

## Status

Accepted and implemented (2026-10-13).

## Context

Utawakui directly imports only container and codec combinations that the packaged
Electron audio element can play reliably. Common local collections also contain
WMA, AIFF, ALAC, Monkey's Audio, WavPack and CAF files. Treating those files as
directly playable would create library records that the renderer cannot play;
silently converting them during file selection would hide a quality and storage
decision and would make the local-library core depend on FFmpeg.

The app already owns an optional, verified FFmpeg lifecycle. Renderer code must
not provide filesystem paths, executable paths, codec arguments or output format
choices to Main.

## Decision

Local import has two explicit capability tiers:

1. Direct formats keep the existing path: validate the actual container, codec,
   audio-only shape and duration, then preserve the selected bytes unchanged.
2. Recognized compatibility formats are validated but held in a short-lived,
   Main-owned review session. Renderer receives only an opaque session id,
   basenames and allowlisted source-format codes. Conversion starts only after the
   user chooses 「轉成 FLAC 並匯入」.

The initial recognized set is WMA, AIFF／AIFF-C and M4A／ALAC, followed through the
same contract by Monkey's Audio (`.ape`), WavPack (`.wv`) and CAF (`.caf`). A known
extension is never enough: `music-metadata` must report the matching audio-only
container and an allowlisted codec with a positive duration. DRM content, MIDI,
CDA, playlists and video-bearing media remain outside this flow.

The conversion operation rechecks `audio-processing-flow` and resolves the
existing verified FFmpeg runtime at execution time. It never installs a dependency
implicitly. Missing FFmpeg routes the user to the existing Settings preparation
flow; direct imports in the same selection remain successful.

Main invokes FFmpeg with a fixed FLAC recipe and one audio stream. The original
file is not modified or copied into the managed library. FFmpeg writes only to a
library-root staging directory; the output is parsed again as direct FLAC, hashed,
deduplicated and atomically moved to `tracks/<trackId>/`. Index persistence failure
rolls back the new track directory. Source tags and validated embedded artwork may
populate the managed record, while output duration remains authoritative.

`library.json` keeps scalar provenance only: original basename, allowlisted source
format code and `flac` as the conversion format. It stores no absolute source path,
raw codec string, FFmpeg path or command line.

Review sessions are process-memory state, expire after a bounded interval and are
consumed once a conversion run begins. Renderer cannot replace their file list or
choose arbitrary files. Public failures remain bounded reason codes; private paths,
parser details and process context stay in Main diagnostics.

## Consequences

- Common stable local formats can enter the playable library without weakening the
  direct-play allowlist.
- Users make the storage and lossless-conversion decision explicitly. FLAC avoids a
  second lossy encoding but may use more disk space.
- Compatibility conversion is unavailable until the existing audio-processing gate
  and FFmpeg runtime are ready; ordinary local import remains available.
- The short-lived session does not survive an app restart. The user can simply pick
  the source files again after preparing FFmpeg.
- Adding another source format requires parser evidence, an allowlisted
  container／codec matcher, fixed fixtures and FFmpeg decode verification; adding an
  arbitrary output-format picker is a separate product decision.
