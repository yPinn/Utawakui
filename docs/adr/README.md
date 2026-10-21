# 架構決策索引

本頁索引ADR的決策狀態與主題；功能完成度只維護在[產品規格](../spec.md#3-功能現況)，現行ownership見[架構圖](../architecture.md)。Accepted不代表所有交付或人工驗收已完成；Proposed也不代表沒有研究／程式實作，細節以原文Status為準。

## 決策清單

| ADR                                                                | 主題                                | 原文決策狀態                      |
| ------------------------------------------------------------------ | ----------------------------------- | --------------------------------- |
| [0001](0001-standalone-ytdlp-no-plugin-support.md)                 | Standalone yt-dlp限制（由0005取代） | Superseded by 0005                |
| [0002](0002-packaged-exe-kept-as-electron-exe.md)                  | 封裝保留electron.exe                | Accepted                          |
| [0003](0003-japanese-reading-analyzer-stack.md)                    | 日文讀音分析器                      | Accepted                          |
| [0004](0004-korean-romanization-package.md)                        | 韓文羅馬字套件                      | Accepted                          |
| [0005](0005-python-ytdlp-provider-engine.md)                       | Python yt-dlp Provider              | Accepted                          |
| [0006](0006-loopback-output-websocket-runtime.md)                  | Loopback Output transport           | Accepted                          |
| [0007](0007-public-release-app-updates.md)                         | 公開發行與更新                      | Accepted                          |
| [0008](0008-local-diagnostics-and-error-handling.md)               | 本機diagnostics與錯誤               | Accepted                          |
| [0009](0009-tiered-audio-processing-runtime.md)                    | 分級音訊環境                        | Accepted for implementation       |
| [0010](0010-lyrics-timing-granularity-and-output-content-split.md) | 歌詞T0／T1／T2與投影                | Accepted                          |
| [0011](0011-overlay-instances-and-presentation-pack-delivery.md)   | Overlay instance／pack方向          | Accepted for planning             |
| [0012](0012-state-convergence-and-startup-phases.md)               | 狀態收斂與啟動階段                  | Accepted                          |
| [0013](0013-external-integration-planes.md)                        | 外部整合平面                        | Accepted                          |
| [0014](0014-audio-python-runtime-family.md)                        | Audio Python runtime family         | Accepted                          |
| [0015](0015-recording-first-provider-discovery.md)                 | 錄音優先的Provider discovery        | Accepted                          |
| [0016](0016-user-feedback-intake.md)                               | 使用者回饋流程                      | Accepted                          |
| [0017](0017-directml-execution-provider-for-mdx-separation.md)     | MDX DirectML GPU／CPU回退           | Accepted                          |
| [0018](0018-signed-update-manifest.md)                             | 更新manifest簽章                    | Accepted foundation；正式啟用待定 |
| [0019](0019-signalsmith-stretch-pitch-transpose.md)                | Signalsmith pitch／transpose        | Proposed                          |
| [0020](0020-metronome-lookahead-audio-scheduling.md)               | 節拍器lookahead排程                 | Proposed                          |
| [0021](0021-bgm-standby-audio-and-handoff.md)                      | BGM lane與交接                      | Accepted                          |
| [0022](0022-artist-identity-and-organization.md)                   | 演出者identity與整理                | Accepted                          |
| [0023](0023-renderer-destination-and-workspace-model.md)           | Renderer目的地與工作區              | Accepted                          |
| [0024](0024-explicit-local-audio-compatibility-transcoding.md)     | 明示音訊相容轉檔                    | Accepted                          |
| [0025](0025-renderer-navigation-history.md)                        | Renderer導覽歷史                    | Accepted                          |
| [0026](0026-t1-acoustic-estimates.md)                              | T1獨立聲學估計                      | Accepted：獨立估計第一階段        |
