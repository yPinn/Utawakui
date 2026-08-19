# ADR 0001: Do not pursue yt-dlp plugin support (PO Token Provider et al.)

## Status

Accepted (2026-08-19).

## Context

Real-world download debugging on this app's actual download pipeline found that some YouTube videos (bot-detection-protected content in particular) fail even after the full `youtubeAttempts.js` fallback ladder — cookies-from-browser and browser impersonation both exhausted. Tracing the root cause led to yt-dlp's PO Token (Proof-of-Origin) mechanism: some videos require a valid PO Token to serve real media data, and this app's yt-dlp install produces `PO Token Providers: none` — no token generation is configured.

The yt-dlp community's standard solution is `bgutil-ytdlp-pot-provider`: a yt-dlp plugin plus a companion Node.js/Deno HTTP server that generates valid PO Tokens directly, without needing browser cookies at all.

## Decision

Do not integrate `bgutil-ytdlp-pot-provider`, or any yt-dlp plugin, into this app.

This was verified empirically, not assumed. The plugin's repo was cloned, its companion server was built and run for real (confirmed healthy on `http://127.0.0.1:4416/ping`), and its yt-dlp-side plugin was installed and pointed at via `--plugin-dirs` against this app's actual `yt-dlp.exe` (the standalone binary `youtube-dl-exec` downloads via its own `postinstall` script). The plugin never loaded — `Plugin directories: none`. A trivial, unrelated dummy extractor plugin was tested the same way and also failed to load, ruling out a plugin-specific problem.

This is a known, documented yt-dlp limitation: `yt-dlp.exe` is a PyInstaller-frozen build, and yt-dlp's plugin discovery mechanism depends on Python's normal `PYTHONPATH`-based module search, which does not work inside a frozen/standalone executable — confirmed against yt-dlp's own GitHub issues and docs. This blocks **every** yt-dlp plugin, not specifically PO Token providers.

## Consequences

Reopening this path requires replacing the current distribution model — auto-downloaded, zero-install standalone `yt-dlp.exe` via `youtube-dl-exec`'s `postinstall` — with something that preserves normal Python module loading (a `pip install`-based yt-dlp, or an embedded portable Python runtime). That is a materially larger architectural decision affecting every user's install footprint, not a scoped feature change, and is not planned.

Instead, download reliability improvements went a different direction that needs no plugin support: a `player_client` extractor-args rotation phase (`electron/lib/youtubeAttempts.js`'s `CLIENT_FALLBACK_YOUTUBE_PHASES`), classified failure reporting to the renderer (`electron/lib/downloadFailure.js`), and the existing cookies/impersonate ladder plus local audio import as the practical ceiling for content this pipeline still can't reach.

If this comes up again — "why not just add a plugin option" — the answer is: already tried, verified structurally blocked by the PyInstaller build, not a configuration problem.
