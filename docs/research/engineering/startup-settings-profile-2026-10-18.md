# App startup and settings profile — 2026-10-18

This is a current-source optimization observation, separate from the packaged
release baseline in [startup-performance-baseline.md](../../operations/startup-performance-baseline.md).
It does not establish a startup budget.

## Method and limits

Both passes used the current production renderer build with the development
Electron executable, an isolated empty library, Output explicitly enabled, and
the existing correlated startup trace. Each pass sampled three fresh profiles,
one excluded warm-prime run, and three restarts of a shared profile. Fresh profiles
do not imply an empty OS disk cache. Machine load, storage and a real OBS instance
were not controlled. The sample is too small for a reliable tail budget.
The harness rewrote the same seed settings and requested an OS-selected free
loopback port on each launch. A subsequent audit found those ephemeral ports
exceeded the product maximum and normalized to 8700 in all saved profiles;
these observations reused the same HTTP origin. Restart observations describe reused profile/cache state, not a
representative populated user configuration.

## Findings and first changes

- Settings, Performance and Display pages were already async imports. Adding
  another page wrapper would not remove a new startup dependency.
- The main renderer entry still statically imported the Signalsmith engine even
  though actual pitch nodes were created on demand. The engine now loads through
  `src/utils/pitchProcessorLoader.js` when pitch processing is first requested.
  Concurrent requests share the import; failed imports can retry. Worklet URLs
  remain self-hosted, and each audio graph retains its own node lifecycle.
- `configState.loadInitialConfig()` previously read and parsed the same config
  twice: once for stored-audio-preference presence and once for normalized values.
  `loadConfigSnapshot()` now derives both from one read. Presence metadata stays
  separate from normalized settings so explicit but invalid stored preferences
  still prevent stale legacy transport values from overwriting defaults.
- Existing `loadConfig()` callers retain the settings-only result. Config schema,
  file layout, atomic writes and preload-seeded theme/audio values are unchanged.
  Splitting config into more files was not justified by this measurement.

## Observations

The production main entry decreased from 1,771,102 to 1,673,490 bytes: 97,612 bytes,
or approximately 5.5%. Settings and Display page code was not moved into the
initial graph. Bundle size reduction is deterministic; elapsed-time differences
below include environmental variation and are not attributed solely to this change.

| Milestone, p50 (ms) | Fresh before | Fresh after | Restart before | Restart after |
| ------------------- | -----------: | ----------: | -------------: | ------------: |
| Interactive shell   |      741.633 |     665.917 |        459.233 |       429.680 |
| First paint         |      999.725 |     862.624 |        616.933 |       577.280 |
| Source synchronized |      911.509 |     812.660 |        561.098 |       517.130 |
| First Output frame  |     2000.701 |    1891.490 |        630.733 |       590.181 |

The maximum fresh-profile first Output frame increased from 2006.733 to
2830.024 ms, so this is not evidence of uniformly faster startup. Working set
also did not show a consistent reduction. No p95 regression gate is introduced.

A separate isolated Electron probe under the same script CSP successfully loaded
the real engine, created two worklet nodes and closed the context without audible
playback. One observation measured module load at 2.3 ms, first node creation at
160.6 ms and another node on that context at 6.2 ms. This verifies the deferred
feature path, not audio quality or first-use latency across hardware.

## OpenCC follow-up

The follow-up measured the existing static OpenCC dependency before editing it.
The full converter entered the main renderer through both `useLyrics` and
`useCurrentTrackLyricsPreview`; lazy converter construction alone did not defer
its module. Content-language character tables also serve the initial Library and
remain separate static dependencies.

Both source owners now prepare the shared lazy projector before publishing a
Chinese document, then recheck cancellation/request identity. Empty and
non-Chinese documents skip the import. Chinese documents prepare it even when
original mode is selected, preserving synchronous later variant toggles without
an original-text flash. Import failures use existing load errors and allow retry.
Canonical text, timing, document/segment identities and source files are unchanged.

The production main entry decreased from 1,673,490 to 572,866 bytes (approximately
65.8%). The 1,101,299-byte converter chunk is deferred, not eliminated; total
download/disk size is not reduced by that amount. A sandboxed Electron fixture
under the application script CSP observed zero converter requests on initial
load and one on first Chinese preparation through `webRequest`. It verified real
conversion, shared preparation, synchronous original mode and retained timing.
One module-preparation observation was 10.3 ms; this excludes the first actual
conversion and is not a first-use latency budget.

A new before/after startup pair used the same harness as above: each phase had
three fresh profiles, an excluded prime and three profile-reuse launches. These
are development Electron with production renderer, not packaged or OS-cache-cold
measurements. The after startup samples preceded the final observer-disposal
guard, which changes only the async Settings chunk.

| Milestone, p50 (ms) | Fresh before | Fresh after | Restart before | Restart after |
| ------------------- | -----------: | ----------: | -------------: | ------------: |
| Interactive shell   |      447.837 |     411.934 |        406.682 |       353.865 |
| First paint         |      541.537 |     528.036 |        545.239 |       486.506 |
| Source synchronized |      534.419 |     501.037 |        489.475 |       436.411 |
| First Output frame  |     1286.537 |    1449.174 |        558.039 |       499.506 |

Fresh first Output frame regressed in this small sample. Working set remained
roughly unchanged. These observations do not establish uniformly faster startup
or attribute all elapsed-time differences to OpenCC.

## Settings section IPC and subscription follow-up

An isolated current-source Electron wrapper instrumented main IPC handlers with
channel, duration and count only. It ran the real composition root and production
renderer with an empty library and auto-update checks disabled. It opened
Settings through DOM click dispatch three times, returning to Library
between opens. It did not write existing user settings. Initial mount times were
54.0 / 17.9 / 16.7 ms before and 66.5 / 19.5 / 19.6 ms on the final build; this
does not demonstrate a faster Settings mount. The initial paired harness used
an unrecognized announcement seed key, so the announcement was not dismissed;
these programmatic mount timings are not manual input-to-ready measurements.
An additional final visibility regression corrected that seed key and confirmed
the same 14-call opening and deferred detection behavior without the announcement.

| Section     | Before IPC per open | After IPC per open | Ownership retained                                     |
| ----------- | ------------------: | -----------------: | ------------------------------------------------------ |
| Library     |                   2 |                  2 | Config and storage read; storage listener disposed     |
| Audio       |                   0 |                  0 | Existing shared player/audio state                     |
| Application |                   4 |                  4 | Version, update status/preferences, window-close draft |
| Optional    |                   8 |                  7 | Gates, dependencies, BPM, separation and OBS reads     |
| Support     |                   1 |                  1 | Persistent diagnostics refresh                         |

Each opening originally issued 15 IPC calls. The FFmpeg discovery alone took
185.9 / 155.6 / 154.6 ms of main-handler elapsed time, while all other individual
handlers were below 1 ms. Only this optional hint discovery is deferred through
`useOnFirstVisible`. Five complete sections and their deep-link targets remain
mounted, avoiding skeleton height changes and delayed focus targets. The final
build issued 14 IPC calls on each of three openings; a fourth opening verified
zero FFmpeg calls before scrolling and exactly one after the optional group
became visible. Detection is deferred, not removed or persistently cached.
The source modal still offers direct detection and manual retry.

Subscription ownership was audited in code and regression tests, not counted by
the main IPC probe: update status, OBS status and dependency progress/updates are
shared runtime subscriptions that must outlive Settings. Library storage and BPM
capability subscriptions belong to the section and dispose on unmount. No
duplicate subscription was established that justified moving or removing these
owners. Cheap settings reads still refresh on reopening, preserving drafts,
retry and current runtime state; there is no blanket stale settings cache.

The final unit run passed 740 files / 6,935 tests. Focused coverage includes
converter sharing/retry, non-Chinese skipping, real conversion, pending-document
publication, cancelled loads, visibility/disposal and Settings deep-link and
lifecycle behavior. ESLint and production build passed; the existing large-chunk
warning remains, now including the deferred converter. A read-only review found
no actionable issue. No packaging inputs or config schema changed.

Populated-library measurements remain a candidate. The subsequent
[BGM dependency measurement](bgm-startup-profile-2026-10-18.md) separates the visual
panel from its startup restoration/live-status owner; it is independently verified.

The subsequent [Output first-frame investigation](output-first-frame-profile-2026-10-18.md)
localized the reproducible fresh-profile delay to Chromium's persistent Cookie
store key load before the first loopback request. It also corrected the port
assumption above and added an explicitly labeled memory-session control while
preserving the historical profile-session default. Its lower memory-control
numbers do not constitute a production Output speedup.
