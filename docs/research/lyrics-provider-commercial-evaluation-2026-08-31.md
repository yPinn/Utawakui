# Lyrics Provider Commercial Evaluation — 2026-08-31

Status: research decision; not a production-provider approval or legal opinion.

## Decision

Do not add Apple Music, Spotify, Paxsenix, Kugou, QQ Music, NetEase, or another
streaming-service private lyrics endpoint as the next production provider. Their
payloads may be technically retrievable, but the reviewed public contracts do not
grant Utawakui the lyric display, storage, OBS output, karaoke, or redistribution
rights it needs.

The next two commercial conversations should be:

1. **Musixmatch Business／Lyrics API** for the strongest documented combination of
   licensed catalog data and authored character／word timing.
2. **LyricFind** as the second licensed enterprise quote, especially if its contract
   can explicitly cover local caching, public OBS output and karaoke／sing-along.

The cheapest bounded technical probe is **Unison**, not Apple Music. Run it only in
the existing isolated provider-evaluation harness until Better Lyrics supplies a
written commercial quote and confirms that the license covers the underlying lyric
copyrights, not only database rights or server source code.

Keep LRCLIB, NetEase and the current Better Lyrics cache as manual／experimental
acquisition paths. Do not describe any of them as a commercial-rights solution.
AMLL remains retired from acquisition because its high-quality authored TTML did
not offset its low observed daily hit rate.

## Evaluation matrix

Every candidate is evaluated on:

- authored word／character timing, not an estimated token sweep;
- separate background／concurrent vocal lanes;
- catalog coverage and recording identity quality;
- lyric-content rights, commercial distribution and territorial restrictions;
- local storage, offline cache, transformation and attribution requirements;
- OBS／broadcast／public display and karaoke／sing-along rights;
- public price or quote requirement, credentials and per-call limits;
- endpoint stability, documented API status and maintenance burden.

An open-source client license applies to code. It does not automatically license
the lyric text returned by that client. Likewise, a paid streaming subscription or
a paid proxy API does not automatically grant public lyric-display rights.

## Candidate ranking

| Path                                       | Authored timing                                                              | Background lane                                                             | Commercial／OBS rights                                                                                               | Cost／access                                                                                       | Decision                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Musixmatch official API                    | RichSync exposes single-character offsets                                    | Not promised; reviewed sample folds backing phrases into the same line      | Licensed catalog, but exact territories, cache, transformation, OBS and karaoke scope must be contracted             | API key; commercial plan／quote; exact public price unavailable                                    | **First commercial quote**                                      |
| LyricFind direct contract                  | Sync products are documented; exact word schema is not public                | Not publicly documented                                                     | Established lyric licensing and royalty reporting; karaoke／public output must be explicitly negotiated              | Enterprise contact; no current public price                                                        | **Second commercial quote**                                     |
| Unison commercial corpus                   | TTML／`richsync` accepted and returned                                       | Preserved only when a submitted TTML contains it; no coverage promise       | README requires a commercial license for sold products; underlying lyric-rights warranty still needs confirmation    | Contact `enterprise@boidu.dev`; no public price                                                    | **Cheapest isolated probe after written terms**                 |
| Better Lyrics API／cache                   | Syllable／TTML when present                                                  | Format can carry background rows                                            | GPL covers code, not upstream lyric content; no reviewed commercial lyric sublicense                                 | Public service is free; uncached access may require a key                                          | Keep experimental; not a rights backbone                        |
| LRCLIB                                     | Broad line sync; rare Lyricsfile records can be real T2                      | No reliable lane contract                                                   | Service is free and server code is MIT; no separate lyric-corpus license was found                                   | Free／donation-supported                                                                           | Keep manual baseline                                            |
| AMLL TTML DB                               | Excellent authored T2 on hits                                                | TTML supports concurrent／background roles                                  | Community provenance and mixed upstream rights                                                                       | Free                                                                                               | Retired: low incremental hit rate                               |
| Apple Music private TTML／Paxsenix         | Best observed syllable timing and concurrent vocals                          | Yes on some Apple TTML                                                      | Official API does not expose lyric bodies; scraping／caching and synchronization restrictions conflict with this use | Apple Developer Program is USD 99／year; Paxsenix is freemium; neither payment grants lyric rights | **No-go for production**                                        |
| Spotify private lyrics wrappers            | Synced payload exists in Spotify clients                                     | Spotify tells contributors to prioritize the main vocal when voices overlap | No official lyrics endpoint; developer policy conflicts with public／business and visual-sync use                    | Developer client id; no official lyrics product to buy                                             | **No-go for production**                                        |
| Kugou KRC／QQ／NetEase consumer endpoints  | KRC／YRC can provide authored word timing; QQ／ordinary NetEase results vary | No dependable separate-lane contract                                        | Elitesand calls undocumented consumer web／mobile endpoints with no reviewed commercial lyric license                | Technically free; partnership price not public                                                     | **No-go unless a direct written business contract is obtained** |
| YouTube Music／Deezer／TIDAL private feeds | Varies by the upstream licensor                                              | Not documented as a public API capability                                   | Their public developer APIs do not provide a reviewed lyric-content license for this product                         | Platform credentials／quota do not buy lyrics rights                                               | **Do not reverse-engineer for production**                      |

## Elitesand comparison

The early local source at `E:/elitesand-pro` registers this order in
`server/services/lyrics-engine.js`:

1. BetterLyrics;
2. Paxsenix／Apple Music;
3. Kugou;
4. QQ Music;
5. LRCLIB;
6. NetEase fallback.

It does not use AMLL. Its Apple path scrapes a bearer token from the Apple Music web
bundle, searches `amp-api.music.apple.com`, then requests the matched lyric from
Paxsenix. Its Kugou, QQ and NetEase paths call consumer web／mobile endpoints
directly. These choices explain its high technical hit rate, but they do not supply
a commercial rights chain.

Elitesand also calls `ensureWordTimings()` in
`public/js/lyric-motion-kernel.js`. When a source has only line timing, that fallback
splits the line into display tokens and estimates their timing. A visible per-word
sweep is therefore not proof of authored word timing. Utawakui should keep T2
reserved for validated authored segments.

## Streaming-platform findings

### Apple Music

Apple's documented `Song` object exposes only a `hasLyrics` Boolean, while the
Apple Music API documents catalog, library and playback resources rather than a
lyrics-body endpoint. The developer agreement also forbids scraping Apple or
licensor data except where expressly provided, and restricts download, modification
and synchronization of MusicKit content. The USD 99 annual developer membership is
an app-development cost, not a lyric sublicense.

Apple remains useful as a quality benchmark and as a metadata／ISRC source through
documented APIs. Its private TTML must not become a production acquisition source.

### Spotify

Spotify's documented track response contains metadata and an `explicit` flag, not
a lyric body. Spotify says Musixmatch supplies its licensed synced lyrics (PetitLyrics
in Japan). Its current developer policy prohibits syncing sound recordings with
visual media and business／public playback uses, while its developer terms include
song lyrics within protected Spotify Content.

Therefore an unofficial Spotify lyrics package, cookie, access token, or user
Premium subscription is not a commercial lyrics integration.

### YouTube Music and other DSP clients

The YouTube Data API exposes video, caption, search and metadata resources; it does
not document the YouTube Music lyric feed used by the consumer client. The same
boundary applies to private Deezer／TIDAL payloads: unless a provider supplies a
documented lyrics product and a contract for Utawakui's use, consumer-client access
is not an acceptable production source.

## Licensed-provider findings

### Musixmatch

Musixmatch's official API materials describe a licensed lyrics database and require
an API key. `track.richsync.get` returns line start／end times plus per-character
offsets, which is sufficient to derive authored T2 segments without inventing
timing. Responses include restriction and lyric-copyright fields.

The reviewed RichSync example does not expose an independent background-vocal
lane. Parenthesized backing phrases are included in the same text line. Sales must
confirm whether another contracted schema represents concurrent vocals and how
often that data exists; this cannot be inferred from the consumer Spotify UI.

No current exact commercial API price was publicly accessible. Treat it as a paid
quote and ask for:

- Taiwan／Japan／Korea and global territory coverage;
- desktop redistribution and end-user authentication rules;
- local cache duration, offline use and deletion obligations;
- OBS Browser Source, livestream, recording and public-display rights;
- karaoke／sing-along and vocal-removal usage;
- OpenCC conversion, romanization, translation and other transformations;
- RichSync coverage by market and any concurrent-vocal schema;
- attribution, tracking, reporting, minimum guarantee and overage price.

### LyricFind

LyricFind publicly presents itself as a licensed lyric-data, synchronization and
translation provider with song-by-song／territory-by-territory royalty reporting.
Its technical schema and price are not currently public, so it needs the same
requirements sheet as Musixmatch.

Do not assume a normal LyricFind consumer feed covers Utawakui. Pandora's published
LyricFind end-user license explicitly limits that feed to personal non-commercial
use and excludes public display and karaoke／sing-along rights. A direct Utawakui
contract must say otherwise.

### Unison and Better Lyrics

Unison is a crowdsourced API with metadata search, voting, TTML／LRC／plain formats,
`richsync`／`linesync` classification and a daily database dump. Its README licenses
the server under AGPL, the dump under ODbL for open use, and requires a commercial
license when selling a product on top of the corpus.

That is a clearer commercial path than the Better Lyrics cache, but it is not yet
sufficient evidence that every submitted lyric has a sublicensable copyright chain.
Before production use, obtain a written answer covering contributor warranties,
takedowns, publisher claims, indemnity, territories, closed-source Electron use,
local storage, public OBS display and karaoke.

The current Better Lyrics endpoint is still useful as a quality／format experiment.
Its GPL statement permits commercial use of the software; that statement must not
be presented as a license to the Apple／Musixmatch／community lyric content handled
by its backends.

### LRCLIB

LRCLIB describes itself as a completely free synchronized-lyrics service, and the
current server repository is MIT-licensed. That LICENSE covers the server software.
No separate current lyric-corpus copyright license was found in the reviewed README,
LICENSE or public docs.

Utawakui has validated one real LRCLIB Lyricsfile as complete T2, but the discovery
pass found T2 rare relative to ordinary line sync. LRCLIB remains a valuable manual
fallback; it does not solve the commercial lyric-rights requirement.

## Background-vocal conclusion

Apple TTML is the strongest observed source for separate primary and background
vocal lanes, but it is not available through an official lyrics API. AMLL and
community TTML can preserve those lanes when contributors include them, but coverage
and rights are not guaranteed. Musixmatch RichSync supplies authored character
timing but the reviewed public schema is effectively one text lane.

Therefore background vocals must remain an optional capability:

- preserve and render them when a legitimately obtained TTML provides them;
- never downgrade a main-vocal match merely because the provider lacks a separate
  backing lane;
- do not synthesize a background lane from parentheses or overlapping audio;
- report `backgroundLane: authored | absent | unknown` separately from T2 quality.

## Safest next prototype

1. Send the same rights／price questionnaire to Musixmatch, LyricFind and Unison.
2. Do not contact or integrate Apple／Spotify private endpoints.
3. After written permission or an evaluation agreement, add an **evaluation-only
   Unison adapter** to the existing private 40-case corpus runner. Record only
   bounded match, timing tier, background-lane presence, latency and failure codes;
   do not commit lyric bodies or private track references.
4. If Musixmatch's quote is viable, prototype its official RichSync API as the
   commercial primary and retain LRCLIB as a user-selected community fallback.
5. If no licensed quote is viable, keep the product local-first: user-imported lyric
   files are the durable commercial-safe core, while online acquisition remains
   explicitly experimental and separately gated.

## Primary references

- [Apple MusicKit](https://developer.apple.com/musickit/)
- [Apple `Song.hasLyrics`](https://developer.apple.com/documentation/musickit/song/haslyrics)
- [Apple Developer Program License Agreement](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)
- [Apple Developer Program enrollment price](https://developer.apple.com/programs/enroll/)
- [Spotify Web API `Get Track`](https://developer.spotify.com/documentation/web-api/reference/get-track)
- [Spotify Developer Policy](https://developer.spotify.com/policy)
- [Spotify Developer Terms](https://developer.spotify.com/terms)
- [Spotify: Musixmatch supplies licensed synced lyrics](https://support.spotify.com/me-en/artists/article/managing-your-lyrics-on-spotify/)
- [Musixmatch official Lyrics API collection](https://www.postman.com/musixmatch-dev/musixmatch-apis/documentation/pqm8o6w/lyrics-api)
- [Musixmatch official API schema](https://github.com/musixmatch/musixmatch-sdk/blob/master/swagger/swagger.json)
- [Better Lyrics](https://github.com/better-lyrics/better-lyrics)
- [Better Lyrics API source](https://github.com/better-lyrics/cf-api)
- [Unison API and corpus licensing](https://github.com/better-lyrics/unison)
- [LRCLIB server and license](https://github.com/tranxuanthang/lrclib)
- [Paxsenix Lyrically API](https://lyrics.paxsenix.org/)
- [YouTube Data API reference](https://developers.google.com/youtube/v3/docs)
- [Pandora LyricFind end-user license](https://www.pandora.com/legal/lyrics)
- [LyricFind company profile](https://ca.linkedin.com/company/lyricfind-inc-)
