# Private acoustic alignment evaluation

This developer tool runs the Phase 2 HubertFA candidate against isolated local
copies. It is excluded from the application package and has no renderer IPC,
activation, installer or download entry. The app's default sidecar loader still
accepts only its synthetic fixture profile. Model results require the explicit
internal method returned by `verifyAssets`.

## Local assets

Use `manifest.json` as the frozen asset and environment reference. It pins the
[HubertFA v0.0.7 release](https://github.com/wolfgitpr/HubertFA/releases/tag/v0.0.7),
source revision `521281fe52dcedb8f970ca200dc4f00fc2869b08`, model files, managed
CPython 3.14.7 runtime files (including `_pth`), and the existing research FFmpeg.
Weights and wheels are not checked into the repository or downloaded by this tool.
The source license does not establish weight redistribution permission.

A private runtime JSON contains absolute `modelDir`, `vendorDir`,
`environmentPath`, `pythonPath` and `ffmpegPath`. The environment contains only
NumPy 2.5.2 and pypinyin 0.55.0; Node uses the existing ONNX Runtime, kuromoji and
wanakana packages at the versions in the manifest. Provider Python is not used.
Installed non-cache environment bytes contribute to the method identity.

The vendor folder contains `tools/decoder.py` and `tools/align_word.py` from the
pinned source. Remove only the optional
`from tools.plot import plot_force_alignment_prob, plot_non_lexical_phonemes`
import from the decoder. Normalize source line endings to LF for hashing.
Unexpected vendor source files are rejected; the worker compiles the two verified
sources in an isolated namespace, without package initializers or cached bytecode.
Environment imports use an empty per-job cache prefix.

`pythonPath` must name the pinned `python.exe`, not another file beside a valid
runtime. Asset binding verifies file integrity; usable inference additionally
requires successful Node ONNX initialization and the decoder's isolated import
and version checks. A valid fingerprint alone is not a model-ready status.

This local configuration is a developer preparation path, not an application
installer. The separate application environment lifecycle has Settings actions,
but preparation is blocked pending weight evidence and does not generate songs.
The independent [HubertFA＋small research trial](../lyricsFreshEvaluation/README.md#hubertfa＋small-本機試用與聽查)
adds explicit downloads and isolated previews without changing that gate.
Basic/optional allocation and loading checks are
recorded in the [environment readiness audit](../../../docs/research/lyrics-acoustic-environment-readiness-2026-10-19.md).

## Run

```powershell
node scripts/research/lyricsAcoustic/evaluate.cjs <runtime.json> <cases.json> <references.json> <new-absolute-output-directory>
```

Use `-` in place of the reference path for unlabelled integration checks. The
output directory must not exist. Each case requires a unique ASCII `id`,
`songId`, `language`, absolute local `audio`, integer `durationMs`, `offsetMs`,
and either `lines` or `lyricsText` with a bounded LRC/VTT `filename`. Each line
contains `lineId`, `text`, integer `startMs` and `endMs`. Use exact decoded media
duration when preparing whole-song cases. Metadata fields `tier`, `phase`,
`variant`, `t1Kind` and `referenceKind` label comparisons; they are not model inputs.

References are a separate object keyed first by case id, then by external line id, with arrays of
`{ "from": <original UTF-16 offset>, "startMs": <reference onset> }`. They are
parsed only after inference. `provider-canonical` may instead evaluate against
fine times parsed from the supplied original source. The runner deliberately
removes those segments from the inferred T1 document before invoking workers.
This is a controlled T1 comparison; it does not overwrite an authored document.

`results.json` keeps private canonical documents, estimates and resource records.
`summary.json` keeps all requested/scorable/missing cuts and per-case results.
These outputs may contain lyrics and must remain outside version control.

## Frozen processing and fallback

The encoder sees at most 30 seconds of 44.1 kHz mono PCM. Each finite T1 interval
must be at most 20 seconds. Context extends at least two seconds around a line
unless bounded by media edges. Overlapping encoder windows assign each line
occurrence once. Decoding uses the T1 interval with 350 ms padding; source time
maps to audio by subtracting offset, and decoded starts add it back once.

Text-only `Intl.Segmenter` word cuts preserve the original ranges. Japanese
readings never replace display text. The official decoder's returned word objects
are mapped through the decoded phone path to original occurrence indices. Missing,
nonmonotonic or out-of-parent internal starts are merged by the Phase 1 helper.
The first chunk retains its T1 anchor. No sung ends or confidence gate are added.

Unsupported languages/scripts, mixed lines, unresolvable intervals and absent
boundaries retain T1. A peak of at most `1e-8` rejects numerical silence; this is
not a singing detector. Quiet nonzero input, accompaniment and wrong content may
still produce apparently valid alignment. Matching lyrics/version remains an
input assumption. Canonical T2 always takes precedence in the shared preview.

One existing heavy-job scheduler serializes the CLI's jobs. A single owner manages
FFmpeg, Node and Python as direct children with bounded I/O and a total deadline.
Cancellation waits for owned workers before deleting that job's temporary files.
Source, assets, generation and deadline are checked before atomic publication.
Failure or cancellation preserves the previously stored estimate.

## Verify

```powershell
npx vitest run scripts/research/lyricsAcoustic --maxWorkers=2
<managed-python.exe> -I scripts/research/lyricsAcoustic/decoder_test.py
```

Tests use synthetic text, times, protocol workers and artifact files. They need no
model download. Real model tests are explicit local runs, not an ordinary test
suite dependency. Report independent human timing separately from provider/model
references. Keep missing cuts in the full scoring denominator; conditional median
and P90 describe retained, scorable cuts only. Whole-song resource records report
per-process OS high-water RSS; separate process peaks must not be described as a
simultaneous machine-memory peak or a guarantee for lower-memory devices.
