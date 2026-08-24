# Music Analysis Model Survey — 2026-08-24

## Outcome

There is no reviewed single model that currently satisfies all three product
requirements: complete M1/M2 output, commercially usable redistributable
weights, and practical packaged Windows x64 CPU inference.

Proceed with two independently activated paths:

- Preferred M1 product candidate: `beat-this==1.1.0`, benchmarking `small0`
  first and `final0` as the quality comparator. Its upstream health is good for
  a small research project: recent releases address compatibility, packaging,
  checkpoint delivery, and license clarity. The concentrated maintainer base
  remains a continuity risk that Utawakui must contain.
- M2 boundary candidate: app-owned bar-synchronous CBM plus `librosa==1.0.0`,
  with `ruptures` as a low-cost benchmark comparator. This initially emits
  `role: "unknown"`; it does not pretend to infer verse/chorus semantics.

Keep All-In-One as the full M1/M2 benchmark baseline only. No surveyed semantic
M2 checkpoint is eligible for product activation yet.

## Candidate disposition

| Candidate                                                                                                     | Signals                                                                     | License / packaging evidence                                                                                                                                                                                             | Disposition                                                                                           |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| [Beat This! 1.1.0](https://github.com/CPJKU/beat_this)                                                        | beat and downbeat timestamps; source BPM can be derived from beat intervals | Upstream explicitly releases code and published weights under MIT, supports CPU, and publishes approximately 8.1 MB `small*` and 78 MB `final*` checkpoints. Its training-data caveat still needs recorded legal review. | **Preferred M1 product-candidate spike**                                                              |
| [All-In-One Infer](https://github.com/openmirlab/all-in-one-infer)                                            | BPM, beats/downbeats, section boundaries and semantic labels                | Package code is MIT, but the maintained [checkpoint manifest](https://github.com/openmirlab/all-in-one-infer/blob/main/src/allin1_infer/config/checkpoints.toml) identifies Harmonix weights as `CC-BY-NC-SA-4.0`.       | **Benchmark only** unless the rights holder supplies written commercial and redistribution permission |
| App-owned CBM + [librosa 1.0](https://librosa.org/doc/main/auto_tutorials/03-advanced/plot_segmentation.html) | section boundaries and repetition clusters                                  | Librosa is ISC and has a current Windows-capable Python package. Official documentation states that cluster ids are arbitrary, not verse/chorus roles. No model artifact is required.                                    | **M2 boundary product-candidate spike**                                                               |
| [ruptures](https://github.com/deepcharles/ruptures)                                                           | generic change points                                                       | BSD-2-Clause with Windows wheels; no model weights.                                                                                                                                                                      | Benchmark/dev comparator only                                                                         |
| [MSAF](https://github.com/urinieto/msaf)                                                                      | multiple structure-boundary algorithms and acoustic-similarity labels       | MIT source, but the complete package carries an old, broad dependency graph including `cvxopt` and `vmo`; labels are not functional section roles.                                                                       | Algorithm reference / benchmark; do not install the package graph                                     |
| [LinkSeg](https://github.com/morgan76/LinkSeg)                                                                | semantic Intro/Verse/Chorus/Bridge/Instrumental/Outro/Silence               | The repository has no LICENSE, checkpoints have no separate terms, and inference requires a Python 3.9 research stack including Git-installed madmom, DGL, PyTorch, and PyTorch Geometric.                               | **Reject for product**                                                                                |
| [MOSS-Music 8B](https://github.com/OpenMOSS/MOSS-Music)                                                       | claims tempo, timestamped beats/downbeats, and semantic sections            | Apache-2.0 model terms are clear, but each model is about 9.1B parameters and the supported path is CUDA/SGLang. Output is autoregressive text rather than the bounded sidecar contract.                                 | Long-term GPU research reference only                                                                 |
| BeatNet / Beat Transformer                                                                                    | beat/downbeat, tempo or meter                                               | Weight terms are not independently clear enough; both retain heavier research or legacy dependencies. Beat Transformer also expects demixed inputs.                                                                      | Secondary benchmark only                                                                              |
| madmom / Essentia                                                                                             | rhythm and some boundary algorithms                                         | madmom model/data files are `CC-BY-NC-SA-4.0`; Essentia is AGPL with non-commercial model terms unless separately licensed.                                                                                              | Reject for current product                                                                            |

## Upstream health and maintenance validation

The acceptance criterion is healthy, dependable upstream maintenance rather
than a formal LTS tag. The review therefore weighs release continuity,
compatibility response, issue and pull-request handling, packaging and
documentation quality, ecosystem health, and maintainer concentration.

| Component                                                          | Health evidence                                                                                                                                                                                                                                                                                    | Remaining risk                                                                                                                                           | Product disposition                                                                                                                           |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Beat This!                                                         | Version 1.1.0 was released on 2026-04-14 after compatibility, packaging, checkpoint-download, and PyPI work; commits continued through 2026-05-28 with checkpoint-license clarification. Open activity is small and focused rather than a large backlog of ignored breakages.                      | A small maintainer pool creates moderate continuity and bus-factor risk; training-data provenance still needs legal review.                              | Pass for the M1 product-candidate spike. Utawakui owns the exact pin, artifact mirror, adapter, regression fixtures, and replacement path.    |
| [librosa 1.0](https://librosa.org/blog/posts/1.0/)                 | Version 1.0.0 was released on 2026-08-11, commits continued through 2026-08-22, and the project has been maintained since 2012. It now expresses stable API intent through EffVer and follows Scientific Python SPEC 0 dependency support windows.                                                 | Normal fast-moving scientific-Python dependency churn remains.                                                                                           | Strongest mature M2 foundation; pass behind an app-owned algorithm boundary and exact environment lock.                                       |
| [ruptures](https://github.com/deepcharles/ruptures/releases)       | Version 1.1.10 was released on 2025-09-10 and new community pull requests continued in 2026.                                                                                                                                                                                                       | Observed merge and release cadence is slower than librosa, so response time is less predictable.                                                         | Keep as a benchmark/dev comparator, not a required product runtime dependency.                                                                |
| [PyTorch](https://github.com/pytorch/pytorch/blob/main/RELEASE.md) | The project is highly active and released 2.13.0 on 2026-07-08, with an established release process and broad ecosystem support.                                                                                                                                                                   | Rapid minor releases and optional patch releases make unbounded upgrades unsuitable for a packaged desktop runtime.                                      | Pass with an exact CPU wheel set, immutable activation, regression evidence, and controlled rebuilds.                                         |
| [TorchAudio](https://docs.pytorch.org/audio/stable/)               | The project is in maintenance phase and has narrowed its scope, but Windows wheels and ML transforms such as `MelSpectrogram` remain supported. Encoding and decoding are moving to TorchCodec; Utawakui already owns fixed FFmpeg decoding and can avoid `torchaudio.load` through `Audio2Beats`. | Future transform-scope changes could require extracting or replacing Beat This! preprocessing; the exact PyTorch/TorchAudio pair must remain compatible. | Watch and contain, but do not block the initial M1 candidate. Pin the pair and prove waveform-to-output parity in packaged Windows CPU tests. |
| [CPython](https://devguide.python.org/versions/)                   | CPython publishes a clear lifecycle: Python 3.14 is in bugfix support through 2027 and security support through 2030, while Python 3.12 is security-only through 2028.                                                                                                                             | The newest interpreter may temporarily lack a complete compatible Windows wheel graph.                                                                   | Prefer the newest bugfix-supported minor whose complete wheel lock passes; retain an older minor only when packaged evidence is stronger.     |

Under this intended health criterion, **Beat This! and librosa pass**. Beat
This!'s smaller maintainer pool produces a medium continuity risk, not a
rejection. Its checkpoint and runtime remain immutable product inputs, while
Utawakui owns a stable integration and replacement boundary. Ruptures remains
optional benchmark material.

## M1 spike contract

The first spike should use a prepared local Beat This! checkpoint, never its
runtime auto-download shortcut:

1. Resolve the official `small0` and `final0` artifacts once in the preparation
   path, record source URL, byte size, SHA-256, license, and upstream revision.
2. Resolve a reviewed wheel-only lock on the newest bugfix-supported CPython
   minor whose full Windows x64 graph passes. Retain the provisional 3.12.10
   spike only if its packaged evidence is stronger and record its shorter
   maintenance horizon. Include notices for every runtime dependency, including
   `soxr`.
3. Extend the replaceable analysis backend so Beat This! produces only M1:
   beat/downbeat times, derived BPM, position in bar, bounded confidence where
   defensible, and exact analyzer/model provenance.
4. Pin the exact PyTorch/TorchAudio pair and add waveform-to-log-mel-to-output
   regression fixtures. Use the fixed FFmpeg decode path instead of TorchAudio
   file I/O, and retain a tested contingency for extracting or replacing the
   preprocessing if TorchAudio later narrows its transform scope.
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

Prepare and benchmark the Beat This! `small0` and `final0` artifacts with an exact
CPython/PyTorch/TorchAudio Windows CPU lock and fixed regression corpus. Run the
no-weight M2 boundary experiment from the same songs after the M1 lock is
reproducible. Recheck upstream health when rebuilding the activation rather than
making the absence of an LTS tag a separate blocker. Do not add a product
activation or model download UI until packaged offline, capacity, license,
maintenance ownership, removal/repair, and real presentation acceptance gates
pass.
