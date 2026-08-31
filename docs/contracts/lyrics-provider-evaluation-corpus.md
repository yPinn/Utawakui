# Lyrics Provider Evaluation Corpus Contract

Status: Phase A evaluation contract; not a production provider or packaged asset.

## Purpose

The private corpus provides reviewed reference metadata for measuring LRCLIB and
candidate lyrics providers against the same 40 tracks. It exists only for local
evaluation and does not change automatic acquisition, provider order, storage, or
renderer behavior.

The executable validator and runner are
`scripts/lyrics-provider-corpus-runner.mjs`. The committed synthetic fixture is
`scripts/fixtures/lyrics-provider-corpus/synthetic-two-case.json`.

## Private Input

Store the real corpus under the ignored `.benchmarks/` directory, for example:

```text
.benchmarks/lyrics-provider/corpus.json
```

The corpus id follows the non-descriptive
`lyrics-provider-private[-synthetic]-vN` pattern. The default validator requires
exactly 40 cases. Each case contains only:

- an opaque sequential id such as `case-001`;
- controlled stratification tags;
- `goldStatus: reviewed`;
- manually reviewed title, artist, optional album, duration, and version class.

Case numbering and corpus order must be assigned independently of source-library
order, chart rank, title, artist, or any other identifying source sequence.

The controlled tags cover language, catalog reach, recording version, optional
era, explicit version traps, and one corpus stratum. Every case requires exactly
one compatible language tag, exactly one catalog-reach tag, exactly one recording version, and exactly one of
`chinese-rap`, `chinese-pop`, `english-catalog`, `japanese-catalog`, or
`korean-catalog`. The reference version must equal the version tag. A real 40-case
corpus contains exactly 8 cases in each stratum and declares each stratum as a
required tag with `minimumCases: 8`; the synthetic fixture keeps the same exact-one
stratum rule without pretending to satisfy the real distribution.

Each real stratum contains exactly 7 `mainstream` and 1 `long-tail` case. Every
case requires a known first release year of 2010 or later during preparation and
an explicit `recent-release` confirmation during manual review.
Chinese strata accept `mandarin`, `cantonese`, or `multilingual`; the other three
accept their named language or `multilingual`.

Chinese rap and Chinese pop are language／genre coverage strata, not geographic
ones. Artist citizenship, residence, label territory, and release origin are not
selection gates. Cross-region and overseas recordings are eligible when manual
review confirms the primary lyrics language and genre; mixed-language works use
the existing `multilingual` tag.

Catalog reach is `mainstream` or `long-tail`, determined only within each corpus
stratum from a fixed popularity snapshot. It does not claim label ownership or
artist independence. `independent` is intentionally not a controlled tag because
that classification would require separate per-release ownership review.

## Candidate Preparation

Candidate preparation is separate from corpus approval. Generated records live
only under `.benchmarks/`, retain source identifiers for private review, and always
use `reviewStatus: needs-review`. The generator cannot write `goldStatus: reviewed`
or directly create the runnable corpus.

Run the read-only official-source smoke with:

```text
npm run lyrics:prepare-provider-corpus -- --smoke
```

It selects one deterministic seed per stratum, reads at most one MusicBrainz page
per seed, samples at most ten recordings per stratum, queries ListenBrainz
popularity, prints counts only, and writes no file. Run the complete private
candidate preparation without arguments. It has one fixed output path,
`.benchmarks/lyrics-provider/candidates.json`, refuses to overwrite an existing
artifact, and does not accept paths, URLs, tokens, headers, or provider ids.

The deterministic selector first excludes missing release dates and dates before
2010, then takes 8 records from each of the five strata. Within each stratum,
ListenBrainz unique-user counts define relative catalog reach: the upper and lower
40% are eligible and the middle 20% is excluded. Subject to the two-record
per-primary-artist cap, the selector takes the 7 highest unique-user counts from
the upper band, using listen count as the next tie-break, plus 1 version-hash
samples from the lower band. Source order, popularity rank, title, and artist name
do not determine final persisted ordering; a versioned SHA-256 key does. An exact
eight-recording pilot shortlist is also valid: its seven highest-popularity records
form the mainstream group and its remaining lowest-popularity record is the named
long-tail control. This fallback never expands the 40-case human-review pool.

### Manual Review And Export

Initialize the separate private review manifest after candidate preparation:

```text
npm run lyrics:review-provider-corpus -- init
```

This command reads only the fixed ignored `candidates.json`, validates its complete
persisted schema and distribution, and creates only
`.benchmarks/lyrics-provider/reviews.json`. Every record starts `pending`; the
command cannot create a runnable corpus or infer a reviewed decision from source
metadata. The review manifest is bound to the canonical validated candidate-set
content by SHA-256, so replacing content under the same candidate-set id invalidates
all prior reviews.

Each review has an exact schema. `pending` keeps every decision field null.
`rejected` requires one controlled reason and also keeps decision fields null.
`approved` requires the reviewer to confirm the original stratum, choose one
compatible controlled language, classify the recording as `studio`, `live`,
`remaster`, `cover`, `remix`, or `acoustic`, state whether it is a version trap,
and provide reviewed title, artist, optional album, duration, and matching version.
An approval requires `recent-release`, which means the reviewer confirmed that the
evaluated recording's first release is from 2010 onward; it is not inferred from candidate
metadata. If research finds an earlier release, reject it with the controlled
`release-before-2010` reason so a replacement can be prepared. The manifest accepts
no notes, lyrics, provider ids, URLs, paths, credentials, hashes other than its
candidate-set binding, or free-form tags.

The reviewer confirms rather than changes a candidate's stratum. Reclassifying a
candidate after selection would invalidate the within-stratum popularity band that
produced its `mainstream` or `long-tail` label. A language／genre mismatch or any
ambiguous recording is rejected and replaced through a deliberate new candidate
set; the exporter never silently backfills, moves, or drops it.

The current editable and exportable pilot identity is candidate-set v4. A
replacement revision increments the candidate-set version, archives the prior
candidate and review pair byte-for-byte, removes every rejected recording, and
adds the same number of candidates in the same strata. Exact retained approvals
are carried by recording MBID only; retained pending cases and every replacement
remain pending. A rejected recording cannot be retained, and an approved or
pending recording cannot be silently removed. Earlier candidate-set versions stay
readable for audit but are not exportable as the current pilot.

The current editable and exportable pilot identity is candidate-set v4. A
replacement revision increments the candidate-set version, archives the prior
candidate and review pair byte-for-byte, removes every rejected recording, and
adds the same number of candidates in the same strata. Exact retained approvals
are carried by recording MBID only; retained pending cases and every replacement
remain pending. A rejected recording cannot be retained, and an approved or
pending recording cannot be silently removed. Earlier candidate-set versions stay
readable for audit but are not exportable as the current pilot.

The current editable and exportable pilot identity is candidate-set v4. A
replacement revision increments the candidate-set version, archives the prior
candidate and review pair byte-for-byte, removes every rejected recording, and
adds the same number of candidates in the same strata. Exact retained approvals
are carried by recording MBID only; retained pending cases and every replacement
remain pending. A rejected recording cannot be retained, and an approved or
pending recording cannot be silently removed. Earlier candidate-set versions stay
readable for audit but are not exportable as the current pilot.

After all 40 reviews are approved, export with:

```text
npm run lyrics:review-provider-corpus -- export
```

The command uses only fixed private paths, bounded JSON reads, private no-overwrite
publication and count-only output. It assigns opaque sequential case ids in the
candidate set's versioned hash order, removes candidate ids and all provenance,
then calls the same runnable-corpus validator used by the benchmark runner. Any
pending or rejected review, digest mismatch, extra or missing record, malformed
field, invalid language／version／era, or 8／7／1 distribution failure prevents
`corpus.json` from being created.

The real-corpus acceptance policy is code-owned rather than review-owned. It fixes
the current LRCLIB baseline and AMLL candidate descriptors, 40 cases, 8 cases per
stratum, at least 20 reviewed provider matches, at least 95% non-miss request
success, at most 1% false matches, at least 10 percentage points of incremental
coverage, or at least 10 unique valid T2 results. The last two value thresholds
make the documented "material set" gate explicit for Phase A and remain subject to
the owner go／no-go decision before product integration; a review file cannot
weaken or replace any threshold.

The 40-case set is a directional Phase A pilot rather than a population estimate.
Eight cases per stratum can expose obvious coverage gaps and false matches, but it
cannot support precise language-wide prevalence claims. The strict percentage
gates intentionally remain unchanged: one false match in 40 cases is already
2.5% and therefore fails the 1% maximum.

Open-metadata discovery must not use citizenship, residence, country of origin, or
release territory. The preferred Chinese discovery path uses a work carrying both
a MusicBrainz work id and work-level Wikidata evidence for a Chinese language plus
the target genre. When that structured coverage cannot fill the eight-record pilot,
a fixed private exact-recording shortlist may supplement it. The persisted source
marks that weaker basis as `recording-shortlist`; it remains `needs-review`, carries
no prior Chinese approval, and requires the same explicit language／genre／credit／
version confirmation. Artist language, occupation, or genre must never be inherited
by all of an artist's recordings. English, Japanese, and Korean discovery continues
to use work-level language metadata.

Wikidata discovery performs only the five fixed queries. A transport failure,
body-stream interruption, 429, or transient 5xx response may retry up to two
times; bounded `Retry-After` takes precedence over the one／two-second fallback
delays. Timeouts, ordinary 4xx responses, response bounds, malformed JSON, and
schema failures do not retry.

MusicBrainz recording expansion uses the official paginated artist／work browse
endpoint with `artist-credits+isrcs`, a shared 1.1-second request scheduler, one
page per seed in the first collection, a 30-second request deadline, and a two-MiB
response bound. A transport failure, 429, or transient 5xx response may retry up to
two times; bounded `Retry-After` takes precedence over the one／two-second fallback
delays. Timeouts and ordinary 4xx responses do not retry. It does not request
releases from recording browse. A 404 for a syntactically valid Wikidata seed is a
stale open-metadata reference and contributes no recordings; other ordinary 4xx
responses still fail the collection. Video entries, missing or out-of-range
durations, and missing artist credits are ineligible. Full credited-artist text is
retained for review while the first credited artist MBID enforces the
per-primary-artist cap.

ListenBrainz popularity uses the anonymous official recording-popularity POST in
batches of at most 250 through one serialized 250-millisecond scheduler. Official
remaining／reset response headers can extend the delay before the next batch.
Response order and MBIDs must match the request. Null counts mean popularity
unavailable and are excluded rather than converted to zero or a catalog miss.
Authentication-required, rate-limited, service-unavailable, timeout, and malformed
responses remain distinct source failures.

Streaming-platform regional charts may supplement candidate discovery and
mainstream evidence. A chart market is an observation context defined by that
platform at a particular time; it is not a recording region, artist nationality,
or universal popularity rank. When the platform's API terms permit retention, the
private candidate provenance may record a controlled platform id, the
provider-defined market code, chart type, snapshot date, and rank or rank band.
These fields never enter the runnable corpus or its controlled tags.

Chart evidence from different platforms remains separate rather than being merged
into one synthetic rank. It may identify source imbalance, support manual review,
or widen candidate recall. Chart absence cannot establish `long-tail`, because it
may instead reflect platform catalog, editorial policy, market availability, chart
window, or API-access differences. The fixed within-stratum ListenBrainz snapshot
remains the comparable reach axis unless a later product decision replaces it.
If retention is not allowed, keep only permitted aggregate counts and the private
review decision; do not archive raw chart responses.

This chart model is recorded for later product discussion only. Phase A does not
implement Spotify／Apple Music access, streaming playback, chart browsing, account
connection, or a built-in music catalog. Any future implementation first requires
an explicit decision about scope, licensing／API boundaries, and how it fits
Utawakui's local-first singing／cover workflow. Current engineering remains limited
to the lyrics-source corpus and LRCLIB／AMLL evaluation path.

The intended sources include dynamic chart playlists such as Spotify global／
country weekly charts and Top 50 feeds, plus Apple Music city Top 25 and global／
country Top 100 feeds. Model these with two private records:

- a chart-feed definition containing platform, chart family, scope type
  (`global`, `country`, or `city`), provider-defined scope key, nominal list size,
  stated refresh cadence, discovery method, and current access／retention status;
- a dated chart snapshot containing its feed id, observation time, observed entry
  count, and only the position and recording identifiers that the platform permits
  the evaluation process to retain.

After recording identity normalization, derived private evidence may keep first
seen, last seen, appearance count, and best rank. Repeated daily／weekly appearances
must not create duplicate corpus cases or multiply a track's selection weight.
Evidence from several feeds on the same platform is correlated and receives a
platform-level cap; it is not counted as several independent popularity votes.
City charts are useful for local distinctiveness and candidate recall, but they do
not stand in for country-level demand. Current charts also bias toward recent
releases, so older catalog candidates continue to require a separate discovery
path.

Provider ids and profile ids are limited to the explicitly evaluated LRCLIB,
AMLL, NetEase, and Musixmatch profiles. LRCLIB with `lrclib-http-v1` is always the
single baseline; candidate providers cannot replace or invert it. The schema
rejects extra fields. Do not add lyrics, provider payloads, provider
record ids, credentials, cookies, URLs, filesystem paths, source hashes, notes, or
free-form tags.

The AMLL profile remains an isolated research／historical comparison after its
product acquisition path was retired on 2026-08-31. Its presence in this private
evaluation registry does not make it a renderer option, main IPC provider, or
member of the production `all` fan-out.

## Probe Contract

The runner receives one statically constructed probe function per declared
provider. A probe receives an in-memory clone containing the opaque case id,
controlled tags, and private reference metadata. It returns the existing
normalized provider observation contract.

The runner does not release a concurrency slot until the probe promise settles.
Every allowlisted provider probe therefore owns and tests its hard network timeout,
bounded response reader, and cancellation behavior; it returns the categorical
`timeout` observation itself. The runner must not simulate a hard timeout with an
in-process `Promise.race`, because an abort-ignoring operation could continue in
the background and exceed the concurrency bound. A thrown, provider-mismatched,
malformed, or unapproved failure-code result becomes a fixed categorical failure
for that provider and case. Exception messages and provider bodies never cross
into the result.

A command-line runner uses the statically constructed LRCLIB／AMLL registry. It
does not load JavaScript probe modules or accept provider ids, URLs, credentials,
headers, or cookies from the corpus or command line. Run the private 40-case
corpus with:

```text
npm run lyrics:evaluate-providers -- <corpus.json> <report.json>
```

The committed two-case fixture is accepted only with an explicit final
`--synthetic` argument. The CLI bounds input to one MiB, rejects input／output
aliasing, reads through one file descriptor with an actual-byte bound, and writes
the report through a private atomic temporary file that is removed after a failed
write. Success prints only the resolved report path; failures print only fixed,
allowlisted categories. It never prints or writes the private corpus.

The LRCLIB evaluation probe composes the existing production query plan, client,
candidate ranking, and capability parser without saving a candidate or changing
automatic acquisition. Its default transport accepts only the official
`https://lrclib.net` origin, rejects redirects, and uses the shared LRCLIB request
scheduler. One 30-second absolute deadline covers the complete probe, including
scheduler waits, retries, fetches, and response-body reads; each request also
retains the production client's eight-second abort timeout and four-MiB bounded
response reader. Timeout aborts remain `timeout` even after response headers have
arrived. The probe projects only ranked match band, reviewed status, truthful
capability, timing validation, duration, and categorical failure state; previews,
lyric text, fingerprints, provider records, and private references are discarded
before returning.

The AMLL probe uses the official `https://api.amll.dev` search and fetch routes.
It normalizes the bounded metadata response, deduplicates candidates, and ranks
title, artist, album, and recording-version evidence deterministically before it
fetches exactly one TTML record. The fetched id must equal the ranked id. One
30-second acquisition deadline covers the search, provider-local scheduler wait,
TTML fetch, and both response-body reads; each HTTP request retains its ten-second
timeout and bounded response limit. Raw TTML, metadata arrays, filenames, record
ids, and exception text are discarded before the normalized observation returns.

The fixed evaluation runner still treats the NetEase reverse-client adapter as an
isolated historical probe and does not add it to this registry. On 2026-08-29 the
owner separately approved an experimental product source that uses a bounded,
fixed-origin direct HTTP client without that reverse package. The two profiles do
not share runtime or eligibility claims. The historical probe remains defined by
the [NetEase validation contract](netease-isolated-technical-validation.md); the
product source is defined by the
[NetEase acquisition contract](netease-acquisition-contract.md).

## Result Boundary

The runner result may contain:

- corpus id and baseline provider id;
- case／provider／observation counts;
- opaque case ids and controlled tags;
- normalized observations with categorical failure codes;
- the aggregate benchmark report.

It must not contain the private reference object or any reference field value.
Real per-case results remain private evaluation artifacts. Only aggregate metrics,
approved metadata judgments, and synthetic non-song fixtures may be committed.

## Verification

The contract is covered by tests for exact schemas, the 40-case default, reviewed
gold labels, controlled tags, privacy-safe output, deterministic ordering, bounded
concurrency, provider-owned timeout observations, malformed observations, and
request-failure versus catalog-miss accounting.
