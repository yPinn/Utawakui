# 隨應用程式交付的資源

本目錄保存 main 擁有的 Python worker 與固定 runtime／環境／模型描述，沒有 Python 安裝、模型權重或使用者曲庫。
實際交付路徑以根目錄 `electron-builder.yml` 的 `extraResources` 明確清單為準；封裝規則見 [release inventory](../docs/operations/release-inventory.md)。

## 資源與責任

| 檔案                                                    | 用途與 consumer                                                                                                                                           |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audio-processing/audio_python_worker.py`               | Audio Python 共用 host 的一次性 probe bootstrap；只檢查 interpreter／隔離旗標，不執行 capability 推論。由 `audioPythonRuntimeHost.js` 解析路徑            |
| `audio-processing/refined_worker.py`                    | Refined 的獨立政策與執行邊界，驗證固定輸入、檔案 hash、匯入及子程序限制。Worker 存在不代表 Refined recipe 已可用                                          |
| `audio-processing/structure_analysis_worker.py`         | 共用音樂分析 worker，已用固定 profiles 分流 Beat This! small0／final0 與 All-In-One；不用為每個模型再建一支 launcher                                      |
| `audio-processing/lyrics_acoustic_probe.py`             | 可選聲學環境的固定 Python／套件版本及 import 路徑檢查；推論實作與此 readiness probe 分開。由 `lyricsAcoustic/catalog.js` 解析                             |
| `provider/artist_photo_ytmusic_worker.py`               | 匿名 YT Music artist-photo 一次性查詢；使用 Provider Python，由 `providerRuntime.js` 與 artist-photo runner 管理，與 Audio Python 分屬不同 runtime family |
| `provider/release_catalog_worker.py`                    | 匿名查詢所屬發行與正式來源曲序；沿用 Provider Python 與 manager 退出 barrier，Main 驗證來源、媒體及提交；不下載缺曲                                       |
| `audio-processing/audio-python-runtime-3.14.7.json`     | 固定 Audio Python artifact 的 identity／大小／SHA-256／授權紀錄；不是已安裝的 Python runtime                                                              |
| `audio-processing/analysis-beat-this-py314-lock.json`   | 固定分析環境依賴閉包、wheel hash 與 probe imports；與 interpreter、模型 manifest 各有生命週期                                                             |
| `audio-processing/analysis-beat-this-small0-model.json` | 正式分析預設模型的固定描述；實際能力仍由 main 的 gate／readiness 控制                                                                                     |
| `audio-processing/analysis-beat-this-final0-model.json` | CLI 比較用模型的獨立描述；權重 identity 與 small0 不同，不是重複副本，也不是 renderer 模型選項                                                            |
| `audio-processing/analysis-structure-model.json`        | All-In-One M2 的 `benchmark-only` 描述及限制；保存此檔不表示允許產品下載其權重                                                                            |
| `audio-processing/lyrics-acoustic-catalog.json`         | 自足的聲學能力契約，包含 runtime／檔案表、環境、模型及阻擋狀態。內嵌 runtime manifest 用於完整性綁定，不能只因與 runtime JSON 部分相同就刪除              |
| `audio-processing/lyrics_acoustic_probe_test.py`        | 相鄰 probe 的純 Python 合成測試；不在 `extraResources`，也不由 Vitest 自動收集                                                                            |

來源母體 worker 與正式曲序見[來源曲序契約](../docs/contracts/release-source-catalog.md)。

功能現況只在[產品規格](../docs/spec.md)維護。Runtime 分工見[架構圖](../docs/architecture.md)、[Audio Python ADR](../docs/adr/0014-audio-python-runtime-family.md)；模型與 worker 行為見[音樂分析契約](../docs/contracts/music-analysis.md)、[聲學估計契約](../docs/contracts/lyrics-acoustic-estimate-contract.md)及[Artist photo 契約](../docs/contracts/artist-photo-provider.md)。

## 合成測試入口

在專案根目錄使用可用的 Python 執行，`-B` 避免產生原始碼目錄的 bytecode cache：

```powershell
python -B resources/audio-processing/lyrics_acoustic_probe_test.py
python -B scripts/refined-worker-probe.test.py
python -B scripts/beat-this-structure-worker.test.py
python -B scripts/structure-analysis-worker.test.py
python -B scripts/artist-photo-ytmusic-worker.test.py
python -B resources/provider/release_catalog_worker.test.py
```

這些測試使用合成資料與假的套件介面；artist-photo 測試另使用本機 HTTP server。
它們不下載權重、不證明真實模型品質或 provider 覆蓋率，也不取代封裝後推論與人工接受。
Main 端路徑解析、manifest 驗證與打包邊界由 `npm test` 內的相關 Vitest suites 驗證。
聲學 probe 的合成測試會模擬固定 interpreter 版本，並另驗證版本不符時在 import 前拒絕；
通過這些測試不表示執行測試的 Python 已符合產品 runtime 要求。

## 維護邊界

- Worker 由 main 推導固定路徑並啟動，不是一般使用者 CLI；驗收與 benchmark 入口見 [scripts 導覽](../scripts/README.md)。
- 不合併 Provider Python 與 Audio Python 的環境、activation 或 process policy。
- 更新固定版本須同步 identity、hash、lock、catalog 與 consumer 驗證；不以「版本較舊」直接刪除或更新描述。
- 移動或刪除 runtime 檔案時，同步 `electron-builder.yml`、release inventory、路徑解析及 packaging tests；本導覽與 Python 測試不隨應用程式交付。
- 模型、套件、runtime 安裝與 activation 由各能力在 userData 管理；不要把它們搬回本目錄，亦不要將 ignored 本機資產視為可直接清空。
