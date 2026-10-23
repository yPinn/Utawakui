# v2→v3 歌詞分析唯讀相容（2026-10-23）

歷史狀態註記：本報告保留唯讀相容實作當時的測試與實播數字。後續 KTV 交接與四處過快補尾修正見[修正驗收](lyrics-handoff-fallback-2026-10-23.md)；相容不改善原始對齊。文末與 JSON 另列本次分類提交候選的驗證，不把歷史實播冒稱新實播。

本輪完成前次核准的嚴格唯讀相容與記憶體 ID 映射。既有分析、canonical 與模型時間不回寫；仍須明確套用，不自動重新分析。數字與所有慢值見[驗證收據](lyrics-readonly-compatibility-2026-10-23.json)。先前 [v2 stale 調查](lyrics-local-cue-pauses-2026-10-23.md) 是修正前的歷史狀態，不回改原收據。

## 相容與回覆邊界

原 strict loader 優先。只有已知的 normalizer v2→v3、封套 v5／schema 2／當前方法 4、無 timing sidecar 的純 T1 候選，才能嘗試相容。Main 以目前完整內容建立應有的舊身分候選，必須精確重現原完整 generation identity，再通過未放寬的 routing、配方、資料範圍與內容摘要驗證。來源／音訊／timing／offset metadata 亦須明確相符。文字相似、profile 改標或只比對全文串接都不足以放行。

通過後只映射 occurrence ID 並產生衍生 estimate ID。完整文字、粗起點、fine 範圍／起訖、unsupported 狀態與原因、警告及已知停頓必須逐值一致；若 factory 丟棄任何可選細證據，相容也會拒絕。人工／provider T2 與已保存 timing 的權威不變，未知版本、損壞、音訊／來源／offset／方法變動仍不放行。

`estimateCompatibility.js` 只有最多八筆凍結的記憶體 memo，以完整 input identity、source revision、原 sidecar bytes SHA 與規則版本為 key，不落磁碟。loader 在準備前後核對 fd／pathname stamp，命中 memo 仍檢查結果檔是否被改寫／替換。`estimateReader.js` 在非同步 input 載入後及回覆前重驗功能開關、曲庫與來源；過期資料回 stale，不把舊結果套給新來源。

這些工作只在來源讀取執行，不進播放器／動畫 tick，不加平滑等待或模型依賴。原歌詞在載入期間仍可用。UI 簡短標示「沿用既有分析，時間未變」，套用預設仍關閉。相容失敗不入列分析，也不寫相容快取。

## 精確版本與程式驗證

隔離 snapshot 由 `a65de392` 加已核准保留的歌詞變更及本輪範圍建立，排除其他 UI、佇列與研究。先補回歸再實作；最終 1,015 檔、9,726 tests passed、1 skipped。聚焦 52 tests passed；兩個 helper 合計 statements 96.1%、branches 87.27%、functions 100%、lines 97.1%。修改檔 lint／format、Markdown 與 build 通過，既有大 chunk 警告保留。唯讀 code review 通過。

回歸涵蓋完整舊 identity 的直接 witness 拒絕、空白／文字／起訖／終點來源、原生 T2 與 timing sidecar 邊界、方法／routing／schema／細終點、重新計算摘要的錯誤 source／audio metadata、三種真 parser 行為差異、結果替換，以及 gate／曲庫／來源的前後競態。實際歌詞或音訊檔在準備後變動，即使命中記憶體投影也回 stale。

初版 TDD 的缺少 reader／相容拒絕、起點 fixture 不一致、既有手動套用測試的呼叫數斷言及 ESLint 未使用解構失敗皆保留收據。首次覆蓋量測因 CJS 間接 require 未被 instrumentation 計入，helper 顯示零並未過門檻；補直接 helper 合約斷言、仍使用真 strict loader 認證後，隔離覆蓋與完整測試重新通過。沒有改產品斷言來掩蓋失敗。

## 《找》目前 v3 正式路徑

| 來源    | 目前 profile | 原句 | fine 單位 | 已知停頓 | 起點／停頓／恢復定點 |
| ------- | ------------ | ---- | --------- | -------- | -------------------- |
| LRCLIB  | v3           | 36   | 225       | 51       | 6                    |
| NetEase | v3           | 32   | 216       | 51       | 6                    |

此次由完整 Main／preload、真播放器／audio clock、useLyrics／useExperimentalLyrics 與 publisher 取得 v3 相容結果，未注入舊 v2 preview，也未改綁 sidecar 身分。兩來源套用前均為關閉，明確套用後逐值比對原 sidecar evidence，相容資訊與畫面提示均正確。各做 65–72 秒自然播放、暖重播與一段已知停頓；停頓內部排除兩側各 50 ms 的觀察量化邊界後，LRCLIB 2,150 筆、NetEase 98 筆均保留原句 marker、沒有底線。原始邊界樣本仍保留。已目視本地螢光筆與提示、Focus／KTV 及假名截圖。

隔離方式有明確邊界：原分析 generation identity 綁定原曲庫路徑與檔案 stamp，直接搬到副本會失效。因此測試僅將「分析 reader 的曲庫解析依賴」指向唯讀原始曲庫，讓真 reader／compatibility 驗證原身分；播放器、偏好、讀音與其他寫入使用複製 profile／曲庫。沒有 renderer preview stub、模型時間改寫或 sidecar identity 造假。正式資料共 24 檔 SHA 前後不變。

KTV 使用註冊模板與正式 Main Output server；Focus 使用既有 `focus-line` 相容 renderer，由另一 server 接收同一批已被正式 Main 接受的 v3 publication。`focus-line` 不在目前公開設定 registry，這輪沒有把它重新加入或改模板。測試會核對真實 template ID。這證明 Focus renderer 的資料／連續填色相容，不宣稱它已成為目前可選模板。

首次探針把 Focus 當公開可選模板而收到正確拒絕，其內部 code 0／passed 標籤不算 Focus 驗收，完整原始數據另存為未接受。修正探針後，正式流程完成；但 LRCLIB 首輪與暖重播的 Output rAF 陣列為空，仍列缺測，不當成零延遲。另一次可見補播也有零樣本，保留為失敗。最終補播在兩個 640×360 並列、置頂的自有視窗先做 preflight capture，再自然重播 65–72 秒，取得 KTV 1,274／Focus 1,273 畫格、其中 970／968 筆含部分填色；KTV 所有觀測均無底線。這是暖設定的功能補驗，不是冷啟動或 A/B 效能證明。CSS 填色值為 0–100 百分比，部分填色按大於 0、小於 100 計數。

## RASEN T2 與時間成本

RASEN 使用目前完整 Main／preload／播放器與原生 T2，11 定點、167 筆句間自然觀測及 163 筆末句觀測通過，renderer／player error 為零。包含跨假名「出し」、空白不畫底線、句間保留最後 marker 與下一原起點切換。其 timing 不進相容重映射。開發程序原有非 props attribute 警告留存，未修改其他 UI。

在 Electron Node 模式另外對正式來源 reader 各讀三次：LRCLIB 28.122／8.311／11.388 ms；NetEase 15.448／8.530／8.797 ms。第二、三次重用同一凍結 preview。數字包含既有來源／音訊雜湊、filesystem guard 及相容處理，沒有 IPC／paint，也沒有配對舊版基準，不能全部歸因為新增相容成本或解讀成顯示延遲。

以下為正式流程的原始畫格間隔最大值，單位 ms。均在靜態準備後觀察，不稱冷啟動，包含觀測成本，不刪慢值。

| 來源    | 畫面  | 首輪自然播放 | 暖重播 | 已知停頓自然播放 |
| ------- | ----- | ------------ | ------ | ---------------- |
| LRCLIB  | 本地  | 11.6         | 11.3   | 26.0             |
| LRCLIB  | KTV   | 缺測         | 缺測   | 20.8             |
| LRCLIB  | Focus | 缺測         | 缺測   | 20.8             |
| NetEase | 本地  | 20.7         | 19.2   | 10.7             |
| NetEase | KTV   | 22.6         | 19.5   | 10.9             |
| NetEase | Focus | 21.5         | 19.4   | 10.9             |

可見補驗 KTV／Focus 最大間隔為 25.1／24.8 ms，布局與前置操作不同，另列、不替換缺測。失敗版本的所有慢值與原始逐筆數據亦保留。公開 JSON 保留原始收據 SHA、分母、p95、最大值與每筆超過 16 ms 的間隔；16 ms 只是列舉門檻，不是接受標準。本機完整原始數據、截圖與失敗在 ignored 的 `tasks/lyrics-v3-readonly-compat-20261023/`。

## 保留限制與收尾

相容只是證明舊分析可以安全接到目前 canonical，不改善模型原有句尾／漏詞／間奏或 unsupported 判斷，不加入新終點。移動曲庫、檔案 stamp／Node／ICU／模型配方或實際內容變動而無法重現完整舊 identity 時仍維持 stale；不自動修復或重新分析。若要改善對齊，需另行明確分析與人工驗收。

GPU 沒有新增候選或 trace，歷史慢值與撤回結論不變。這輪不是聽唱真值或 OBS 人工接受。正式來源、其他工作、HEAD／index 與自有程序的最終核對記在本輪收據；未 commit／push。

## 本次分類提交驗證

本次只納入核准的 29 路徑歌詞差異；第一組 `5592ee90` 以本地 cue／已知停頓為範圍，5 檔 62 聚焦與 16 檔 243 相關 tests passed；第二組 `9325b814` 為嚴格唯讀相容，4 檔 45 聚焦與 9 檔 95 相關 tests passed。各組 lint／format 與覆核通過，Git hooks 保留。其他 UI／佇列／Output 模板及研究不納入，不 push。

本輪沒有新播放器／Output 實播或模型分析，原有實播、失敗、缺測與慢值仍以原報告／原始收據為準。本次精確累積候選重新驗證的結果另列於下段，不以舊全庫數字代替。

本次從 `17b617b3` 建立的精確累積候選重新通過 1,016 個測試檔、9,746 tests passed、1 skipped，以及 build 與既有封裝／依賴邊界回歸。既有大 chunk 警告保留；沒有產出新安裝包、OBS 或新實播驗收。三份原 JSON 所有既有欄位、三份 MD 原歷史本文、十份原始收據 SHA 均核對保留；更正只追加。初次 B 聚焦測試因 sandbox 暫存 fixture 原子重新命名 EPERM 得到 27 failed／18 passed，相同候選在允許環境重跑通過；失敗 log 保留，沒有改斷言。
