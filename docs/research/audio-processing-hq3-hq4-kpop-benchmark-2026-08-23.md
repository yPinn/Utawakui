# Inst HQ3 vs Inst HQ4 K-pop benchmark (2026-08-23)

Status: accepted point-in-time evidence. Inst HQ4 is the active implementation behind the
stable `general` product recipe. HQ3 remains compatible with existing results
and available only for controlled benchmark/legacy execution, not as another UI
tier.

## Question and controls

Can Inst HQ4 replace Inst HQ3 behind the stable `general` product recipe while
reducing install/runtime cost without a meaningful quality regression?

Both candidates used Utawakui's identical CPU-only ONNX MDX worker, FFmpeg decode,
overlap `0.25`, denoise enabled, 44.1 kHz stereo inference, and four-channel
16-bit PCM output. Every job verified the source and model SHA-256 before
inference. Jobs ran sequentially on an AMD Ryzen 7 7700 (8 cores/16 logical
processors), 64 GiB RAM, Windows 11 build 26200, using CPUExecutionProvider.

## Pinned artifacts

| Artifact |      Bytes | SHA-256                                                            | UVR execution data                       |
| -------- | ---------: | ------------------------------------------------------------------ | ---------------------------------------- |
| Inst HQ3 | 66,759,214 | `317554b07fe1ea5279a77f2b1520a41ea4b93432560c4ffd08792c30fddf9adc` | FFT 6144, dim F 3072, compensation 1.022 |
| Inst HQ4 | 59,074,342 | `3c4b5b9b05090fdf238f38ba5046813982d50e2a652e9cb3324ea79720c3c9c8` | FFT 5120, dim F 2560, compensation 1.019 |

HQ4's UVR lookup key is MD5
`0f2a6bc5b49d87d64728ee40e23bceb1` over the last 10,240,000 bytes. The
[UVR metadata registry](https://raw.githubusercontent.com/TRvlvr/application_data/main/mdx_model_data/model_data_new.json)
maps that key to the recorded tensor parameters and instrumental-primary stem.
The official [UVR model release](https://github.com/TRvlvr/model_repo/releases/tag/all_public_uvr_models)
is the downloaded artifact source. HQ4 is 7,684,872 bytes (11.51%) smaller than
HQ3 if it replaces HQ3; shipping both would instead add 59,074,342 bytes.

## Challenge corpus

| Track                  | Product risk represented                       |
| ---------------------- | ---------------------------------------------- |
| NewJeans - Attention   | layered and breathy female harmonies           |
| NewJeans - Cookie      | close vocal and rap-like delivery              |
| NewJeans - Hurt        | sparse arrangement where leakage is exposed    |
| BTS - FAKE LOVE        | dense chorus and high male vocals              |
| BTS - MIC Drop         | male rap consonants and strong drum transients |
| BTS - The Truth Untold | sustained ballad vocals and reverb tails       |

The source files remain in the user's production library and were never modified
or copied into the repository. Source hashes and private absolute paths live only
in ignored task storage.

## CPU and memory results

| Track            | HQ3 seconds | HQ4 seconds | HQ4 faster | HQ3 peak MiB | HQ4 peak MiB |
| ---------------- | ----------: | ----------: | ---------: | -----------: | -----------: |
| Attention        |      143.53 |      114.93 |      19.9% |     3,441.89 |     2,986.46 |
| Cookie           |      182.41 |      144.85 |      20.6% |     3,745.82 |     3,416.39 |
| Hurt             |      127.82 |      115.02 |      10.0% |     3,432.56 |     2,975.62 |
| FAKE LOVE        |      178.61 |      140.97 |      21.1% |     3,775.29 |     3,301.30 |
| MIC Drop         |      182.59 |      143.55 |      21.4% |     3,904.14 |     3,493.01 |
| The Truth Untold |      186.18 |      160.74 |      13.7% |     3,910.51 |     3,414.05 |

Across all six songs, HQ3 used 1,001.14 wall seconds and HQ4 used 820.06:
HQ4 reduced total wall time by 181.08 seconds (18.09%). Mean real-time factor
improved from 0.760 to 0.625. Mean peak RSS fell from 3,701.70 MiB to 3,264.47
MiB, a 437.23 MiB (11.81%) reduction. Average CPU utilization stayed near 7.5
cores for both profiles, so the speed gain reflects less work per chunk rather
than lower parallel utilization.

## Output and temporary capacity

All 12 results passed `pcm_s16le`, 44.1 kHz, four-channel, and duration checks.
Each model produced 443 MiB across the six songs. Output size is identical because
it is determined by duration and the fixed PCM contract, not ONNX weight size.
The six unique compressed sources total about 21.11 MiB, so one retained result
set is about 20.98 times the source size; retaining both candidates doubles that
benchmark cost.

The ignored benchmark workspace occupied 1,048.23 MiB: 885.99 MiB full run
artifacts/manifests, 105.87 MiB lossless blind excerpts, and 56.34 MiB for the HQ4
candidate. These figures are evaluation storage, not the intended steady-state
product cost. After this decision was recorded, the reproducible benchmark
WAV/FLAC/model artifacts were deleted from the exact verified task directory;
production-library sources were never in that directory.

## Quality gate and current decision

The maintained `python-audio-separator`
[score catalog](https://raw.githubusercontent.com/nomadkaraoke/python-audio-separator/main/audio_separator/models-scores.json)
reports only a small median lead for HQ4 (instrumental SDR 15.5122 vs 15.421 for
HQ3), which cannot establish product quality by itself. The operational half of
the replacement gate passed: HQ4 is smaller, faster on every challenge song,
and uses less peak memory.

Six balanced, anonymous 45-second A/B cases were generated in ignored local task
storage. The promotion rule was frozen before listening: keep HQ3 on one severe
HQ4 regression or repeatable regressions in two challenge cases; allow HQ4 to
replace the versioned `general` profile only when it has no material regression
and the overall instrumental/guide assessment is tied or better.

The blind review found HQ3 generally a little cleaner, but the difference was
minor enough that the two were effectively tied in the practical PR85 judgment
and required deliberate comparison to distinguish. No severe or repeatable HQ4
regression was identified. The audible non-regression gate therefore passed;
HQ4's measured 18.09% wall-time gain, 11.81% mean peak-RSS reduction, and 11.51%
smaller weight decide the replacement. This is an operational profile upgrade,
not a claim that HQ4 sounds better. Material quality uplift remains assigned to
the future optional `refined` path. No new product tier is created.

The dependency transition downloads and checksum-verifies HQ4 before deleting
the deprecated managed HQ3 cache. Peak model overlap is 125,833,556 bytes
(about 120.0 MiB); steady state is 7,684,872 bytes smaller than HQ3 alone. A
failed HQ4 verification preserves HQ3, and existing HQ3-generated WAV results
are never deleted by model-cache cleanup.
