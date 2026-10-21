# 共用 GPU 偏好與歌曲／歌詞解析評估

日期：2026-10-21。此為已完成盤點、暫緩採用的評估提案；不改正式 gate、預設下載及人工時間驗收 pending 狀態。現行歌詞研究結論見[收斂入口](../lyrics-alignment/lyrics-alignment-summary.md)。

## 結論

使用者已決定目前 CPU 足夠。歌詞 HubertFA／small、節拍與段落分析維持既有 CPU，暫不實作共用 GPU 設定、不新增 GPU 環境或推進下載／建置／實測；伴奏分離既有 DirectML 及其偏好保持不變。

後續已完成[HubertFA CPU／DirectML 有界對照](lyrics-hubertfa-directml-2026-10-21.md)，固定四案整體省 7.56%，內容／回退一致，但未接產品；[small 容量評估](whisper-small-gpu-cost-2026-10-21.md)亦完成，Vulkan／CUDA 實際效果仍未知。以下共用偏好與資源策略保留為未採用提案，不是目前排程。

## 現況與可行路徑

| 模組                                   | 當前行為                                                              | 可評估的 GPU 路徑                            | 環境與取捨                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 伴奏／人聲分離                         | ONNX DirectML，建立 session 失敗時回 CPU；已有預設開啟的分離 GPU 偏好 | 沿用已接受的 DirectML 路徑                   | 已包含執行環境；目前 session 建立回退不等於所有推論錯誤、OOM 或 native crash 都有回退                         |
| HubertFA 詞塊對齊                      | 產品聲學前端固定 CPU，NumPy／字典解碼另在隔離程序                     | 同權重 DirectML 四案研究已完成，產品採用暫緩 | 新增模型權重為 0；固定四案整體省 7.56%，一般時間品質、變長輸入與整曲效能尚未全面驗收。解碼與 I/O 仍在 CPU     |
| Whisper small 內容檢查                 | 固定 `--no-gpu`，現裝 binary 僅有 CPU backend                         | Vulkan／CUDA 成本已盤點，下載與實測暫緩      | 沿用 small 權重；官方 CUDA 整包解壓約 608 MB／1.182 GB，Vulkan 自建交付容量未知。只移除旗標無法讓現有安裝加速 |
| Beat This! 節拍／重拍                  | `Audio2Frames` 固定 CPU                                               | 上游支援 CUDA                                | 須建立經驗證的 Audio Python GPU 能力鎖，不改寫現有完整性鎖；完整環境容量待選版量測                            |
| all-in-one 歌曲段落                    | 分析與內部 htdemucs 分離固定 CPU                                      | 驗證整條 GPU 推論鏈                          | 不能只驗 Beat This! 就宣稱段落分析已加速；額外模型／環境依各自能力管理                                        |
| 文字規則、長句候選、來源映射與一般 DSP | CPU                                                                   | 先維持 CPU                                   | 成本低；搬到 GPU 的傳輸與啟動成本可能抵銷收益                                                                 |

程式依據：`electron/lib/vocalSeparation.js`、`electron/main/separationHandlers.js`、`electron/lib/config.js`、`src/components/settings/SeparationGpuSettingsRow.vue`、`scripts/research/lyricsAcoustic/frontend.cjs`、`electron/lib/lyricsAcoustic/probe.js`、`scripts/research/lyricsAcoustic/decoder.py`、`electron/lib/lyricsResearch/engine.js`、`scripts/research/lyricsFreshEvaluation/trial-assets.json`、`resources/audio-processing/structure_analysis_worker.py` 與現有 analysis lock。既有分離決策見 [ADR-0017](../../adr/0017-directml-execution-provider-for-mdx-separation.md)。

## 本機確認與限制

唯讀硬體查核確認 NVIDIA GeForce RTX 5060 Ti，`nvidia-smi` 回報顯存 16,311 MiB、driver 617.14；另有 AMD Radeon 內顯。CIM 的 AdapterRAM 不用作顯存容量依據。

初次盤點只確認 `onnxruntime-node` 登錄 CPU、DML、WebGPU，當時未跑新推論。其後有界對照另以 DXGI 與 ORT profile 確認 NVIDIA adapter、實際 DML／CPU 混合節點配置及耗時；結果與限制保留於上述日期報告，不能擴張為所有歌曲的品質等價或產品加速承諾。

DirectML 預設 adapter 0 不保證是獨顯；應由 main 派生裝置選擇並記錄實際 adapter。變長輸入需實測，且 DirectML 的 session 選項與同 session 執行限制需個別確認，不能照搬 CPU 設定。[官方 DirectML 說明](https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html)

## 共用設定提案（暫緩）

原提案是將現有分離開關提升為「優先使用 GPU 加速」，不增加各功能重複開關。以下均未採用，不更名或遷移現有設定；只有未來明確重啟此工作時才重新評估。開關若實作只代表運算偏好，不授權下載、啟用功能或放寬 gate，亦不影響 Electron 畫面或 OBS 硬體加速。

- 單一 main-owned 布林偏好，例如 `processingGpuAcceleration`；缺值時繼承舊 `separationGpuAcceleration` 的明確 true／false，再採既有預設 true，保留使用者關閉選擇。
- 每個 job 開始時取偏好快照；開啟選擇已驗證且已安裝的 GPU backend，否則 CPU；關閉使用 CPU。變更只影響後續工作。
- 各模組接受小型執行選項或計畫，不互相匯入 feature composable、session 或環境。renderer 只送布林意圖，不指定 backend、路徑或裝置。
- 實際執行狀態分開記錄 requested、actual backend 與有界 fallback reason；一個模組失敗不應把其他模組全域判成無 GPU。
- 能力結果依模型、runtime、driver／adapter 分開驗證。ORT 仍只在隔離 worker／child 載入，main 不建立 native GPU session。
- Provider Python、Audio Python 與歌詞研究環境維持各自生命週期。GPU 偏好不能觸發隱藏下載或在既有環境內自動替換套件。

## 排程、取消與回退提案（未實作）

共用偏好不需要共用模型服務；但不同工作同時使用同一 GPU 時，需要輕量資源協調。初期建議同一時間僅一個重型 GPU 推論階段，完成即釋放，CPU 工作不被整段鎖住。這可避免下一首分離與上一首自動歌詞分析疊加，也減少與 OBS 爭用資源；不保證完全消除 OBS 影響。

初始化／推論失敗或顯存不足，僅對可安全重跑階段做一次有界 CPU 重試；未完成輸出不得發布，已成功伴奏、來源歌詞、T2 優先及 T1 回退保留。取消須清理並停止，不能當 GPU 失敗再啟動 CPU。Native crash 依賴程序隔離與監看，不能只靠 JavaScript catch。

Whisper 現有逐句啟動會重複載入模型，GPU 啟動成本也可能抵銷收益。原 context 重用提案亦暫緩；若未來另行評估，仍須保留逐句盲轉寫範圍、時鐘、取消與內容門檻，不因追求速度改成把待驗歌詞餵給辨識器。

## 研究結案與未做

HubertFA 對照與 small 成本盤點已完成，數據不重跑或改寫。small Vulkan／CUDA 下載、SDK 建置、GPU 實測、context 重用、Beat This!／all-in-one GPU 能力鎖、共用設定遷移與跨工作 GPU 資源協調尚未完成，現階段均暫緩。CPU 足夠是目前的投入決定，不等於這些候選已失敗、已驗證或自動列入下一輪。

若未來因實際等待成本重啟，仍須固定歌曲／來源／offset／配方，比較冷暖載入、整體耗時、RAM／顯存與內容／時間差異，並補齊無 GPU、OOM、native crash、取消與跨工作資源釋放。現有四案不代表這些全部驗收；人工時間仍獨立 pending。
