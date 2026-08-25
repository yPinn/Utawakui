# Audio Python Separation CPU Lock Spike — 2026-08-23

## Scope and safety boundary

This spike evaluates the first ADR 0009 Refined dependency set behind ADR 0014's
`AudioPythonRuntimeHost`. It does not enable the `refined` recipe, publish an
activation generation, install an app runtime, or download a model checkpoint.
Resolver reports and the reviewed 0.44.5 wheel were written only to ignored
benchmark storage.

The candidate remains BS-RoFormer Viperx-1297:

- checkpoint: `model_bs_roformer_ep_317_sdr_12.9755.ckpt`;
- config: `model_bs_roformer_ep_317_sdr_12.9755.yaml`; and
- wrapper candidate: `audio-separator==0.44.5`.

## Resolver evidence

Target-platform dry runs used the official PyPI index plus PyTorch's official CPU
wheel index. Both Windows x64 targets resolved wheel-only graphs with the same
58 reported packages when starting from:

- `audio-separator[cpu]==0.44.5`;
- `torch==2.11.0+cpu`; and
- `torchvision==0.26.0+cpu`.

The Torch/TorchVision pair follows the official 2.11 compatibility matrix.
`torchvision` is not a Refined feature choice; `onnx2torch-py313` declares it as
a dependency. `torchaudio` is not in the resolved separation-only graph and must
not be added merely because another capability may need it.

The 58-package CPython 3.13 report is not complete: pip's cross-target resolver
selected CPython 3.13 wheels but evaluated the `python_version >= "3.13"` marker
against the resolver host. A real CPython 3.13 lock must therefore also resolve
and pin `audioop-lts` (currently 0.2.2) using the target interpreter. This is why
the raw report is evidence, not a release lock.

CPython 3.12 has stronger upstream Windows CPU integration evidence today.
CPython 3.13 has compatible wheels and remains ADR 0014's family candidate, but
neither version is selected until the product-use blockers below are cleared and
the real packaged matrix passes.

## Blocking findings

### Windows dependency license

`audio-separator` is MIT, but its Windows metadata directly requires
`diffq-fixed>=0.2`. Version 0.2.4 is CC BY-NC 4.0. A technically resolved graph
therefore cannot be treated as an activatable commercial-product environment.

Inspection of the exact 0.44.5 wheel found `diffq` imports only under its bundled
Demucs implementation. The selected RoFormer path does not import those files.
That observation does not authorize silently installing `audio-separator`
`--no-deps`; doing so would contradict upstream metadata and make Utawakui own an
undocumented dependency fork.

An acceptable path requires one of:

1. an upstream RoFormer-only dependency extra or equivalent release that removes
   the unused DiffQ dependency from this environment;
2. a separately reviewed, reproducible metadata patch with its own source hash,
   notices, import proof, and maintenance policy; or
3. a different maintained wrapper that clears the same quality, offline,
   packaging, and LTS gates.

### Checkpoint license and digest

The wrapper code and ZFTurbo training repository are MIT, but no authoritative
commercial-use and redistribution grant was found for the Viperx-1297 checkpoint
itself. The official release asset reports 639,331,213 bytes and no publisher
SHA-256. Utawakui must not infer the weight license from either code repository.

Until the weight terms are established, the candidate is `benchmark-only`. A
future approved staging download may compute and pin SHA-256 from the official
asset, but a locally computed digest proves identity, not permission.

The worker-spike recheck found no new authoritative grant: the official hosting
repository still exposes no LICENSE file, and the checkpoint release page provides
the asset without product-use or redistribution terms. Public availability remains
identity/location evidence only, so the block is unchanged.

### Offline and deterministic loading

The wrapper supports `AUDIO_SEPARATOR_MODEL_DIR`, but missing files cause network
downloads. Its catalog comes from a mutable `main` URL, and the 0.44.5 RoFormer
loader falls back to a legacy implementation after selected new-loader failures.
The product worker must instead:

- require an app-owned, hash-verified checkpoint, config, and pinned catalog;
- fail readiness when any file is missing instead of downloading;
- reject legacy-loader fallback so one model manifest means one implementation;
- run the packaged cold smoke with network access unavailable; and
- verify the checkpoint hash before loading it.

## Manifest contract added by this spike

`audioPythonManifest.js` now validates:

- exact Windows x64 runtime artifacts;
- wheel-only complete environment locks with exact versions, URLs, sizes,
  SHA-256 values, direct requirements, and a closed resolved dependency graph;
- separate package license evidence and product-use decisions;
- exact two-file separation model manifests with independent checkpoint/config
  licenses and explicit benchmark-only, upstream-product-download, or
  redistribution decisions; and
- canonical manifest hashes.

Validation and activation eligibility are separate. A license-blocked lock or a
benchmark-only model remains representable for research, but the activation
assertions reject it.

## Dependency-route follow-up

### Upstream survey

The maintained upstream does not currently publish a RoFormer-only dependency
extra or a strict-offline mode. Version 0.44.5 remains the latest release; the
current branches and open pull requests contain no accepted dependency split,
no-download contract, or removal of the legacy RoFormer fallback. Open pull
request 298 contains relevant RoFormer correctness and performance work, but an
unmerged branch is not an immutable LTS dependency.

The stock wheel is therefore still excluded from a product lock. Setting a model
directory does not change that decision: missing catalog, config, or checkpoint
files can still trigger HTTP, and selected new-loader failures can still enter the
legacy implementation.

### Reproducible metadata-patch artifact

The first fallback route now has a benchmark-only builder at
`scripts/audio-separator-roformer-wheel-patch.mjs`. It consumes only the exact
reviewed PyPI wheel and fails closed on filename, byte length, SHA-256, package
identity, version, dependency-line, archive-path, or RECORD drift.

| Evidence               | Exact value                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| Upstream wheel         | `audio_separator-0.44.5-py3-none-any.whl`                          |
| Upstream bytes         | 415,089                                                            |
| Upstream SHA-256       | `9db7d8ded987a74aec9d96be949b49c9068def69823abb59cabb6e6f88679ae7` |
| Research wheel         | `audio_separator-0.44.5-1utawakui-py3-none-any.whl`                |
| Research bytes         | 412,241                                                            |
| Research SHA-256       | `99ba237eb0002237368f0d2a9c0c58ba86d1cbe584fa5c649c4cab54bec436c3` |
| Source files changed   | None                                                               |
| Metadata files changed | `METADATA`, `RECORD`                                               |
| Activation eligibility | False                                                              |

Two fresh output directories produced byte-identical research wheels. Automated
tests also verify every non-metadata entry remains byte-identical and every
RECORD digest and size is valid. The builder declares `adm-zip` only as a
development tool. That exact package/version was already present in the existing
production dependency closure, so this change adds no new package or
optional-capability runtime dependency.
An offline `pip --no-index --no-deps` structure smoke accepted the rebuilt wheel
and reported package version 0.44.5; installed metadata retained only the three
explicit `onnxruntime` provider extras among the reviewed ONNX/DiffQ group.

The exact removed requirement lines are:

- `diffq (>=0.2) ; sys_platform != "win32"`;
- `diffq-fixed (>=0.2) ; sys_platform == "win32"`;
- `julius (>=0.2)`;
- `onnx-weekly`; and
- `onnx2torch-py313 (>=1.6)`.

`onnxruntime` remains because `separator.py` imports it at module load. Requests,
Torch, audio I/O, resampling, and RoFormer dependencies also remain. Removing the
five reviewed lines proves only a smaller resolver surface; it does not yet prove
the installed-byte saving because no replacement environment lock was resolved or
downloaded in this pass.

The generated patch sidecar is deliberately not an ADR 0014 environment lock. It
records `status: benchmark-only`, `activationEligible: false`, the upstream and
rebuilt hashes, the exact metadata delta, and the still-required runtime policy.
Static inspection of the rebuilt source found DiffQ imports only in three bundled
Demucs modules, Julius imports only in two bundled Demucs modules, and
`onnx2torch` only in the MDX adapter. Runtime module-load proof remains a separate
gate below.

### Separate strict-worker gate

Metadata cannot enforce runtime behavior. A later app-owned Refined worker must
pass all of the following before this route can become a release-lock candidate:

1. deny network access and make a missing catalog, config, or checkpoint a
   structured readiness failure;
2. verify the exact app-owned files before importing the wrapper;
3. prove the selected load result uses only the new RoFormer implementation and
   reject any legacy-loader invocation;
4. record loaded modules and reject Demucs, DiffQ, Julius, ONNX conversion, and
   TorchVision imports;
5. exercise short, normal-length, and partial-final-chunk fixtures without NaN,
   length drift, hidden cache writes, or unstructured process exit; and
6. pass cancellation, corrupt-file, offline cold-start, and packaged Windows CPU
   smoke behind `AudioPythonRuntimeHost`.

These are runtime/inference probes, not wheel-builder claims. They remain blocked
from full execution while the checkpoint product-use terms are unresolved and no
runtime/model download is authorized.

The stdlib policy/fake-probe portion is now implemented without downloading those
artifacts. Main derives only the fixed `refined`/Viperx intent and host-owned
runtime, environment, model, and job paths, validates the manifest/expected hashes,
and checks local presence and model-file sizes without loading the large checkpoint
into Electron main. The Refined worker hashes all three files in bounded chunks
before `audio_separator` import. It rejects network operations and unowned child
processes, patches the exact v0.44.5
legacy method to fail closed, blocks the reviewed-out module families, redirects
common caches into the job, removes user-site paths, and normalizes `SystemExit`
and wrapper failures. The
unpackaged fake wrapper covers those paths plus process termination and proves that
missing or corrupt artifacts fail before its import marker is written.

This completes the contract spike, not the real package probe. No test in this
batch imports `audio-separator`, Torch, or Viperx assets. Native imports, real
new-loader statistics, short/normal/partial-chunk inference, output invariants,
OS-boundary offline behavior, and packaged Windows CPU execution remain gates for
the later complete research lock.

### Third-route status: ZFTurbo/MSST

The current ZFTurbo repository now declares a `bs_roformer` optional group, which
makes a pinned native subset more credible than the older monolithic requirements
file suggested. The stock package is still training-oriented: its base metadata
includes plotting, tabular, request, audio, and GUI dependencies, and the stock
inference entry loads checkpoints with `weights_only=False`.

If the metadata-patch plus strict-worker route fails maintenance, license, or
packaged-smoke gates, the next candidate is therefore not the stock MSST install or
CLI. It is a commit-pinned, audited inference subset containing the selected
BS-RoFormer implementation, minimal config/chunking code, an app-owned
`weights_only=True` loader, and Utawakui's existing process/progress/cancel
contract. Code MIT terms still do not establish the checkpoint license.

| Dependency route                  | Immediate result                           | LTS assessment                                        | Current decision                   |
| --------------------------------- | ------------------------------------------ | ----------------------------------------------------- | ---------------------------------- |
| Stock `audio-separator` 0.44.5    | Broad API, but Windows DiffQ NC dependency | Blocked                                               | Exclude                            |
| Metadata patch plus strict worker | Smallest integration delta                 | Auditable spike; wrapper/fallback maintenance remains | Continue gates                     |
| Source-level RoFormer-only fork   | Can remove download/fallback at source     | Higher permanent fork cost                            | Consider only after spike evidence |
| Pinned ZFTurbo inference subset   | Cleanest potential Torch-native surface    | Requires a maintained app-owned subset/API            | Third route                        |

## Decision

Do not publish a `separation-cpu` release lock or download the 639 MB checkpoint
from the current graph. Keep `refined` non-runnable and retain the existing ONNX
`quick`/`general` product path.

The upstream search and reproducible metadata-patch artifact are complete, but
the dependency route is not accepted for activation. The next Refined work is:

1. establish checkpoint product-use terms;
2. resolve the selected CPython target with its own interpreter against the
   research wheel, retaining a complete generated report;
3. download every approved wheel into a fresh staging directory, measure bytes,
   review licenses, and emit the complete immutable lock; then
4. construct the app-owned environment and run the strict worker against the real
   package under an OS-offline packaged smoke before any activation-generation
   work.

If the strict wrapper becomes a long-term monkeypatch burden, evaluate the pinned
ZFTurbo subset before adopting a source fork. None of these steps changes the
single Viperx-1297 model baseline or promotes Demucs/All-In-One to Refined.

## Sources

- [audio-separator 0.44.5 metadata](https://pypi.org/pypi/audio-separator/0.44.5/json)
- [audio-separator dependency declaration](https://github.com/nomadkaraoke/python-audio-separator/blob/v0.44.5/pyproject.toml)
- [diffq-fixed package and license](https://pypi.org/project/diffq-fixed/)
- [onnx2torch-py313 package](https://pypi.org/project/onnx2torch-py313/)
- [PyTorch previous-version matrix](https://pytorch.org/get-started/previous-versions/)
- [PyTorch CPU wheel index](https://download.pytorch.org/whl/cpu/torch/)
- [audioop-lts package](https://pypi.org/project/audioop-lts/)
- [audio-separator model catalog and CPU behavior](https://github.com/nomadkaraoke/python-audio-separator)
- [audio-separator releases](https://github.com/nomadkaraoke/python-audio-separator/releases)
- [audio-separator open pull requests](https://github.com/nomadkaraoke/python-audio-separator/pulls)
- [RoFormer loader in v0.44.5](https://github.com/nomadkaraoke/python-audio-separator/blob/v0.44.5/audio_separator/separator/roformer/roformer_loader.py)
- [ZFTurbo package metadata and model extras](https://github.com/ZFTurbo/Music-Source-Separation-Training/blob/main/pyproject.toml)
- [ZFTurbo stock inference entry](https://github.com/ZFTurbo/Music-Source-Separation-Training/blob/main/inference.py)
- [Viperx-1297 training config](https://github.com/ZFTurbo/Music-Source-Separation-Training/blob/main/configs/viperx/model_bs_roformer_ep_317_sdr_12.9755.yaml)
- [official checkpoint asset](https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/model_bs_roformer_ep_317_sdr_12.9755.ckpt)
