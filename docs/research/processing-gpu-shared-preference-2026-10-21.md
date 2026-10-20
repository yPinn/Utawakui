# 共用 GPU 偏好與歌曲／歌詞解析評估

日期：2026-10-21。此為評估提案，尚未實作或驗收新 GPU 推論路徑；不改正式 gate、預設下載及人工時間驗收 pending 狀態。

## 結論

可以用一個「優先使用 GPU 加速」設定涵蓋音訊處理與分析，各模組仍獨立管理模型、環境、執行程序與回退。開關代表運算偏好，不代表所有分析已支援 GPU，也不代表允許下載、啟用功能或放寬 gate。

目前只有伴奏分離已接 GPU；HubertFA、Whisper small、節拍與段落分析均固定 CPU。優先測試同權重 HubertFA 的 DirectML 路徑，並量測 small 在整體耗時中的占比；不能把 GPU 等同更準確的歌詞或語意斷句。

## 現況與可行路徑

| 模組                                   | 當前行為                                                              | 可評估的 GPU 路徑                  | 環境與取捨                                                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 伴奏／人聲分離                         | ONNX DirectML，建立 session 失敗時回 CPU；已有預設開啟的分離 GPU 偏好 | 沿用已接受的 DirectML 路徑         | 已包含執行環境；目前 session 建立回退不等於所有推論錯誤、OOM 或 native crash 都有回退                                      |
| HubertFA 詞塊對齊                      | ONNX 聲學前端固定 CPU，NumPy／字典解碼另在隔離程序                    | 同一 ONNX 權重嘗試 DirectML        | 新增模型權重為 0；現有 ORT 已包含 DML，但仍須驗證模型運算子、變長輸入、時間品質與實際效能。解碼與 I/O 仍在 CPU             |
| Whisper small 內容檢查                 | 固定 `--no-gpu`，現裝 binary 僅有 CPU backend                         | 比較 Vulkan 與 NVIDIA CUDA backend | 可沿用 small 權重，但須另選、固定與驗證 GPU binary／相依庫；只移除旗標無法讓現有安裝加速。額外下載／安裝容量待實際選版量測 |
| Beat This! 節拍／重拍                  | `Audio2Frames` 固定 CPU                                               | 上游支援 CUDA                      | 須建立經驗證的 Audio Python GPU 能力鎖，不改寫現有完整性鎖；完整環境容量待選版量測                                         |
| all-in-one 歌曲段落                    | 分析與內部 htdemucs 分離固定 CPU                                      | 驗證整條 GPU 推論鏈                | 不能只驗 Beat This! 就宣稱段落分析已加速；額外模型／環境依各自能力管理                                                     |
| 文字規則、長句候選、來源映射與一般 DSP | CPU                                                                   | 先維持 CPU                         | 成本低；搬到 GPU 的傳輸與啟動成本可能抵銷收益                                                                              |

程式依據：`electron/lib/vocalSeparation.js`、`electron/main/separationHandlers.js`、`electron/lib/config.js`、`src/components/settings/SeparationGpuSettingsRow.vue`、`scripts/research/lyricsAcoustic/frontend.cjs`、`electron/lib/lyricsAcoustic/probe.js`、`scripts/research/lyricsAcoustic/decoder.py`、`electron/lib/lyricsResearch/engine.js`、`scripts/research/lyricsFreshEvaluation/trial-assets.json`、`resources/audio-processing/structure_analysis_worker.py` 與現有 analysis lock。既有分離決策見 [ADR-0017](../adr/0017-directml-execution-provider-for-mdx-separation.md)。

## 本機確認與限制

唯讀硬體查核確認 NVIDIA GeForce RTX 5060 Ti，`nvidia-smi` 回報顯存 16,311 MiB、driver 617.14；另有 AMD Radeon 內顯。CIM 的 AdapterRAM 不用作顯存容量依據。

目前 `onnxruntime-node` 登錄的 bundled backend 為 CPU、DML、WebGPU。這只證明 runtime 包含 backend，不證明 HubertFA 可成功建立 GPU session、實際用了哪張卡或能加速。本輪未跑新 GPU 推論、未下載或安裝環境，沒有實測倍速或 CPU／GPU 對齊品質等價結論。

DirectML 預設 adapter 0 不保證是獨顯；應由 main 派生裝置選擇並記錄實際 adapter。變長輸入需實測，且 DirectML 的 session 選項與同 session 執行限制需個別確認，不能照搬 CPU 設定。[官方 DirectML 說明](https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html)

## 共用設定提案

設定頁將現有分離開關提升為「優先使用 GPU 加速」，不增加各功能重複開關。輔助說明：「支援的工作優先使用顯示卡；無法使用時改用 CPU，不會自動下載額外環境。」此設定不影響 Electron 畫面或 OBS 的硬體加速。

- 單一 main-owned 布林偏好，例如 `processingGpuAcceleration`；缺值時繼承舊 `separationGpuAcceleration` 的明確 true／false，再採既有預設 true，保留使用者關閉選擇。
- 每個 job 開始時取偏好快照；開啟選擇已驗證且已安裝的 GPU backend，否則 CPU；關閉使用 CPU。變更只影響後續工作。
- 各模組接受小型執行選項或計畫，不互相匯入 feature composable、session 或環境。renderer 只送布林意圖，不指定 backend、路徑或裝置。
- 實際執行狀態分開記錄 requested、actual backend 與有界 fallback reason；一個模組失敗不應把其他模組全域判成無 GPU。
- 能力結果依模型、runtime、driver／adapter 分開驗證。ORT 仍只在隔離 worker／child 載入，main 不建立 native GPU session。
- Provider Python、Audio Python 與歌詞研究環境維持各自生命週期。GPU 偏好不能觸發隱藏下載或在既有環境內自動替換套件。

## 排程、取消與回退

共用偏好不需要共用模型服務；但不同工作同時使用同一 GPU 時，需要輕量資源協調。初期建議同一時間僅一個重型 GPU 推論階段，完成即釋放，CPU 工作不被整段鎖住。這可避免下一首分離與上一首自動歌詞分析疊加，也減少與 OBS 爭用資源；不保證完全消除 OBS 影響。

初始化／推論失敗或顯存不足，僅對可安全重跑階段做一次有界 CPU 重試；未完成輸出不得發布，已成功伴奏、來源歌詞、T2 優先及 T1 回退保留。取消須清理並停止，不能當 GPU 失敗再啟動 CPU。Native crash 依賴程序隔離與監看，不能只靠 JavaScript catch。

Whisper 現有逐句啟動會重複載入模型，GPU 啟動成本也可能抵銷收益。可先評估每個有界歌曲 job 重用一個模型 context，保留逐句盲轉寫範圍、時鐘、取消與內容門檻；不因追求速度改成把待驗歌詞餵給辨識器。

## 建議順序與驗收

1. 先定共用偏好、舊設定遷移、實際 backend 狀態與資源協調契約；分離沿用既有路徑。
2. 同權重 HubertFA 做 CPU／DirectML 對照，同時拆出 small 載入與推論耗時。前者環境增量最低，後者可能影響整體較大，收益需量測。
3. small 比較固定版本 Vulkan／CUDA 手動選配 runtime，記錄完整下載與落地 bytes，再決定是否值得提供。上游 v1.9.2 支援兩條 GPU 建置路徑，但現有 CPU archive 不具備這些 backend。[固定版本上游文件](https://github.com/ggml-org/whisper.cpp/blob/v1.9.2/README.md)
4. 最後評估 Beat This! 與 all-in-one GPU 能力鎖，分別驗證節拍及段落成果。Beat This! 上游支援 CUDA，但 App 的 CPU profile 尚未接入。[上游推論介面](https://github.com/CPJKU/beat_this#inference)

驗收使用相同歌曲／來源／offset／配方，比較冷啟動、暖執行、整首耗時、記憶體／顯存、內容誤接受／誤拒、詞塊時間差與長尾；另驗無 GPU、缺環境、裝置錯誤、OOM、推論失敗、等待中與執行中取消，以及跨工作資源釋放。記錄實際 provider、adapter、精度與版本，不以 backend 登錄或 session 建立成功當作完成。人工時間驗收仍獨立 pending。
