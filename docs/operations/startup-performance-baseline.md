# Startup Performance Baseline

## 2026-08-23 packaged Windows capture

This is an observed reference baseline, not a regression budget. The capture ran
the unpacked Windows package produced by Electron Builder, with startup tracing
explicitly enabled. Normal product launches do not create the trace writer,
renderer IPC, hidden overlay probe, or telemetry endpoint.

The harness ran five fresh-profile captures, one excluded warm-profile priming
capture, and five measured warm-profile captures. Every profile used an isolated
empty library, enabled the existing public Output gate, started Output on port
8700 with zero display delay, and loaded one hidden 1280 by 720 bundled Lyrics
overlay. Percentiles use nearest-rank calculation.

| Observed milestone (ms from process start) |  Cold p50 |  Cold p95 | Warm p50 | Warm p95 |
| ------------------------------------------ | --------: | --------: | -------: | -------: |
| Electron ready                             |   102.057 |   142.093 |  104.859 |  114.101 |
| Window created                             |   134.981 |   186.576 |  157.346 |  172.544 |
| Interactive shell                          |   282.971 |   336.611 |  298.239 |  313.829 |
| Source synchronized                        |   310.042 |   445.300 |  329.434 |  341.150 |
| First paint                                |   337.924 |   456.311 |  359.055 |  387.299 |
| First Output instance ready                | 1,399.472 | 2,699.611 |  329.899 |  341.729 |
| First Output rendered frame                | 1,405.272 | 2,703.411 |  372.129 |  378.699 |

After the first Output frame, each run had a fixed one-second settle interval and
a fixed one-second idle sample while the default traced instance remained active.

| Observed aggregate     | Cold p50 | Cold p95 | Warm p50 | Warm p95 |
| ---------------------- | -------: | -------: | -------: | -------: |
| Idle CPU percent       |    0.116 |    0.949 |    0.143 |    0.186 |
| Working set (KiB)      |  578,028 |  579,076 |  580,376 |  583,428 |
| Peak working set (KiB) |  581,332 |  582,328 |  584,064 |  587,128 |
| Process count          |        7 |        7 |        7 |        7 |
| Output queued bytes    |        0 |        0 |        0 |        0 |
| Output clients         |        1 |        1 |        1 |        1 |

GPU compositing was enabled in all ten measured runs. The capture host reported
Windows build 10.0.26200, x64, 16 logical CPUs, and 64,676 MiB total memory.
Storage class and GPU memory were not measurable through the current local
harness.

“Cold” here means a new isolated Chromium/application profile. It does not claim
an emptied Windows filesystem cache or controlled slow storage. The much wider
cold Output first-frame range is retained in the p95 rather than discarded. Low-
memory hardware, lower-core hardware, slow storage, a representative large
library, OBS-owned browser processes, GPU-memory capture, and multiple default
instances remain open matrix rows. No p50 or p95 regression gate should be set
until those rows provide enough representative evidence.

The reproducible command is:

```bash
npm run perf:startup -- --exe <packaged-exe> --output <new-output-directory>
```

The output directory must be new because the harness uses exclusive trace/report
creation and fails closed instead of overwriting evidence.

## Profile initialization and memory-session control

Default tracing continues to use the profile session. Fresh-profile Output timings
therefore include Chromium persistent Cookie store initialization, not only the
bundled Overlay and projection delivery. The historical table above remains a
profile-session measurement and must not be compared directly with memory-session
results as a product speedup.

For an explicit control matching the non-persistent session lifecycle of the
Spout helper, use a newly built executable and a separate output directory:

```bash
npm run perf:startup -- --exe <new-packaged-exe> --output <new-output-directory> --probe-session memory
```

`--probe-session profile` is the default. Memory mode passes the trace-only
`--startup-trace-memory-probe` flag; normal launches create no diagnostic window
and retain their existing sessions, proxy settings, caches and configuration.
Each completed trace records `baseline-complete.metadata.probeSession`, and the
report records `environment.probeSession`. The harness rejects a runtime mode
mismatch, including an older executable that ignores the memory flag. Legacy
traces without the field are treated as profile measurements.

Current App startup also begins a read-only default Cookie-store preparation in
parallel with shell initialization. A later preview can overlap that work with
time spent in Library; an immediate preview can still wait for completion.
Record whether that production preparation is present when comparing builds.
The actual App path, interleaved control measurements and unchanged session /
configuration boundaries are described in the investigation linked below.

Compare matching session modes, library contents and executable builds. A fresh
profile is not an OS-cold cache. The 2026-10-18 investigation, counterfactual
controls and limitations are recorded in
[Output first-frame profile investigation](../research/output-first-frame-profile-2026-10-18.md).
