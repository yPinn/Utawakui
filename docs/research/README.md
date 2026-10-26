# 研究索引

研究保存當輪方法、分母與限制，不代表產品狀態；現況見[規格](../spec.md)。舊數字不回改，新結論寫進該主題入口。私有歌曲與人工標註不隨專案分發。

## 歌詞時間與聲學對齊

入口：[研究結論](lyrics-alignment/lyrics-alignment-summary.md)；操作見[本機試用手冊](../operations/lyrics-alignment-research.md)；原始數據在 [data](lyrics-alignment/data)。

- 10-22：[offset 與內容證據收斂](lyrics-alignment/lyrics-alignment-summary.md#offset-與內容證據)：前段不足後完成內容／定位／時間分離的固定快取離線對照，仍不可校時；中後段未補測、未接產品。原方案與日期證據由研究結論追溯。
- 10-22：[歌詞顯示階段整理](../archive/lyrics-display-performance-2026-10.md#階段總結2026-10-22)：長句容量、時鐘配對、中日細時間與本地／Focus 連續填色已實作；保留舊資料回退及冷暖慢值，人工時間品質未驗。
- 10-22：[T1+ 細部時間與顯示時鐘](lyrics-alignment/lyrics-fine-timing-clock-2026-10-22.md)：實作前研究，確認可擷取細區間與時鐘問題；當輪未實作掃字，後續交付見階段整理。
- 10-21：[逐句 CPU 分流方法與驗證](lyrics-alignment/lyrics-mixed-cpu-feasibility-2026-10-21.md)、[句內混語有界研究結案](lyrics-alignment/lyrics-mixed-cpu-bounded-2026-10-21.md)、[混語長句兩段顯示](lyrics-alignment/lyrics-mixed-phrases-2026-10-21.md)；現行採用決策統一見研究結論。
- 10-20：[純英文 T1+ 與回退](lyrics-alignment/lyrics-english-validation-2026-10-20.md)
- 10-19 模型選型：[模型配對與完整成本](lyrics-alignment/lyrics-model-pairing-2026-10-19.md)、[配對聽查案例](lyrics-alignment/lyrics-model-pair-listening-2026-10-19.md)、[LyricFloat 成本](lyrics-alignment/lyricfloat-cost-2026-10-19.md)、[HubertFA＋small 試用](lyrics-alignment/lyrics-hfa-small-listening-trial-2026-10-19.md)、[HubertFA 新曲配對](lyrics-alignment/lyrics-hubertfa-fresh-2026-10-19.md)、[small 誤拒與 Qwen 退步](lyrics-alignment/lyrics-root-causes-and-noncommercial-2026-10-19.md)、[新 16 案對照](lyrics-alignment/lyrics-fresh-decision-2026-10-19.md)、[人聲活動與內容一致性](lyrics-alignment/lyrics-qwen-quality-2026-10-19.md)、[方法族比較](lyrics-alignment/lyrics-alignment-methods-comparison-2026-10-19.md)、[Qwen3／Whisper.cpp 配方](lyrics-alignment/lyrics-alignment-candidates-2026-10-19.md)
- 10-19 環境與實作：[權重與字典授權](lyrics-alignment/lyrics-acoustic-weight-license-gate-2026-10-19.md)、[環境生命週期](lyrics-alignment/lyrics-acoustic-lifecycle-2026-10-19.md)、[環境完整性](lyrics-alignment/lyrics-acoustic-environment-readiness-2026-10-19.md)、[HubertFA 第二階段](lyrics-alignment/lyrics-acoustic-phase2-2026-10-19.md)、[獨立估計實作評估](lyrics-alignment/lyrics-acoustic-segmentation-implementation-assessment-2026-10-19.md)、[T1 句內切分](lyrics-alignment/lyrics-t1-acoustic-segmentation-2026-10-19.md)
- 10-18：[中日韓早期實測](lyrics-alignment/lyrics-alignment-cjk-evaluation-2026-10-18.md)、[第一輪實測](lyrics-alignment/lyrics-alignment-pilot-2026-10-18.md)、[初始方法調查](lyrics-alignment/lyrics-audio-alignment-evaluation-2026-10-18.md)

## 歌詞文字預處理

- [來源合塊合成留出結果](lyrics-text-holdout-results-2026-10-23.md)（10-23）：100 新 occurrence、固定 120 請求；110 完成／1 超時停止／9 缺測。空白合句有局部訊號，全體未優於標點對照，和聲與混合塊分類仍有風險；代理參考、無母語盲審，未接產品。
- [來源合併塊盲測計畫](lyrics-text-blind-validation-plan-2026-10-23.md)（10-23）：C 完整預覽與獨立分類的 100 個新案例設計、多答案／日文依附／空白與長區間負例、同字用途歧義及 120 次請求成本提案；尚未製作正式題目或完成母語盲審，未跑模型、未接產品。
- [4B 任務分離與候選斷點對照](lyrics-text-qwen-ablation-2026-10-23.md)（10-23）：100 次固定離線對照；完整左右預覽改善拆句，幾何縮減候選有退步；獨立分類保留實唱／對唱／和聲。全部失敗與成本保留，未接產品、未改原文或時間。
- [Qwen3.5 CPU 實測](lyrics-text-qwen-pilot-2026-10-23.md)（10-23）：2B／4B 各 60 案與 8 次獨立診斷；4B 製作資訊分類較佳，語意分組仍過切／角色落單，未達採用證據；原文及時間未改、未接產品。
- [模型輔助可行性](lyrics-text-preprocessing-feasibility-2026-10-23.md)（10-23）：五語系 60 個自製案例與規則基線、語意斷句／製作資訊候選、文字與時間保真、本機模型成本及離線實驗規格；未下載／執行文字模型、未接產品。

## 歌詞來源

- [來源與使用邊界](lyrics-providers/lyrics-provider-commercial-evaluation-2026-08-31.md)（08-31）、[NetEase／Kugou 對照](lyrics-providers/lyrics-provider-technical-evaluation-2026-09-01.md)（09-01）
- [LRCLIB 逐字驗證](lyrics-providers/lrclib-t2-live-validation-2026-08-24.md)（08-24）、[NetEase 隔離驗證](lyrics-providers/netease-isolated-technical-validation-2026-08-28.md)（08-28）

## 音訊處理與分析

- [播放偶發失真實驗方案](engineering/playback-distortion-investigation-2026-10-26.md)與[第一階段診斷結果](engineering/playback-distortion-diagnostics-2026-10-26.md)（10-26）：隔離時間線／25 秒 PCM、三種編碼原曲對照與 capture pitch 初始化競態修正；電子音根因仍未定位，真實裝置／OBS 未驗。
- [HubertFA CPU／DirectML 對照](audio/lyrics-hubertfa-directml-2026-10-21.md)（10-21）：四案實測完成，未接產品
- [Whisper small GPU 容量與投入](audio/whisper-small-gpu-cost-2026-10-21.md)（10-21）：成本評估完成，GPU 實測暫緩
- [GPU 共用偏好](audio/processing-gpu-shared-preference-2026-10-21.md)（10-21）：提案暫緩；目前 CPU 足夠，既有分離 DirectML 不變
- 分離（08-22～23）：[ONNX CPU 基線](audio/audio-processing-baseline-2026-08-22.md)、[模型調查](audio/audio-processing-model-review-2026-08-23.md)、[HQ3／HQ4](audio/audio-processing-hq3-hq4-kpop-benchmark-2026-08-23.md)、[CPU lock](audio/audio-python-separation-cpu-spike-2026-08-23.md)
- 分析（08-24～28）：[Beat This!](audio/audio-python-beat-this-m1-spike-2026-08-24.md)、[結構分析](audio/audio-python-analysis-structure-spike-2026-08-24.md)、[模型調查](audio/music-analysis-model-survey-2026-08-24.md)、[BPM 正規化](audio/music-analysis-bpm-normalization-2026-08-28.md)

## 其他

- 識別：[封面來源](metadata/online-artwork-provider-evaluation-2026-09-27.md)（09-27）、[MusicBrainz 覆蓋率](metadata/musicbrainz-artist-coverage-2026-10-05.md)、[演出者照片](metadata/artist-photo-sources-2026-10-05.md)（10-05）
- 效能與安全：[啟動與 Settings](engineering/startup-settings-profile-2026-10-18.md)、[Output 首幀](engineering/output-first-frame-profile-2026-10-18.md)、[BGM 啟動](engineering/bgm-startup-profile-2026-10-18.md)（10-18）、[依賴安全](engineering/dependency-security-review-2026-10-16.md)（10-16）
- [防禦編程與發行防護檢查](engineering/defensive-security-review-2026-10-26.md)（10-26）：Windows 名稱／ZIP 邊界、獨立工具修補、fuse 實測及尚未啟用的更新簽章。
- [正式 runtime 打包驗證](engineering/runtime-packaging-verification-2026-10-26.md)（10-26）：六個壓縮入口、三個自有 unpacked 檔、啟動／播放與四聲道輸出比對。
- [輕量混淆候選評估](engineering/light-obfuscation-assessment-2026-10-26.md)與[第一批正式驗證](engineering/light-symbols-verification-2026-10-26.md)（10-26）：Main 兩個規則模組的私有符號轉換、實際 ASAR 邊界、播放與四聲道管線、兩輪各十冷／十暖交錯量測；第二批未啟用。
- 視覺：[Row／Grid 收束](design/track-collection-row-consolidation-proposal-2026-10-14.md)（10-14）、[Apple HIG](design/apple-hig-alignment-review-2026-09-15.md)（09-15）、[視覺系統選型與遷移沿革](../archive/visual-system-evolution.md)、[參考網站結構](design/nintendo-wonder-reference-structure.md)
- 產品：[競品調查](product/competitive-research.md)、[外觀贊助模式](product/appearance-support-models-market-plan-2026-10-20.md)（10-20）、[v0.4.0 公開網站稿](product/public-site-content-v0.4.0.md)
