# ADR 0017: DirectML execution provider for `quick`/`general` MDX separation

## Status

Accepted (2026-09-15). Code, unit-test coverage, packaged Windows x64
execution, CPU／GPU output comparison, and automatic CPU fallback have been
verified. Amended same-day: the renderer GPU toggle originally rejected below
(see "Rejected for this phase") was reconsidered and implemented — see that
section for the reasoning.

## Context

`onnxruntime-node`'s Windows x64 build already bundles Microsoft's
`DirectML.dll` (`electron-builder.yml`'s `asarUnpack` for
`node_modules/onnxruntime-node/bin/**/*`), but nothing in the codebase ever
requested the DirectML execution provider — `ort.InferenceSession.create(modelPath)`
in `electron/lib/vocalSeparation.js` took no `SessionOptions`, so `quick` and
`general` separation ran CPU-only despite the GPU acceleration binary already
shipping in every build.

`docs/spec.md` §7 recorded this as an open decision after a round of
competitor research (`docs/research/competitive-research.md`) found that both
actively-developed competitors now ship GPU-accelerated vocal separation —
one competitor specifically runs the same UVR MDX-Net model family Utawakui
already uses through `sherpa-onnx` + DirectML, with no CUDA/PyTorch
dependency. This ADR records the decision to enable DirectML for Utawakui's
existing MDX models, and the verification performed before shipping it.

### Licensing (checked as part of this decision, not deferred)

`onnxruntime-node`'s own npm package is MIT (`package-lock.json`), correctly
recorded in `THIRD_PARTY_NOTICES.md` and
`docs/governance/legal-compliance.md`. The bundled `DirectML.dll` binary,
however, is distributed separately via the `Microsoft.AI.DirectML`/
`Microsoft.ML.OnnxRuntime.DirectML` NuGet packages under **"Microsoft
Software License Terms — Microsoft DirectX Machine Learning (DirectML)"** — a
Microsoft redistributable EULA (installation rights, data collection, export
restrictions, dispute resolution), not the MIT license that covers
`microsoft/DirectML`'s own source repo or the ONNX Runtime core. This gap
pre-dated this change (the DLL was already bundled, just unused) and is not
caught by `scripts/license-inventory.mjs`, which only reads npm's own
`license` field and has no visibility into a sub-bundled binary's own terms.
Both `THIRD_PARTY_NOTICES.md` and `docs/governance/legal-compliance.md` §8.2
have been corrected to document the DirectML binary separately from the
ONNX Runtime core's MIT license. The EULA's full text has not been reviewed
clause-by-clause; this document does not constitute legal advice, consistent
with both files' existing disclaimers. Microsoft redistributable EULAs of
this shape (comparable to the VC++ Redistributable or DirectX Runtime) are
designed for exactly this kind of app-bundling use and are not
copyleft/viral, so this is not expected to block shipping — but it is a
documentation gap worth having fixed regardless of this feature.

### Technical maturity (checked because DirectML is not a default-obvious choice)

- DirectML itself is in Microsoft's own words **"sustained engineering"** —
  new feature development has moved to WinML, which has no visible
  Node.js/`onnxruntime-node` binding today. DirectML continuing to work is
  not in question; it is simply not where Microsoft's active investment is.
  The competitor evidence above shows it is still what real shipping
  products use today for this exact model family.
- `onnxruntime-node` has multiple open upstream reports of instability
  specifically in Electron + `worker_threads`, which is exactly Utawakui's
  execution shape (`electron/lib/vocalSeparationWorker.js` runs inside a
  `worker_threads.Worker` spawned by
  `electron/lib/audioProcessing/engines/onnxMdxJob.js`):
  - [microsoft/onnxruntime#20084](https://github.com/microsoft/onnxruntime/issues/20084) —
    random crashes creating multiple worker threads that `require('onnxruntime-node')`.
  - [microsoft/onnxruntime#13086](https://github.com/microsoft/onnxruntime/issues/13086) —
    crash/leak when a worker is terminated mid-session.
  - [microsoft/onnxruntime#17678](https://github.com/microsoft/onnxruntime/issues/17678) —
    DirectML reports "no available backend found" specifically inside
    Electron, despite working in plain Node.js.
- Separately, the DirectML execution provider's own documentation lists
  known operator gaps (GridSample-20, DeformConv, opset > 20 causes "poor
  performance"), and an unrelated project reported DirectML rejecting a
  ConvTranspose-using model — directly relevant since UVR MDX-Net is a
  Conv/ConvTranspose-based architecture.

## Decision

Enable DirectML for `quick` and `general` separation with an automatic CPU
fallback, entirely inside the existing engine boundary — no new recipe, no
scheduling changes. (Amended same-day: a boolean on/off toggle was added
after all — see the note after the "Rejected for this phase" bullet below.)

- `electron/lib/vocalSeparation.js` gained `createInferenceSession(modelPath,
{ preferGpu, onFallback, createSession })`: tries
  `ort.InferenceSession.create(modelPath, { executionProviders: ['dml'] })`
  first; if that throws, logs via `console.warn` (matching this file's
  existing `console.error` convention in `decodeAudio()`) and falls back to
  the prior no-execution-provider (CPU default) creation. `createSession` is
  an injectable seam so `vocalSeparation.test.js` can exercise the fallback
  branch without mocking the `onnxruntime-node` module itself, consistent
  with this codebase's established injectable-override testing convention
  (`separationHandlers.js`).
- `separateTrack()` threads `preferGpu`/`createSession`/`onGpuFallback`
  through as an options object that production callers
  (`vocalSeparationWorker.js`) never pass, so real runs always attempt
  DirectML first.
- A Settings checkbox now exposes this as a boolean product-level intent
  (`separationGpuAcceleration` config key, default `true`) — see the amended
  "Rejected for this phase" note below for why this doesn't conflict with
  `docs/adr/0009-tiered-audio-processing-runtime.md`'s "execution-provider
  names never cross IPC" principle. Only the boolean crosses IPC; main still
  owns everything about what DirectML/CPU selection actually does.
- `heavyJobScheduler.js`'s concurrency=1 and `demixSong()`'s sequential
  per-chunk processing were left unchanged. Whether GPU throughput changes
  the case for revisiting either is deferred until real wall-clock data
  exists from broader use, not decided speculatively here.

### Verification performed

1. **Plain Node.js CLI spike** (not Electron): `ort.InferenceSession.create()`
   with `executionProviders: ['dml']` against both shipped models
   (`UVR_MDXNET_KARA_2.onnx`, `UVR-MDX-NET-Inst_HQ_4.onnx`) succeeded, and a
   full `session.run()` with correctly-shaped zero input completed for both,
   producing the expected output tensor dimensions. No GridSample/DeformConv/
   ConvTranspose rejection occurred for either model on this machine's GPU.
   Single-run timings were inconsistent between the two models (consistent
   with DirectML's known first-run shader-compilation warmup cost) and are
   not a performance claim — a real throughput comparison needs a multi-chunk
   run over a real track, not done here.
2. **Real Electron `worker_threads` execution** (`ELECTRON_RUN_AS_NODE=1`
   running `electron.exe` as the Node host, spawning the actual
   `vocalSeparationWorker.js` via `worker_threads.Worker` with real
   workerData — the same code path production uses, without needing a GUI
   driver): four sequential worker runs against a real audio file (`quick`
   recipe/`kara2` model), including one run terminated mid-flight via
   `worker.terminate()` to simulate `separation:cancel`, followed by one more
   full run to confirm the process stayed healthy afterward. Result: all
   three completed runs finished with `done` and a valid `.wav`
   output + manifest; the terminated run exited cleanly (exit code 0, no
   error event); no crash, hang, or `console.warn` fallback line appeared at
   any point — i.e. none of the three upstream-reported failure modes
   (#20084, #13086, #17678) reproduced on this machine, and DirectML
   appears to have been used successfully (silently) rather than falling
   back to CPU.
3. **Unit tests**: `createInferenceSession()`'s three branches (DirectML
   success, DirectML failure → CPU fallback with `onFallback` invoked once,
   `preferGpu: false` skips straight to CPU) are covered in
   `vocalSeparation.test.js` without needing a real model file, per this
   file's existing "pure/deterministic pieces only" testing philosophy.
   Full suite (`npm test`): 448 files / 4863 tests passed. `npm run lint`,
   `npm run lint:md`, `npm run format:check`, `npm run license:inventory`
   all clean.

### Packaged-build acceptance

`docs/adr/0002-packaged-exe-kept-as-electron-exe.md` documents a packaging-level
Chromium GPU-process crash correlated with `onnxruntime-node`／DirectML being
bundled when the packaged executable was renamed away from `electron.exe`.
The current build continues to use `executableName: electron`. Acceptance was
therefore performed against a fresh v0.3.0 Windows x64 `dist:dir` package, not
against Vite development mode or an older artifact.

1. The package retained `electron.exe` and included only the win32／x64 ONNX
   native binding. `DirectML.dll`, `dxcompiler.dll`, `dxil.dll`,
   `onnxruntime.dll`, and `onnxruntime_binding.node` were present together in
   the unpacked runtime.
2. Cold start, Settings access, a real renderer-to-main `separation:run`, and
   normal shutdown completed without a GPU-process FATAL, network-service
   restart loop, or orphaned process. The packaged Settings preference was
   readable and enabled by default.
3. The same 67.94-second local track completed through both CPU and GPU paths
   for `quick` and `general`. GPU runs were approximately 2.19x and 3.45x
   faster on the acceptance machine. All four outputs had the same duration,
   channel count, sample rate, and bit depth; CPU／GPU samples differed by at
   most one signed 16-bit least-significant bit, with SNR above 100 dB.
4. A forced DirectML session-creation failure attempted DirectML once, invoked
   the fallback once, and successfully created the CPU session.

These results accept the implementation and packaging boundary on the tested
Windows x64 configuration. They are not a claim that every GPU, driver, or
Windows configuration has been exhaustively certified; incompatible or failed
DirectML initialization continues to fall back to CPU, and the Settings toggle
remains the user-facing escape hatch.

## Rejected for this phase

- ~~A renderer-facing GPU on/off setting.~~ **Reconsidered same-day and
  implemented.** The original rejection read ADR 0009's "execution-provider
  names never cross IPC" principle as ruling out any GPU-related renderer
  control at all. Re-reading it more precisely: the objection is to the
  renderer choosing or naming a concrete execution provider (`'dml'`, a
  model path, an executable path) — not to a simple boolean product-level
  intent crossing IPC, which Utawakui already does elsewhere (BPM
  analysis's "自動分析" preference,
  `src/composables/useMusicAnalysisSettings.js` +
  `electron/main/configHandlers.js`'s `config:get/set-auto-music-analysis`).
  A GPU on/off checkbox is the same shape: the renderer sends a boolean via
  a new `separationGpuAcceleration` config preference (default `true`); main
  still owns everything about what that boolean actually does inside
  `createInferenceSession()`'s existing `preferGpu` parameter — no execution
  provider name, path, or any other DirectML-specific detail crosses IPC.
  This also matches what both competitors in
  `docs/research/competitive-research.md` actually ship (a plain "GPU 加速"
  checkbox with automatic CPU fallback on failure). Implementation: new
  `src/composables/useSeparationSettings.js` and
  `src/components/settings/SeparationGpuSettingsRow.vue` (both modeled on,
  but simpler than, the BPM analysis pattern — no install/repair/remove
  lifecycle exists for this preference, since `DirectML.dll` always ships),
  wired into `electron/main/separationHandlers.js`'s `prepareJob` as
  `preferGpu: getConfig().separationGpuAcceleration !== false`. Verified via
  the same `ELECTRON_RUN_AS_NODE=1` worker-thread spike pattern used above:
  `preferGpu: false` skips DirectML entirely (no fallback warning, since
  none is attempted); `preferGpu: true` behaves identically to the
  Verification section above.
- **CUDA.** Not evaluated here at all — it is scoped to the separate,
  already-deferred `refined`/BS-RoFormer tier decision in ADR 0009, and
  existing research shows `python-audio-separator`'s DirectML support
  doesn't cover RoFormer/MDXC on Windows, so DirectML and CUDA aren't
  substitutes for that tier regardless.
- **A graceful mid-inference cancellation protocol** (worker listens for a
  cancel message and calls `session.release()` before the caller
  `terminate()`s it). The plan for this work initially assumed this was
  needed to guard against upstream issue #13086. Empirical evidence (see
  Verification, item 2) did not reproduce that failure mode for Utawakui's
  actual usage pattern, so building unused machinery for a problem that
  didn't manifest was rejected in favor of documenting the finding and only
  adding it if real instability surfaces later.

## Consequences

- `quick`/`general` separation now attempts GPU acceleration by default on
  Windows, with an automatic, silent CPU fallback if DirectML session
  creation fails for any reason (no compatible GPU, driver issue, or an
  upstream regression).
- The license and technical-maturity caveats above (DirectML "sustained
  engineering" status, Electron/`worker_threads` risk reports) are now
  documented in one place for future reference, even though none of the
  Electron-specific risks reproduced in this round of testing.
- If a real packaged-build machine surfaces the ADR 0002-adjacent crash when
  DirectML is actually invoked, the fallback in `createInferenceSession()`
  only helps if session _creation_ fails cleanly — a lower-level native
  crash (like the Chromium `CHECK()` ADR 0002 describes) would not be
  caught by a JS `try/catch`. Unlike when this ADR was first written, a
  user now has an in-app escape hatch (unchecking "GPU 加速" in Settings)
  without needing a new app version — but that only helps if the app can
  still launch far enough to reach Settings; a crash severe enough to
  prevent that would still require either changing the config default or
  reopening ADR 0002's investigation with DirectML actually active instead
  of merely bundled.
- The Settings checkbox (`separationGpuAcceleration`, default `true`)
  follows the exact config-preference shape already established for BPM
  analysis's auto-analyze toggle — no new architectural pattern, no change
  to `docs/architecture.md`'s IPC/runtime-ownership tables.

## References

- `docs/adr/0002-packaged-exe-kept-as-electron-exe.md`
- `docs/adr/0009-tiered-audio-processing-runtime.md`
- `docs/research/competitive-research.md` §3.2, §3.3 and §4 (competitor GPU
  separation products and the current comparison matrix)
- [microsoft/onnxruntime#20084](https://github.com/microsoft/onnxruntime/issues/20084),
  [#13086](https://github.com/microsoft/onnxruntime/issues/13086),
  [#17678](https://github.com/microsoft/onnxruntime/issues/17678)
- [ONNX Runtime DirectML execution provider docs](https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html)
