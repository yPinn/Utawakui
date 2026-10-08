# ADR 0022: Artist identity and organization

## Status

Accepted (2026-10-05). Implemented on 2026-10-05: the derived index, the sidebar
artists section and the artist page. The official-channel artist photo path and
the explicit YT Music candidate fallback were implemented by 2026-10-08;
visible Electron acceptance and the YT Music drift gate are pending.
MusicBrainz display-name resolution is not implemented yet. The owner selected MusicBrainz as the
external artist identity authority; the remaining sections define the local
model that consumes it.

Delivery is phased. The first slice is the derived, non-persistent artist model,
the library navigation and the artist page, plus MusicBrainz resolution used only
for the display name. `artists.json` with merge／split／undo, merge suggestions
and MBID-based automatic merging are deferred until the library shows real
cross-language duplication or a shift toward single-track imports; on 2026-10-05
the owner's library had one such duplicate. Local audio tags and cover／upload
performer attribution follow after the first slice.

## Context

The library stores one flat `artist` string per track. Provider imports derive it
from yt-dlp fields in this order: corroborated performers, the joined `artists`
list, `artist`, a title-derived artist, then `uploader`／`channel`. Local file
imports have no artist at all because audio tags are not read. MusicBrainz is
already used by artwork discovery, but `artwork.json` keeps only recording,
release-group and release MBIDs, and the client flattens `artist-credit` into text.

The only artist grouping today is the album page's supporting content. It picks
the most common artist string among album members and matches other albums and
tracks by `trim().toLocaleLowerCase()`. Consequently `周杰倫`, `周杰伦` and
`Jay Chou` are three artists, `YOASOBI, Ayase` does not match `YOASOBI`, and
local tracks never appear.

The [music identity contract](../contracts/music-identity-evidence-contract.md)
forbids the shared identity layer from emitting canonical artist entities and
requires an ADR before any identity is persisted. Its research basis
([artwork provider evaluation](../research/online-artwork-provider-evaluation-2026-09-27.md))
already states the target shape: tracks keep their credited form, while credits
link to a stable entity; merges without a trusted external id stay local,
confirmed and reversible.

The owner wants an artist page comparable to the album page and has decided:

- covers belong to the performing artist, not the original artist;
- MusicBrainz is adopted directly, because no more stable open artist identity
  source exists for this product;
- local audio tags are likely needed.

## Decision

### Positioning: read-only reference, like albums

Collections split by role. Playlists are editable and ordered because their order
feeds the Setlist and the recording／streaming running order. Albums and artists
are read-only references to source authority, used for lookup and comparison.
An artist page therefore has no editable membership, no manual order and no
Setlist semantics of its own; it shares the album's reference role.

### Library navigation

The playlist sidebar keeps two tiers, separated by one divider:

| Tier             | Content                              | Order                                                                                   |
| ---------------- | ------------------------------------ | --------------------------------------------------------------------------------------- |
| Performance prep | Playlists                            | Manual drag order only; no automatic sort                                               |
| Reference        | Albums and artists mixed in one list | By artist name through `Intl.Collator`; each artist row leads its albums (newest first) |

Albums and artists share one reference list with no divider or toggle between
them: a toggle cannot be shown in the collapsed sidebar, and grouping by artist
name already places an artist directly above its own albums. An album is grouped
under its index-derived album artist (falling back to the member-majority artist
string before the index loads). In the collapsed lane artist rows use a circular
thumbnail cropped from the artist's newest album cover (or a track cover for
album-less artists), while albums keep square covers, so the two kinds stay
distinguishable without labels. Artist rows are labelled only 「藝人」, without a
track count, and do not carry the collapsed-lane current-source dot. The sidebar search filters the whole list.

The artist rows list only artists that own an album or have at least two
tracks. Single-collaboration artists are reached by clicking a credited name on a
track row, PlayerBar or album page, or through search.

Reference sections use fixed, predictable order. A 「最近」 sort and the
collection-level activity record it would need are deferred; returning to recent
music is already served by Right Dock 最近播放. The Lyrics playlist selector keeps
its own stable order.

An artist page mirrors the album page layout: a round-cover 藝人資料 dossier
with play／shuffle／queue, then one read-only track list, then a 專輯 grid that
opens the existing album pages. The track list runs album by album (newest album
first, album order inside), followed by tracks outside the artist's albums
(newest first, then title), so every track stays playable and searchable even
when an artist owns a single album. The album page links its artist name and a
「查看藝人」 action to the artist page, and queue／history sources resolve
artist ids back to the artist page. Track rows on the artist page show no artist line at all, since every
row shares the artist; collaborators are found through each track's album. Elsewhere on the Setlist page and in the
PlayerBar each credited artist is a link to its artist page; Queue and Recently
Played keep plain artist text.

### Artist photos

Artist rows and pages show an artist photo, never a borrowed album cover
([research](../research/artist-photo-sources-2026-10-05.md)). Resolution and
precedence are:

1. A user-selected local image.
2. An already accepted local sidecar image. A user removal marker is also
   authoritative and blocks every automatic resolver.
3. The artist's official YouTube channel avatar. The channel is the majority
   `channel_id` among tracks where the artist is the first credited part, and only
   when that track sidecar's channel name does not end in "- Topic", because
   Topic channels use an album cover as their avatar. Main reads it with the
   app-managed yt-dlp from the fixed channel `/featured` tab and downloads only
   HTTPS `yt3.googleusercontent.com`／`yt3.ggpht.com` images through the existing
   validated image download (redirect re-check, size, magic bytes, MIME,
   dimensions).
4. If the official-channel path still leaves the artist without a photo, an
   explicit 「搜尋線上藝人照片」 action may request up to three anonymous YT Music
   artist candidates. Main derives the artist name and up to three first-credit
   recording／channel observations. The user must inspect a downloaded,
   validated preview and choose one; no result is applied automatically in this
   phase.
5. A generic person icon on a round surface. No initials and no album cover.

Avatar resolution is gated by `provider-flow`, like provider metadata backfill.
While the gate is on, the renderer asks main to resolve missing photos for the
artists listed in the sidebar, one at a time and at most once per artist per app
session; opening an artist page also asks for that artist. Main derives the
channel itself; the renderer sends only the opaque artist id. A YouTube photo is
applied automatically because it comes from the artist's own channel; the user
can replace it with a local image or remove it at any time. YT Music lookup is
never started by sidebar traversal, startup or this automatic channel resolver.
It runs only from the artist-page action, and sends the derived artist name to
the external provider only at that point.

Photos are the first persisted artist data: `<library>/artists/<artistId>/` holds
`photo.<ext>` and `photo.json`. New writes use schema version 2 with an allowlisted
source (`youtube-channel`, `youtube-music` or `local-file`), acceptance
(`automatic-evidence` or `user-confirmed`), accepted time and only the bounded
source evidence needed by the current source. No artist name, remote image URL,
YT Music browse／entity id or worker response is stored; schema version 1 remains
readable. Renderer media uses the allowlisted `utawakui-media://artist-photo/`
route. Because artist ids derive from the comparison key, a future normalizer
change must migrate these directories together with the credit-key re-key.
Wikidata images become a manual candidate once MusicBrainz resolution exists.

The YT Music worker is an anonymous, app-owned, one-request process inside the
same prepared Provider runtime. Search, preview and apply use short-lived opaque
candidate ids; Renderer receives only display names and validated bytes, never
remote URLs. Main serializes lookup, bounds retry, opens a global cooldown on
429 or repeated operational failures, rechecks the feature gate and current
artist evidence on every apply, and lets a local／official photo that wins a race
remain authoritative. Strict automatic apply is a separate future policy: it
requires zero wrong auto decisions across at least three runs over 48–72 hours
and two locales. Until that gate passes, even a unique high-evidence match stays
user-confirmed.

### Grouping basis: performing credit

An artist page groups tracks by **performing credit**. A cover by a VTuber belongs
to that VTuber. Composer, lyricist and original-artist relations are out of scope
for this decision. UI copy never uses「作者」: the artist entity, its page and its
actions say「藝人」, and a track's credit field says「演唱者」.

Before the artist page ships, the provider title parser must be verified against
cover-style titles (`曲名 / 原唱 (Cover)`, `歌ってみた`, `covered by`). No cover
handling exists in `trackIdentity.js`, `ytdlpInfo.js` or `musicTitle.js`, so a
title-derived artist may currently name the original artist.

### Roles: primary and featured

Each track's credit is projected into ordered parts with a role:

| Credit evidence                                                  | Role     | Artist page section |
| ---------------------------------------------------------------- | -------- | ------------------- |
| First credited part, or parts joined by `&`／`、`／`,`／`x`／`×` | primary  | 作品                |
| Parts introduced by `feat.`／`ft.`／`with`                       | featured | 參與作品            |

Roles are derived only from structured credits: the yt-dlp `artists` list and
join context, MusicBrainz `artist-credit` with join phrases, or audio tags.
Splitting a flat string remains a query hint and never creates or merges an
entity, so names such as `AC/DC` are not broken apart.

YT Music credits carry only comma separators, with no `feat.`／`with` join
phrases. Every part of such a credit is therefore **primary** by default, and a
track lists under 作品 for each credited artist. 參與作品 appears only when a source
supplies join phrases: a MusicBrainz credit, audio tags, or an explicit `feat.`
in a structured title. Most first-version pages will show only 作品.

The performer list comes from the same filtered projection as the library
`artist` scalar (`corroboratedAutoGeneratedPerformers`), never from the raw
`info.json` `artists` array, which also lists songwriters and producers. Main
derives it from track sidecars on the first index request and keeps it in memory,
re-reading only new or re-credited tracks after a library change; it adds no
`library.json` field. The renderer requests the index once the library list has
loaded, from an idle task, so it never blocks app startup.

Albums are attributed to their album artist: the audio tag `albumartist` when
present, otherwise the existing most-common-member derivation. A featured guest
on one album track does not place the whole album on the guest's page.

### MusicBrainz is the external artist identity authority

An artist MBID is the only external identifier that can merge entities
automatically. A credited part resolves to an MBID through one of these sources,
strongest first:

1. A MusicBrainz artist id in the audio tags (`MUSICBRAINZ_ARTISTID`,
   `MUSICBRAINZ_ALBUMARTISTID`).
2. The `artist-credit` of a recording MBID that the user already accepted through
   artwork apply.
3. A MusicBrainz artist search where the credited form matches the artist's name
   or one of its aliases exactly, the match is unambiguous, and at least one
   library recording by that credit corroborates it (title plus duration).

Anything weaker is a candidate for user confirmation and is not linked
automatically.

Lookups reuse the existing `electron/lib/musicbrainz/` adapter, the app-wide
1.1-second request scheduler, response bounds and User-Agent. They require the
`provider-flow` gate, the same gate artwork search already uses. Resolution is
on demand only: opening an artist page resolves that artist, and an explicit
「全部查詢」 action enqueues the rest. The app never scans the library in the
background at startup, so artist names leave the machine only after a user
action. The queue is bounded and cancellable and never blocks import, playback or
the artist page. With the gate off or the provider unavailable, the page still
works entirely from local derivation.

From each resolved artist, main keeps only bounded scalar facts: MBID, name, sort
name, type, disambiguation, and up to 32 aliases with their locale, primary flag
and type. Full responses and URLs are never persisted. Cached facts carry a fetch
time and are refreshed lazily.

### Merge tiers

| Tier       | Evidence                                                                                                                                                                    | Behavior                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| A. Auto    | Identical provider-neutral comparison key (NFKC, case, width, whitespace), or the same resolved MBID                                                                        | Grouped as one artist without prompting; the user can still split            |
| B. Suggest | Traditional／Simplified equivalence through the bundled OpenCC forms; a credited form that matches a MusicBrainz alias of an already resolved artist; a weak MBID candidate | Shown as「可能是同一位」; confirm or dismiss once, and the choice is kept    |
| C. Silent  | Romanization, fuzzy similarity, partial token overlap                                                                                                                       | Offered only when the user searches for a merge target; never auto-suggested |

Traditional／Simplified equivalence stays in tier B because identical-looking
names can still belong to different artists and the contract limits OpenCC to
comparison. MusicBrainz aliases are what remove the need for users to enumerate
names by hand: `周杰倫`, `Jay Chou` and `Chou Jie Lun` arrive as catalog aliases of
one MBID. Artists the catalog does not hold fall back to tier A plus manual merge.

### Local persistence: `artists.json`

Main owns a versioned `<library>/artists.json`, beside `playlists.json`. It holds
user decisions and bounded catalog facts, never track metadata:

- `artists`: a local stable id (UUID), an optional user display-name override,
  an optional MBID with its cached catalog facts, and the credit keys linked to
  the entity. Each credit key keeps the raw credited form it came from, the
  normalizer version, and its link source (`auto`, `musicbrainz`, `user`).
- `trackLinks`: a bounded exception list that pins one track's credited part to a
  specific entity, used only to separate homonyms.
- `dismissed`: suggestion pairs the user rejected.
- `revision` plus a bounded undo history of merge, split and override operations.

Track metadata is never rewritten. `library.json` keeps its scalar `artist`, and
the raw credited form stays the display and evidence source. If the comparison
normalizer changes, main re-keys stored credit keys from their raw forms under the
new normalizer version instead of trusting stale keys.

Display name precedence is: user override, then the resolved MusicBrainz artist
name (usually the original script, e.g. 米津玄師 rather than the YT Music
`Kenshi Yonezu`), then the most frequent credited form in the library. Other
MusicBrainz locale aliases are offered as options and are never applied
silently. Track rows keep showing their own credited form.

### Local audio tags

Local import reads bounded tag fields: title, artist, artists, albumartist,
album, year, and the MusicBrainz artist／album-artist／recording ids. Local tracks
have no `info.json`, so these observations go into a new main-owned
`tracks/<trackId>/tags.json` sidecar, while scalar title and artist enter
`library.json` with a `tag` origin. Manual edits keep priority
under the existing origin rules. The candidate parser is `music-metadata` (MIT,
pure JavaScript, ESM-only). Adding it requires the usual sync of
`electron-builder.yml`, `docs/operations/release-inventory.md`, the license
inventory and packaging tests.

### Process boundary

The renderer sends bounded intents only: open an artist by local id, merge entity
ids, split a credit key, confirm or dismiss a suggestion, set or clear a display
override, choose an MBID candidate by opaque candidate id, and undo. It never sends
MBIDs, MusicBrainz URLs, raw provider data or file paths. Main derives artist pages
from the library, playlists and `artists.json`, and projects only display data and
opaque ids.

## Rejected for this decision

- String-only grouping as the long-term model. It cannot merge cross-language
  names and splits joint credits.
- Global replacement of track `artist` strings with a canonical name.
- Automatic merges from romanization, fuzzy matching, machine translation or
  Traditional／Simplified equivalence alone.
- Spotify, Apple Music, Discogs, Last.fm or TheAudioDB as artist identity sources,
  for the licensing, credential and caching reasons in the artwork provider
  evaluation.
- YouTube／YT Music channel ids as an entity identity. Cross-platform identity
  between them is not provable; a channel id may later become supporting evidence
  only after separate verification.
- Group membership, member↔group relations and original-artist links for covers.

## Consequences

Artist pages work offline from local data, and MusicBrainz improves them
incrementally when `provider-flow` is enabled. Coverage of VTuber and doujin
artists in MusicBrainz is unmeasured; for uncatalogued artists the experience is
tier A plus manual merge. The 1 req/s fair-use limit makes a full 「全部查詢」 of a
large library slow by design, which is why resolution is on demand, bounded and
resumable. Hosted MusicBrainz terms favor non-commercial use; commercial
distribution would require confirming MetaBrainz service terms, as already noted
for artwork.

`artists.json` is a new library-root document that needs migration, corruption
backup and restart tests in the same style as `playlists.json`. The album page's
supporting content should move onto the same derivation so album and artist pages
cannot disagree. Accepting this ADR updates the music identity contract's
persistence boundary and the architecture map.
