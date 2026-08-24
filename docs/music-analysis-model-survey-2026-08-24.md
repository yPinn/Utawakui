# Music Analysis Model Survey — 2026-08-24

## Outcome

There is no reviewed single model that currently satisfies all three product
requirements: complete M1/M2 output, commercially usable redistributable
weights, and practical packaged Windows x64 CPU inference.

Proceed with two independently activated paths:

- Conditional M1 candidate: `beat-this==1.1.0`, benchmarking `small0` first and
  `final0` as the quality comparator. It is active, but it has no formal LTS
  commitment and its TorchAudio dependency is already in maintenance mode.
- M2 boundary candidate: app-owned bar-synchronous CBM plus `librosa==1.0.0`,
  with `ruptures` as a low-cost benchmark comparator. This initially emits
  `role: "unknown"`; it does not pretend to infer verse/chorus semantics.

Keep All-In-One as the full M1/M2 benchmark baseline only. No surveyed semantic
M2 checkpoint is eligible for product activation yet.

## Candidate disposition

| Candidate                                                                                                     | Signals                                                                     | License / packaging evidence                                                                                                                                                                                             | Disposition                                                                                           |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| [Beat This! 1.1.0](https://github.com/CPJKU/beat_this)                                                        | beat and downbeat timestamps; source BPM can be derived from beat intervals | Upstream explicitly releases code and published weights under MIT, supports CPU, and publishes approximately 8.1 MB `small*` and 78 MB `final*` checkpoints. Its training-data caveat still needs recorded legal review. | **Conditional M1 spike; not LTS**                                                                     |
| [All-In-One Infer](https://github.com/openmirlab/all-in-one-infer)                                            | BPM, beats/downbeats, section boundaries and semantic labels                | Package code is MIT, but the maintained [checkpoint manifest](https://github.com/openmirlab/all-in-one-infer/blob/main/src/allin1_infer/config/checkpoints.toml) identifies Harmonix weights as `CC-BY-NC-SA-4.0`.       | **Benchmark only** unless the rights holder supplies written commercial and redistribution permission |
| App-owned CBM + [librosa 1.0](https://librosa.org/doc/main/auto_tutorials/03-advanced/plot_segmentation.html) | section boundaries and repetition clusters                                  | Librosa is ISC and has a current Windows-capable Python package. Official documentation states that cluster ids are arbitrary, not verse/chorus roles. No model artifact is required.                                    | **M2 boundary product-candidate spike**                                                               |
| [ruptures](https://github.com/deepcharles/ruptures)                                                           | generic change points                                                       | BSD-2-Clause with Windows wheels; no model weights.                                                                                                                                                                      | Benchmark/dev comparator only                                                                         |
| [MSAF](https://github.com/urinieto/msaf)                                                                      | multiple structure-boundary algorithms and acoustic-similarity labels       | MIT source, but the complete package carries an old, broad dependency graph including `cvxopt` and `vmo`; labels are not functional section roles.                                                                       | Algorithm reference / benchmark; do not install the package graph                                     |
| [LinkSeg](https://github.com/morgan76/LinkSeg)                                                                | semantic Intro/Verse/Chorus/Bridge/Instrumental/Outro/Silence               | The repository has no LICENSE, checkpoints have no separate terms, and inference requires a Python 3.9 research stack including Git-installed madmom, DGL, PyTorch, and PyTorch Geometric.                               | **Reject for product**                                                                                |
| [MOSS-Music 8B](https://github.com/OpenMOSS/MOSS-Music)                                                       | claims tempo, timestamped beats/downbeats, and semantic sections            | Apache-2.0 model terms are clear, but each model is about 9.1B parameters and the supported path is CUDA/SGLang. Output is autoregressive text rather than the bounded sidecar contract.                                 | Long-term GPU research reference only                                                                 |
| BeatNet / Beat Transformer                                                                                    | beat/downbeat, tempo or meter                                               | Weight terms are not independently clear enough; both retain heavier research or legacy dependencies. Beat Transformer also expects demixed inputs.                                                                      | Secondary benchmark only                                                                              |
| madmom / Essentia                                                                                             | rhythm and some boundary algorithms                                         | madmom model/data files are `CC-BY-NC-SA-4.0`; Essentia is AGPL with non-commercial model terms unless separately licensed.                                                                                              | Reject for current product                                                                            |

## Maintenance and LTS validation

No shortlisted analyzer has a formal community LTS support window. “Active” and
“LTS” must therefore remain separate release gates.

| Component                                                          | Current activity evidence                                                                                                                               | Formal LTS status                                                                                                                                                           | Product interpretation                                                                                                                                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Beat This!                                                         | Version 1.1.0 was released on 2026-04-14; the repository received compatibility, packaging, and checkpoint-license commits through 2026-05-28.          | No published LTS, security policy, supported-version window, or guaranteed patch cadence was found. It is a small research project, despite being marked Production/Stable. | Active enough for a pinned spike, not community-LTS. Utawakui must own the adapter, artifact mirror, regression fixtures, and replacement path.                                                                |
| [librosa 1.0](https://librosa.org/blog/posts/1.0/)                 | Version 1.0.0 was released on 2026-08-11 and commits continued through 2026-08-22. The project has been maintained since 2012.                          | No release LTS label. It now uses stable API intent through EffVer and follows Scientific Python SPEC 0 support windows for Python and core dependencies.                   | Strongest mature and active M2 foundation; acceptable behind an app-owned algorithm boundary.                                                                                                                  |
| [ruptures](https://github.com/deepcharles/ruptures/releases)       | Version 1.1.10 was released on 2025-09-10; new community pull requests continued in 2026, but the latest merged release activity observed is from 2025. | No published LTS or support window.                                                                                                                                         | Keep as a benchmark/dev comparator, not a required product runtime dependency.                                                                                                                                 |
| [PyTorch](https://github.com/pytorch/pytorch/blob/main/RELEASE.md) | The project is highly active and released 2.13.0 on 2026-07-08.                                                                                         | No current community LTS line was found. Official release planning states patch releases are optional and follows rapid minor releases.                                     | Pin an exact CPU wheel set and rebuild through immutable activations; activity does not substitute for an LTS promise.                                                                                         |
| [TorchAudio](https://docs.pytorch.org/audio/stable/)               | Windows wheels still exist and ML transforms remain available.                                                                                          | Explicitly in maintenance phase since 2.8/2.9; encoding/decoding moved to TorchCodec and APIs were removed.                                                                 | This is the main lifecycle blocker for Beat This!, which currently uses both `torchaudio.load` and `torchaudio.transforms.MelSpectrogram`. Product activation requires a parity-tested removal/isolation plan. |
| [CPython](https://devguide.python.org/versions/)                   | Python 3.14 is in bugfix support through 2027 and security support through 2030. Python 3.12 is already security-only through 2028.                     | CPython has an official five-year security lifecycle, but security-only branches do not provide the same Windows binary maintenance channel as bugfix branches.             | Do not promote the provisional 3.12.10 spike runtime as the product lock. Prefer the newest bugfix-supported minor whose complete Windows wheel graph passes.                                                  |

Strict result: **the M1 shortlist does not currently satisfy a mandatory formal
community-LTS requirement**. Beat This! remains the best functional and licensing
candidate, but only under a product-owned support envelope. Librosa is mature and
active enough for M2 primitives, while ruptures is optional benchmark material.

## M1 spike contract

The first spike should use a prepared local Beat This! checkpoint, never its
runtime auto-download shortcut:

1. Resolve the official `small0` and `final0` artifacts once in the preparation
   path, record source URL, byte size, SHA-256, license, and upstream revision.
2. Resolve a reviewed wheel-only lock on the newest bugfix-supported CPython
   minor whose full Windows x64 graph passes; do not inherit the provisional
   3.12.10 benchmark lock. Include notices for every runtime dependency,
   including `soxr`.
3. Extend the replaceable analysis backend so Beat This! produces only M1:
   beat/downbeat times, derived BPM, position in bar, bounded confidence where
   defensible, and exact analyzer/model provenance.
4. Before product activation, remove or isolate TorchAudio behind a numerically
   parity-tested preprocessing boundary. The fixed FFmpeg decode path already
   removes the need for TorchAudio file I/O; mel-spectrogram parity still needs
   proof.
5. Benchmark fixed karaoke, K-pop, and J-pop songs with beat/downbeat F-score,
   BPM octave error, wall time, peak memory, environment size, cancellation, and
   cold packaged offline execution.
6. Start with `small0`; promote `final0` only when measured accuracy gains justify
   the larger checkpoint and CPU/RAM cost.

This M1 activation must not wait for M2. Missing sections remain a valid M1
sidecar and the existing M0 presentation fallback remains unchanged.

## M2 spike contract

Use Beat This! downbeats as bar anchors, calculate bar-synchronous chroma and
MFCC features, then compare app-owned CBM, librosa Laplacian segmentation, and a
bounded ruptures change-point baseline.

The initial result may publish valid section intervals with `role: "unknown"`
and a bounded acoustic cluster id in `rawLabel`. It must not synthesize semantic
roles or confidence. Because the current consumer deliberately ignores
`unknown`, this improves analysis/authoring evidence but does not by itself
enable chorus/verse visual variants.

Automatic canonical roles remain blocked until one of these is true:

- All-In-One rights are clarified in writing and its full release gates pass;
- another semantic checkpoint has explicit code, weight, dataset, commercial,
  and redistribution terms plus Windows CPU evidence; or
- the separately defined authored section override UI supplies the roles.

## Next phase

First run a maintenance-closure spike: resolve the current CPython/PyTorch Windows
CPU wheel set and prove whether Beat This! preprocessing can drop or isolate
TorchAudio without changing beat/downbeat output. Only then prepare and benchmark
the M1 artifact. Run the no-weight M2 boundary experiment from the same fixed-song
corpus after the M1 lock is reproducible. Do not add a product activation or model
download UI until packaged offline, capacity, license, maintenance ownership,
removal/repair, and real presentation acceptance gates pass.
