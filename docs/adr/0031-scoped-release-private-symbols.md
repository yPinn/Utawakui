# ADR 0031: Scoped release private symbols

## Status

Accepted (2026-10-26).

## Context

[ADR 0030](0030-release-runtime-bundles.md) removes the source hierarchy from
Main and workers while preserving function names and lazy module initialization.
The next protection layer must avoid decoder calls, initialization loops and
changes to audio or operation lifecycle code. A second generic minifier would
add little value because local parameters are already short.

## Decision

The Main release build applies a symbols-only pass to exactly
`electron/lib/importRecordingPolicy.js` and
`electron/lib/artwork/releasePolicy.js` before bundling. The build-only policy in
`scripts/runtime-symbol-policy.mjs` reserves the ten existing exported functions
and CommonJS host identifiers. Rolldown 1.2.15 is an explicit, exact development
dependency; the existing npm lock gains no new transitive packages.

The pass disables compression and property mangling. It renames private bindings
without changing literals, public data fields, numerical rules or control flow.
Its source parser requires the reviewed static CommonJS export shape and rejects
unreviewed exports, module aliases, reflection and timer/eval constructs.
The fixed Main targets must both be present. Reaching a non-Main entry fails the
build instead of expanding protection to a worker or preload.

The final bundle keeps the existing name-preserving configuration. Build and
afterPack checks reject retained distinctive private-name sentinels and missing
public functions. Per-module transformation receipts stay in build/test memory;
the package gains no mapping file or source map. Shared helper names that also
belong to other, untransformed modules can still appear in Main.

The beforePack hook uses the protected default. A programmatic
`protectSymbols: false` option exists for controlled build comparisons only;
there is no runtime setting, environment switch or renderer IPC for it.

Other five runtime entries, renderer assets, native wrappers, dictionaries,
explicit research scripts and the three-file app-owned unpack boundary remain
unchanged. No anti-debugging, self-defending code, string table, obfuscator service
or runtime dependency is introduced.

## Verification and consequences

Contract tests compare exported keys, function names and arity, Node named
imports, Unicode data, score boundaries, rankings, failure behavior and lazy
initialization. Integration tests compare all six generated entries against the
same-source unprotected build. Artifact checks inspect actual ASAR bytes, not
only source files or the standalone transform result.

Acceptance compares packaged startup with alternating fresh-profile and warm
runs. Native checks cover playback, pause/seek/next, BGM/capture, reading workers
and synthetic inference. Playback-period rule workloads use the actual artifact
functions through a test-only in-memory observation bridge; that bridge is never
packaged. Performance comparisons must run without concurrent test/build load.
Budgets and evidence belong in the dated verification report, not product status.

The protection removes some private semantic labels and raises casual reading
cost only. Public functions, scoring constants, data contracts and observable
behavior remain recoverable. It does not provide encryption or anti-scraping.
The second batch of lyrics rules requires separate acceptance and is not enabled
by this decision.
