# Analysis Structure Windows CPU Spike — 2026-08-24

## Outcome

The main-owned `analysis-structure` producer path and packaged worker execute a
real All-In-One inference on Windows x64 CPU using only app-supplied model paths
and job-owned cache roots. The worker's Python-level network policy was active and
no download was observed, but the harness did not deny network at the OS layer.
This is benchmark evidence, not release eligibility: the fixed model catalog is
`benchmark-only`, and the resolved dependency graph is not a reviewed wheel-only
product lock.

## Fixed benchmark inputs

- CPython: official embeddable x64 `3.12.10`; archive SHA-256
  `4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3`.
- Requested packages: `all-in-one-infer==3.1.0`,
  `demucs-infer==4.2.2`, `torch==2.11.0+cpu`, and
  `torchaudio==2.11.0+cpu`.
- Resolved graph: 62 distributions; the smoke imported NumPy `2.5.2` and SciPy
  `1.18.1` in addition to the fixed packages above.
- Structure checkpoint: `harmonix-fold0-0vra4ys2.pth`, 1,400,571 bytes,
  SHA-256 `0db596dfb0995f41d62f6267d76a9d54c046f1649bd35e1dbeca0c5f9a7b8acd`.
- Separation checkpoint: `955717e8-8726e21a.th`, 84,141,911 bytes,
  SHA-256 `8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4`.
- Demucs config: `htdemucs.yaml`, 21 bytes, SHA-256
  `239c445d0b14454d541ad8bd9bb271c9e536d267e8a4625208744cbb2e7bb66c`.

The checked-in model manifest records source URLs, hashes, sizes, per-artifact
license evidence, and fail-closed distribution status. Main rejects benchmark
models when evaluating activation eligibility.

## Packaged inference evidence

The exact worker and catalog copied into `win-unpacked/resources/audio-processing`
matched their source SHA-256 values. The final worker digest was
`4b88aedaeb9f1016d96b0b84c9326a04284fbf2f2e1d92203b5a3629b8728594`; the
catalog digest was
`d6c0ee528036838695d63ae499528f10dff37c83950afb178cb81116505ea700`.
The target runtime also reported `win32` and a 64-bit pointer width. That
packaged worker analyzed a deterministic 36-second stereo PCM fixture on CPU
and returned:

- duration: 36,000 ms;
- tempo: 120 BPM, confidence approximately `0.46`;
- 72 beats and 18 downbeats;
- bounded section intervals;
- `offlineEnforced: true`; and
- `noUserCache: true`.

The synthetic fixture proves native imports, local model loading, worker
transport, confidence extraction, and the output schema. `offlineEnforced` is a
worker policy assertion, not evidence of an OS firewall. The fixture does not
measure real-song section quality. Its tempo confidence is below the consumer
threshold of `0.5`, so it intentionally does not claim visual activation.

Electron Builder intermittently failed its final unpacked-directory rename with
Windows `EPERM` after creating a complete staging directory. The smoke used a
test-only bounded rename/copy retry outside product code. Packaged resource hashes
were rechecked after that step; installer behavior was not part of this spike.

## Remaining release gates

- Replace or approve every model artifact for product use. The Harmonix weights
  are CC-BY-NC-SA-4.0, and the reviewed HTDemucs checkpoint provenance does not
  provide a standalone product-use grant.
- Produce a reviewed wheel-only environment lock. The resolved graph currently
  includes `antlr4-python3-runtime==4.9.3` from an sdist and therefore cannot be
  published by the immutable environment installer contract.
- Implement artifact preparation/download, repair, removal, rollback, and
  activation publication; the product must not reuse this temporary benchmark
  environment.
- Run fixed real-song utility, cancellation/shutdown, capacity, and manual
  Workbench/OBS acceptance before enabling the capability.
- Repeat the packaged cold smoke with network denied outside Python and verify
  that known user-cache roots are unchanged before accepting offline readiness.
- Resolve `combined-ml` independently only when both Refined and Music Analysis
  are requested.
