# Music Analysis Model Survey — 2026-08-24

## Outcome

There is no reviewed single model that currently satisfies all three product
requirements: complete M1/M2 output, commercially usable redistributable
weights, and practical packaged Windows x64 CPU inference.

Proceed with two independently activated paths:

- M1 product candidate: `beat-this==1.1.0`, benchmarking `small0` first and
  `final0` as the quality comparator.
- M2 boundary candidate: app-owned bar-synchronous CBM plus `librosa==1.0.0`,
  with `ruptures` as a low-cost comparison/fallback. This initially emits
  `role: "unknown"`; it does not pretend to infer verse/chorus semantics.

Keep All-In-One as the full M1/M2 benchmark baseline only. No surveyed semantic
M2 checkpoint is eligible for product activation yet.

## Candidate disposition

| Candidate                                                                                                     | Signals                                                                     | License / packaging evidence                                                                                                                                                                                             | Disposition                                                                                           |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| [Beat This! 1.1.0](https://github.com/CPJKU/beat_this)                                                        | beat and downbeat timestamps; source BPM can be derived from beat intervals | Upstream explicitly releases code and published weights under MIT, supports CPU, and publishes approximately 8.1 MB `small*` and 78 MB `final*` checkpoints. Its training-data caveat still needs recorded legal review. | **M1 product-candidate spike**                                                                        |
| [All-In-One Infer](https://github.com/openmirlab/all-in-one-infer)                                            | BPM, beats/downbeats, section boundaries and semantic labels                | Package code is MIT, but the maintained [checkpoint manifest](https://github.com/openmirlab/all-in-one-infer/blob/main/src/allin1_infer/config/checkpoints.toml) identifies Harmonix weights as `CC-BY-NC-SA-4.0`.       | **Benchmark only** unless the rights holder supplies written commercial and redistribution permission |
| App-owned CBM + [librosa 1.0](https://librosa.org/doc/main/auto_tutorials/03-advanced/plot_segmentation.html) | section boundaries and repetition clusters                                  | Librosa is ISC and has a current Windows-capable Python package. Official documentation states that cluster ids are arbitrary, not verse/chorus roles. No model artifact is required.                                    | **M2 boundary product-candidate spike**                                                               |
| [ruptures](https://github.com/deepcharles/ruptures)                                                           | generic change points                                                       | BSD-2-Clause with Windows wheels; no model weights.                                                                                                                                                                      | Comparison and bounded fallback                                                                       |
| [MSAF](https://github.com/urinieto/msaf)                                                                      | multiple structure-boundary algorithms and acoustic-similarity labels       | MIT source, but the complete package carries an old, broad dependency graph including `cvxopt` and `vmo`; labels are not functional section roles.                                                                       | Algorithm reference / benchmark; do not install the package graph                                     |
| [LinkSeg](https://github.com/morgan76/LinkSeg)                                                                | semantic Intro/Verse/Chorus/Bridge/Instrumental/Outro/Silence               | The repository has no LICENSE, checkpoints have no separate terms, and inference requires a Python 3.9 research stack including Git-installed madmom, DGL, PyTorch, and PyTorch Geometric.                               | **Reject for product**                                                                                |
| [MOSS-Music 8B](https://github.com/OpenMOSS/MOSS-Music)                                                       | claims tempo, timestamped beats/downbeats, and semantic sections            | Apache-2.0 model terms are clear, but each model is about 9.1B parameters and the supported path is CUDA/SGLang. Output is autoregressive text rather than the bounded sidecar contract.                                 | Long-term GPU research reference only                                                                 |
| BeatNet / Beat Transformer                                                                                    | beat/downbeat, tempo or meter                                               | Weight terms are not independently clear enough; both retain heavier research or legacy dependencies. Beat Transformer also expects demixed inputs.                                                                      | Secondary benchmark only                                                                              |
| madmom / Essentia                                                                                             | rhythm and some boundary algorithms                                         | madmom model/data files are `CC-BY-NC-SA-4.0`; Essentia is AGPL with non-commercial model terms unless separately licensed.                                                                                              | Reject for current product                                                                            |

## M1 spike contract

The first spike should use a prepared local Beat This! checkpoint, never its
runtime auto-download shortcut:

1. Resolve the official `small0` and `final0` artifacts once in the preparation
   path, record source URL, byte size, SHA-256, license, and upstream revision.
2. Produce a reviewed wheel-only CPython 3.12 Windows x64 lock. Include notices
   for every runtime dependency, including `soxr`.
3. Extend the replaceable analysis backend so Beat This! produces only M1:
   beat/downbeat times, derived BPM, position in bar, bounded confidence where
   defensible, and exact analyzer/model provenance.
4. Benchmark fixed karaoke, K-pop, and J-pop songs with beat/downbeat F-score,
   BPM octave error, wall time, peak memory, environment size, cancellation, and
   cold packaged offline execution.
5. Start with `small0`; promote `final0` only when measured accuracy gains justify
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

Prepare and benchmark the Beat This! M1 path first. Run the no-weight M2 boundary
experiment from the same fixed-song corpus in parallel only after the M1 artifact
and wheel lock are reproducible. Do not add a product activation or model
download UI until packaged offline, capacity, license, removal/repair, and real
presentation acceptance gates pass.
