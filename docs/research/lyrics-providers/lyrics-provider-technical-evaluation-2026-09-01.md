# Lyrics Provider Technical Evaluation — NetEase and Kugou

Date: 2026-09-01

Scope: technical retrieval and authored timing only; no commercial-rights claim.

## Decision

Keep NetEase as the existing experimental manual source, with reinforced bounded
query and identity matching. Do not claim that its current anonymous endpoint is a
reliable YRC source: the reduced live sample returned ordinary LRC and no YRC for
all three queried catalog records.

Keep Kugou research-only for now. Its mobile-search → hash-lyrics-search → KRC
download path is currently functional and produced complete validated authored T2
for two of three reduced smoke cases. The remaining case was a clean catalog miss.
That is enough to continue evaluation, but not enough to add Kugou to production
search, preload, packaging or the renderer provider list.

## What changed

### NetEase production path

- The acquisition path now consumes up to three structured queries already
  produced by the shared query planner, including cross-script title aliases.
- Candidate title and artist scoring compares original, Traditional and Simplified
  Chinese forms. Conversion affects matching only; stored metadata and lyrics stay
  provider-authored.
- Recording-version, artist and duration gates are unchanged. Complete validated
  YRC remains the only route to T2; LRC remains T1／T0 fallback.

### Kugou isolated path

`scripts/lyrics-provider-kugou.mjs` is a research-only adapter with three fixed
HTTPS origins:

1. `mobileservice.kugou.com` for bounded song/hash discovery;
2. `krcs.kugou.com` for hash-bound lyric candidates;
3. `lyrics.kugou.com` for keyword fallback and KRC download.

The adapter accepts no cookie, token or renderer URL. Responses are size-bounded,
redirects are rejected, catalog records and lyric candidates are count-bounded,
and report output contains only request status, match band and timing capability.
KRC payloads are base64-decoded, checked for the `krc1`／`krc2` envelope,
XOR-decoded with the format key, zlib-inflated under a fixed output cap, then
validated line by line. Relative segment offsets must be monotonic, non-overlapping
and fully contained by their authored line duration. Invalid／partial timing is not
promoted to T2 and no estimated words are created.

## Elitesand comparison

Elitesand uses the same Kugou endpoint family and KRC envelope. Its implementation
selects a duration match or official recommendation, decodes the KRC, and falls
back to LRC when KRC decoding fails. The isolated Utawakui adapter deliberately
does not use that LRC fallback because this evaluation asks whether Kugou adds true
authored T2 coverage.

Elitesand's NetEase path is different from Utawakui's experimental YRC path: it
requests `/api/song/lyric` with `lv=1&tv=1` and returns ordinary LRC. Its separate
client display kernel can estimate per-word progress for line-timed lyrics.
Therefore a visible Elitesand by-word sweep is not evidence that NetEase supplied
YRC.

## Reduced live evidence

The smoke used three public multilingual references and printed only case ids plus
sanitized observations. It is an interface-health sample, not a catalog-coverage
benchmark.

| Provider | Requests | Matches | Valid T2 | T1 candidates | Misses | Hard failures |
| -------- | -------: | ------: | -------: | ------------: | -----: | ------------: |
| Kugou    |        3 |       2 |        2 |           n/a |      1 |             0 |
| NetEase  |        3 |       2 |        0 |             4 |      1 |             0 |

An additional NetEase schema check fetched the top record for each reference and
recorded content presence only: 3／3 had LRC and 0／3 had YRC. This agrees with the
upstream project's recent report that `/lyric/new` can return LRC without YRC.

## Next gate for Kugou

Before any production integration:

1. run the existing private multilingual corpus with a separate Kugou descriptor;
2. manually review recording identity for the eligible matches;
3. require a useful incremental valid-T2 rate over LRCLIB／NetEase／Better Lyrics;
4. add a bounded save-time refetch／fingerprint and main-owned artifact contract;
5. only then propose production IPC, registry and renderer changes.

## Verification and references

- Focused fixture verification covers encrypted KRC decode, relative offsets,
  overlap／bounds rejection, fixed HTTPS routing, 20-candidate responses, Chinese
  script normalization, keyword fallback, sanitized output and invalid input.
- [Kugou lyric search／download reference implementation](https://github.com/kangkang520/kugou-lyric)
- [Current NetEase `lyric_new` request implementation](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced/blob/main/module/lyric_new.js)
- [NetEase YRC-missing report](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced/issues/44)
