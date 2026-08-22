# ADR 0009: Tiered audio-processing recipes and replaceable runtimes

## Status

Accepted for implementation (2026-08-22). Product naming, default selection,
and model candidates were revised after local listening feedback and community
model review on 2026-08-23. Inst HQ4 was accepted later that day as the new
versioned implementation behind `general`; optional community runtimes and
model artifacts remain benchmark-gated and are not selected for release.

## Context

Utawakui prepares accompaniment before playback. It is not an in-stream effect
and is not intended to expose a studio source-separation workstation. The main
product cases are livestreams, ordinary recordings, and an optional
semi-formal recording path.

The local engine runs two UVR-family MDX product profiles through
`onnxruntime-node`:

- KARA2 is fast and intentionally karaoke-oriented, but its result varies with
  recording style, backing vocals, rap, sparse arrangements, and a cappella;
- Inst HQ4 now supplies the dependable full vocal-removal path. Inst HQ3 was
  the previous implementation and remains provenance-compatible for existing
  results and controlled comparisons.

The original preset ids (`standard`, `clean`, `inst-hq3`, and
`recording-enhanced`) mixed user intent, relative quality claims, and model
identity. Their meaning would drift whenever the default or model changed.
The former `high-quality` preset also ran KARA2 with only more overlap and
denoise, taking substantially longer without creating a distinct product
outcome.

Four concerns must therefore remain independent:

1. stable product intent, such as fast or general processing;
2. exact versioned processing profile;
3. inference runtime and dependency pack;
4. persisted artifact identity and provenance.

If two choices have similar useful quality and speed, the smaller complete
download, installed size, RAM peak, temporary-disk peak, and maintenance
surface win.

## Decision

### Stable product recipes

Users choose an outcome-oriented recipe. They never choose a raw model,
execution provider, or arbitrary engine parameters.

| Recipe           | Product label | Current or planned profile | Availability       |
| ---------------- | ------------- | -------------------------- | ------------------ |
| `quick`          | 快速分離      | `mdx-kara2-v1`             | Built in           |
| `general`        | 推薦分離      | `mdx-inst-hq4-v1`          | Built in, default  |
| `refined`        | 精修分離      | One accepted BS-RoFormer   | Optional, gated    |
| `backing-vocals` | 保留和聲      | Base separator then BVE    | Optional, deferred |

`general` is the default. `quick` is a best-effort speed path, not the
quality baseline. The UI may explain likely trade-offs, but recipe ids and
localized labels must not contain a model name or a relative promise such as
“standard”, “clean”, or “HQ”.

Main accepts only allowlisted runnable recipe ids and resolves the engine,
profile, model chain, dependency ids, parameters, and output policy. Model
paths, Python arguments, execution-provider names, and arbitrary settings
never cross from renderer.

### Versioned processing profiles

An exact processing profile owns the reproducible implementation identity.
For example, `mdx-inst-hq4-v1` identifies Inst HQ4 plus its FFT dimensions,
overlap, compensation, denoise policy, runtime adapter, and output mapping.
Replacing the `general` model creates a new profile id; it does not rename the
recipe.

The manifest records both the stable recipe and the exact profile. This lets a
future `general` result use Inst HQ4 or another accepted model without changing
UI intent or pretending an older artifact used the new model.

### Current UVR model selection

The two product models are useful together, but serve different priorities:

- retain KARA2 as `quick`; its speed and karaoke bias are a distinct feature;
- use Inst HQ4 for new `general` jobs. In the six-song blind review, HQ3 was
  usually slightly cleaner, but the practical difference was small enough to
  require deliberate comparison and the overall result was effectively tied;
- accept HQ4 on that audible non-regression plus its repeatable operational
  gain: 18.09% less total CPU wall time, 11.81% lower mean peak RSS, and an
  11.51% smaller pinned model than HQ3;
- use one BS-RoFormer as the first `refined` spike because its model family has
  a materially higher quality ceiling and therefore justifies a separate
  optional tier;
- keep PolarFormer as a watch-list candidate until its releases and behavior
  are mature enough for an LTS product dependency;
- do not add MDX23C InstVoc HQ2 as another normal UI choice: it overlaps the
  general/refined outcomes while adding a PyTorch-class runtime cost;
- do not add Demucs merely for model variety. Its multi-stem strength is not a
  product benefit when Utawakui saves only accompaniment plus guide vocals.

Automated source-separation scores are screening evidence, not product
acceptance. Local blind listening must include dense choruses, male and female
Japanese vocals, rap, backing vocals, sparse/acoustic sources, live recordings,
reverb, and compressed sources.

### No model-zoo UI

Additional models enter the product only when they create a different user
outcome. The accepted possible outcomes are:

- faster preparation;
- generally dependable vocal removal;
- optional semi-formal refinement;
- explicit backing-vocal retention.

De-reverb, de-noise, four/six-stem export, ensembles, and per-model tuning are
not added until a concrete workflow requires them. They may become processing
stages inside a future recipe, but not free-standing technical knobs.

### Remove the former KARA2 tier-two action

`high-quality` is not offered for new jobs. It uses the same KARA2 model with
more overlap and denoise, costs substantially more time, and does not establish
a stable user outcome.

The removal is non-destructive:

- existing `high-quality.wav` files remain in place;
- existing manifest entries remain readable and selectable;
- library listing and media serving continue to recognize the legacy result;
- no startup migration renames, deletes, or regenerates user media.

### Product-owned service boundary

Main owns `AudioProcessingService`, which validates recipe intent, resolves
dependencies, permits one active job, normalizes progress and failures, owns
temporary storage, supports cancellation, atomically publishes the final
artifact, and updates the manifest only after publication succeeds.

```text
Renderer recipe intent
        |
        v
AudioProcessingService
  |-- recipe and dependency resolution
  |-- one-job scheduling, cancellation, and cleanup
  |-- progress and atomic result publication
  |
  +-- onnx-mdx adapter
  |     |-- quick   -> mdx-kara2-v1
  |     `-- general -> mdx-inst-hq4-v1
  |
  `-- community-python adapter (optional)
        |-- refined        -> one accepted BS-RoFormer
        `-- backing-vocals -> BS-RoFormer then BVE
```

A broad plugin framework is not introduced. The service supports only engines
required by accepted product recipes.

### Runtime and dependency policy

The lightweight ONNX path remains built in. It is CPU-completable and uses the
same runtime for KARA2 and Inst HQ4; HQ3 remains available only for legacy
provenance and controlled benchmark execution.

CPU and GPU do not normally change a model's weight file or saved-result size.
They mainly change inference speed, runtime installation size, peak memory, and
hardware compatibility. A CUDA PyTorch environment can add gigabytes even when
the model itself is only hundreds of megabytes. GPU acceleration is therefore
an optional runtime decision, not another recipe.

The community quality pack, if accepted, uses an independent versioned,
app-managed Python runtime. It must not reuse or modify the yt-dlp Python
environment: provider download and audio inference have unrelated Python,
update, repair, licensing, and failure requirements.

Optional layers remain separately removable:

1. community CPU runtime;
2. one selected BS-RoFormer model;
3. one selected BVE model;
4. a future hardware-specific GPU runtime.

The UI shows expected download and installed capacity before preparation. No
separation job performs a hidden download. Every managed runtime and model
requires a fixed upstream source, immutable version, license, checksum,
expected and maximum sizes, notices, repair/removal path, and update policy.

### Output and storage contract

Every recipe publishes one playback artifact:

- 44.1 kHz signed 16-bit PCM;
- channels 0/1: accompaniment left/right;
- channels 2/3: guide or lead-vocal left/right.

The layout costs 352,800 bytes/second: about 20.19 MiB per minute or
100.94 MiB for five minutes per retained result. Compared with a 128–256
kbit/s compressed source, one result is usually about 11–22 times larger; it
is exactly twice the rate of 44.1 kHz/16-bit stereo PCM. Result size is
independent of CPU/GPU and model weight.

The product keeps one selected result by default. Extra recipe results are a
user-visible, removable, regenerable cache. It does not persist separate stems
or multi-stage intermediates by default. A future compressed result format
needs independent playback, seek, guide-mix, quality, and migration validation.

`backing-vocals` would split full vocals into lead and backing vocals, mix the
backing vocals into accompaniment, and save lead vocals as the guide pair. All
intermediate audio stays in the job directory and is deleted after success,
failure, or cancellation.

### Manifest v2 and legacy compatibility

New results use canonical recipe ids and exact provenance:

```json
{
  "version": 2,
  "selectedRecipeId": "general",
  "results": {
    "general": {
      "recipeVersion": 1,
      "engineId": "onnx-mdx",
      "profileId": "mdx-inst-hq4-v1",
      "modelIds": ["inst-hq4"],
      "artifactFilename": "general.wav",
      "completedAt": "2026-08-23T00:00:00.000Z",
      "outputLayout": "accompaniment-guide-4ch"
    }
  }
}
```

Readers and result selection accept these aliases:

| Released or transitional id | Canonical result id | Artifact is renamed? |
| --------------------------- | ------------------- | -------------------- |
| `standard`                  | `quick`             | No                   |
| `clean`                     | `general`           | No                   |
| `inst-hq3`                  | `general`           | No                   |
| `recording-enhanced`        | `refined`           | No                   |

Aliases are read/select compatibility only. New job intent must use canonical
ids. `high-quality` remains a separate non-runnable legacy result. Unknown,
well-formed legacy entries remain available for recovery but cannot become new
executable intent. Media serving uses the allowlisted `artifactFilename` and
never exposes an absolute path.

### Benchmark and release gates

An ONNX model may replace the `general` profile only after the same local corpus
and challenge set show no meaningful regression and at least one practical gain
in quality, speed, RAM, or installed size. The comparison must use identical
source excerpts and blind labels.

The 2026-08-23 K-pop challenge completed the operational half of this gate on
six NewJeans/BTS songs. On the Ryzen 7 7700 CPU path, HQ4 reduced total wall
time from 1,001.14 to 820.06 seconds (18.09%) and mean peak RSS from 3,701.70
to 3,264.47 MiB (11.81%). Its pinned weight is also 7,684,872 bytes (11.51%)
smaller. Both profiles produced the same 443 MiB for the corpus because saved
size follows the fixed four-channel PCM contract, not model size. All output
format checks passed. Blind listening found HQ3 generally a little cleaner but
the overall practical result effectively tied and difficult to distinguish
without focused comparison. No material regression was found, so HQ4 passed
the replacement gate and `general` moved to `mdx-inst-hq4-v1`. See
[the K-pop benchmark report](../audio-processing-hq3-hq4-kpop-benchmark-2026-08-23.md).

The managed dependency update downloads and verifies the 59,074,342-byte HQ4
weight before removing the deprecated 66,759,214-byte HQ3 managed cache. This
creates a bounded temporary overlap of 125,833,556 bytes (about 120.0 MiB),
then leaves steady-state model storage 7,684,872 bytes smaller. Verification
failure keeps HQ3 intact. Existing separation WAV files are library media and
are never part of this dependency-cache cleanup.

The `refined` pack must additionally prove:

- reproducible installation in the independent managed runtime;
- packaged Windows CPU inference, progress, cancellation, and cleanup;
- output length, sample rate, channel mapping, alignment, and atomic publish;
- runtime/model download, installed size, update overlap, RAM, and temp peaks;
- a material listening benefit over `general` in semi-formal use.

If no candidate clears provenance, capacity, CPU usability, packaged execution,
and listening gates, Utawakui ships only the two ONNX recipes. BVE begins only
after the single-pass refined path is stable. CUDA requires a later explicit
capacity and hardware-support decision.

### Rollout stages and current implementation state

The work is deliberately staged so model research cannot silently expand the
base installation:

1. **Canonical product contract — implemented:** expose `quick` and `general`,
   make `general` the default, persist manifest v2 provenance, retain legacy
   result aliases, and validate recipe/profile/model agreement before inference.
2. **Lightweight challenger — implemented:** Inst HQ4 passed the six-song K-pop
   CPU, RAM, capacity, provenance, output-contract, and blind non-regression
   gates. New `general` jobs use `mdx-inst-hq4-v1`; HQ3 remains readable in old
   manifests and benchmark-only for controlled comparisons. The managed HQ4
   dependency supersedes HQ3 only after successful checksum verification.
3. **Refined CPU spike — pending:** construct a contained, independently
   versioned `python-audio-separator` CPU runtime with one pinned BS-RoFormer.
   The spike may write only to benchmark storage and must not become a hidden
   first-use download.
4. **Optional-pack productization — gated:** add dependency preparation,
   repair/removal, capacity presentation, packaged execution, cancellation,
   and manifest publication only after the refined candidate passes all gates.
5. **Backing vocals — deferred:** add BVE only after the one-pass refined path
   is stable and its mix semantics pass listening tests.
6. **GPU acceleration — separate decision:** benchmark CUDA or another provider
   only after the CPU product path is accepted. GPU support never changes the
   stable recipe id or saved-result contract.

BS-RoFormer, BVE, and CUDA are documented candidates, not currently installed
product dependencies. HQ4 is the active on-demand `general` dependency; its
presence in the registry still does not permit a hidden separation-time
download because preparation remains explicit in Settings.

### Benchmark artifact retention and cleanup

Benchmark input references, aggregate measurements, hardware context, and
acceptance conclusions belong in versioned documentation. Generated WAVs,
temporary manifests, A/B excerpts, downloaded candidate weights, and unpacked
experimental runtimes belong under ignored, task-specific benchmark storage.

After measurements have been captured and the listening decision has been
recorded, generated media is deleted unless an active blind-listening review
still needs it. Cleanup must resolve and verify the exact benchmark directory,
must never target the production library, and must report the deleted size and
whether the artifacts can be regenerated. A later benchmark starts in a fresh
directory so stale artifacts cannot be mistaken for output from a new profile.

## Rejected options

- Keep `high-quality` as KARA tier two: more work with the same model is not a
  distinct product outcome.
- Promote a replacement from leaderboard values alone: the HQ3/HQ4 reference
  delta was too small, so HQ4 was accepted only after local operational and
  blind-listening gates passed.
- Replace the normal path with Python/PyTorch: it adds a much larger runtime
  without benefiting the current ONNX recipes.
- Reuse the yt-dlp Python environment: unrelated dependencies and release
  cycles would make both workflows less reliable.
- Bundle every community model: it transfers upstream catalog complexity and
  capacity costs into the product.
- Default to CUDA: its footprint, driver, and hardware requirements violate the
  CPU-completable contract.
- Persist every intermediate stem: it multiplies library growth for data the
  player does not use.
- Destructively rename legacy result files: it risks playback and open-file
  failures without user value.

## Consequences

The ordinary product has two understandable built-in choices and one default:
`quick` for time-sensitive preparation and `general` for dependable everyday
use. HQ4 improves repeatable preparation cost without claiming an audible
quality upgrade over HQ3. Semi-formal quality remains the responsibility of the
future `refined` pack. Existing results remain usable.

The cost is permanent manifest compatibility, versioned profile discipline,
optional-runtime lifecycle work, and real-audio acceptance tests before any
model replacement or additional feature recipe ships.

## References

- [Local ONNX CPU baseline](../audio-processing-baseline-2026-08-22.md)
- [Current community model review](../audio-processing-model-review-2026-08-23.md)
- [python-audio-separator](https://github.com/nomadkaraoke/python-audio-separator)
- [python-audio-separator maintained model scores](https://raw.githubusercontent.com/nomadkaraoke/python-audio-separator/main/audio_separator/models-scores.json)
- [MVSEP synthetic leaderboard](https://mvsep.com/quality_checker/synth_leaderboard)
- [Music Source Separation Training releases](https://github.com/ZFTurbo/Music-Source-Separation-Training/releases)
- [UVR model catalog](https://github.com/Anjok07/ultimatevocalremovergui/blob/master/gui_data/model_manual_download.json)
