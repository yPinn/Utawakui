# Output first-frame profile investigation — 2026-10-18

## Question and method

The preceding OpenCC change reduced the main renderer dependency graph, but the
small fresh-profile sample had a slower median Output frame. This investigation
separates renderer source readiness, first profile initialization and resource
cache effects before changing product behavior.

The current-source production renderer ran under development Electron 43.7.8.
Every sample used an isolated empty library, confirmed public Output gate,
auto-start with zero display delay and disabled update checks. The bundled
announcement was marked seen with the actual config key. Each process restarted
completely. Three blocks each used a fresh profile, reopened it on the same
origin, then reopened it on a different allowed-range port. Both the requested
and saved effective ports were checked. No existing user profile was used.

A local wrapper recorded HTTP request/response completion, browser navigation
timings and CDP resource events. Selected diagnostic controls also recorded
Chromium NetLog; only summarized events are reproduced here. CDP attachment adds
overhead, so these numbers are diagnostic observations, not a replacement for
the earlier uninstrumented baseline or an OBS/Spout texture acceptance test.
OS file caches and host load were not controlled.

## Findings

The slow fresh-profile interval precedes the first request reaching the local
HTTP server. Three baseline navigation observations spent approximately 945,
850 and 656 ms between fetch start and request start. Source synchronization
had already completed while the probe waited.

NetLog localized the gap more precisely in the direct-networking control:
`COOKIE_PERSISTENT_STORE_KEY_LOAD_STARTED` occurred at relative 39 ms and
`COOKIE_PERSISTENT_STORE_KEY_LOAD_COMPLETED` at 1057 ms. The first loopback
request's `NETWORK_DELEGATE_BEFORE_START_TRANSACTION` began at that same 1057 ms;
the server responded a few milliseconds later. Proxy resolution and
`HTTP_CACHE_GET_BACKEND` then completed within the recorded millisecond.
This is evidence of persistent Cookie store/key initialization blocking the
first request. It does not establish which Windows encryption or disk operation
inside Chromium accounts for the key-load time.

Disabling the HTTP cache still left pre-request waits of approximately 532 and
597 ms. Disabling proxies still left approximately 1024 and 666 ms. Neither
control removed the first-use delay. No production proxy or cache setting was
changed on the strength of these experiments.

Reusing an initialized profile on a new origin did not reproduce the long wait,
even though resource bytes and origin-keyed code caches could not all be reused.
This distinguishes profile initialization from an already cached Overlay module
graph. Resource transfer/parse/cache effects and scheduling still contribute to
the smaller differences after initialization.

| Diagnostic session and profile     | Samples | Frame p50 (ms) | Frame range (ms)  |
| ---------------------------------- | ------: | -------------: | ----------------- |
| Profile, fresh                     |       3 |       1507.681 | 1338.369–1519.524 |
| Profile, reused with same origin   |       3 |        538.176 | 518.566–560.615   |
| Profile, reused with new origin    |       3 |        600.797 | 556.585–617.202   |
| Memory control, fresh              |       3 |        531.455 | 524.007–546.717   |
| Memory control, reused same origin |       3 |        528.817 | 511.879–571.345   |
| Memory control, reused new origin  |       3 |        528.656 | 515.513–549.258   |

The implemented memory control's fresh-profile pre-request waits were about
10–11 ms. An additional three default-profile runs after the code change still
produced 1298.213–1475.821 ms frames, demonstrating that the default metric did
not silently drop persistent-profile initialization. The memory control is a
different measurement condition, not a production speedup. The historical
OpenCC before/after samples lacked NetLog, so their exact 162.637 ms median
difference cannot be assigned entirely to a particular initialization operation.

## Changes justified by the evidence

The trace probe previously shared the default persistent session, while the
actual Spout helper already uses an in-memory partition. The resulting fresh
trace combined two costs that should be compared separately. Default tracing
remains unchanged for historical comparability. An explicit memory probe now
provides the additional control through `--startup-trace-memory-probe`, exposed
as `perf:startup --probe-session memory`.

Memory mode uses a separate non-persistent diagnostic partition. It does not
change the main renderer, previews, Spout helper, external OBS browser profile,
proxy, cache or saved configuration. Sandbox, navigation allowlist and disabled
Node integration remain identical. Electron documents the non-persistent
partition behavior in its [Session API](https://www.electronjs.org/docs/latest/api/session#sessionfrompartitionpartition-options).

The runtime records a bounded `probeSession` label in baseline metadata. The
harness verifies it against the requested mode before accepting a run. Older
traces without a label remain profile measurements; an old executable ignoring
the memory flag cannot be mislabeled as a successful memory control. This avoids
making an apparent improvement merely by changing the metric's default.

The prior scratch harness used OS-assigned ephemeral ports beyond the product's
49151 maximum. All saved profiles in both preceding before/after pairs actually
normalized to 8700. The new matrix selects and verifies allowed-range ports;
the preceding report has been corrected. Existing samples are retained with
their true same-origin interpretation.

## Verification and limits

Focused tests cover explicit session selection, trace-disabled behavior, bounded
mode labels, harness argument propagation and rejection of legacy-mode mismatch.
Complete Electron restarts exercised both session modes and confirmed valid
source synchronization, first-frame telemetry and the existing Output connection.
The final mode-label validation runs add one fresh and two reopen captures for
memory mode and one fresh capture for profile mode, separately from the table.
The full unit suite passed 740 files / 6,939 tests, and the focused harness
runtime suite passed 9 tests. ESLint, Markdown lint (120 files), formatting,
production build and diff whitespace checks passed. The build retains its
existing large-chunk warning. Read-only review found no actionable issue.

This change improves diagnostic separation rather than changing product output
delivery. There is no verified need to bypass user proxies, disable persistent
storage encryption, clear caches or rewrite output settings. The public Browser
Source and Spout texture presentation were not visually changed. A populated
library, real OBS process, packaged executable and controlled OS-cold storage
remain unmeasured here.

## Actual App and preview follow-up

The preceding sections describe the diagnostic-only phase. A subsequent pass
measured the normal visible App without any startup-trace flag or probe window.
It navigated from Library to Display through the existing workflow trigger,
waited for the real workbench iframe to finish loading and two animation frames,
then switched to Gallery. Each process used the same isolated empty-library
conditions, verified ports and complete restart as above. NetLog recorded the
actual iframe request rather than a separate top-level probe navigation.

The real preview reproduced the initialization wait. Three fresh immediate
openings took 709–962 ms from navigation action to the iframe's post-load frame
boundary, including 425–653 ms before sending the first HTTP request. Three
profile-reuse openings took 233–256 ms, with about 4 ms before request start.
Fresh profiles that stayed in Library for another 1.5 seconds still waited
203–230 ms before sending their first preview request. NetLog showed key loading
starting after that navigation, so simply staying on the main screen did not
fully prepare the store.

The App shell was available before the iframe waited. Gallery's selected-template
preview is a renderer-local `ObsTemplateMockup`, with no direct HTTP Cookie-store
dependency; workbench Browser Source previews use the original persistent
default session. Browser paint timing entries were empty for this `file://`
fixture. Shell readiness therefore means visible window plus two animation
frames and usable workflow controls, not a measured first-paint timestamp.

A diagnostic candidate initiated a read-only, loopback-filtered `cookies.get`
at App ready without awaiting it. This reduced delayed first-preview latency,
but initial sequential batches did not show consistent improvement for immediate
openings. The production change was then checked in interleaved control/prepared
pairs with alternating order, fresh profiles for both conditions and no other
heavy test work running. The control bypassed only the new helper; both sides
used the same real App and renderer build.

| Interleaved fresh-profile path             | Control p50 (ms) | Prepared p50 (ms) |
| ------------------------------------------ | ---------------: | ----------------: |
| Immediate action to preview frame boundary |          762.195 |           742.930 |
| Immediate request pre-send wait            |          488.500 |           451.200 |
| Delayed action to preview frame boundary   |          496.634 |           259.122 |
| Delayed request pre-send wait              |          225.700 |             1.700 |
| Shell readiness, immediate-path sample     |          285.409 |           271.397 |
| Shell readiness, delayed-path sample       |          262.608 |           262.509 |

Each cell summarizes three samples. Delayed means 1.5 seconds after shell
readiness. Shell times start at window creation; preview times start at the
navigation action. Preparation itself still took roughly 647–1117 ms in these
fresh profiles: the benefit is overlap with time spent using Library, not removal
of the initialization work. Immediate ranges overlap substantially, and one
prepared immediate sample was slower than its paired control. There is no claim
of uniformly faster immediate previews or a p95 guarantee. Warm-start samples
remained usable, and shell readiness showed no systematic regression in these
small interleaved groups.

`previewSession.js` now performs that local read once from App ready. Cookie
values are discarded, never returned to the renderer or diagnostics. The
operation neither navigates to the filter URL nor changes cookies, proxy,
cache, session identity, Output gates or saved configuration. Electron's
[Cookies API](https://www.electronjs.org/docs/latest/api/cookies#getfilter)
documents the filtered asynchronous query. Preparation failure is best effort:
the original navigation still performs its own initialization and error handling.
The shell, Output startup and settings never await the preparation Promise.

The final production-build smoke test restarted Electron for a fresh immediate,
profile-reuse and fresh delayed run. It exercised default workbench preview,
Gallery, workbench reopening and Lyrics preview, checked a running Output
client and unchanged port/auto-start/display-delay settings, and captured the
visible Lyrics preview. The final delayed observation was 212.6 ms with 1.4 ms
pre-send wait. These are functional confirmations outside the interleaved table.
External OBS-owned browser startup and Spout native texture delivery were not
changed or claimed as validated by this preview probe.

The helper's focused startup/Output/config suite passed 128 tests, and packaging
boundary checks passed 4 tests. The full unit run passed 6,945 tests and failed
one unrelated infra guard: concurrent settings-page `UiDisclosure` adoption
conflicts with `DemoNewInfra.test.js`'s pending-component exclusion. Those
settings changes and that guard were not altered by this task. Read-only review
approved the helper; it uses the existing `electron/**/*` packaging inclusion.

Subsequent guard verification retained the Settings adoption of `UiDisclosure`,
added a shared mounted-draft/lifecycle regression, and confirmed the remaining
pending primitives stay excluded from production. The full unit-plus-runtime
run also exposed two plain deferred loaders under the composables directory;
they and their tests now live in `src/utils/`, with imports and architecture
references updated rather than weakening the naming rule. The complete suite
then passed 802 files / 7,781 tests, with one existing skip. Settings Electron
layout checks passed at both sizes and Dock states. Rebuilt sandboxed Electron
fixtures also verified real Signalsmith worklet creation and deferred OpenCC
conversion after the move. This resolves the earlier guard failure recorded
above without changing settings operations or deferred loading behavior.
