# ADR 0030: Independent release runtime bundles

## Status

Accepted (2026-10-26).

## Context

Renderer assets already pass through Vite, but Main/preloads and app-owned Node
workers were shipped as their original modules. The entire `electron/lib/` tree
was unpacked so worker dependencies could resolve from disk. This exposes the
source hierarchy and makes an unnecessarily broad app-owned unpack boundary.
The application must preserve playback, delayed initialization, independent
workers, sandboxed preloads and the source development loop.

## Decision

`scripts/build-release-runtime.mjs` uses the existing Vite Node API with a separate
configuration. It emits six minified CJS files in ignored `runtime/`: Main's
dispatcher (including its lazy Spout branch), two preloads, the reading and
separation workers, and the independent ONNX Node probe. No new bundler runtime
dependency, obfuscator, bytecode loader or generated source map is introduced.

Production dependencies remain external. CJS require order and lazy module
initialization are retained; tree shaking is disabled and function/class names
are preserved. A lexical compiler transform relocates each app-owned module's
`__dirname` and `__filename` relative to the installed app root. It does not bake
build-machine absolute paths into the generated files.

`electron/lib/runtimeEntries.js` owns the exact source/release entry mapping.
Development continues to use `electron/entry.js`. Builder `beforePack` regenerates
the release files; packaged `package.json` points to `runtime/main.cjs`.
Preload paths remain inside ASAR. The two workers and Node probe resolve to
`app.asar.unpacked/runtime/` physical files. The probe stays a separate module so
its CLI guard and self-spawn filename retain their meaning when Main imports it.

Only these three app-owned bundles are unpacked. Native ONNX binaries, their
Node/CommonJS wrappers, dictionary packages and kuromoji's actual dependencies
must still exist on disk for plain Node worker contexts. Existing bounded
research subprocess scripts and Python resources retain their explicit delivery
rules. Browser Source routes and assets are unchanged.

The afterPack verifier checks the real ASAR main field, exact physical boundary,
absence of original Electron source modules and release source maps, and that
worker dependency resolution stays inside the artifact. A developer checkout's
parent `node_modules` must never silently satisfy a missing packaged dependency.
The established third-party notices verifier still runs.

## Verification and consequences

Tests build and relocate an independent CJS/ESM fixture, execute the actual
sandbox-compatible preload bundles, compare original and bundled Japanese/Korean
worker results, and preserve probe import/CLI behavior. Package tests inspect the
generated module graph rather than claiming original source paths are shipped.
Artifact fixtures reject source leakage, incorrect unpacking and dependency
fallback outside the package.

Native acceptance compares source-layout and bundled artifacts using isolated
profiles, startup traces and synthetic PCM playback. Packaging changes must not
move decoding, Web Audio processing or dictionary/model initialization to Main
or the startup critical path. Renderer/DSP algorithms are unchanged by this ADR.

This increases the cost of recovering the source hierarchy and reading app-owned
code. It is not encryption or a guarantee against reverse engineering. Public
Browser Source code, explicit research scripts, Python workers, data contracts
and third-party assets remain readable. Heavy obfuscation, bytecode, native core
migration and installer signing are separate decisions.
