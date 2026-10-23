# 4B task and boundary design comparison

This is a second, explicitly authorized research run. It reuses the original
corpus, opaque occurrence IDs, verified Qwen3.5 4B Q4_K_M and pinned CPU runtime.
It never changes the original pilot, corpus, source lyrics, timing or product.

## Frozen comparisons

| Arm | Task                                           | Candidate representation                          | Output                                   |
| --- | ---------------------------------------------- | ------------------------------------------------- | ---------------------------------------- |
| A   | Original combined classification and splitting | Original local windows, all safe word candidates  | Original five-field schema               |
| B   | Splitting only, explicit subset example        | Same windows and candidates as A                  | lineId and breakIds                      |
| C   | Same splitting prompt as B                     | Full left/right source slices for every candidate | Same schema as B                         |
| D   | Same splitting prompt as B                     | Full slices, at most eight coarse candidates      | Same schema as B, allowed IDs restricted |
| E   | Classification only                            | Original target without boundary suggestions      | lineId and kind                          |

A–B changes the task, prompt and schema together; it cannot isolate one wording
change. B–C changes only candidate representation. C–D changes the allowed subset.
D removes role-detaching positions and short outer fragments, preserves strong
punctuation or role starts when possible, then uses deterministic geometric
spacing. It reads no reference partitions or vocabulary from answers. It is not a
semantic parser. Candidate coverage and exact-reference feasibility are measured
before inference and retained in every denominator.

The schedule is 15 long cases (l1, l2, l4 for five language groups) crossed with
A/B/C/D, plus 20 classification cases (c3, s2, s3, s4) crossed with A/E: 100
requests over 35 synthetic cases. Arm order rotates within a case. This is a
development diagnosis using previously seen cases, not an independent test set.

## Execution and receipts

`runAblation.mjs --freeze` writes a new protocol and exact source snapshots into
`tasks/lyrics-text-qwen-ablation-20261023/`. A subsequent invocation without the
flag verifies that protocol and source hashes still match, validates the reused
asset SHA with streaming reads, checks the disk reserve and starts the model.
Existing clocks prevent another inference run; they must not be removed to reset
the budget. Changing a frozen inference source is rejected before inference.

The transport reuses the original process sampler, lifecycle termination and
contract validator. It keeps all requests, SSE streams, raw responses, fallback
reasons, timing and process telemetry. It stops at the original per-experiment
limits: CPU four threads, one slot, no GPU or thinking, 4096 context including a
512 output reserve, 30 seconds per request, 45 minutes from model startup, 8 GiB
conservative combined process memory, no new downloads and a 10 GiB disk reserve.
No mode retries generation or changes the prompt after seeing results.

Split-only output is validated through the same lossless source slicing and
role-attachment guard. Classification-only output has no split/hide/time fields;
even a credit candidate is returned as the entire original text. Neither task
can establish from text alone whether attribution-looking text was sung.

`exportAblation.mjs` refuses an unfinished run and exports a separate dated public
JSON. It separates A's long-case cost from its classification-case cost, keeps
missing and rejected cases in scheduled denominators, and counts raw false
credits even if split validation rejected the combined response. Reference exact
agreement, boundary agreement, feasible-reference subsets and candidate-copying
patterns are distinct. A shared model process has one memory peak; per-arm
physical memory differences cannot be inferred from that peak.

The focused checks remain:

```powershell
npx --no-install vitest run --project runtime scripts/research/lyricsTextPreprocessing
```

Only the pure contracts, scorer, candidate design and lifecycle helper are under
instrumented unit coverage; actual model execution supplies end-to-end research
receipts, not general production or native-speaker acceptance.
