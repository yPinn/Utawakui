# Music Analysis M2 Real-Song Quality Gate

## Outcome

M2.1 evaluates a pretrained semantic analyzer before it can become an
installable Music Analysis capability. It does not train a model and does not
change F10 activation. The first benchmark target remains
[All-In-One Infer 3.1.0](https://github.com/openmirlab/all-in-one-infer), using
the already-spiked Windows CPU worker and `harmonix-fold0` checkpoint.

Passing this quality gate proves only measured utility on the labeled corpus.
It does not override the separate model-rights, wheel-only packaging, OS-level
offline, capacity, recovery, or manual UI release gates.

## Privacy-safe corpus manifest

Copy [`music-analysis-m2-benchmark-template.json`](music-analysis-m2-benchmark-template.json)
to an ignored path under `tasks/`, then replace the example with user-owned
cases. Commit neither copyrighted audio nor a manifest containing titles,
artists, filenames, absolute paths, source URLs, or library ids. Each case uses
an opaque benchmark id and contains only:

- grouping tags;
- decoded source duration and manually reviewed reference BPM;
- one manually reviewed, contiguous semantic reference partition; and
- the fixed analyzer's completed estimate or a bounded failure code.

The reference partition must start at zero, end at the decoded duration, contain
at least two intervals, and use the canonical roles `intro`, `verse`,
`pre-chorus`, `chorus`, `bridge`, `instrumental`, or `outro`. Do not use
`unknown` as ground truth. Exclude or adjudicate genuinely ambiguous songs
rather than making the reference pretend to be certain.

An analyzer failure is recorded as:

```json
{
  "status": "failed",
  "errorCode": "WORKER_FAILED"
}
```

## Metrics

The evaluator follows the conventional distinction made by
[`mir_eval.segment`](https://github.com/mir-evaluation/mir_eval/blob/main/mir_eval/segment.py):
boundary detection and structural labels are different tasks, and intervals
represent a song partition.

- Boundary precision, recall, and F1 exclude the fixed first and last song
  boundaries. Reports include strict ±500 ms and tolerant ±3000 ms windows.
- Semantic-role accuracy is the fraction of reference duration covered by the
  same canonical estimated role. Missing coverage and `unknown` are incorrect.
- M2 eligibility reuses the production contract. Any missing, incomplete,
  unknown, or sub-0.5-confidence section result remains a safe M1 downgrade.
- BPM is classified as `match`, `half-time`, `double-time`, `unrelated`, or
  `missing`; the evaluator reports octave errors without silently correcting
  the analyzer result. Every case requires reference BPM, and missing analyzer
  BPM is gated separately so absent results cannot dilute octave errors.
- Aggregate metrics are macro averages over songs. Every required tag receives
  its own summary and minimum semantic/M2 gates, preventing strong results in
  one category from hiding weak results in another.

Failed inference contributes zero boundary, semantic, and M2 scores and is also
reported through the independent analysis-failure rate.

## Provisional acceptance corpus

The first decision-bearing run requires at least 30 manually reviewed songs:

- at least 10 tagged `j-pop`;
- at least 10 tagged `k-pop`; and
- at least 10 tagged `karaoke`.

Tags may overlap. Select different arrangements, vocal densities, live/studio
mixes, intros without vocals, instrumental breaks, key changes, and songs with
repeated or abbreviated choruses. Avoid selecting only clean, conventional pop
forms.

The initial thresholds are deliberately explicit but provisional until the
first corpus is annotated:

| Gate                              | Initial threshold |
| --------------------------------- | ----------------: |
| Boundary macro F1, ±500 ms        |            ≥ 0.50 |
| Boundary macro F1, ±3000 ms       |            ≥ 0.75 |
| Semantic role duration accuracy   |            ≥ 0.65 |
| Contract-eligible M2 rate         |            ≥ 0.60 |
| Each required tag's role accuracy |            ≥ 0.55 |
| Each required tag's M2 rate       |            ≥ 0.50 |
| BPM half/double-time error rate   |            ≤ 0.10 |
| Missing analyzer BPM rate         |            ≤ 0.05 |
| Analyzer failure rate             |            ≤ 0.05 |

Changing a threshold requires a documented reason and a new benchmark id. Do
not lower a gate after seeing a poor result merely to make a model pass.

## Running the evaluator

Run the isolated inference utility first with an ignored, machine-local config:

```powershell
npm run analysis:benchmark-real -- tasks/music-analysis-m2-real-run.json
```

The config supplies absolute paths to the private library, isolated Python
environment, fixed worker, verified model directory, and an output directory
outside the library. The runner resolves audio only through a track id, decodes
one case at a time, keeps raw audio and identifying paths out of prediction
evidence, and removes each decoded work file after inference. Reusable results
are accepted only when a SHA-256 fingerprint still matches the source audio,
worker, model artifacts, and case contract. `--case <opaque-id>` runs one case;
`--force` deliberately ignores a valid cache.

### Annotating references in F10

Press F10, switch from **正式分析** to **人工標註**, and choose the ignored run
config before opening Benchmark Review. This blind workspace never reads
`predictions.json`. It maps each opaque case back to the current library for
playback, then records only manually entered BPM, contiguous boundaries, and
canonical roles in `<outputRoot>/reference-worklist.json`. Incomplete drafts can
be saved; a case is complete only after BPM and at least two fully labeled,
exactly contiguous intervals cover the decoded duration.

The quick-annotation surface may use only a matching `level: M1` beat result as
non-semantic timing guidance. It renders beat／downbeat marks and can snap a new
boundary to a downbeat within ±300 ms; any M2 result supplies no guidance in this
blind mode. The active interval follows the player clock. `B` inserts a boundary,
`1`–`7` assigns its canonical role, `Shift+1`–`7` inserts and assigns the following
interval, `Alt+Left／Right` moves the active starting boundary by 100 ms, `N` selects
the next incomplete case, and `Ctrl／Cmd+S` saves explicitly. Draft edits also save
after a short idle delay; a completed older save must not replace newer local edits.

The renderer cannot supply config or worklist paths. Main owns the picker,
validates the run config against the current library, returns an opaque session
id, and accepts only bounded case references on save. The worklist contains no
track ids, source paths, model fields, or predictions and never writes song
sidecars.

### Reviewing predictions in F10

Press F10, switch from **正式分析** to **Benchmark Review**, and choose the
ignored run config used for inference. The read-only review workspace shows the
mapped library track, BPM, runtime, M1/M2 contract result, proportional semantic
timeline, per-section confidence, and analyzer provenance. Clicking a timeline
segment or its detail row loads the matching library track in the existing
player and seeks to that segment's start.

The renderer cannot supply a path. Electron's main process owns the file picker,
requires the config's `libraryRoot` to match the currently configured library,
reads only the bounded `predictions.json` beneath the declared output root, and
returns a path-free projection. Malformed evidence, a different library, or a
failed load produces no partial review data. Opening a review never writes or
promotes a sidecar: low-confidence, incomplete, unknown, missing, and failed
predictions remain visibly downgraded to M1.

Keep reference annotation independent from these predictions. Finish and save
the blind worklist before switching to Benchmark Review. Merge the
manually reviewed BPM and contiguous reference partition with the path-free
prediction evidence only after annotation is complete; model output must never
be copied into the reference fields as ground truth.

Then run the evaluator from the repository root:

```powershell
npm run analysis:evaluate -- tasks/music-analysis-m2-real.json tasks/music-analysis-m2-report.json
```

The input is bounded to 8 MiB and 500 cases. It rejects extra fields, duplicate
case ids, identifying path fields, invalid confidence, overlapping intervals,
incomplete references, and unknown reference roles. The report is atomically
written and returns one of:

- `insufficient-data`: the total or required-tag corpus is too small;
- `fail`: corpus coverage is sufficient but at least one quality gate failed;
  or
- `pass`: every coverage and quality gate passed.

## Current pretrained-model disposition

No training is authorized by this phase. All-In-One remains the first benchmark
because its native output includes BPM, beats/downbeats, semantic boundaries,
and functional labels. Its maintained inference package is MIT, but the pinned
Harmonix checkpoint evidence reviewed by this project conflicts with the
current MIT model-card label. The exact weight grant must be clarified before
commercial redistribution or in-product download is enabled.

LinkSeg and Hybrid-Net remain rejected product candidates because their current
checkpoint rights and Windows packaging evidence are weaker. Fine-tuning or
training is considered only if the pretrained benchmark fails materially after
annotation quality is checked, or if checkpoint rights cannot be resolved.
