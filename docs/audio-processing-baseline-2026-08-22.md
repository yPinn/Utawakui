# Local ONNX CPU Baseline — 2026-08-22

## Purpose

This benchmark checks whether Utawakui's two lightweight product recipes are
usable on a representative Windows desktop before any optional Python,
PyTorch, BS-RoFormer, BVE, or CUDA investment. It measures operational cost;
it does not claim an objective quality winner without a listening test.

The run used `scripts/audio-processing-benchmark.mjs`. At the time of the run,
the recipe ids were `standard` and `clean`; those measurements now correspond
to canonical `quick` (KARA2) and `general` (Inst HQ3), respectively. Every job ran in a
fresh Node process and wrote only below the gitignored
`tasks/audio-benchmark-2026-08-22/` directory. The production library,
manifests, and existing legacy results were not modified.

## Test system and corpus

- Windows 11 Enterprise, build 26200
- AMD Ryzen 7 7700, 8 cores / 16 logical processors
- 63.16 GiB usable RAM
- NVIDIA GeForce RTX 5060 Ti present but unused; this is the current CPU path
- Six local Opus 48 kHz stereo sources totaling 22.003 MiB and 1,358 seconds

| Artist | Album | Track                              | Duration |
| ------ | ----- | ---------------------------------- | -------: |
| tuki.  | 15    | 晩餐歌 - Bansanka                  |    218 s |
| tuki.  | 15    | 星街の駅で - At Hoshimachi Station |    239 s |
| tuki.  | 15    | 地獄恋文 - Inferno Love Letter     |    170 s |
| Yuuri  | Ichi  | Dried Flower                       |    286 s |
| Yuuri  | Ichi  | BETELGEUSE                         |    231 s |
| Yuuri  | Ichi  | Peter Pan                          |    214 s |

## Aggregate results

| Historical recipe (current id) | Model    | Median real-time factor | Median speed | Median wall time | Mean CPU cores | Median peak RSS | Maximum peak RSS |
| ------------------------------ | -------- | ----------------------: | -----------: | ---------------: | -------------: | --------------: | ---------------: |
| `standard` (`quick`)           | KARA2    |                   0.254 |        3.94x |           57.2 s |           7.07 |     2,987.5 MiB |      3,029.3 MiB |
| `clean` (`general`)            | Inst HQ3 |                   0.751 |        1.33x |          173.3 s |           7.40 |     3,833.1 MiB |      3,886.6 MiB |

On this CPU, a five-minute source projects to about 76 seconds with
`quick` and 225 seconds with `general`. Across matched tracks, `general` took
2.9 times as long as `quick` at the median. Both remain faster than real
time, but neither is an in-stream real-time effect: separation stays an
offline preparation step.

## Per-track results

| Track        | Recipe     | Wall time | Speed |    Peak RSS |    Source | Four-channel result | Result/source |
| ------------ | ---------- | --------: | ----: | ----------: | --------: | ------------------: | ------------: |
| 晩餐歌       | `standard` |    54.4 s | 4.00x | 2,983.9 MiB | 3.448 MiB |          73.267 MiB |        21.25x |
| 晩餐歌       | `clean`    |   156.1 s | 1.40x | 3,856.8 MiB | 3.448 MiB |          73.267 MiB |        21.25x |
| 星街の駅で   | `standard` |    59.5 s | 4.02x | 3,029.3 MiB | 3.896 MiB |          80.296 MiB |        20.61x |
| 星街の駅で   | `clean`    |   173.9 s | 1.37x | 3,886.6 MiB | 3.896 MiB |          80.296 MiB |        20.61x |
| 地獄恋文     | `standard` |    45.4 s | 3.75x | 2,601.6 MiB | 2.648 MiB |          57.207 MiB |        21.61x |
| 地獄恋文     | `clean`    |   124.2 s | 1.37x | 3,434.9 MiB | 2.648 MiB |          57.207 MiB |        21.61x |
| Dried Flower | `standard` |    71.5 s | 4.00x | 3,017.1 MiB | 4.904 MiB |          96.348 MiB |        19.65x |
| Dried Flower | `clean`    |   222.1 s | 1.29x | 3,872.2 MiB | 4.904 MiB |          96.348 MiB |        19.65x |
| BETELGEUSE   | `standard` |    63.1 s | 3.66x | 2,991.1 MiB | 3.737 MiB |          77.587 MiB |        20.76x |
| BETELGEUSE   | `clean`    |   178.1 s | 1.30x | 3,707.6 MiB | 3.737 MiB |          77.587 MiB |        20.76x |
| Peter Pan    | `standard` |    55.0 s | 3.89x | 2,821.9 MiB | 3.370 MiB |          72.073 MiB |        21.39x |
| Peter Pan    | `clean`    |   172.8 s | 1.24x | 3,809.3 MiB | 3.370 MiB |          72.073 MiB |        21.39x |

All 12 results passed a mechanical probe: PCM signed 16-bit, 44.1 kHz,
four channels, and duration within one second of the source metadata.

## Capacity interpretation

The installed model files are about 50.3 MiB for KARA2 and 63.7 MiB for Inst
HQ3, or 114.0 MiB together. They reuse the current ONNX and FFmpeg path; an
optional Python/PyTorch pack would be an additional, separately gated cost.

Each recipe produced 456.778 MiB for the corpus; retaining both produced
913.556 MiB, or 41.52 times the compressed source total. The two recipes have
the same result size because storage is determined by the fixed four-channel
PCM contract, not model weight or inference speed.

The contract costs about 100.9 MiB per five minutes, or 1.18 GiB per hour, for
each retained recipe. Keeping both doubles that to about 201.9 MiB per five
minutes or 2.37 GiB per hour. Product policy should therefore keep one selected
result by default and treat additional recipe results as user-visible cache
that can be removed and regenerated.

## Decision and remaining gate

The lightweight CPU baseline is operationally viable. Subsequent listening
feedback changed the product default without changing these measurements:

- keep KARA2 as `quick`, an explicit speed-first best-effort path;
- use Inst HQ3 as the current `general` default because it is usually more
  dependable across recording and arrangement differences;
- benchmark the smaller Inst HQ4 against HQ3 before changing the versioned
  `general` processing profile;
- do not restore the former KARA parameter-only `high-quality` tier;
- do not bundle the optional Python quality pack based on these speed results
  alone.

Thirty-second lossless accompaniment A/B excerpts (60–90 seconds of each
track) were generated locally for the remaining listening gate. Listen for
lead-vocal leakage, backing-vocal retention, transient/high-frequency damage,
reverb tails, and phasing. A BS-RoFormer spike is justified only if that review
finds a recurring semi-formal quality gap that `general` does not cover. See
the [current model review](audio-processing-model-review-2026-08-23.md) for the
HQ4 and RoFormer shortlist.
