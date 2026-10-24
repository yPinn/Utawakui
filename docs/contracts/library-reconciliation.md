# 曲庫檢查、資訊校對與發行合併

## 權威與入口

設定的「曲庫資訊 → 校對」提供離線整庫掃描、逐欄比較與確認式發行合併。
結果列以「比較」開啟發行合併預覽、「校對」開啟曲目逐欄比較；可合併候選
不重複提示確認流程，無法合併時仍保留原因。儲存及 tags 寫入維持各自確認。
逐欄保留曲庫、音檔標籤及來源值比較，只在選擇變更後顯示「儲存後」結果。
欄位以共用 UiSelect／UiTextField 呈現，群組標題與可及名稱保留欄位脈絡，
不重複顯示完整欄名。採用本次來源與恢復跟隨來源仍為不同決策；
已保留分開的項目以「重新列入」撤回決策，與重新檢查整庫分開。
校對視窗沿用 UiModal small 高度上限（35rem），內容只由一個具名稱的
UiScrollLayout 捲動，底部操作保持在捲動區外；內容 padding 使用公開變數，
保留捲軸與鍵盤焦點空間。切換校對／合併預覽時回到內容頂部；長紀錄名稱可換行，
逐欄比較在窄視窗改為單欄，不截斷校對證據。
`electron/lib/reconciliation/` 持有文件快照、唯讀掃描、欄位決策、合併及 JSON 交易；
`reconciliationHandlers.js` 僅接受主視窗 main frame 的固定 intents。
來源更新仍由既有 provider gate、catalog runner 與 shared library lane 管理。

掃描不呼叫會遷移的 `listTracks`／`findTrackRecord`，只讀取既有 structured 與 legacy
音檔、索引、來源 manifest 及 sidecar；不連網、不移動檔案，也不寫入索引。
整檔 SHA-256 與檔案 stamp 用於驗證現有持有關係；相同 bytes 的不同 trackId
只列為音檔重複候選，不自動刪除或合併曲目。缺檔與讀不到 tags 分開呈現。

## 比較與欄位決策

目前曲庫值固定來自已保存的 index，音檔 tags 與來源 sidecar 值另外顯示。
比較畫面不把尚未儲存的觀察值冒充為目前值。來源原始標題、slotIdentity 及
錄音身分不由文字校對改寫。欄位涵蓋 title、artist、album、albumArtist、
releaseDate、releaseYear、trackNumber／trackTotal、discNumber／discTotal。

`library.json` 保存 scalar 值與各欄的 `<field>Origin`，不保存檔案路徑。
保留不變更；採用本次參考值與手動輸入都固定成 manual；明確清空保存空字串或 null
及 manual origin，下次離線整理、sidecar refresh、遷移及 provider backfill 不得補回。
title 必填；日期保留年、月或日精度；曲號／碟號與總數不得矛盾。

「恢復跟隨來源」只對目前有可重放 provider sidecar observation 的欄位提供，
Main 同樣驗證該能力；保存 provider origin，後續既有離線整理負責更新。
只有檔案 tags 的欄位提供明確採用快照，不宣稱會自動追蹤外部檔案編輯。
舊欄位缺少 origin 時標為未知，不假定可覆蓋人工資料。

## 發行判定及防重

本機發行與來源發行只有在完整成員相同、正式類型相容、全部原始音源 bindings
符合 fresh hash、完整來源位置均有有效關聯時，才提供可合併預覽。
相同正式來源的兩個集合還需有一致的完整 slots 與人工 links；位置衝突不得丟棄。
同名、同曲長、共用錄音或不同 OLAK 都不足以自動判定同一發行。
同一 track 合法屬於 Single、EP 及 Album，作品／版本關係不會因此合併發行。

`playlists.json` v4 保留原有 collections，新增同檔 `reconciliation` v1：

- `pendingReleases`：來源提案；與既有人工發行成員相同的來源匯入先進此處，
  不新增可見卡片。catalog 後續沿用提案 UUID 補齊，再由使用者確認歸屬。
- `decisions`：依穩定身分、有效欄位、成員／位置及媒體證據保存保留分開的決策。
  抓取時間、機械 revision、側欄順序或派生 alias 改變不使同一決策失效。
  已略過候選在獨立分類可重新列入；關鍵證據改變才需重新檢查。
- `redirects`：退休 UUID 到保留 UUID 的有界映射，禁止循環。
- `merges`：合併收據，含兩側原始集合、索引位置、合併後指紋、轉址與頁面物件快照。

新舊 catalog 寫入、既有 album upsert 與後續來源更新共用此防重入口。
「保留分開」若涉及 pending 提案，會明確將其正式發布為獨立集合；不讓它永久隱藏。
沒有來源或不完整的提案不能略過媒體驗證直接合併。

## 合併與引用

預設保留原本機 UUID、名稱、簡介、封面及人工日期；來源完整曲序與持有關係接入。
使用者可逐欄選擇原值或另一側 effective 值；顯示、確認與實際保存一致。
來源僅有 year 不會在預設建議中降低人工 day 精度。
source-less localMemberBindings 正式轉換成來源 catalog bindings，兩種 schema 不並存。
不同發行與無法完整對應的成員維持獨立，不做按文字硬併。
曲目／檔案重複候選與發行合併是不同操作；掃描不會自動整併專輯。
同發行確認合併後，側欄及相關發行只顯示保留集合，不再顯示退休集合；
不同的 EP、Acoustic 或 Live 發行保持獨立。

保留與退休頁的照片／便條保留原物件 key 與 asset id，移入保留頁；衝突及超過
既有 12 個 user objects 上限時拒絕合併。重複的 derived 頁面投影可重新產生。
兩側封面檔不刪除；保留頁沿用其原有封面，避免改變既有縮圖策略。

列表投影提供 `redirectedIds`，不將此派生欄位寫回 collection。
Main release runtime 與 renderer collection identity resolver 共同解析退休 UUID。
目前頁選取、queue 來源導覽及播放鍵比較均可找到保留集合；現有 queue 的順序、
目前曲目與播放時間不重建。歷史／resume 來源 ID 可保持原快照，使用時經轉址解析。
發行合併不更改 trackId、使用者播放清單成員、BGM 或演出場次曲目。

## 確認與恢復

掃描結果有效 15 分鐘，最多保留 32 份、每份 10 分鐘的 Main-private preview。
Renderer 只提交 scan／item／preview ID、有限分頁、欄位決策與合併選擇；
不提交路徑、hash、來源 manifest 或任意執行內容。
確認在 shared lane 重驗 library epoch、完整文件 fingerprint、pending deletion、
fresh audio hash 與最終 stamp。外部改檔、其他編輯、刪除或換庫使舊預覽失效。

`library-reconciliation-journal.json` 在寫檔前保存各已知 JSON 的精確 before／after，
flush staging bytes 後 rename。跨文件提交不宣稱一次 rename 原子完成。
啟動與換庫先恢復未完成交易；關聯寫入／遷移在 journal 存在時拒絕運行。
恢復前檢查所有目標仍等於 before 或 after，再冪等完成；若遇到外部新資料，
保留 journal 與現檔並回報恢復衝突，不覆蓋新內容。

復原合併需符合提交後集合、轉址及頁面 fingerprint；後續編輯造成衝突時拒絕硬蓋。
v1–v3 playlists 首次 v4 寫入仍先備份。損壞、超限及未來版本拒寫，未知頂層與
不相關列欄位保留。每份 JSON 及整份 journal 上限 32 MiB；collections／pending
各最多 500、decisions／redirects 各最多 5000、merge receipts 最多 500。

## 驗證邊界

相鄰測試覆蓋 RASEN 類型的人工 Single／來源 Single、不同 EP、人工位置衝突、
清空及跟隨來源、穩定略過決策、pending 發布、UUID 導覽與不中斷 queue、CAS／epoch、
JSON 中斷點恢復及復原衝突。桌面驗證使用隔離 profile 與合成音源，包含完整
Main／preload、實際設定入口、逐欄儲存、合併、EP 保留與復原；不代表真庫已執行整理。

音檔 tags 以獨立預覽與媒體交易處理；第一批 native FLAC 文字回寫及尚未開放的格式，
見[音檔標籤回寫契約](audio-tag-writeback.md)。此 JSON 交易不直接作為音檔寫入許可。
