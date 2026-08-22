# Audio-processing model review — 2026-08-23

## Product question

Are Utawakui's current KARA2 and Inst HQ3 models the best product combination,
and which additional model capabilities are worth maintaining?

The answer is conditional:

- KARA2 remains a strong `quick` choice because it creates a distinct fast,
  karaoke-oriented outcome;
- Inst HQ3 is a sound current `general` baseline, but Inst HQ4 is a credible
  same-runtime replacement candidate;
- one BS-RoFormer is the only near-term addition with enough expected quality
  separation to justify a `refined` optional pack;
- backing-vocal extraction is a later feature recipe, not another normal model
  choice.

No candidate is promoted from a public score alone. Source separation scores
are measured on reference datasets and do not capture Utawakui's exact failure
cases: backing vocals, rap, a cappella, live reverb, sparse arrangements, and
highly compressed provider audio.

## Evidence snapshot

The maintained `python-audio-separator` score catalog currently reports these
median SDR values. They are useful for screening candidates but are not a
cross-dataset listening verdict.

| Candidate               | Family/runtime class | Vocal SDR | Instrumental SDR | Product reading                                             |
| ----------------------- | -------------------- | --------: | ---------------: | ----------------------------------------------------------- |
| KARA2                   | MDX ONNX             |     5.433 |           14.770 | Keep for speed and karaoke behavior, not raw quality        |
| Inst HQ3                | MDX ONNX             |     8.809 |           15.421 | Current dependable general baseline                         |
| Inst HQ4                | MDX ONNX             |     8.832 |           15.512 | Very small score lead; benchmark before replacing HQ3       |
| MDX23C InstVoc HQ2      | MDXC/PyTorch         |    10.514 |           15.919 | Better screening score, but overlaps a quality-pack runtime |
| BS-RoFormer Viperx-1297 | MDXC/PyTorch         |    11.774 |           16.451 | First practical refined-tier spike                          |

The HQ3-to-HQ4 difference is only about +0.023 vocal SDR and +0.091
instrumental SDR in that catalog. HQ4's listed model size is about 56.3 MB
versus HQ3's 63.7 MB, so the immediate reason to test it is a possible smaller
same-engine replacement, not a proven audible leap.

The independent MVSEP synthetic leaderboard is currently dominated by single
BS-RoFormer entries near the top. This supports investing in a RoFormer spike,
but does not identify the final shipping checkpoint for Utawakui.

## Candidate-by-candidate disposition

### Built-in lightweight path

| Candidate                   | Keep or test              | Why                                                                               | Main risk                                              |
| --------------------------- | ------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------ |
| KARA2                       | Keep as `quick`           | Fastest measured current path; useful when preparation time matters               | Arrangement-dependent leakage or unwanted preservation |
| Inst HQ3                    | Keep as current `general` | Existing integration, provenance, and local listening are understood              | Roughly 2.9× KARA2 time on the measured CPU            |
| Inst HQ4                    | Operational pass; listen  | Same MDX/ONNX path; 18.09% less total CPU wall time and 11.81% less mean peak RSS | Audible result may still be song-dependent             |
| Other Inst HQ/Main variants | Do not expose             | They do not establish a separate product outcome                                  | Model-zoo maintenance and confusing choices            |
| Spleeter 2-stem             | Reject for this slot      | Mature and fast, but the current MDX path already meets CPU speed needs           | Quality ceiling does not justify migration             |
| VR architecture models      | Reject for normal path    | Useful for specialized targets in UVR                                             | Another runtime path without a current product need    |

Inst HQ4 received the first benchmark slot. The completed challenge round used
three NewJeans and three BTS tracks spanning layered female vocals, rap, sparse
arrangements, dense choruses, sustained male vocals, and reverb tails. HQ4 was
faster on every track, used less peak RAM, and its pinned model is 11.51%
smaller. The operational gate therefore passes, but HQ4 still replaces HQ3 only
when the generated blind material shows no meaningful regression. Detailed
measurements and the pre-committed listening rule are in the
[K-pop benchmark report](audio-processing-hq3-hq4-kpop-benchmark-2026-08-23.md).

### Optional refined path

| Candidate                             | Disposition                 | Why                                                                                               |
| ------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------- |
| BS-RoFormer Viperx-1297               | First spike                 | Maintained wrapper support, strong reference results, and a distinct quality ceiling              |
| Other BS/MelBand RoFormer checkpoints | Secondary challengers       | Consider only if the first spike exposes a repeatable corpus weakness                             |
| MDX23C InstVoc HQ2                    | Do not make a third default | It requires the heavier community runtime but offers less separation from the refined candidate   |
| PolarFormer                           | Watch list                  | Active model release and promising leaderboard presence, but too new for the first LTS dependency |
| Multi-model ensemble                  | Reject initially            | Multiple weights and passes increase download, RAM, time, and provenance work                     |

`python-audio-separator` is the leading first integration spike because it has
a programmatic API, model catalog, CPU and CUDA paths, and current UVR-family
model support. It is not silently installed by the separation action. The app
must pin and verify its own independent runtime and selected checkpoint.

On Windows, DirectML is not a general solution for this quality pack. The
wrapper documents MDX ONNX acceleration, but currently falls RoFormer/MDXC back
to CPU because of allocator limits and does not support Demucs under DirectML.
CUDA may be faster on supported NVIDIA hardware, but its much larger runtime
footprint remains a separate optional decision.

### Feature models

| Feature                        | Decision                      | Reason                                                                            |
| ------------------------------ | ----------------------------- | --------------------------------------------------------------------------------- |
| Backing-vocal extraction (BVE) | Defer behind stable `refined` | It creates a real product outcome: backing vocals in accompaniment, lead as guide |
| Demucs four/six stems          | Do not add                    | Utawakui does not need drum/bass/guitar/piano authoring outputs                   |
| De-reverb                      | Do not add yet                | No accepted workflow or storage/mixing contract                                   |
| De-noise                       | Do not add yet                | May damage music; not a generic quality switch                                    |
| Stem export                    | Do not add by default         | Multiplies storage and moves the product toward studio tooling                    |

Demucs remains important in the broader community, especially for four- and
six-stem separation. That strength is orthogonal to Utawakui's two-pair
playback artifact, so excluding it is scope discipline rather than a claim
that the architecture is poor.

## Capacity and execution interpretation

CPU versus GPU is mainly an execution trade-off, not a result-format trade-off:

- the same model weight normally occupies the same disk space;
- the saved four-channel PCM result is the same size;
- GPU can reduce wall time, but needs a compatible inference runtime, driver,
  and additional installed files;
- CPU has broader compatibility and remains the guaranteed completion path;
- peak RAM/VRAM and temporary disk must be measured per profile.

The current local output contract costs about 100.9 MiB per five-minute result.
This is larger than either lightweight model weight and quickly dominates a
library when multiple results are retained. Only the selected result should be
kept by default; alternates are explicit, removable cache.

## Ordered investment plan

1. Ship the stable `quick` and `general` product ids with KARA2 and Inst HQ3.
2. Complete blind review of the operationally qualified Inst HQ4 challenger;
   keep HQ3 as the default profile until that review passes.
3. Add a contained CPU-only `python-audio-separator` spike with one pinned
   BS-RoFormer checkpoint.
4. Compare `general` and `refined` on the expanded blind-listening corpus and
   record runtime, download, install, update-overlap, RAM, and temp peaks.
5. Productize the optional pack only if the quality difference is material.
6. Evaluate BVE only after the single-model refined path is stable.
7. Evaluate CUDA and newer PolarFormer checkpoints as separate later decisions.

## Sources

- [python-audio-separator README and runtime support](https://github.com/nomadkaraoke/python-audio-separator/blob/main/README.md?plain=1)
- [Maintained model score catalog](https://raw.githubusercontent.com/nomadkaraoke/python-audio-separator/main/audio_separator/models-scores.json)
- [sherpa-onnx UVR model size listing](https://github.com/k2-fsa/sherpa/blob/master/docs/source/onnx/source-separation/models.rst)
- [MVSEP synthetic leaderboard](https://mvsep.com/quality_checker/synth_leaderboard)
- [MSST releases, including PolarFormer weights](https://github.com/ZFTurbo/Music-Source-Separation-Training/releases)
- [UVR model download catalog](https://github.com/Anjok07/ultimatevocalremovergui/blob/master/gui_data/model_manual_download.json)
