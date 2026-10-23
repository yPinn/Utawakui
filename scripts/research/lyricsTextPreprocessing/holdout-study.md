# Synthetic source-block holdout diagnosis

The approved design is in the [validation plan](../../../docs/research/lyrics-text-blind-validation-plan-2026-10-23.md).
This run is an agent-authored synthetic holdout diagnosis, not native-speaker
blind review. Authored alternatives are proxies; human acceptability remains
pending. It does not import real songs, provider artifacts or audio.

## Fixed data and interfaces

`authorHoldout.mjs` imports no candidate or model module. It creates separate
input, answer and evaluator-only time-control manifests, then records their
hashes before candidate inspection. It refuses to replace existing inputs.
Do not run it to regenerate random IDs for a second attempt.

There are 100 new occurrences, 93 distinct text strings: five identical-text
intent pairs and the English/Korean M1 a/c duplicates account for seven repeats.
Each language has 12 split inputs in 10 content families and eight classification
inputs. Six split inputs per language have multiple authored alternatives.
The a/c duplicates are retained limitations, not extra independent evidence.

C and E are imported unchanged from `ablation.mjs`. C receives all original
grapheme-safe candidates with full source prefix/suffix previews. E receives no
candidate list. Inputs to both exclude source timing, answer partitions,
forbidden ranges, intended use, family, case labels and review status.

The main schedule is C60/E40. The fixed joint subset adds C10/E10 for 20 source
blocks already in the main schedule, giving C70/E50 and 120 total requests.
Order is a stable hash of the preassigned opaque occurrence ID and task. There
is no quality retry, adaptive routing, candidate pruning or post-result editing.

## Freeze and run

`runHoldout.mjs --freeze` validates reconstruction, roles and authored spans,
checks no old text was reused, builds the schedule and measures reference
feasibility. It also snapshots transitive inference sources and hashes the
reused native binaries. Answer hashes already exist when coverage is measured;
infeasible cases cannot be edited out. Frozen manifest JSON is preserved in its
original machine serialization, not reformatted after locking.

The inference invocation without `--freeze` verifies the original C/E interface
lock, all manifest/source/binary hashes, the reused GGUF and runtime archive
with streaming SHA, and the disk reserve. It never parses answers for generation;
the fixed schedule supplies only the precomputed allowed payloads.
`localCpuRun.mjs` and its sampler/lifecycle helpers remain unchanged.

The existing CPU, context, output, memory and deadline limits apply. A clock
refuses a second run, partial failures are retained, and native generation is
killed on a request timeout. General invalid responses are saved as whole-line
fallbacks without a repair request. There is no resume mode or clock reset.

## Scoring and receipts

`holdout.mjs` accepts any one frozen complete partition. It never unions cuts
from separate answers. Partial scores select the highest F1 against one complete
reference, with original reference order breaking ties. Rejected/missing results
get zero contribution to partial-score averages. Accepted and raw forbidden
cuts are reported separately, so safe fallback cannot conceal bad selection.
Candidate feasibility means at least one whole reference is available.

Classification keeps identifiable credits, performed negatives, mixed blocks
and unresolvable identical-text pairs separate. Identical hidden intent is never
used as a recoverable model answer. A credit candidate always retains the source
text and cannot request omission. The joint subset is diagnostic and excluded
from main quality denominators.

`exportHoldout.mjs` runs only after a terminal summary exists. It reads the
answers for scoring and writes separate dated public results, including every
scheduled cell, raw decision, reference, candidate, fallback and cost. The
evaluator-only eight/32-second fixtures reuse one C result each; they are
structural timing-isolation checks, not repeated inference or singing-time
validation. No new child timings are emitted.

Ignored `tasks/lyrics-text-holdout-20261023/` retains original interface and
authorship locks, snapshots, protocol, coverage, request/SSE/result files,
process samples, lifecycle, failures, tests and verification receipts.
No product module, packaging registry, lyric source or timing sidecar is edited.

Focused checks use the existing runtime project:

```powershell
npx --no-install vitest run --project runtime scripts/research/lyricsTextPreprocessing
```

Only pure contracts/scoring/candidate/lifecycle code is under instrumented
coverage. Native offline execution is separate research evidence and does not
replace native-speaker review, real-provider validation or Electron/OBS checks.
