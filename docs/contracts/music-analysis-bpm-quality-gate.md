# Music Analysis BPM Quality Gate

## Outcome

This gate evaluates one analyzer profile's global source-BPM estimates without
changing Music Analysis activation or sidecar behavior. It is the required M1
baseline before comparing Beat This! models, postprocessors, or tempo estimators.

The evaluator is path-free and consumes two bounded JSON documents:

1. a manually reviewed corpus containing opaque ids, tags, and one reference BPM;
2. predictions bound to that exact corpus by a SHA-256 fingerprint.

Synthetic fixtures prove evaluator behavior only. They are not analyzer-quality
evidence.

## Corpus boundary

Copy [`music-analysis-bpm-benchmark-template.json`](music-analysis-bpm-benchmark-template.json)
to an ignored private benchmark directory before adding real cases. Do not commit
audio, titles, artists, library ids, filenames, paths, source URLs, or hashes.

The first pilot requires at least 30 manually reviewed fixed-tempo songs. Required
coverage includes J-pop, K-pop, karaoke, and slow／mid／fast tempo bands. Tags may
overlap. Ambiguous metrical level, rubato, tempo changes, unusual meter, or disputed
ground truth belongs in a separate challenge corpus and cannot decide the initial
pass gate.

Lock the corpus before running analyzer candidates. Predictions must carry the
fingerprint computed from the schema version, benchmark id, tolerance, case ids,
tags, and reference BPM values. Editing any of those fields invalidates old
predictions. Acceptance thresholds are excluded from the fingerprint so a stricter
report can reuse unchanged inference evidence.

## Prediction boundary

Every corpus case has exactly one prediction:

- `completed` carries a bounded BPM or `null`, plus nullable
  `beatEvidenceConfidence`;
- `failed` carries one bounded categorical error code.

Analyzer id, version, profile id, and model id are required. Extra fields fail
closed, including paths, source fingerprints, stderr, model locations, or arbitrary
provider data.

`beatEvidenceConfidence` is the mean strength of emitted beat peaks in the current
Beat This! worker. It is diagnostic evidence, not a calibrated probability that
the global BPM is correct, and it never participates in a quality gate.

## Metrics

The evaluator uses the corpus `tempoToleranceRatio`, provisionally `0.04`, and
classifies each completed finite estimate as:

- `match`: within tolerance of the reviewed BPM;
- `half-time`: within tolerance of half the reviewed BPM;
- `double-time`: within tolerance of twice the reviewed BPM; or
- `unrelated`: none of the above.

A completed `null` estimate is `missing`. An analyzer failure is reported
separately and does not also increase the missing rate. Half-time and double-time
are errors; the evaluator never rewrites or silently normalizes a prediction.

Reports contain overall and per-tag summaries for:

- direct-match rate;
- octave-error rate;
- unrelated-error rate;
- missing rate;
- analysis-failure rate;
- median relative error among direct matches; and
- diagnostic beat-evidence sample count and mean confidence.

## Provisional acceptance

| Gate                                  | Initial threshold |
| ------------------------------------- | ----------------: |
| Direct-match rate                     |          ≥ `0.90` |
| Each required tag's direct-match rate |          ≥ `0.80` |
| Half／double-time error rate          |          ≤ `0.05` |
| Unrelated-error rate                  |          ≤ `0.05` |
| Missing-estimate rate                 |          ≤ `0.05` |
| Analysis-failure rate                 |          ≤ `0.05` |

Coverage failure returns `insufficient-data`. Sufficient coverage with any failed
quality gate returns `fail`; only complete coverage and passing quality gates
return `pass`.

Thirty songs are a pilot, not stable release evidence: a five-percent threshold
represents only one or two cases. Production profile promotion requires a larger
locked corpus or a tuning corpus plus an untouched holdout. Changing a threshold
requires a new benchmark id and a documented reason; do not lower a threshold
after seeing a candidate fail.

## Running the evaluator

### Non-scoring runtime breadth

Before reference annotation, copy
[`music-analysis-bpm-smoke-run-config-template.json`](music-analysis-bpm-smoke-run-config-template.json)
to an ignored private directory. Schema v3 runs local tracks through the same fixed
worker, model verification, source hashing, cleanup, and cache path as scored BPM
inference, but it has no corpus or reference BPM fields.

```powershell
npm run analysis:benchmark-bpm -- `
  tasks/music-analysis-bpm-smoke-run.json
```

Its `bpm-smoke-predictions.json` is explicitly marked
`evidenceKind: "bpm-runtime-smoke"` and carries bounded duration／wall-time
diagnostics. It deliberately has no corpus fingerprint and fails the scored BPM
prediction validator, so it cannot produce an accuracy decision. Use this mode to
measure completion, missing estimates, runtime distribution, and cache reuse only.

### Scored corpus

First copy
[`music-analysis-bpm-run-config-template.json`](music-analysis-bpm-run-config-template.json)
to an ignored private directory. Map each opaque corpus case id to one current
local-library `trackId` and its duration in milliseconds (`library.json` stores
duration in seconds, so multiply that value by 1,000). The config case ids must
exactly match the locked corpus; do not add titles, artists, filenames, or tags to
the run config.

Run the fixed Beat This! profile against the whole corpus:

```powershell
npm run analysis:benchmark-bpm -- `
  tasks/music-analysis-bpm-small0-run.json
```

The schema-v2 runner accepts only the checked-in `beat-this-small0` or
`beat-this-final0` manifest contract. It verifies the worker and every model
artifact, resolves source audio only from the local library plus `trackId`, decodes
one temporary WAV at a time, and deletes that WAV after each case. Its cache is
bound to the source audio, worker, profile, manifest, and verified artifacts.

The generated `bpm-predictions.json` contains only opaque case ids, bounded
estimates, analyzer identity, and the corpus fingerprint. It contains no library
ids, tags, durations, paths, source hashes, worker output, or model locations. BPM
runs intentionally reject `--case`, because a partial prediction document cannot
match the evaluator's exact-corpus contract; use the cache to resume a whole run.

To compare `final0`, copy the private run config, change only `outputRoot`,
`modelManifestPath`, and `modelPath`, then rerun. Keep the two output roots separate
so their evidence and caches cannot overwrite one another. This comparison does
not promote `final0` or change the product's active profile.

Then evaluate either generated prediction file:

```powershell
npm run analysis:evaluate-bpm -- `
  tasks/music-analysis-bpm-corpus.json `
  tasks/beat-this-small0-results/bpm-predictions.json `
  tasks/music-analysis-bpm-report.json
```

Inputs are limited to 8 MiB and 500 cases. The optional report is atomically
replaced and cannot overwrite either input. Omitting the report path prints the
same JSON to stdout.

## Promotion boundary

This gate does not authorize a candidate by itself. Model, postprocessor, and
estimator candidates must be compared one factor at a time on the same locked
corpus. The 2026-08-28 normalization study completed that review and the owner
approved its four-beat estimator as `beat-this-small0-cpu-v3`／
`beat-this-final0-cpu-v3`. Existing v2 sidecars remain readable but are not
considered current by normal F5 batch analysis; no automatic half／double-time
normalization was authorized.
