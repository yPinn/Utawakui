# ADR 0014: Audio Python Runtime Family

## Status

Accepted on 2026-08-23. The `AudioPythonRuntimeHost` contract foundation is
implemented: family paths, allowlisted environment/model identities, immutable
activation generation validation and atomic pointer publication, generation
leases, capability job manifests, concurrency-one scheduling, bounded process
transport, a host-only packaged probe, and strict artifact/environment/model
manifest validation with separate activation-eligibility checks. Initial
`separation-cpu` resolution found no maintained upstream RoFormer-only or
strict-offline release. A reproducible benchmark-only metadata rebuild avoids the
Windows `diffq-fixed` dependency in its research graph, but remains ineligible for
activation because it cannot enforce offline/new-loader-only execution and the
checkpoint terms remain unresolved. A separate stdlib Refined policy worker and
fake-wrapper probe now prove fixed main-owned intent, pre-import SHA-256 checks,
network/legacy/forbidden-import rejection, bounded errors, cancellation, and
job-owned caches without installing ML. The Music Analysis producer now uses the
same host and scheduler: fixed decode, capability lease, bounded All-In-One
worker, model integrity checks, cancellation, cleanup, and validated atomic
sidecar publication are implemented. A benchmark environment resolved and a real
unpacked Windows x64 CPU/local-model inference passed under the worker policy;
OS-level network denial remains a release gate. The internal Music Analysis
workbench now owns a fixed Beat This! `small0` preparation lifecycle: exact
runtime, wheel, and checkpoint downloads; size/SHA-256 verification; immutable
publication; version/import probe; progress; repair; removal; and atomic
activation. A real install from an empty app-owned root and inference through the
installed environment passed on Windows x64 CPU. Its Harmonix and HTDemucs
weights remain benchmark-only, so no Refined product activation is published.

## Context

The optional `refined` separation recipe and the planned Lyrics music-structure
analysis both need a Python, PyTorch, native-wheel, model, subprocess, progress,
cancellation, and repair lifecycle. They do not have the same worker, model,
result, feature readiness, or product purpose:

- Refined produces a persistent accompaniment/guide-vocal playback artifact.
- Music analysis produces source-fingerprinted BPM, beat, downbeat, and section
  metadata for Lyrics presentation and authoring.

Installing both capabilities into one environment that is later modified by
`pip install` or `pip uninstall` would make either feature capable of breaking
the other. Fully duplicating Python, Torch, NumPy, SciPy, and librosa for every
capability would instead raise download, installed-size, repair, and update
costs without creating a useful product boundary.

ADR 0009's provisional `community-python/<version>` Stage A path was generalized
before any Python runtime, package, or model was installed. There is no user-data
migration or compatibility promise tied to that removed path.

## Decision

### Share a runtime family, not a mutable environment

Main owns one `AudioPythonRuntimeHost` family with these responsibilities:

```text
AudioPythonRuntimeHost
|-- RuntimeArtifactStore
|-- ImmutableEnvironmentStore
|-- ModelStore
|-- ActivationManager
|-- ProcessTransport
`-- HeavyJobScheduler
    |-- RefinedWorker
    `-- StructureAnalysisWorker
```

The family may share:

- one exact CPython artifact while it remains referenced;
- a compatibility constraints catalog for Torch, torchaudio, NumPy, SciPy,
  librosa, soundfile, and other shared native dependencies;
- an app-owned FFmpeg decode service and versioned decoded-audio profiles;
- bounded subprocess JSON-lines framing, normalized progress/error/cancel, and
  app-quit cleanup;
- heavy-job scheduling, installation, checksum, repair, rollback, and garbage
  collection infrastructure.

The following remain capability-specific:

- worker code and protocol operations;
- complete environment lock;
- model manifest and model directory;
- feature gate, readiness, preparation, and removal transition;
- result sidecar, persistent media, and retention policy.

The renderer supplies only allowlisted product intent. It never supplies an
executable, environment, worker, model path, cache path, command, or Python
argument.

### Use content-addressed immutable artifacts and environments

The target family layout under app-managed user data is:

```text
dependencies/audio-python/
  runtimes/
    cpython-3.13.x/<artifactHash>/
  environments/
    separation-cpu/<lockHash>/
    analysis-structure/<lockHash>/
    combined-ml/<lockHash>/
  activations/
    generations/<generationId>.json
    current.json
  models/
    separation/<modelId>/<version>/
    analysis/<modelId>/<version>/
  jobs/
    <capability>/<jobId>/
```

`3.13.x` is a candidate family baseline, not a claim that every selected
Windows dependency is already validated. The exact runtime version and artifact
hash are recorded in every environment manifest and activation generation. If
the packaged Windows matrix fails, the runtime baseline may move to 3.12 without
changing product recipes, worker operations, model ids, or result schemas.

End-user preparation downloads a complete pre-resolved environment artifact. It
does not run an unconstrained resolver or modify an active environment with
`pip`. Every archive and installed manifest has fixed sources, package versions,
wheel hashes, licenses, expected size, maximum size, and runtime compatibility.

The Windows launcher or app-owned bootstrap explicitly binds one environment's
site-packages and native DLL roots. It does not rely on the user's `PYTHONPATH`,
user site, working directory, or global package state. The selected CPython
artifact's isolated-path configuration and the final `sys.path` are part of the
probe because Windows embeddable Python uses an `_pth`-controlled import model
and is not a normal mutable pip installation.

### Maintain one constraints catalog and three complete locks

`separation-cpu`, `analysis-structure`, and `combined-ml` each have an
independent complete immutable lock. They are generated from one reviewed
compatibility catalog but are not described as one shared lock.

`combined-ml` is a separately resolved union that can satisfy both capabilities.
It is never produced by installing one capability into another environment or
by concatenating two lock files. In particular:

- Torch and torchaudio use an exact compatible pair and pinned CPU artifact
  source;
- development or rolling dependencies such as `onnx-weekly` are pinned to an
  exact build and hash;
- all loose transitive dependencies are resolved and recorded before release;
- native DLL and `.pyd` imports are part of the packaged smoke, not inferred
  from resolver success.

### Activate one generation atomically

An activation generation maps each enabled capability to an exact runtime
artifact, environment lock, worker protocol, and compatible model manifest.
Preparation follows:

```text
derive desired capabilities
-> download immutable artifacts into staging
-> checksum and manifest validation
-> capability probes and real packaged smoke
-> publish immutable versions
-> atomically replace current.json
-> garbage-collect unreferenced versions after all leases end
```

One atomic generation pointer prevents a crash from exposing a mixed set of
independently updated capability pointers. A job pins its generation and
environment when it starts. Active-pointer replacement never changes a running
worker, and Windows-locked DLLs are not removed until all worker and job leases
for the old generation reach zero.

If two capabilities currently use `combined-ml`, removing one capability first
prepares and verifies the standalone environment required by the remaining
capability, atomically remaps it, disables the removed capability, and only then
collects the combined environment. Independent feature lifecycle therefore does
not imply that shared physical files can always be deleted immediately.

### Keep scheduling and job storage main-owned

`HeavyJobScheduler` is a service next to the runtime host rather than state owned
by either worker or whichever view started a job. CPU-heavy ML concurrency
defaults to one until measured resource classes justify a different policy. The
scheduler owns queueing, cancellation, app shutdown, process leases, and stale
job recovery.

Every job id is main-derived. Its capability-scoped directory records the
activation generation and environment hash and contains only that job's decoded
input, intermediate stems, and temporary output. Success, failure,
cancellation, and crash recovery may clean only verified app-owned job paths.

### Share decode infrastructure through versioned profiles

The app owns FFmpeg decode, but consumers do not assume one universal WAV.
Versioned profiles define sample rate, channels, and sample format, for example
a music-stereo analysis profile and a mono alignment profile. A source
fingerprint plus profile id may identify reusable decoded input. Cache reuse is
an optimization and must not merge the Refined media-result lifecycle with the
Music Analysis sidecar lifecycle.

### Keep models app-managed and offline-capable

Workers receive a verified model id and app-derived local path. Package defaults
must not download into user-home Torch, Hugging Face, or audio-separator caches.
Preparation sets explicit app-owned roots and publishes models only after
checksum validation. A cold worker smoke runs with network access unavailable to
prove that runtime inference cannot trigger a hidden download.

Each model manifest records code license and weight license separately. This is
required for the initial All-In-One analysis candidate: the package code is MIT,
while the current upstream Harmonix checkpoint manifest declares
CC-BY-NC-SA-4.0. Analysis therefore remains gated and on-demand until model
distribution, attribution, non-commercial restrictions, and product-use terms
are accepted.

### Keep the Refined policy worker separate and non-activating

The base package carries a Refined-specific stdlib worker beside the generic
host probe. `refinedPythonWorkerProbe.js` resolves the fixed
`refined`/`bs-roformer-viperx-1297` intent from `AudioPythonRuntimeHost` paths,
validates the benchmark model manifest, expected hashes, local presence, and model
file sizes, creates only a capability-scoped probe workspace, and never publishes
an activation generation. Main deliberately does not synchronously load and hash
the approximately 639 MB checkpoint. The worker hashes the pinned catalog, config,
and checkpoint in bounded chunks before the first `audio_separator` import. It
then installs network and forbidden-import guards,
rejects unowned child processes, replaces the v0.44.5 legacy RoFormer method with
a fail-closed sentinel, redirects common package caches into the job, and strips
user-site import paths.

A stdlib fake wrapper exercises success, missing/corrupt artifacts, network,
legacy fallback, Demucs/DiffQ/Julius/ONNX-conversion/TorchVision imports,
`SystemExit`, bounded failure, and process termination. The fixture stays outside
Electron Builder's allowlist. This proves the app-owned policy and transport
contract only: it does not prove that the real package imports, that native Torch
obeys the Python-level network guard, or that real inference is correct. Those
claims still require a complete lock plus a packaged cold smoke with network
access unavailable at the OS/test-environment boundary.

### Preserve the Refined product and model route

This ADR changes Refined infrastructure, not ADR 0009's product route:

1. one benchmark-selected RoFormer is the `refined` baseline;
2. the recording-enhanced RoFormer combination remains a challenger;
3. a dual-RoFormer ensemble remains quality-ceiling research only;
4. BVE remains an independent deferred option; and
5. All-In-One's four-stem Demucs remains a structure-analysis implementation
   detail and never becomes the default Refined separator.

Existing Refined vocals may later be reused by an explicitly requested lyrics
alignment job. If only Structure Analysis has produced temporary Demucs vocals,
an alignment operation may consume them within the same authorized job graph.
Lyrics must never trigger Refined separation implicitly, and intermediate stems
are deleted after their owning job unless the user explicitly requested a
persistent Refined result.

### Treat combined capacity as measured evidence

An estimated analysis delta such as approximately 145 MiB may be reported only
after the exact Windows lock, models, physical deduplication behavior, and both
real inference smokes are measured. Reports distinguish download bytes,
installed unique bytes, model bytes, work/cache bytes, and peak update
coexistence. Identical locks do not make files in separate environments share
disk space unless hardlink or content-store behavior is implemented and
verified.

## Packaged acceptance gates

Each released environment combination must prove:

- exact CPython cold start, `pip check` equivalent manifest validation, and
  imports for all locked native packages;
- Torch/torchaudio/NumPy native DLL loading on supported Windows x64 systems;
- a real short RoFormer inference for `separation-cpu` and `combined-ml`;
- real BPM, beat, downbeat, and section inference for `analysis-structure` and
  `combined-ml`;
- bounded progress, cancellation, app shutdown, and no residual process;
- model reads only from app-managed paths and no user-home cache writes;
- offline execution, repair, removal transition, and version rollback; and
- download, installed, RAM, job-temporary, and update-coexistence peaks.

Passing dependency resolution without these packaged smokes is not readiness.
Readiness is computed separately per capability even when both map to one
combined environment.

The first `separation-cpu` resolution also proved that resolver success is not
release eligibility. `audio-separator==0.44.5` resolves Windows wheels but pulls
CC BY-NC `diffq-fixed`; the selected Viperx-1297 checkpoint has no established
weight redistribution/product-use grant; and cross-target pip resolution omitted
CPython 3.13's `audioop-lts` marker. These inputs remain research evidence and
must not be published or activated. See the
[Refined lock spike](../audio-python-separation-cpu-spike-2026-08-23.md).

The follow-up upstream survey found no accepted RoFormer-only dependency extra,
strict-offline flag, or no-fallback release. The exact 0.44.5 wheel can be rebuilt
reproducibly with only reviewed dependency metadata and RECORD changes; the
generated sidecar is permanently `benchmark-only` and has
`activationEligible: false`. This artifact may be an input to a future resolved
`separation-cpu` research lock, but never bypasses this ADR's complete-lock,
capability-worker, license, offline, and atomic-activation gates.

## Rejected options

- Reuse the yt-dlp Python runtime: provider acquisition and ML have unrelated
  dependencies, capacity, failure, update, and removal lifecycles.
- Keep one mutable ML environment: installing or removing one feature can break
  another and cannot provide reliable rollback.
- Merge two lock files to create `combined-ml`: a textual union does not resolve
  native or transitive compatibility.
- Let workers download models on first inference: it bypasses capacity,
  licensing, checksum, offline, and cancellation contracts.
- Use All-In-One Demucs as the Refined default because Torch already exists: its
  four-stem structure-analysis purpose and resource cost do not match Refined's
  two-output product result.
- Claim a fixed incremental size before measuring physical installation and
  update coexistence.

## Consequences

Refined and Music Analysis can reuse expensive infrastructure without sharing
product state or allowing package mutation to couple their reliability. The
cost is an activation manager, three release locks, capability-aware removal,
leases, packaged dual-feature smokes, and explicit model-license review.

Music Analysis now exercises the preparation side of this contract. Main owns a
fixed `analysis-structure` catalog, downloads each exact artifact into staging,
verifies size and SHA-256, probes the exact Python/package versions and native
imports, publishes immutable directories, then atomically switches activation.
Repair repeats that verified preparation; removal first publishes a generation
without the capability and only collects artifacts not protected by a lease or
another capability. The renderer can request only prepare, repair, or remove and
cannot supply URLs, paths, versions, hashes, model ids, or worker arguments.

This does not make every runtime-family gate complete. Refined remains
benchmark-only, shared-environment migration and broader garbage collection are
future work, and Music Analysis remains an internal feature until labeled
accuracy, OS-level offline, release license notice, disk-capacity, and recovery
acceptance are closed.

## References

- [ADR 0009: Tiered audio-processing recipes](0009-tiered-audio-processing-runtime.md)
- [ADR 0010: Lyrics timing granularity](0010-lyrics-timing-granularity-and-output-content-split.md)
- [Music analysis contract](../music-analysis-contract.md)
- [python-audio-separator project metadata](https://raw.githubusercontent.com/nomadkaraoke/python-audio-separator/main/pyproject.toml)
- [All-In-One Infer project metadata](https://raw.githubusercontent.com/openmirlab/all-in-one-infer/main/pyproject.toml)
- [All-In-One checkpoint manifest](https://raw.githubusercontent.com/openmirlab/all-in-one-infer/main/src/allin1_infer/config/checkpoints.toml)
- [Python embeddable package](https://docs.python.org/3/using/windows.html#the-embeddable-package)
- [Refined separation-cpu lock spike](../audio-python-separation-cpu-spike-2026-08-23.md)
