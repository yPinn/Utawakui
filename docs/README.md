# 文件導覽與決策現況

這是 Utawakui 文件的單一入口。`docs/` 根目錄只保留會持續維護的產品入口；其他
文件依用途分類，避免研究、歷史計畫與現行規格混在一起。

## 目錄結構

```text
docs/
  README.md       文件入口、分類與決策現況
  spec.md         產品範圍、功能現況與方向
  architecture.md 現行 runtime 與 dependency boundaries
  adr/            已接受決策與取捨歷史
  contracts/      可驗證的 protocol、security、sidecar 與 quality gates
  operations/     發布、diagnostics、packaging 與 startup 操作文件
  governance/     合規與專案治理參考
  research/       有日期或明確研究範圍的 benchmark、spike 與競品證據
  archive/        已完成但仍需追溯的執行計畫
  releases/       已發布版本的歷史 release notes
```

## 保留與歸檔判斷

| 分類                                      | 處理         | 理由                                                                    |
| ----------------------------------------- | ------------ | ----------------------------------------------------------------------- |
| `README.md`、`spec.md`、`architecture.md` | 根目錄保留   | 是所有讀者的 live entry，不應被歷史資料淹沒。                           |
| `adr/`                                    | 全部保留     | 即使已 superseded，仍保存當時限制、取捨與後續決策鏈。                   |
| `contracts/`                              | 全部保留     | 對應 validator、fixtures、IPC、sidecars 或 future acceptance boundary。 |
| `operations/`                             | 全部保留     | 直接支援 release、support、diagnostics 與效能回歸。                     |
| `governance/`                             | 保留         | 合規立場與 dependency license 邊界仍影響產品和發布。                    |
| `research/`                               | 集中保存     | 不作為目前狀態來源，但 ADR 與模型選擇需要可追溯證據。                   |
| `archive/`                                | 歸檔、不刪除 | Lyrics T2 plan 已完成；contract 才是現行規範，但 plan 仍解釋遷移順序。  |
| `releases/`                               | 逐版本保留   | Release note 描述已發行 artifact，不能用目前 source tree 覆寫。         |

本輪沒有刪除有意義的文件。只有重複段落被移除；過期內容透過 status、資料夾與本頁
定位，不再放在 live root。

## 文件權責

| 文件                        | 唯一責任                                               | 不應承擔                                   |
| --------------------------- | ------------------------------------------------------ | ------------------------------------------ |
| [Root README](../README.md) | 對使用者與 contributor 的產品／開發入口                | 完整 roadmap、低階架構或歷史決策           |
| [PRODUCT](../PRODUCT.md)    | 穩定定位、承諾、原則、非目標與語氣                     | 隨實作變動的功能狀態                       |
| [產品規格](spec.md)         | 現行產品範圍、完成度、方向與 open decisions            | Module 級實作細節                          |
| [架構圖](architecture.md)   | 現行 runtime ownership、資料、gate、依賴與 diagnostics | 未落地功能承諾                             |
| [ADR](adr/)                 | 決策原因、取捨與採用狀態                               | 每次功能進度或操作手冊                     |
| [Contracts](contracts/)     | 可驗證的資料、security 與 acceptance boundaries        | 整體產品介紹                               |
| [Operations](operations/)   | 現行操作與維護程序                                     | 產品定位或歷史研究                         |
| [Research](research/)       | Point-in-time evidence                                 | 目前產品狀態                               |
| [Archive](archive/)         | 已完成計畫的追溯                                       | 現行 backlog                               |
| `tasks/`（如存在）          | `.gitignore` 下的短期 scratch、fixture 與本機驗證輸出  | Durable knowledge、產品 backlog 或完成歷史 |

判斷衝突時：產品意圖看 spec 與仍有效的 ADR；目前行為以 code、registry、tests 與
packaged verification 為證據；package 內容看 release inventory。若兩者不一致，
應記錄並修正差異，不把 research、archive 或 task list 當成替代來源。

## 目前產品快照

- Local library、playback、queue、playlists 與 Windows shell integration 已是預設核心。
- Lyrics canonical timing、provider acquisition、reading、Self-View 與 Overlay 主路徑
  已建立；剩餘重點是人工視覺驗收與操作 polish。
- `quick`／`general` audio processing 可用；Refined 與 Music Analysis 尚未通過產品
  activation gate。
- OBS Browser Source MVP 已具備四個固定 slot、Gallery、Workbench、Projection Hub
  與 content/state convergence；instance／pack model 仍是後續方向。
- Provider assist 已改為 app-managed Python `yt-dlp` runtime，且只存在於明確啟用的
  advanced flow。
- Installer、startup trace、diagnostics 與 unsigned updater runtime 已建立；公開簽章
  與連續版本 update acceptance 尚未完成。

更細的狀態只維護在 [產品規格](spec.md)。

## ADR 現況對照

| ADR                                                                    | 目前效力             | 現況／方向                                                                                |
| ---------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| [0001](adr/0001-standalone-ytdlp-no-plugin-support.md)                 | 已被 0005 取代       | Standalone executable 限制仍是有效證據；產品已改用 app-managed Python。                   |
| [0002](adr/0002-packaged-exe-kept-as-electron-exe.md)                  | 現行                 | Executable 維持 `electron.exe`，產品 identity 由 installer／AUMID 提供。                  |
| [0003](adr/0003-japanese-reading-analyzer-stack.md)                    | 已實作               | 日文 reading 使用 kuromoji + wanakana。                                                   |
| [0004](adr/0004-korean-romanization-package.md)                        | 已實作               | 韓文 romanization 使用 koroman。                                                          |
| [0005](adr/0005-python-ytdlp-provider-engine.md)                       | 已實作               | Provider runtime、plugin 與 sidecar 由 app 原子準備和驗證。                               |
| [0006](adr/0006-loopback-output-websocket-runtime.md)                  | 已實作               | Loopback HTTP + `ws` 是目前 Browser Source transport。                                    |
| [0007](adr/0007-signed-public-release-app-updates.md)                  | 已實作基礎           | Public feed、updater 與 unsigned metadata flow 已建立；簽章與連續版本 acceptance 未完成。 |
| [0008](adr/0008-local-diagnostics-and-error-handling.md)               | 部分實作             | Main diagnostics 已建立；domain wrappers 與 export 增量導入。                             |
| [0009](adr/0009-tiered-audio-processing-runtime.md)                    | 部分實作             | `quick`／`general` 可執行；Refined 與其他品質包仍受 gate 限制。                           |
| [0010](adr/0010-lyrics-timing-granularity-and-output-content-split.md) | 主路徑已實作         | T0／T1／T2、content/state split 與 fallback 已建立；人工視覺 acceptance 待完成。          |
| [0011](adr/0011-overlay-instances-and-presentation-pack-delivery.md)   | 規劃中               | 現行仍是四個固定 slot；instance／pack model 尚未交付。                                    |
| [0012](adr/0012-state-convergence-and-startup-phases.md)               | 核心已實作           | Projection Hub、source identity、liveness 與 startup budgets 已落地。                     |
| [0013](adr/0013-external-integration-planes.md)                        | 規劃中               | 目前只有 Browser Source；其他 adapters 尚未實作。                                         |
| [0014](adr/0014-audio-python-runtime-family.md)                        | Foundation／research | Host、scheduler 與 workbench 已建立；沒有 Refined product activation。                    |

## 常用文件

- Lyrics：[LRCLIB acquisition](contracts/lrclib-acquisition-contract.md)、
  [timing](contracts/lyrics-timing-contract.md)。
- Output：[runtime hardening](contracts/output-runtime-hardening.md)、
  [asset security](contracts/overlay-asset-security.md)、
  [pack model](contracts/overlay-pack-contract.md)。
- Music analysis：[producer contract](contracts/music-analysis-contract.md)、
  [M2 quality gate](contracts/music-analysis-m2-quality-gate.md)。
- Integrations：[adapter contract](contracts/integration-adapter-contract.md)。
- Codebase：[naming contract](contracts/codebase-naming.md)。
- Operations：[diagnostics rollout](operations/diagnostics-rollout.md)、
  [startup baseline](operations/startup-performance-baseline.md)、
  [manual acceptance](operations/manual-acceptance.md)、
  [release inventory](operations/release-inventory.md)、
  [release runbook](operations/release-runbook.md)。
- Governance：[legal compliance](governance/legal-compliance.md)。
- Research：[競品調查](research/competitive-research.md)、
  [LRCLIB T2 validation](research/lrclib-t2-live-validation-2026-08-24.md) 與其他
  dated evidence。
- Archive：[Lyrics T2 implementation plan](archive/lyrics-t2-implementation-plan.md)。
