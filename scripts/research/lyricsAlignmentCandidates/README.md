# Private Qwen3 / Whisper.cpp paired evaluation

This research CLI has no renderer IPC, activation, installer or download entry.
It is outside the application package. The production acoustic catalog and the
default fixture-only sidecar loader remain unchanged. Results require an explicit
internal model method to be read as research estimates.

## Frozen candidates and environment

The experiment uses Qwen3-ForcedAligner-0.6B revision
`c7cbfc2048c462b0d63a45797104fc9db3ad62b7` with Qwen3-ASR source
`7c6daf77a2421100f5fb066495372c00129d39ff`, and the official Windows x64 CPU
Whisper.cpp `v1.9.2` release. The latter has a downloadable CPU binary; the newer
release inspected during preparation did not. Whisper models are the original
multilingual GGML base and small files at revision
`5359861c739e955e79d9a303bcbc70fb988958b1`, without quantization.

Qwen uses an isolated CPython 3.12.12 environment, CPU Torch 2.9.1, float32,
four intra-op threads and one inter-op thread. The upstream wrapper also imports
Japanese/Korean processing and ASR utilities, so the measured dependency closure
includes them. It does not install the optional Web UI. This runtime is separate
from the application's existing Audio Python and Provider Python families.

Whisper uses its native CLI with four threads, GPU and flash attention disabled,
and full JSON. The `dtw-point` control enables the matching DTW head preset;
the `token-start` profile uses token `offsets.from` in milliseconds. The official
header defines `t_dtw` as an approximate token output moment, not a token start.
The token-start path includes upstream voice-length allocation and energy
adjustment, so it must not be described as a pure acoustic onset detector.
Whisper reloads the model for each window. It does not require Python for inference. An external Python process
used for memory measurement is test instrumentation, excluded from its payload.

Verify the upstream model/archive digests before creating a private file manifest.
`assets.cjs` exports `snapshot` for complete non-cache file tables. Each candidate
configuration supplies `root`, `assetRoots`, `ffmpegPath`, and either
`pythonPath` / `vendorDir` / `modelDir`, or `whisperPath` / `modelPath` /
`timestampSource`. A private
JSON file contains those configurations under `qwen`, `base`, `small`, and an
absolute `manifest` path whose corresponding keys contain their file tables.
No private configuration, model, song, lyrics or generated result is committed.

Binding rehashes the files, rejects unbound files within asset roots, and binds
the research source, shared/store dependencies and lockfile into the method.
Publication rechecks file identities and directory closure. Python starts with
`-I -B -X pycache_prefix=<new-job-cache>` before importing anything. Its model
loads are offline and disallow remote model code. This is a developer binding,
not a signed distribution manifest or managed product environment.

## Run

```powershell
node scripts/research/lyricsAlignmentCandidates/evaluate.cjs <config.json> <qwen|base|small> <cases.json> <references.json|-> <frozen-hfa-run-directory> <new-absolute-output-directory>
```

Use the same case/reference bytes as the corrected Phase 2 summary. The baseline
run supplies the canonical T1 and original documents, source and audio copies.
Each audio copy is checked against the original HFA sidecar hash. Fine references
are snapshotted but parsed only after inference; they never enter either worker.
The original `lyricsAcoustic/evaluate.cjs` scorer is reused without modification.
An unexpected operational failure stops the run and preserves existing estimates;
it must not silently remove that case from the benchmark.

All cases run serially. Each case owns its child process group, deadline and new
temporary directory. FFmpeg decodes the frozen windows to 16 kHz mono float PCM;
decoded length must match within 100 ms. Finite peaks above one receive the same
whole-window peak normalization for both candidates, matching Qwen's upstream
float-range rule. Windows are at most 30 seconds, with the frozen T1 limit of
20 seconds and context planning. Exact numerical silence skips inference. This
is not a vocal-presence detector.

Qwen receives the text of complete T1 occurrences within the window. This differs
from HFA's per-line decoder constraint; it is a comparison of complete candidate
pipelines, not an isolated architecture experiment. Qwen is initialized once per
case, then reused for its windows. No timestamps are interpolated inside an
upstream word.

Whisper receives audio and the language only. Its ASR text is matched against the
original by a bounded monotone LCS. A character must have the same target index
in every optimal path, and a requested chunk must match completely and
consecutively. Ambiguous repeated text and unmatched chunks receive no cut.
This is ASR timing, not forced alignment of the supplied lyrics. The DTW output
point control and token-start profile have distinct method identities. Missing
token starts never borrow DTW points. Full JSON is
read as bytes so merged UTF-8 token boundaries can be preserved. No word-internal
time is invented.

The valid-cuts replay retains all lexical ASR text for matching while exposing
only monotone, in-window token starts. Untimed tokens supply no boundary. It
rehashes raw evidence, binds the model/language, and verifies the full recomputed
window plan and prior result hash. It decodes audio again but does not run the
model again or use reference timings during inference.

```powershell
node scripts/research/lyricsAlignmentCandidates/tokenStartReplay.cjs <config.json> <base|small> <cases.json> <references.json|-> <completed-token-start-run-directory> <new-absolute-output-directory>
```

## Validation and interpretation

Original `Intl.Segmenter` cuts and all requested/scorable denominators stay fixed.
NFKC normalization is confined to comparison keys. Display text, UTF-16 ranges and
repeated occurrences retain their original identities. Missing cuts are merged
by the existing chunk builder; the first chunk keeps the T1 anchor. Canonical T2
is never replaced. Invalid duration, out-of-window spans, deadline, cancellation,
source changes and asset changes prevent publication. All workers close before
save, and owned staging is removed.

```powershell
npx vitest run scripts/research/lyricsAlignmentCandidates
<qwen-python.exe> -I -B scripts/research/lyricsAlignmentCandidates/qwen_worker_test.py
node scripts/research/lyricsAcoustic/verify.cjs <completed-candidate-run-directory>
```

Use a workspace-owned `TEMP` / `TMP` directory for Windows verification. The
real cancellation checks additionally interrupt actual workers and compare the
previous estimate/source bytes. Unit fixtures alone do not establish lifecycle
acceptance. The dated research report records the measured capacity, results,
fallback evidence, limitations and adoption decision.

See the [paired evaluation report](../../../docs/research/lyrics-alignment-candidates-2026-10-19.md)
and its durable data. The measured Windows venv launcher also starts an interpreter
descendant; cancellation acceptance additionally checked that process tree, rather
than relying only on the direct-child group inventory. No managed product
environment or clean-machine installer acceptance is implied.

## Quality ablation and conservative replay

The quality CLI reuses frozen Qwen estimates and the original audio-only native
Whisper raw JSON, while actually running pinned Silero JIT frame inference in
the existing isolated Torch environment. Extend the private onset configuration
with `vadModelPath`, its `vadSha256`, and `vadAssetRoots` covering the complete
VAD asset directory. No additional Python distribution or product download is
required. All source/audio/method/window/raw identities are checked; references
are parsed only for final scoring. Use a new absolute output directory.

```powershell
node scripts/research/lyricsAlignmentCandidates/qualityRun.cjs <config.json> <cases.json> <references.json|-> <qwen-run> <base-token-start-run> <small-token-start-run> <new-absolute-output-directory>
```

This produces ten hard-filter profiles and bounded `evidence.json`. For the
exploratory conservative policy, pass that exact evidence SHA-256 separately.
The replay verifies it and the seed of the original three result receipts,
rechecks raw ASR and cached window identities, then saves four distinct methods.
It does not run any model or retime an accepted cut.

```powershell
node scripts/research/lyricsAlignmentCandidates/qualityReplay.cjs <config.json> <cases.json> <references.json|-> <qwen-run> <base-token-start-run> <small-token-start-run> <completed-quality-run> <new-absolute-output-directory> <evidence-sha256>
```

`quality.cjs` reports activity and unique textual support; its maximum LCS
compatibility is separate so ambiguous repeats never become content mismatch.
`qualityConservative.cjs` treats insufficient evidence as unknown. VAD is advisory;
two ASR models share biases. These are research policies, not calibrated confidence
or accepted production gates. The [quality report](../../../docs/research/lyrics-qwen-quality-2026-10-19.md)
records the loss of correct cuts, remaining wrong-audio acceptance and actual
resource cost; the [method comparison](../../../docs/research/lyrics-alignment-methods-comparison-2026-10-19.md)
covers other feasible routes and their unverified requirements.
