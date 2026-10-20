# 研究索引

研究保存當輪方法、分母與限制，不代表產品狀態；現況見[規格](../spec.md)。舊數字不回改，新結論寫進該主題入口。私有歌曲與人工標註不隨專案分發。

## 歌詞時間與聲學對齊

入口：[研究結論](lyrics-alignment/lyrics-alignment-summary.md)；操作見[本機試用手冊](../operations/lyrics-alignment-research.md)；原始數據在 [data](lyrics-alignment/data/)。

- 10-21：[混語長句兩段顯示](lyrics-alignment/lyrics-mixed-phrases-2026-10-21.md)
- 10-20：[純英文 T1+ 與回退](lyrics-alignment/lyrics-english-validation-2026-10-20.md)
- 10-19 模型選型：[模型配對與完整成本](lyrics-alignment/lyrics-model-pairing-2026-10-19.md)、[配對聽查案例](lyrics-alignment/lyrics-model-pair-listening-2026-10-19.md)、[LyricFloat 成本](lyrics-alignment/lyricfloat-cost-2026-10-19.md)、[HubertFA＋small 試用](lyrics-alignment/lyrics-hfa-small-listening-trial-2026-10-19.md)、[HubertFA 新曲配對](lyrics-alignment/lyrics-hubertfa-fresh-2026-10-19.md)、[small 誤拒與 Qwen 退步](lyrics-alignment/lyrics-root-causes-and-noncommercial-2026-10-19.md)、[新 16 案對照](lyrics-alignment/lyrics-fresh-decision-2026-10-19.md)、[人聲活動與內容一致性](lyrics-alignment/lyrics-qwen-quality-2026-10-19.md)、[方法族比較](lyrics-alignment/lyrics-alignment-methods-comparison-2026-10-19.md)、[Qwen3／Whisper.cpp 配方](lyrics-alignment/lyrics-alignment-candidates-2026-10-19.md)
- 10-19 環境與實作：[權重與字典授權](lyrics-alignment/lyrics-acoustic-weight-license-gate-2026-10-19.md)、[環境生命週期](lyrics-alignment/lyrics-acoustic-lifecycle-2026-10-19.md)、[環境完整性](lyrics-alignment/lyrics-acoustic-environment-readiness-2026-10-19.md)、[HubertFA 第二階段](lyrics-alignment/lyrics-acoustic-phase2-2026-10-19.md)、[獨立估計實作評估](lyrics-alignment/lyrics-acoustic-segmentation-implementation-assessment-2026-10-19.md)、[T1 句內切分](lyrics-alignment/lyrics-t1-acoustic-segmentation-2026-10-19.md)
- 10-18：[中日韓早期實測](lyrics-alignment/lyrics-alignment-cjk-evaluation-2026-10-18.md)、[第一輪實測](lyrics-alignment/lyrics-alignment-pilot-2026-10-18.md)、[初始方法調查](lyrics-alignment/lyrics-audio-alignment-evaluation-2026-10-18.md)

## 歌詞來源

- [來源與使用邊界](lyrics-providers/lyrics-provider-commercial-evaluation-2026-08-31.md)（08-31）、[NetEase／Kugou 對照](lyrics-providers/lyrics-provider-technical-evaluation-2026-09-01.md)（09-01）
- [LRCLIB 逐字驗證](lyrics-providers/lrclib-t2-live-validation-2026-08-24.md)（08-24）、[NetEase 隔離驗證](lyrics-providers/netease-isolated-technical-validation-2026-08-28.md)（08-28）

## 音訊處理與分析

- [GPU 共用偏好](audio/processing-gpu-shared-preference-2026-10-21.md)（10-21）：目前只有分離接 GPU
- 分離（08-22～23）：[ONNX CPU 基線](audio/audio-processing-baseline-2026-08-22.md)、[模型調查](audio/audio-processing-model-review-2026-08-23.md)、[HQ3／HQ4](audio/audio-processing-hq3-hq4-kpop-benchmark-2026-08-23.md)、[CPU lock](audio/audio-python-separation-cpu-spike-2026-08-23.md)
- 分析（08-24～28）：[Beat This!](audio/audio-python-beat-this-m1-spike-2026-08-24.md)、[結構分析](audio/audio-python-analysis-structure-spike-2026-08-24.md)、[模型調查](audio/music-analysis-model-survey-2026-08-24.md)、[BPM 正規化](audio/music-analysis-bpm-normalization-2026-08-28.md)

## 其他

- 識別：[封面來源](metadata/online-artwork-provider-evaluation-2026-09-27.md)（09-27）、[MusicBrainz 覆蓋率](metadata/musicbrainz-artist-coverage-2026-10-05.md)、[演出者照片](metadata/artist-photo-sources-2026-10-05.md)（10-05）
- 效能與安全：[啟動與 Settings](engineering/startup-settings-profile-2026-10-18.md)、[Output 首幀](engineering/output-first-frame-profile-2026-10-18.md)、[BGM 啟動](engineering/bgm-startup-profile-2026-10-18.md)（10-18）、[依賴安全](engineering/dependency-security-review-2026-10-16.md)（10-16）
- 視覺：[Row／Grid 收束](design/track-collection-row-consolidation-proposal-2026-10-14.md)（10-14）、[Apple HIG](design/apple-hig-alignment-review-2026-09-15.md)（09-15）、[視覺 foundation](design/visual-system-foundation-2026-08-28.md)、[元件 foundation](design/ui-component-foundation-2026-08-28.md)（08-28）、[方向比較](design/visual-direction-options-2026-08-25.md)、[早期探索](design/visual-system-discovery-2026-08-25.md)（08-25）、[參考網站結構](design/nintendo-wonder-reference-structure.md)
- 產品：[競品調查](product/competitive-research.md)、[外觀贊助模式](product/appearance-support-models-market-plan-2026-10-20.md)（10-20）、[v0.4.0 公開網站稿](product/public-site-content-v0.4.0.md)
