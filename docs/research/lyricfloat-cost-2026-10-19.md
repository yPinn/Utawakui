# LyricFloat 校時配方：效果與完整環境成本重評

日期：2026-10-19。研究固定 [LyricFloat f448c24a](https://github.com/Din0326/LyricFloat/tree/f448c24a8af1dace06d1203ca826c404347f3dfd)，不移植其程式碼。這次只讀官方檔案 metadata，沒有安裝新 Python／Torch、下載模型或執行該配方；產品 gate 與現有模型選型不變。

## 決策

Demucs＋faster-whisper base／stable-ts 值得保留為有界研究候選，尚無理由取代現有 HubertFA＋small。它的模型檔比現有完整研究配方小，但需要另一套 Python、Torch、CTranslate2 與數值依賴；安裝後容量、RAM 和同條件品質尚未驗證。

優先順序為 provider 離線契約 → 同錄音版本時間軸差異提示 → 問題案例回流 → 模型配對實驗。前三項不需要新模型；固定研究資料與品質分母後，再決定是否值得支付新環境成本。

第四批已另完成[現有GGML base／small與既有guide配對](lyrics-model-pairing-2026-10-19.md)，新增下載0，不是本配方的stable-ts實跑。該報告補齊本機Node／FFmpeg／依賴與研究host容量；本頁保留原metadata口徑，不回填成已驗LyricFloat installed或品質。

## 可核對的下載清單

單位採十進位 MB／GB。依其 [runtime lock](https://github.com/Din0326/LyricFloat/blob/f448c24a8af1dace06d1203ca826c404347f3dfd/src/lyricfloat/align/runtime_lock.json)、[worker](https://github.com/Din0326/LyricFloat/blob/f448c24a8af1dace06d1203ca826c404347f3dfd/src/lyricfloat/align/worker.py) 與官方 metadata 核算；逐檔證據見 [JSON](data/lyricfloat-cost-2026-10-19.json)。

| 項目                                                 |       bytes |  約 MB | 證據界線                                                                                             |
| ---------------------------------------------------- | ----------: | -----: | ---------------------------------------------------------------------------------------------------- |
| CPython 3.12.10 embeddable archive                   |  11,133,606 |  11.13 | python.org HEAD Content-Length，未下載驗 SHA                                                         |
| pip、建置與執行套件                                  | 270,749,274 | 270.75 | 51 筆 lock entries、50 個 unique artifacts；每筆檔名／SHA 對上 PyPI metadata，packaging 重複只計一次 |
| faster-whisper base 與 tokenizer／config／vocabulary | 147,882,941 | 147.88 | 固定 Hugging Face commit 的四個必要檔案                                                              |
| HTDemucs safetensors 與 bag YAML                     |  84,025,461 |  84.03 | 固定 commit；依 worker 取檔邏輯，不加未讀取的旁支 JSON／README                                       |
| 去重後固定資產合計                                   | 513,791,282 | 513.79 | 約 0.514 GB；不是已實測的安裝或網路傳輸總量                                                          |

套件最大項為 Torch 124,113,906 bytes、llvmlite 41,865,553、PyAV 28,149,519、CTranslate2 19,222,069。來源為 `https://pypi.org/pypi/<name>/<version>/json`；模型 metadata 分別為 [Whisper base 固定版本](https://huggingface.co/api/models/Systran/faster-whisper-base/tree/ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66?recursive=true) 與 [HTDemucs 固定版本](https://huggingface.co/api/models/adefossez/HTDemucs/tree/cbc8a9b1a87023b7fd74e7b3412e6321c0eab003?recursive=true)。

此合計不含 App、其他系統 runtime、pip build 額外成本、模型快取布局重複、安裝／修復並存與歌曲 PCM。上游 README 的環境約 1 GB 是作者描述，本輪沒有重現，不填入「本機實測 installed」欄。CPU `compute_type: int8` 是執行設定，不能因此把上述 model.bin 當成磁碟上的 int8 壓縮版。

## 與現有證據對照

| 配方                           | 磁碟／下載口徑                                                                 | 效果與執行證據                                                                              | 判斷                                           |
| ------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Basic T1／匯入或人工 T2        | 新模型為零                                                                     | 現有穩定回退；人工 T2 仍優先                                                                | 維持預設                                       |
| 原 HubertFA 選配               | catalog 未快取下載 282,700,610 bytes；前輪非快取落盤約 0.485 GB                | 新配對日文 35 個可評內部切點：22 點≤100 ms、1 點>500 ms、5 點缺界；provider 參考非人工真值  | 現有主要起點估計候選；特定權重／字典證據仍未決 |
| HubertFA＋small 獨立內容檢查   | 現有研究下載清單九項合計 778,532,833 bytes；整套 installed／安裝峰值未重新合計 | 相同日文起點結果未改；配對構造錯片語／靜音目標各 3 案由全接受降為零輸出；其他壓力組仍有漏擋 | 沿用研究基準，品質與環境不能用單一數字代表     |
| LyricFloat 原配方              | 固定資產約 0.514 GB；installed／安裝峰值／RAM 未測                             | 分離後以已知歌詞強制對齊；缺少我們相同音訊、切點與錯內容分母的結果                          | 有機會降低下載量；尚無準確率或整體資源優勢結論 |
| Qwen3 FA 既有 float32 研究配方 | 前輪完整落盤約 2.903 GB，不含共用 FFmpeg                                       | 觀測 worker peak working set 6.101 GB；不是本輪重測                                         | 對環境量級較不利；目前不優先增加投入           |

現有容量與資源口徑見 [生命週期](lyrics-acoustic-lifecycle-2026-10-19.md)、[候選比較](lyrics-alignment-candidates-2026-10-19.md)；品質分母見 [新曲配對](lyrics-hubertfa-fresh-2026-10-19.md)、[small 內容檢查](lyrics-hfa-small-listening-trial-2026-10-19.md)。不能將歷史不同分母的百分比併入本表排行，也不能把兩個 worker 各自的峰值直接相加冒充整體並行峰值。

## 優先驗證的成本消融

1. 先用相同原曲窗口比較 faster-whisper base／stable-ts，不做新增分離。
2. 使用本專案已存在且身分相符的 guide-vocal artifact，檢查是否能改善同一 aligner；沒有該資產時仍需計入產生它的真實成本，不能視為免費。
3. 只有前兩者顯示足夠收益、仍受混音影響時，再比較原配方 HTDemucs 前處理。若不需要分離，重選實際依賴閉包並重新產生 lock／容量清單；不能只從原配方總量扣掉 84 MB 就宣稱已得輕量環境。
4. Whisper base／small 是不同大小與用途的變項。LyricFloat 的 base 強制對齊與我們的 small 獨立內容檢查不是同一任務；若保留內容驗證，需要另列其模型／時間成本。

正式選配的既有 Audio Python catalog 與 LyricFloat CPython 3.12 wheels 不可只因都是 Python 就共用。首次完整成本、已有相容環境的增量、已有分離資產的增量要分開；只有精確 runtime／ABI／版本／hash 相符才認列重用。

## 下一輪驗收條件

固定既有音訊與 canonical T1、原文切點、正常／錯片語／漏詞／靜音案例；保留所有要求與可評分母，同時報誤差、缺界、coverage、錯內容接受與正常誤拒。不得將低信心行的平移／插值當成新聲學證據；不得僅按文字長度映回後宣稱原文逐字正確。

同一 CPU threads／窗口下，記錄新程序載入、整個 job 耗時、實際 interpreter／模型 worker 的 working set 與 private、磁碟邏輯檔案、下載 artifact 與連續安裝峰值。App＋OBS 並行與較低 RAM 主機需獨立驗收，不能由目前開發機可執行推論可用。

本輪沒有品質勝負結論，也沒有安裝新模型。先完成上述小型配對與成本消融，再依收益決定是否擴大環境；研究輸出不寫 canonical T2，既有人工品質與權重 gate 保持。
