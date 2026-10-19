# 研究文件索引

研究文件保存當輪方法、資料分母、環境與限制；不作為產品可用狀態或操作手冊。產品現況見[規格](../spec.md)，現行視覺規則見[DESIGN](../../DESIGN.md)。

歌詞模型先讀[研究結論](lyrics-alignment-summary.md)，實際執行見[本機研究試用手冊](../operations/lyrics-alignment-research.md)。以下日期報告保留證據，不按檔名或單一分數替代跨批次判讀；原始JSON在[data](data/)，私有歌曲／人工標註不隨專案分發。

## 歌詞時間與聲學對齊

| 文件                                                                                            | 日期       |
| ----------------------------------------------------------------------------------------------- | ---------- |
| [HubertFA＋small漏詞／誤拒、試用驗證與失敗紀錄](lyrics-hfa-small-listening-trial-2026-10-19.md) | 2026-10-19 |
| [原HubertFA新曲配對、錯配與特定權重查核](lyrics-hubertfa-fresh-2026-10-19.md)                   | 2026-10-19 |
| [small誤拒、Qwen日文退步與低成本消融](lyrics-root-causes-and-noncommercial-2026-10-19.md)       | 2026-10-19 |
| [新中日16案的原始Qwen／small對照](lyrics-fresh-decision-2026-10-19.md)                          | 2026-10-19 |
| [人聲活動、內容一致性與保留分母](lyrics-qwen-quality-2026-10-19.md)                             | 2026-10-19 |
| [方法族、漸進環境與未測候選](lyrics-alignment-methods-comparison-2026-10-19.md)                 | 2026-10-19 |
| [Qwen3／Whisper.cpp配方與環境容量](lyrics-alignment-candidates-2026-10-19.md)                   | 2026-10-19 |
| [權重、字典與分發證據](lyrics-acoustic-weight-license-gate-2026-10-19.md)                       | 2026-10-19 |
| [選配環境準備／載入／修復／取消／移除](lyrics-acoustic-lifecycle-2026-10-19.md)                 | 2026-10-19 |
| [Basic與選配完整性稽核](lyrics-acoustic-environment-readiness-2026-10-19.md)                    | 2026-10-19 |
| [原HubertFA第二階段實跑](lyrics-acoustic-phase2-2026-10-19.md)                                  | 2026-10-19 |
| [獨立估計契約與實作評估](lyrics-acoustic-segmentation-implementation-assessment-2026-10-19.md)  | 2026-10-19 |
| [T1句內切分、節奏與模型消融](lyrics-t1-acoustic-segmentation-2026-10-19.md)                     | 2026-10-19 |
| [中日韓活動／重複句／段落早期實測](lyrics-alignment-cjk-evaluation-2026-10-18.md)               | 2026-10-18 |
| [第一輪實測與漸進模型選型](lyrics-alignment-pilot-2026-10-18.md)                                | 2026-10-18 |
| [初始方法調查與環境配置評估](lyrics-audio-alignment-evaluation-2026-10-18.md)                   | 2026-10-18 |

## 歌詞來源

| 文件                                                                              | 用途       |
| --------------------------------------------------------------------------------- | ---------- |
| [歌詞供應來源與產品使用邊界](lyrics-provider-commercial-evaluation-2026-08-31.md) | 2026-08-31 |
| [NetEase／Kugou技術對照](lyrics-provider-technical-evaluation-2026-09-01.md)      | 2026-09-01 |
| [LRCLIB逐字時間驗證](lrclib-t2-live-validation-2026-08-24.md)                     | 2026-08-24 |
| [NetEase隔離技術驗證](netease-isolated-technical-validation-2026-08-28.md)        | 2026-08-28 |

## 音訊處理與音樂分析

| 文件                                                                          | 用途       |
| ----------------------------------------------------------------------------- | ---------- |
| [本機ONNX CPU基線](audio-processing-baseline-2026-08-22.md)                   | 2026-08-22 |
| [分離模型調查](audio-processing-model-review-2026-08-23.md)                   | 2026-08-23 |
| [HQ3／HQ4 K-pop對照](audio-processing-hq3-hq4-kpop-benchmark-2026-08-23.md)   | 2026-08-23 |
| [Audio Python分離與CPU lock](audio-python-separation-cpu-spike-2026-08-23.md) | 2026-08-23 |
| [Beat This! Windows CPU實驗](audio-python-beat-this-m1-spike-2026-08-24.md)   | 2026-08-24 |
| [歌曲結構分析實驗](audio-python-analysis-structure-spike-2026-08-24.md)       | 2026-08-24 |
| [音樂分析模型調查](music-analysis-model-survey-2026-08-24.md)                 | 2026-08-24 |
| [BPM正規化與指標](music-analysis-bpm-normalization-2026-08-28.md)             | 2026-08-28 |

## 歌曲與演出者識別

| 文件                                                                         | 用途       |
| ---------------------------------------------------------------------------- | ---------- |
| [封面來源與跨語言identity](online-artwork-provider-evaluation-2026-09-27.md) | 2026-09-27 |
| [MusicBrainz演出者覆蓋率](musicbrainz-artist-coverage-2026-10-05.md)         | 2026-10-05 |
| [演出者照片來源](artist-photo-sources-2026-10-05.md)                         | 2026-10-05 |

## 啟動與效能

| 文件                                                            | 用途       |
| --------------------------------------------------------------- | ---------- |
| [App啟動與Settings測量](startup-settings-profile-2026-10-18.md) | 2026-10-18 |
| [Output首幀測量](output-first-frame-profile-2026-10-18.md)      | 2026-10-18 |
| [BGM啟動依賴測量](bgm-startup-profile-2026-10-18.md)            | 2026-10-18 |

## 視覺、產品與公開內容

| 文件                                                                                            | 用途       |
| ----------------------------------------------------------------------------------------------- | ---------- |
| [競品調查與需求線索](competitive-research.md)                                                   | 日期見本文 |
| [Track Collection Row／Grid收束提案](track-collection-row-consolidation-proposal-2026-10-14.md) | 2026-10-14 |
| [v0.4.0公開網站內容核對稿](public-site-content-v0.4.0.md)                                       | 日期見本文 |
| [早期視覺探索](visual-system-discovery-2026-08-25.md)                                           | 2026-08-25 |
| [早期視覺方向比較](visual-direction-options-2026-08-25.md)                                      | 2026-08-25 |
| [早期視覺foundation](visual-system-foundation-2026-08-28.md)                                    | 2026-08-28 |
| [早期元件foundation](ui-component-foundation-2026-08-28.md)                                     | 2026-08-28 |
| [Apple HIG檢查](apple-hig-alignment-review-2026-09-15.md)                                       | 2026-09-15 |
| [參考網站布局與動態結構](nintendo-wonder-reference-structure.md)                                | 日期見本文 |

## 依賴安全

| 文件                                                         | 用途       |
| ------------------------------------------------------------ | ---------- |
| [當時依賴安全查核](dependency-security-review-2026-10-16.md) | 2026-10-16 |
