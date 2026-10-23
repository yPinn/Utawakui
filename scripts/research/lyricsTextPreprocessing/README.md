# Offline lyric text model pilot

This directory contains research code only. The Electron application, provider
environments, packaging registries and Output templates do not import it. It reads
the dated synthetic corpus and pinned local GGUF assets; it does not read private
songs, write lyrics sidecars, rewrite text or assign timestamps.

## Fixed scope

The approved protocol is in
[the feasibility report](../../../docs/research/lyrics-text-preprocessing-feasibility-2026-10-23.md).
The dated workspace under `tasks/lyrics-text-qwen-pilot-20261023/` owns assets,
upstream metadata, requests, SSE responses, results, process samples and failures.
It is ignored scratch, not a distributable model cache.

- Two pinned Qwen3.5 Q4_K_M artifacts and the official Windows CPU runtime only.
- Generation and prompt evaluation use four threads, one slot, no GPU, no
  thinking, no context shifting and no prompt cache reuse.
- Context is at most 4096 tokens including a 512-token output reserve.
- Each inference request has a 30-second deadline. The original inference clock
  remains authoritative for the entire 45-minute experiment, including resumed
  work and diagnostics; no mode resets it.
- A conservative sum of server memory, runner RSS and sampler memory stops the
  run at 8 GiB. Working set and private bytes are different measurements; do not
  add both to claim physical memory usage.
- The server listens on authenticated loopback only, with Web UI disabled and
  offline asset loading. The per-run key is redacted from saved arguments.

## Commands and evidence

The primary `pilot.mjs` invocation refuses an existing inference clock. Its
`--resume-four` mode is specific to the preserved 60-case 2B batch, with the same
deadline and no rerun of those cases. `--diagnose` requires a completed 120-case
primary summary and writes to a separate directory. Do not delete clocks or
results to rerun: create a separately approved, dated protocol instead.

Run focused contract, scoring and process-lifecycle checks using the repository's
existing runtime test project:

```powershell
npx --no-install vitest run --project runtime scripts/research/lyricsTextPreprocessing
```

`export.mjs` produces the dated public research JSON from completed raw receipts.
It keeps raw model classification separate from accepted suggestions, so rejecting
an unsafe split cannot conceal a classification error. Missing and failed cases
remain in scheduled denominators. The punctuation-only comparator is a research
control, not a claim about current template semantic quality.

The frozen primary corpus and prompt are not adjusted after observing results.
Diagnostics reuse one English harmony line with original schema, reversed enum
order, JSON-only and unconstrained output. They test decoding sensitivity and are
excluded from five-language quality and cost tables.

Process-cold means a new process, not empty OS file caches: assets are hashed
before loading. Windows process CPU counters and private bytes are sampled by
`sample-process.ps1`; actual gaps are preserved. Per-request CPU brackets are
approximate and must not be summed as disjoint CPU intervals. Native timing,
first-content-token latency and full request wall time are recorded separately.

Reference partitions are authored synthetic examples, not native-speaker review
or performance ground truth. Exact reference agreement is not general semantic
accuracy; identical text with different hidden author intent is not resolvable
from the supplied model input.
