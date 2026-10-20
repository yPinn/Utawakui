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

## F5 2026-10-20 封裝快照

F5 以當輪 dirty checkout 的固定來源快照重建 Windows unpacked artifact，未覆寫既有 release、未安裝 installer。正常 afterPack 與 Electron fuses 通過，73 個 Output closure 檔案與 ASAR bytes 一致；工具與 fixtures 不進 artifact。來源 manifest／exe／ASAR hashes 見[版本化紀錄](../governance/data/appearance-integration-f5-validation-2026-10-20.json)，原始資料在 tasks/output-f5-package-Omvt0X 與 tasks/output-f5-package-evidence.json。後續並行修改不自動成為此快照的一部分。

以 --port 18700（profile）及 18701（memory）避免現有 App 的 8700 衝突；首次 8700 EADDRINUSE 失敗保留，沒有關閉使用者 App。工具啟動 child 前移除 ELECTRON_RUN_AS_NODE，新增有界 --port 選項，未修改正式 main／preload。Electron 43.7.8／Chromium 150.0.7871.250，Windows 10.0.26300、16 logical CPU、64,676 MiB RAM；主 GPU RTX 5060 Ti。每種模式 cold 5、warm prime 1 不計、warm 5；fresh profile 不等同 OS cold cache。

| Session | Milestone            | Cold p50 / p95 ms   | Warm p50 / p95 ms  |
| ------- | -------------------- | ------------------- | ------------------ |
| profile | interactive shell    | 663.862 / 824.809   | 597.737 / 933.573  |
| profile | first rendered frame | 1782.609 / 1853.017 | 658.102 / 1022.173 |
| memory  | interactive shell    | 667.380 / 780.645   | 667.905 / 801.701  |
| memory  | first rendered frame | 730.680 / 830.345   | 728.750 / 876.201  |

p95 使用 nearest-rank，五筆時就是最大值；只作本機描述，不宣稱統計穩定或產品加速。profile 與 memory 是 session 初始化控制，必須分開比較。原始 startup-performance.json 分別在 tasks/output-f5-startup-current-port18700-20261020 與 tasks/output-f5-startup-memory-port18701-20261020；無真實音訊／大曲庫／OBS 場景負載，完整演出可靠性仍待驗。
