# 本地詞塊提示與已知停頓回歸（2026-10-23）

歷史狀態註記：本報告保留本地停頓階段的原始收據；其中 v2 在 v3 載入 stale／尚待相容決策屬當時狀態，後續嚴格唯讀處理見[相容報告](lyrics-readonly-compatibility-2026-10-23.md)。後續 KTV 交接與過快補尾已另行修正，見[修正驗收](lyrics-handoff-fallback-2026-10-23.md)。本地原始部分填色計數的百分比口徑勘誤追加於文末與 JSON，原欄位／原始觀測／缺測／慢值保留。

本輪接續 `a65de392`，只補本地 T1+ 詞塊內的已知停頓與說明落差。Output 程式、模板與模型時間沒有變更；GPU 排查維持收斂，沒有新的效能候選。數值與失敗紀錄見[驗證收據](lyrics-local-cue-pauses-2026-10-23.json)。

## 保留的行為與修正

本地 list／sheet 統一整句螢光筆與當前非空白詞塊的藍色底線，不再把本地描述成連續填色或累積進度底線。原生 T2、跨假名與原文空白沿用同一呈現；句間保留最後原句的 marker。分析摘要改稱「含細時間」，區分保留資料與畫面效果。

既有粗分段只知道起點與整個詞塊的 cue end，因而可能在兩個實際細單位之間的已知停頓仍畫底線。本輪新增本地索引，僅接受同一粗詞塊內、原文範圍相接的兩個有效 fine 單位：左終點必須嚴格晚於原粗起點，右起點不能超過下一粗起點或原句終點。停頓採左含右不含區間，只暫隱底線，不修改粗狀態、文字、假名、起訖或 Output 文件。

缺 end、缺覆蓋、跨詞塊與只有起點的資料不構成停頓證據；與原起點矛盾的 fine 不得延後起點即亮。兩側邊界沿既有 audio element clock 重採樣，不等待下一次 timeupdate，也不加動畫等待、補播或第二套時鐘。靜態區間按 line revision 快取並按 chunk 建索引，只有 active chunk 查詢，避免每次更新平方掃描。

Focus／KTV 保留連續填色與各自外觀，KTV 不加底線；本輪沒有改 Output、shared 投影或 sidecar。沒有引入 BPM、線上歌聲活動門檻或模型重分析。

## 驗證版本與接受範圍

只由基線 HEAD 加本輪明列歌詞檔案建立隔離 snapshot，不包含其他 UI、佇列、offset 與離線研究。先補失敗回歸，再修正：renderer 的 list／sheet、owner 的原起點／停頓／恢復與倒退 seek、clock 的兩側採樣皆曾失敗並轉綠；初版 owner fixture 的 fine ID 與粗 ID 衝突另存，不算產品失敗。另有 500 chunks／1,000 fine units 的容量隔離案例。

聚焦 5 檔 62 tests passed，新增 helper 的 lines／statements／functions 100%、branches 97.29%。完整隔離測試為 1,012 檔、9,690 tests passed、1 skipped；首輪因舊文案斷言有 1 failed／9,689 passed，更新斷言後重跑通過。修改檔 ESLint／Prettier、契約 Markdown 與 build 通過；既有大 chunk build 警告保留。Code review 發現的全行重複 lookup 已改成索引後獲得通過。

《找》的正式保存結果仍綁定 `lyrics-source-v2`，目前 normalizer 已是 `lyrics-source-v3`，正式載入檢查回傳 stale。本輪沒有遷移、改綁正式身分、回寫模型或重跑分析。隔離重播使用前輪保留、彼此身分一致的 v2 canonical／分析與原始音訊副本，搭配本輪 player、clock、owner、Panel、publisher、Hub、正式 Focus／KTV；其他 owner 以固定投影隔離。這證明舊資料的本地呈現與 Output 回歸，不能宣稱 v3 正式套用已驗收。兩來源各有 51 個符合條件的內部停頓；各選三處做起點／停頓／恢復共 9 個 DOM 定點，並做 65–72 秒自然播放、暖重播與一段已知停頓自然播放，完整文字沒有差異，沒有本地填色節點。

RASEN T2 另以目前隔離 snapshot 的完整 main／preload、實際播放器與 media scheme、正式 useLyrics 與演唱工具驗證。11 定點、166 筆句間自然觀測與 162 筆末句觀測通過，包含跨假名「出し」、空白不畫底線、5.822 秒句間 marker 保留與下一原起點換句。已目視本地停頓、當前底線、Focus／KTV 與 RASEN 截圖；沒有將這些觀測當作聽唱音準或 OBS 人工接受。RASEN 開發程序既有非 props attribute 警告留存，renderer／player error 為零。

正式來源共 24 檔前後 SHA 不變。測試只操作複製曲庫，未操作既有視窗；專用 Electron／Vite 在完成後退出。完整原始逐筆觀測、失敗、截圖與程序收據保存在本機 ignored 的 `tasks/lyrics-known-pauses-20261023/`，公開 JSON 保留原始收據 SHA、樣本數、p95、最大值及每筆超過 16 ms 的間隔。16 ms 僅為列出慢值的門檻，不是接受標準，原始樣本未刪除。

## 慢值與未解限制

下表為觀測畫格間隔最大值，單位 ms。含 DOM／style 採樣、視窗重疊與截圖成本，沒有配對基線，不是 GPU 成本拆解或效能改善證明。定點與初始化在自然播放之前，因此不稱冷啟動。Output 第一輪自然播放的觀測為空，照實列缺測；不能視為零延遲或冷啟動通過。

| 來源    | 畫面  | 首輪自然播放 | 暖重播 | 已知停頓自然播放 |
| ------- | ----- | ------------ | ------ | ---------------- |
| LRCLIB  | 本地  | 10.6         | 25.4   | 20.7             |
| LRCLIB  | Focus | 缺測         | 24.7   | 20.6             |
| LRCLIB  | KTV   | 缺測         | 21.4   | 20.7             |
| NetEase | 本地  | 10.6         | 30.3   | 18.8             |
| NetEase | Focus | 缺測         | 33.0   | 76.2             |
| NetEase | KTV   | 缺測         | 30.4   | 18.8             |

首次 LRCLIB 實播完成後，探針把 playTrack 重設至首句之前的 marker=0 誤判為失敗。原收據與慢值保留，修正為首句開始後才要求 marker，未刪前置樣本，再跑完整流程通過。正式《找》載入 stale 的初步診斷、不同 Node／ICU 下的讀取嘗試亦保留；未把診斷失敗當顯示成功。

尚未解決來源缺詞、模型句尾／對齊不足與推定句框含間奏的真實音準問題；本輪只尊重已有可靠細區間，未知停頓仍未知。舊 v2 結果如何在 v3 下安全相容或重新分析需另行決策，不能為了讓畫面套用而繞過身分檢查。歷史 GPU 慢值與候選撤回結論不改，76.2 ms 觀測保留但不展開新 GPU 排查。未 commit／push。

## 本次分類提交驗證

本次只納入核准的 29 路徑歌詞差異；第一組 `5592ee90` 以本地 cue／已知停頓為範圍，5 檔 62 聚焦與 16 檔 243 相關 tests passed；第二組 `9325b814` 為嚴格唯讀相容，4 檔 45 聚焦與 9 檔 95 相關 tests passed。各組 lint／format 與覆核通過，Git hooks 保留。其他 UI／佇列／Output 模板及研究不納入，不 push。

本輪沒有新播放器／Output 實播或模型分析，原有實播、失敗、缺測與慢值仍以原報告／原始收據為準。本次精確累積候選重新驗證的結果另列於下段，不以舊全庫數字代替。

## 部分填色計數追加勘誤

原 accepted replay 摘要的 `partialFillSamples` 使用 0–1 判斷，但原 CSS 值是 0–100 百分比；因此舊數量低估。以下以相同原始觀測重算，不是新實播。舊欄位與完整慢值／缺測不改；JSON 的 `measurementCorrections` 另存規則、分母、raw SHA 與包含缺測窗口的全部更正列。失敗回放不作接受證據。

| 來源    | 模板          | 窗口        | 舊計數 | 百分比更正計數 |
| ------- | ------------- | ----------- | ------ | -------------- |
| LRCLIB  | focus-line    | warm-replay | 15     | 1179           |
| LRCLIB  | focus-line    | known-pause | 1      | 154            |
| LRCLIB  | karaoke-stack | warm-replay | 15     | 1180           |
| LRCLIB  | karaoke-stack | known-pause | 0      | 78             |
| NetEase | focus-line    | warm-replay | 13     | 1154           |
| NetEase | focus-line    | known-pause | 2      | 122            |
| NetEase | karaoke-stack | warm-replay | 11     | 1154           |
| NetEase | karaoke-stack | known-pause | 0      | 134            |

本次從 `17b617b3` 建立的精確累積候選重新通過 1,016 個測試檔、9,746 tests passed、1 skipped，以及 build 與既有封裝／依賴邊界回歸。既有大 chunk 警告保留；沒有產出新安裝包、OBS 或新實播驗收。三份原 JSON 所有既有欄位、三份 MD 原歷史本文、十份原始收據 SHA 均核對保留；更正只追加。初次 B 聚焦測試因 sandbox 暫存 fixture 原子重新命名 EPERM 得到 27 failed／18 passed，相同候選在允許環境重跑通過；失敗 log 保留，沒有改斷言。
