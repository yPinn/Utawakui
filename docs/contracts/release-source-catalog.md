# 所屬發行、來源曲序與本地持有

第一階段補齊目前音源所屬的正式發行，不遍歷藝人全部作品、不自動下載缺曲，
也不以同名或曲長相近自動匹配其他版本。本地音源、播放與歌詞的權威維持原契約。

既有人工發行與來源提案的確認式去重、逐欄校對及引用復原見
[曲庫校對契約](library-reconciliation.md)。來源提案可能先進 pending，
經使用者確認才接入既有發行或作為獨立集合顯示。

## 來源證據

`resources/provider/release_catalog_worker.py` 使用已準備的 Provider Python／ytmusicapi，
一次匿名查詢只讀固定 YouTube Music HTTPS endpoints。它不讀帳號、cookies、proxy
或 renderer 網址，不啟動 bgutil，不準備 runtime，也不使用 Audio Python。
Main 的固定 runner 限制 30 秒、2 MiB stdout；worker 限 16 個請求、每個回應
2 MiB、固定 connect/read timeout 且不跟隨 redirect。

自動解析要求 watch metadata 的原 video ID、官方音訊 ATV 與唯一 album reference，
再由 album browse 取得正式 OLAK，並驗證正式 audio playlist 包含原 video ID。
Album browse 的 tracks 可能返回替代 video ID，不能拿它建立本地持有證據。
正式 playlist 的 IDs／順序才是 manifest；MV、Live、翻唱或無唯一關係時保留待確認。
既有 `youtube`／`yt-music` OLAK 集合由同一正式來源驗證後沿用 UUID 與原 platform；
後續匯入只有已保存可信 catalog 的同 OLAK 才接受平台別名，不按文字合併集合。
確認合併後保留本機 UUID 與來源 catalog，後續單首補齊、同來源匯入、下載掛回及來源更新
沿用該集合與人工 override；退休 UUID 透過既有 redirect 解析。同名但不同來源的 EP、Acoustic、Live
維持獨立，相同音訊重匯入仍沿用內容去重，不覆蓋已校對的曲目 metadata。

2026-10-24 公開小樣本驗證使用 ytmusicapi 1.12.3：THE BOOK 的
`rgNdeflYdYw` 能解析到 9 個正式位置；單曲 `tYP-i_tShDY` 解析到獨立的
1 曲 Single。Album browse 的替代 IDs 與正式 playlist 不同，因此正式路徑
改用後者，並由 yt-dlp flat playlist 交叉核對。這是小樣本來源證據，
不代表所有地區、發行、多碟或下架狀態都已做真實來源驗收。

## 保存與權威

`playlists.json` v4 在來源 album 的 `releaseInfo.catalog` 同檔原子保存：

- `manifest`：OLAK／browse 身分、標題、藝人、類型、年、可選封面參照、
  `reportedTotal`、完整性與最多 5000 個有序 slots。
- slot：獨立 `slot-N` key 對應原位置、來源 video ID 或 null、文字、時長與來源可用狀態。
  重複來源 ID 保留不同位置；來源未提供 disc number 時不推測碟號。
- `links`：位置到本地 track ID、exact-source／manual 證據與已接受 slot identity。
- `bindings`：Main 私有原始音源 SHA-256；`rejected` 保存人工解除的本地關係。
- `fetchedAt`：已接受來源快照時間。完整快照不被 partial 回應降級，
  但仍可用既有完整曲序重新對照目前本地持有。

只有正整數、一致且等於取得位置數、無 continuation 的來源總數才算完整。
空、矛盾、超限或格式漂移不得用本地檔案數補造完整性。
`collection.trackIds` 只包含唯一的本地收錄；未持有來源列不進 `library.json`，
也不建立假的 canonical track。無對應的既有本地成員保留並另列。
來源更新保留名稱、簡介、封面、addedAt、人工 override 與更精確日期。
來源封面只在初次建立 catalog、沒有既有封面時補入；之後不復原使用者清除的封面。
圖片透過固定 host／逐跳 redirect allowlist、2 MiB 與 400 萬像素限制驗證後，
保存在既有 `playlist-covers/<collectionId>/`，失敗仍保留文字曲序。

v1–v3 可讀且不因讀取寫檔；首次 v4 寫入先備份原始 bytes，備份失敗拒寫。
v2 不重跑 kind heuristic；損壞及未來版本拒寫。不相關頂層與列欄位保留。
Downgrade 編輯不保證保留新欄位，須使用備份恢復。

## 工作與 IPC

`catalogRuntime.js` 擁有來源查詢與人工候選 session；新匯入於音源提交、
索引及儲存政策完成後排入背景補齊，不等待 metadata 成功。
既有曲庫由設定的「曲庫資訊 → 線上補齊」啟動；涵蓋已具類型／日期的
來源專輯、未歸屬來源單曲與需要人工確認的本地檔案。
自動工作去重、最多等待 100 項；一天內完整快照可重用且仍重驗本地音源。
批次重跑以快照作 checkpoint；目前專輯的明確來源更新可重新查詢。

網路與第一次媒體檢查在 shared lane 外；短提交在作品／發行同一 lane
重驗 gate、library epoch、集合 UUID／source／revision、pending deletion 與媒體。
不復活查詢期間刪除的集合，不覆寫其他操作產生的新版資料。
停止會 abort 目前來源 worker 並使在途及排隊 generation 失效；已提交快照保留。
Worker 與 artist-photo 共用 Provider manager 的停止／退出 barrier。

Main 主視窗的 main frame 才可呼叫固定 `library:release-catalog-*`：
page、download、link-local、refresh、search、preview、accept、unlink。Preload 只轉傳 IDs、revision、
epoch、有限分頁與產品意圖；來源 facts、URL、路徑與 binding 不由 renderer 提供。
讀取已保存曲序、導出匯入目標、納入精確本地音源及解除關聯離線可用；其餘操作逐次重查 provider-flow。
bulk refresh／cancel 沿用既有 `library:*release-metadata*` 進度事件。

專輯列下載由固定 `library:download-release-track` 接收集合 UUID／revision／epoch／slot key。
Main 以已保存曲序建立私有目標，直接交給既有 Provider download scheduler，
與一般匯入依音源 ID、曲庫位置及 epoch 共用執行／去重；不改寫匯入草稿或啟動搜尋。
實際開始前及 runner 準備完成後重驗 gate／scope／來源位置；音檔安裝完成後才提交關聯。
若下載成功但關聯衝突，返回已下載但未納入的狀態，不把已安裝音檔報成下載失敗。

來源專輯頁首提供同列的批次下載 icon button，tooltip／accessible label 顯示未下載數量。
固定 `library:release-download-batch` 只接受 `status`／`start`／`stop`／`retry` 與集合 UUID、
revision、epoch。Main 從完整保存曲序建立最多 5000 個位置的私有計畫，不受表格分頁或搜尋影響；
略過已持有、本地候選、已排除、待確認、來源不可用及其他下載已排隊的音源。檔案遺失僅接受
相同精確來源的原關聯，不能用批次下載替換人工綁定。

批次重用 Provider scheduler 的兩首並行與跨匯入去重，同音源只下載一次，位置逐一納入。
逐次開始前仍驗 gate／scope／slot identity／排除狀態；自身納入造成 revision 增加可繼續，
外部改綁、刪除、來源位置變更或換庫不能繞過驗證。單曲失敗繼續其餘項目；已下載但未納入
獨立計數，重試可重用本地音檔。歌詞與分析沿既有匯入完成路徑觸發，不另外增加批次觸發。

批次由 Main 持有，切頁後繼續；renderer 單一 session 每 500ms 讀取 active 狀態，完成後停止，
合併一次曲庫／專輯刷新及結果通知。下載中的位置與單曲按鈕共用 pending 投影，防止重按。
停止只阻止尚未開始的工作，已開始者可完成，不取消其他匯入共享的工作；重試只包含上一批
失敗或尚未納入的位置。批次不跨 App 重啟自動恢復，不代表提供續傳。狀態讀取與停止可離線，
開始／重試及實際下載皆重新驗 provider-flow。Main private errors 保留原始 context，UI 只顯示
固定復原訊息。新增 main owner 沿既有 recursive packaging，沒有新增下載器或 provider 環境。

無關聯位置若精確來源 ID 的音檔已存在，投影為本地候選，與已驗證成員狀態分開保存，
不影響同音源其他已接受的位置。使用者明確「納入本地曲目」才解除該音源的排除紀錄，
以兩次媒體摘要、shared lane、pending deletion、來源身分及 CAS 驗證後只寫入選定位置。
本地納入不依賴來源仍在線；既有 stale binding 不會被靜默重綁，新加入的人工排除不被在途下載覆蓋。

候選由目前歌曲藝人／專輯或曲名查詢，最多 5 個；Main opaque token
有效 15 分鐘、最多保存 20 個。選定發行後仍須明確選擇曲目位置，接受時
重驗媒體與 CAS，不能按同名整組套用。解除關聯保留排除紀錄且不刪音源。
來源移除的位置保留舊關聯記錄；改變的 slot identity 需要重新確認。

## 顯示與播放

App 單掛 ReleaseCatalogModal；曲目選單提供「補齊專輯資料」。
LibraryReleaseCatalog 有界讀取每頁最多 100 列，由薄來源 adapter 組合共用
TrackTable 的 album profile，沿用欄位偏好、密度、表頭及欄寬；同專輯封面只在
專輯資訊顯示，不逐列重複。來源位置以 slot key 識別，允許同一音源多次出現。
可用列連結現有 canonical track，其他列只顯示來源資料。
狀態為本地可用、未匯入、未納入、已排除、檔案遺失、待確認；來源下架是另一個狀態。
頁首只顯示可靠的來源總曲數，不顯示本地可用數量。未持有列維持停用，
原伴奏操作位置改為下載按鈕，Main 依 collection／slot 導出來源目標，
直接使用共用下載執行器，不開啟匯入 Dock。已有精確本地候選則在同位置提供「納入本地曲目」，
不重複下載；候選在確認前仍不允許播放或試聽。下載、伴奏處理、處理中及完成徽章
共用時長前的固定操作欄；停用列不封鎖可用下載。已持有列保留伴奏處理操作。
一般曲目列不提供行內解除關聯，也不加曲序說明尾註。來源移除的舊關聯
保留於資料層，來源對應校對仍透過曲目選單的「補齊專輯資料」。
來源更新／離線重新讀取只在設定提供，partial 不顯示假總數。
同一曲庫與專輯的背景更新透過既有 page intent 的 `availabilityOnly` 布林值讀取
Main 驗證過的持有投影，仍受 epoch、revision、媒體 binding 與分頁上限約束。
Main 導出 `structureVersion`，狀態投影只包含 slot key／position 與可用性、已關聯及本地候選 ID，
不重送曲名／藝人／時長或私有來源資料。所有已展開頁面驗證完成後，
只套用改變的狀態欄位，保留同一 catalog、列物件與共用表格；下載完成由停用轉為可用，
原下載操作轉為伴奏處理。來源結構版本改變才重新讀取完整曲序，保留既有展開範圍。
舊 preload 未轉送此 intent 時，完整投影仍可相容載入。
完成通知可能先於集合清單的新 revision 抵達。若曲序讀取回傳 `conflict`，
保留同 scope 表格並維持驗證 pending，透過既有集合清單刷新取得新 revision，
再由 watcher 重新驗證狀態。同 scope／revision 的衝突共用一次刷新結果，
不因 tracks Map 重建而重複復原；版本未前進且仍無法驗證時回報失敗。
重讀期間試聽可用性維持 pending，不把舊畫面當作新的音源驗證；換專輯、換庫
或重讀驗證失敗會移除舊快照，在途舊回應不得覆蓋目前專輯。
伴奏完成沿用相同背景刷新；來源 slot 與本機 track ID 作為穩定列鍵，
保留捲動及曲目選取，只在對應音源的狀態欄更新完成徽章。
同一音源若出現在多個來源位置，各對應列的徽章一併更新。

`releases/runtime.js` 對 source catalog 與本地發行使用同一原始音源驗證，
所有 forTrack／resolveMembers／withPlayableCollection 消費端均需驗證
binding 與已接受位置身分。列表移除私有 catalog／bindings，開頁才讀有界投影。
未持有或失效列不能選取播放、右鍵加入、雙擊、Enter、排隊、待唱或建場次。
同一音源出現多個來源位置會計算多個已持有 slots；queue 沿用同 track ID 去重，
不承諾逐 occurrence 重播。現有播放 queue 不因 metadata 更新被重建。

## 驗證邊界

相鄰 Vitest 覆蓋 schema、原子保存／備份、來源別名、舊庫、人工候選、排除、
媒體改變、partial、CAS、取消、epoch、IPC allowlist 與來源列操作。
純 Python 測試入口為 `python -B resources/provider/release_catalog_worker.test.py`。
包裝只額外交付 worker，測試與 runtime 安裝不隨這份 source resource 交付。
可見 Electron、正式 worker 小樣本與合成測試應分別記錄；無法以單元測試宣稱真實來源全覆蓋。
