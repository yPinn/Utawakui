# ADR 0028: Local works, versions and release classification

## Status

Accepted; P0/P1 data foundation, P2 work/version operations and P3 release
operations with the shared artist discography implemented (2026-10-23).
P4 Single details implemented; manual acceptance clarified direct reuse of album
visuals and settings, including one-track Singles (2026-10-24).
Provider identity lookup remains deferred.

## Context

The library has playable tracks and read-only album collections, but no stable
local composition identity. Acoustic performances and covers can belong to the
same work while retaining different artists, audio, timing and releases.
The existing collection `kind: 'album'` describes membership authority; it does
not establish whether the publication is an Album, EP or Single. Incomplete
local imports cannot establish a publication's type or total number of tracks.

ADR 0022 assigns covers to their performing artist. The music identity evidence
layer supplies observations and comparison primitives, not persistent identity.
Artwork selection establishes neither a work relationship nor a release type.

## Decision

Use a main-owned `works.json` in each library root for stable `work-UUID`
entities, optional per-track work relationships and independent version facts.
Keep existing track IDs and original-media ownership. A private media binding
prevents a reused track ID from silently inheriting a previous file's profile.
One track has at most one work link in v1; medley relations remain deferred.

Extend `playlists.json` to v3 with optional `releaseInfo` on existing album
collections. Keep collection UUIDs, `kind`, source identities and canonical
membership/order. Release type is `unknown`, `single`, `ep` or `album` and is
resolved per field from manual overrides, source-bound observations, then an
unknown/missing default. Clearing an override restores the source value;
explicit unknown/null suppresses it. Local Single creation uses a bounded
Main operation with one existing track and a verified binding. It does not
introduce arbitrary release membership editing.

Artist discography reuses the existing album area and card primitives as one
music releases section (owner reference confirmed 2026-10-23). Album, Single
and EP cards share that section, with All, Albums and Singles/EPs filters and
year/type metadata. These cards identify releases, not work entities. Unknown
types remain visible in All without being guessed from local track counts.
P4 keeps the same collection UUID and membership authority while opting explicit
Singles into release wording on the same album dossier and track table. Artwork
size, columns, density and controls directly reuse album defaults for one-track,
multiple-track and partial imports. Ordinary summaries show date, count and
duration; partial collection and media failures add only necessary information.
Do not display lead badges or reorder tracks. Missing or changed audio retains
a repair entry through the existing release editor.

Do not create a parallel recording catalog or another release membership file.
Do not deduplicate audio, copy lyrics timing, modify track title/artist, change
queue occurrences or replace playback as a consequence of organization.
Manual organization is offline and does not require provider gates.

Persist user changes with revision checks and atomic replacement. Read failures,
malformed organization documents and unsupported future versions fail closed.
Back up legacy playlist documents before their first successful v3 write.
The v1-to-v2 kind classifier must never run again for a v2 document.

The works data foundation also owns durable deletion receipts and an injectable
recovery service. Prepare the receipt before media deletion; reconcile only the
original binding. P2 connects production delete/import admission to the same
per-library lane. Main validates canonical audio and acquisition epochs; fixed
IPC projects bounded product data and never exposes private bindings.

## Consequences

Phase 1 source-catalog enrichment advances playlists to v4. The authoritative
source manifest, accepted local slot relationships and private media bindings
remain in the same collection document. Automatic parent lookup requires exact
official audio and formal playlist identity; ambiguous local media requires an
explicit release and position confirmation. Source-backed consumers now verify
bindings through the same release runtime as local releases. Full behavior and
operational bounds are in the [source catalog contract](../contracts/release-source-catalog.md).
No artist-wide discography or missing-audio acquisition is introduced.

The explicitly approved reconciliation flow (2026-10-24) permits a user to merge
a verified local release and its complete source counterpart after a field-level
preview. It preserves the local UUID, manual metadata and media, stores retired
UUID redirects in the same playlists document, and keeps ambiguous imports as
pending proposals. It never merges publications merely because they share a
recording or title. Decision replay, metadata provenance and recoverable JSON
transactions are defined in the [library reconciliation contract](../contracts/library-reconciliation.md).

The approved file-tag follow-up is a separate, explicit preview and commit.
Native FLAC comment edits preserve encoded audio and non-target data; only
bindings valid for the verified previous whole-file hash may migrate. Existing
stale bindings must not become fresh by coincidence. Primary publication choice,
format gates, backups and recoverable media transactions are defined in the
[audio tag writeback contract](../contracts/audio-tag-writeback.md).

Artist organization, works, playable media and publication membership remain
separate authorities. The data layer can represent Acoustic + Live + Cover
without collapsing them into an exclusive version enum. Source reimport cannot
overwrite manual release decisions. The same track can remain in several
release collections without changing its source identity.

The v3 release loader preserves existing data and rejects unsupported documents;
older application versions may strip new fields when saving. Migration backups
are necessary, and downgrade editing is not a supported preservation strategy.

P2 exposes a shared work/version editor without introducing a Single layout.
P3 adds a shared release editor, explicit local Single creation and multiple
containing-release navigation. Main verifies bound-local membership lazily;
playback/queue actions refresh proof, and session admission commits under the
same library lane. Startup list projection does not hash the whole library.
P4 consumes those public facts and guards without adding schema or IPC. Current
source pause/resume retains the queue snapshot; lead designation never reorders
members. Album, EP and unknown detail composition retains existing defaults.
Details, operation bounds, persistence and recovery acceptance belong in the
[works and releases contract](../contracts/works-versions-and-releases.md).
