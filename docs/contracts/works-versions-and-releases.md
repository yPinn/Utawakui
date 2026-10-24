# 作品、版本與發行資料契約

本契約實作 [ADR 0028](../adr/0028-local-works-versions-and-releases.md)。
P0／P1 交付資料層；P2 接通 Main／IPC、正式匯入／刪除協調及作品與版本編輯入口。
P3 交付發行編輯與藝人共用作品區，P4 交付單首／多曲 Single 詳情；provider 身分查詢仍待補全。

## 語意與權威

| 物件               | 權威                                            | 不代表                       |
| ------------------ | ----------------------------------------------- | ---------------------------- |
| Work               | 本機穩定作品 ID、人工標題與關聯                 | 同一錄音、同一檔案或同一發行 |
| Track profile      | 特定原始媒體的版本與可選作品關係                | 改寫曲目標題、藝人或歌詞時間 |
| Release collection | 現有 collection UUID 與來源擁有的 trackIds 曲序 | 可任意重排的使用者 playlist  |
| Release info       | 發行類型、日期、總曲數與人工覆寫                | 由本機收錄數猜測完整度       |
| Artist index       | 本次演唱者的 canonical 投影                     | 原唱／詞曲作者權威           |

`library.json` 仍只存 scalar track metadata；新資料不存絕對路徑。
作品名稱、別名、歌名比較鍵與 artwork MBID 都不是可自動建立外鍵的證據。
第一版每曲最多一個 work link；串燒可記版本，但多作品關聯另行設計。
同一 trackId 可屬多個發行；不建立 recording entity 或自動合併檔案。

## Works 文件

曲庫根目錄 `works.json` 為使用者資料，不是可隨時丟棄重建的 cache。
頂層包含 `version: 1`、單調 `revision`、`works`、`trackProfiles` 與
私有 `pendingTrackDeletions`。Main 產生 `work-UUID` 與時間戳。

Work 保存 `title`、`aliases`、`note`、`createdAt`、`updatedAt`。
title 必填且最多 200 字元；aliases 至多 16 筆、每筆 200；note 最多 500。
字串保留原文，trim 並拒絕控制字元；不把有損正規化結果當顯示值。
不要求原唱已在庫中，也不新增原唱藝人外鍵或詞曲作者編輯。

每個 `trackProfiles[trackId]` 有 Main 驗證的原始音源 `binding`，以及可省略的：

- `workLink: { workId, relationship }`，relationship 為 unknown／original／cover。
- `versionInfo: { arrangement, performance, vocal, label, note }`。

arrangement 接受 unspecified／acoustic／remix／other；performance 接受
unspecified／studio／live／demo；vocal 接受 unspecified／vocal／instrumental。
label 最多 120 字元，note 最多 500。版本備註接受 LF／CRLF 換行，儲存為 LF；其他控制字元仍拒絕，名稱／搜尋等單行欄位不放寬。
版本不依賴 workLink；解除作品保留版本。
Acoustic、Live、Cover 可同時存在；unspecified 不表示原唱或錄音室版本。
介面將 original 顯示為「原唱」、demo 顯示為「Demo」，unknown／unspecified 顯示為「未設定」；只調整文案，不改既有儲存值或推斷未知分類。
作品成員由有效 profile 推導，不保存另一份 `work.trackIds`。
trackId 沿用既有本機曲庫的 255 字元上限；作品標題與搜尋字串仍為 200。

Main service 以每曲庫序列化操作及 expectedRevision 防止遺失更新。
建立作品並連結最多兩曲須同檔原子提交；改連只動選定曲目，不合併作品。
作品改名不回寫 scalar metadata。零成員作品保留，供日後搜尋與重新連結。
mutation 拒絕未知欄位、非法 enum、懸空關聯及不安全 dictionary keys。

## 原始媒體綁定與曲庫世代

binding 形狀為 `{ kind: 'audio-content-sha256', value: '<64 lowercase hex>' }`。
它只回答 profile 是否仍屬於目前媒體，不回答是否同一創作或同一錄音。
Renderer 不提供或接收 hash；只有 Main 取得原始音源、驗證或計算摘要。
摘要以串流有界計算，檢查檔案前後 stamp，不能使用分離輸出替代原始媒體。
profile 綁定只接受非空、至多 4 GiB 的原始音源。刪除／恢復的私有檢查允許空檔摘要，
讓損壞的空音檔仍可清理；特殊保留字 trackId 可作 receipt 值供刪除，不能作人工 profile dictionary key。
不在啟動時為整庫計算 hash。cache、路徑與 binding 都屬 Main 私有 context。

相同 trackId 但 binding 不同時，profile 不進有效投影，也不能靜默重新綁定。
原始 profile 保留，供後續明確確認；暫缺音檔不等於刪除人工關聯。
Main service 接受注入的媒體 resolver，於非同步工作後與提交前重查曲庫 epoch。
切換目錄使舊操作失效，不把 A 曲庫結果寫進 B 曲庫。
現行選擇曲庫位置只切換資料夾，沒有自動搬庫。

## P2 操作與程序邊界

`electron/lib/works/runtime.js` 解析實際 canonical original、串流驗證 binding，
共用 service 的每曲庫提交佇列。Main host 負責 playlist／session／BGM 引用清理、
啟動恢復與換庫通知；Renderer 不接收檔案路徑、binding、deletion receipt。

固定 IPC 只允許主視窗 main frame；preload 與 Main 各自限定欄位：

- `library:get-work-organization`：trackId、offset、limit，回傳目前作品、版本、bindingStatus 及相關版本頁。
- `library:search-work-organization`：trackId、query、limit，本機搜尋既有作品與可選曲目，不連外。
- `library:save-work-organization`：trackId、expectedRevision、libraryEpoch、selection、relationship、versionInfo、可選 reconfirm。
- `library:rename-work`：workId、title、expectedRevision、libraryEpoch，只改作品名稱。

selection 為 keep／none／track（targetTrackId）；existing（workId）與 new（title、可選 targetTrackId）保留相容。
逐曲連結只提交所選曲目 id，Main 重查其音源及作品關係：已連結則加入既有作品，未連結則以曲庫標題建立兩曲作品。
不修改其他搜尋結果；目標版本資訊保留。儲存前再次驗證兩份音源，目標變更回傳 target-changed，
不誤標目前編輯曲目的 bindingStatus，也不要求重新確認錯誤的音源。
new 可將目前曲目與另一首未連作品的曲目一起原子連結；不偷搬已連結的目標。
none 解除連結時保留獨立版本資訊。音源改變後隱藏舊 profile，儲存須明確 reconfirm；
keep 依當下畫面保留未連結狀態，不恢復未顯示的舊作品。
預期衝突以 conflict／stale／binding-mismatch／target-changed／not-found／recovery-pending 等有界狀態回傳；
操作失敗留在 Main diagnostics，跨 IPC 只傳固定公用訊息。

查詢只驗證當前曲目及當頁相關候選的媒體，不在開窗時 hash 整庫。
relatedCandidateTotal 與作品 memberCount 是已記錄關係數；不等於已驗證可播放數。
hasMore／nextOffset 依候選位置分頁，缺檔或 binding 改變的候選不進公開版本列。

local／convert／provider 在取得音源前捕捉 library epoch；長複製、下載與摘要留在提交佇列外。
finalization 才進同一佇列，先恢復 deletion receipts，再分配／確認 ID、安裝 canonical 媒體及更新索引。
provider 的 onTrackCommitted 在佇列內更新 scalar index；既有 canonical original 不被重抓結果覆蓋。
A→B→A 仍拒絕 A 的舊 acquisition。刪曲先寫 receipt，媒體與跨檔引用依序處理；
途中失敗保留 receipt，於重試、啟動或同 ID 匯入前恢復。不同 binding 的替代音源與新引用保留。

`library:work-organization-changed` 只攜帶 libraryEpoch、revision 與有界 trackIds；
組織異動不觸發一般 library reload／provider backfill。切換曲庫另推送新 epoch。
module-scope useWorkOrganization 擁有草稿、請求世代與訂閱；App 掛載單一共用編輯視窗。
Library、Queue、播放資訊與 preview 使用同一入口。dirty close 經既有確認元件，衝突保留草稿並要求重載。
相關版本明確播放／加入佇列使用既有 player／queue actions；編輯與儲存不更動播放、歌詞或 queue occurrence。

## 發行文件與 v3 遷移

`playlists.json` v3 沿用 `playlists` 陣列；保留 UUID、name、kind、source、
trackIds、addedAt、description、coverImage、performanceExportKey。
一般 playlist 不必有 releaseInfo；kind=album 仍表示一般歌單操作不可改曲序。
沒有 releaseInfo 的舊集合解析為 unknown；讀取本身不寫檔或重新分類。

releaseInfo 包含：

- `revision`：初值 0，相關異動單調增加；no-op 不增加。
- `observed`：type／date／totalTrackCount 的來源事實，每欄為 value 與 provenance。
- `overrides`：使用者指定的 type／date／totalTrackCount。
- 選填 `leadTrackId` 與私有 `localMemberBindings`。

observed 每欄形狀為 `{ value, provenance: { provider, sourceId } }`，
必須與該 collection.source.platform／id 相符；無 source 的集合不能套 provider facts。
來源同步逐欄 patch observed，不取代整份 releaseInfo，不覆蓋人工決策。
type 接受 unknown／single／ep／album；不從 OLAK 前綴、曲名或曲庫首數判斷。

逐欄解析順序為 override → observed → unknown／null。
移除 override key 表示回到來源；明確 type=unknown 或 date／totalTrackCount=null
表示壓住來源值，兩者不能混為一談。投影另回傳各欄 provenance 與衝突。

date 為 `{ value, precision }`，只接受有效 YYYY／YYYY-MM／YYYY-MM-DD，
precision 分別為 year／month／day；日期不以匯入日補空。
totalTrackCount 為正整數。人工總數小於集合已收錄成員數時拒絕；
provider 總數矛盾時保留原事實、投影隱藏總數並標衝突，不自動改分類。
leadTrackId 必須屬成員；移除該曲即清除主打標記，不把另一曲自動設為主打。

source-less 集合初次明確整理時，由 Main 初始化 localMemberBindings；
缺媒體的成員記 null／unresolved，不刪 membership、不在檔案再出現時自動接受。
既有 albumReference 仍是 session-only 標題投影；建立持久發行另需明確確認成員。
資料 helper 不開放 Renderer 提交 bindings；Main adapter 自行解析原始媒體。

讀取支援 legacy v1／v2 與 v3。首次寫回舊版本前先建立 byte-preserving 備份，
備份失敗即不寫主檔。kind heuristic 只處理尚未完成 v2 migration 的文件，
不能因目前常數升到 3 就重跑 v2 的 kind 推論。未來 schema 或損壞文件拒絕寫入，
保留原始 bytes；不能回空陣列後讓下一個 mutation 覆蓋。

## Release writer 與相容性

release editor 使用 expectedRevision；儲存同時確認目前 kind=album。
分類、日期、總數、主打、來源 facts、成員與 binding 的真實異動須更新 revision。
`upsertAlbum`、`setPlaylistTracks`、`removeTrackFromAllPlaylists`、
`setPlaylistKind` 均保留 releaseInfo 並協調 revision／成員修剪。
album→playlist→album 也使舊 editor 失效；刪集合後舊 editor 回 not-found。
一般改名、封面與描述沿用現有 API；沒有改動相關 release 欄位時不使 revision 跳動。

來源仍按 platform＋id 查集合，不能按名稱把本機 Single 與 provider 發行合併。
分類不更改 collection UUID、sourceId、曲序或目前 queue 快照。
內部儲存結構不得直接把 localMemberBindings 暴露給現有 playlist IPC；
Main public projection 移除私有 bindings；Renderer 不能提交或接收摘要。

## P3 發行操作與公開投影

`electron/lib/releases/runtime.js` 與作品、匯入提交及刪曲共用每曲庫 service lane。
發行儲存要求 expectedRevision 與 libraryEpoch；非同步驗證後重查集合 revision、
source、曲序及曲庫世代。所有可能失敗的音源驗證在原子寫入前完成，
提交成功後只產生純資料投影，不能因寫後再次讀取失敗而回報建立失敗。

固定 Main-only IPC 與 preload intents 為：

- `library:get-release-info`：collectionId、offset、limit；讀取欄位來源、人工覆寫、成員狀態與目前 revision。
- `library:save-release-info`：collectionId、expectedRevision、libraryEpoch、set、remove、leadTrackId，以及明確 initializeBindings 或 reconfirmTrackIds。
- `library:create-local-release`：trackId、name、libraryEpoch；原子建立一個 source-less、type=single 的單首發行及其 Main 驗證 binding。
- `library:get-track-releases`：trackId、offset、limit；回傳所有有效收錄發行的有界分頁，不自選唯一專輯。
- `library:resolve-release-members`：collectionId、expectedRevision、libraryEpoch、offset、limit；回傳當頁成員狀態與可播放 ID。

成員頁最多 100 筆、offset 至多 5000；收錄發行頁最多 50 筆、offset 至多 500。
兩者回傳 hasMore／nextOffset。重新確認一次最多 100 個 trackId。
建立只接受非空名稱及一個現有音源，不接受任意成員、source、路徑或 binding；
集合上限 500 時回 limit-reached。建立不推測日期、總數或作品關聯。

source-backed 集合允許人工欄位覆寫，但不能經發行操作改 source、曲序或 bindings。
正式來源觀察只能由 Main 的可信 provider adapter 送入；既有 upsert-album 的
Renderer payload 不提供 observed 權威。沒有可信來源事實時維持 unknown／null。
既有歌單標記為專輯只改集合類型及 revision，不以該操作自動接受目前音源。
未初始化的本機集合在編輯視窗明確確認後，才建立 localMemberBindings；
既有 changed／unresolved 成員須逐項重新確認，缺檔保留 membership 並標 missing。

公開列表只加入 resolvedRelease（type、date、totalTrackCount、provenance、conflicts、
revision、leadTrackId）、releaseLibraryEpoch 及需驗證旗標，不在啟動時掃描摘要。
有本機 bindings 的集合在 Renderer 驗證完成前可用成員為空；選取集合與藝人區
才以有界併發讀取當頁成員。播放及加入佇列操作重新驗證完整集合，
不得把同 ID 的替代音源視為原發行；source-backed／未初始化舊集合只檢查實際檔案存在。
加入演出待唱／從集合重建場次由 Main 在同一 lane 內驗證完整成員後同步提交，
不接受 Renderer 傳入的曲目陣列。非同步等待期間切換曲庫、集合異動或較新的播放意圖
使舊結果失效，不能把 A 集合的曲目標成 B 的播放來源。

`library:release-organization-changed` 僅傳 libraryEpoch 及至多 100 個 collectionIds；
空陣列表示換庫或全面失效，不觸發 provider backfill。`useReleaseOrganization`
持有單一 editor 草稿與請求世代，`useReleaseMembers` 持有可用成員快取。
App 掛載共用 ReleaseInfoEditor，沿用既有 modal／fields／menu；衝突保留草稿，
要求重載，換庫不接受舊回應。明確 null／unknown 與回到來源 remove 分開操作。
建立本機單曲使用短表單寬度與內容高度；建立成功切至發行資訊時，恢復寬版固定工作區。

曲目既有選單提供建立單首發行及「收錄於」多發行導覽；現有集合操作提供發行資訊。
多發行選擇優先保留目前 collection context，其餘保持原列表穩定順序；
編輯、分類及導覽不修改當前播放快照、歌詞或 queue occurrence。

## 藝人頁共用音樂作品區

依使用者 2026-10-23 確認的藝人頁參考，沿用現有專輯區及 LibraryAlbumCard 等既有元件，
以同一「音樂作品」區混合呈現 Album、Single、EP；不新增平行的單曲主導覽或另一份集合資料。
此處的卡片單位是發行集合，不是 works.json 的 Work；同一作品的原版與 Acoustic
若屬不同發行，仍可各有一張卡片，不按作品關聯合併。

預設顯示「全部」，提供「專輯」與「單曲與 EP」篩選；卡片下方以有效日期顯示年份、
以解析後的 release type 顯示專輯／單曲／EP。未知類型留在全部並標示未分類，
未知日期不補匯入年份；不從本機曲數或既有 kind=album 猜測發行類型。
藝人摘要以中性的發行數量顯示，發行年份範圍同樣取自 resolvedRelease；
曲目 scalar metadata 的年份不能冒充發行日期。
僅投影本機已有對應內容的發行，保持原 collection UUID、來源曲序與 canonical 演唱者歸屬。
目前沒有可依據的熱度資料，不由參考畫面引入「熱門」排行或人工人氣指標。

P3 共用範圍為藝人頁作品區。P4 在同一集合詳情內增加獨立 Single 呈現；
Single 卡片仍開啟原 collection UUID，不另建詳情導覽或成員權威。
此區與發行編輯共用 Main 的 resolvedRelease，不另外解析一份分類權威。

## P4 Single 詳情頁（2026-10-24 已實作）

依人工驗收修正，Single 直接共用專輯視覺及設定：同一 LibraryCollectionHeader／
LibraryEntityDossier／AppFolderDossier、136px 封面、TrackTable／TrackCollectionRow、
欄位與密度、操作列及 compact bar。不再建立單首焦點列、放大封面或專屬控制配置。
只有持久集合 kind=album 且 Main resolvedRelease.type=single 才採單曲文案；
不新增 kind、路由、檔案 schema、IPC 或成員權威，頁面鍵仍為 album＋UUID。

### 摘要與狀態

正常摘要與專輯相同，只顯示日期、曲數及時長。日期使用 Main 有效日期，
以 YYYY／YYYY-MM／YYYY-MM-DD 保留精度，不補 scalar 年份或匯入日期。
正式總數未知時，頁首只表示本機曲目數；完整欄位及未知值由既有發行資訊編輯器呈現。
正式總數已知但僅收錄部分內容時，顯示「已收錄 1／3 首」與已收錄曲長，
不把局部時長當成整張發行時長。曲長有缺值時標明已知曲長。

單首、多曲與部分收錄都用相同 album table profile，不依可播放數量切換視覺。
驗證中沿用 TrackTable 載入呈現；失敗時使用既有 UiNotice 的重新確認操作，
空集合使用中性提示，缺檔／音源變更仍可從 Header 選單進入發行資訊修復。
不在正常內容另外放置常駐發行資訊按鈕或重複可播放計數。

不顯示主打標籤、額外主打列或提示，不改來源曲序或自選播放起點。
既有 leadTrackId 資料仍由 Main／原發行編輯器保存，詳情表格不據此增加呈現。
整理歌曲仍使用原 TrackActionMenu 與 WorkVersionEditor，不複製到 releaseInfo。
使用者入口與視窗統一稱「整理歌曲」，原「編輯歌曲」選單項目合併至同一入口。
共用視窗以既有 UiTabs 分為歌曲資訊、版本與連結；歌曲資訊重用 TrackMetadataFields 與原封面草稿流程，來源型資訊維持唯讀。
版本與連結左側設定版本，右側依「連結曲目／已連結版本」分區。
useSongEditor 協調兩個既有 domain owner，切換分頁保留草稿；關閉或換曲只確認一次。
一組 footer 依序提交有變更的歌曲資訊及版本／連結，不重複已成功的寫入。
兩個 domain 仍各自提交，不宣稱跨檔原子儲存；失敗時保留未完成草稿，顯示已儲存部分並切至出錯分頁。
搜尋結果統一顯示曲目與演唱者，各列提供連結；不顯示作品群組連結或獨立建立連結按鈕。
開啟時先依曲目標題查詢本機候選；搜尋依 Unicode 正規化、版本詞與字串相近程度排序，
只提供選項，不自動建立作品身分或連結。保留手動搜尋與具名稱及提示的圖示按鈕；候選常駐，可直接改選。
搜尋失敗或輸入變動時隱藏舊結果，避免以過時結果作選擇。尚未儲存的選擇可復原。
左側依序為版本名稱（選填）、已有或待建立連結時的演唱類別（未設定／原唱／翻唱），以及預設收合的更多設定。
更多設定依錄製形式、編曲、人聲及備註（選填）排列；進階下拉各佔一列，備註重用 UiTextarea，可輸入多行。
不提供共同歌名設定或作品改名操作；逐曲連結只表達歌曲關係，各曲目歌名、演唱者（含合作資訊）及版本資料獨立保留。
作品識別與既有內部名稱維持相容，Main 以所選曲目解析作品或提供新作品內部名稱，不要求使用者另行命名，也不因連結／解除同步曲目資訊。
解除連結放入目前歌曲的共用 ⋯／右鍵選單，先改草稿並可復原。
收合不清除資料，儲存仍保留各版本維度。
未儲存的連結變更不顯示舊作品的其他版本；其他版本列的選單不直接解除目前曲目。
歌曲版本 modal 依內容容器寬度排版：足夠寬時左欄為版本名稱、原唱／翻唱及收合的進階設定，
右欄依選歌搜尋、其他版本陳列排序，移除獨立管理區；不足 40rem 時按相同 DOM 順序回到單欄。
其他版本留在右欄，WorkVersionTrackRow 只組合正式 UiTrackRow、共用封面播放提示及 TrackContextActions。
歌名與演唱者／版本摘要使用元件既有省略與提示；封面可播放，⋯與滑鼠右鍵開啟同一 TrackActionMenu，
不將播放／佇列按鈕攤在列外，也不重寫共享 row 內部布局。
TrackContextActions 的 inline trigger 使用既有 UiIconButton，佇列／待唱／播放清單及編輯仍走原 owner。
由選單前往專輯／收錄發行前先透過 editor.close 處理未儲存草稿；取消時留在原畫面。
Modal 內的動作選單使用該 modal backdrop 的局部 floating host，避免被 dialog 蓋住；
可見驗證需確認實際命中選單項目，不能只以程式觸發 click 當作可操作證據。

### 共用操作與藝人作品區

頁面播放、試聽、一般佇列及演出待唱沿用 P3 owner 與動作前 fresh member proof，
保留晚回應、換頁／換庫、較新播放 intent 及 BGM pending-start guard。
目前來源暫停／續播保留 queue snapshot。TrackTable 的選取、鍵盤、非持久排序、
密度與唯讀成員規則直接沿用專輯；不因類型改動曲序或新增 Single 搜尋配置。

藝人「音樂作品」沿用原卡片與 UiTabs 的 bar 下底線 variant。分類文字為
「全部／專輯／單曲與迷你專輯」，以內容寬度靠左排列、最大寬度不超過容器，
不占用整行灰色底板；tab與目前panel由穩定ID連結，保留方向鍵／Home／End及載入中停用。未知類型仍出現在全部，不補造熱度或發行日期。
測試沙盒的操作說明放在外部驗收文件，不作為發行 description 混入產品畫面。

### 驗收範圍

純 helper 固定正常摘要密度、日期精度、partial／missing／unknown／pending／error、
曲長缺值與來源衝突；statement／branch／function／line coverage 均至少80%。
Mounted 測試及可見 Electron 比較單首／多曲／部分收錄與專輯對照的封面、欄位、
列高、控制項及密度；另驗證無主打tag、篩選內容寬度、空結果與可鍵盤操作。
驗證1280×850／960×650、深淺主題及寬窄Sidebar，正式 Main／preload 的播放、
試聽、加入佇列／待唱、發行與作品編輯、分類切換及換庫競態維持原契約。
本範圍不含 provider 身分補全、任意發行成員編輯或 Output／封面電台改版。

## 刪除 journal 與恢復資料層

私有 pendingTrackDeletions 以 Main operation ID 為 key，記錄原 trackId、binding、
phase 與建立時間。操作流程為先保存 prepared → 刪原媒體 → 保存 media-deleted
→ 冪等清理引用與該 binding 的 profile → 清除 receipt。
receipt 保存失敗不開始刪媒體；清理失敗保留 receipt，提供獨立 retry。
使用可 flush 的原子替換保存 works 文件；不把既有無 fsync 的一般 metadata writer
當成 durable deletion journal 的證據，也不改其他 domain 的原子寫入語意。

重啟恢復若 prepared 且同音源仍在，撤回 receipt，不重新執行破壞性刪除。
若媒體已不存在則繼續已授權清理；若同 ID 出現不同 binding，不刪新媒體或新 profile。
曲庫／磁碟不可用時延後，不把讀取錯誤當 missing。
刪最後一曲保留 Work；刪發行只刪集合，不刪音源與作品。

service 使用注入的 inspect／delete／cleanup callbacks，以真實檔案及故障注入測試
崩潰後可恢復的狀態。正式 delete handler 由 runtime 協調 journal 與引用；
import finalize 的 ID admission 先完成 pending receipt recovery，不以裸 media delete 重試替代。

## 驗收

聚焦測試須覆蓋：版本可獨立保存、同作品多版本、unlink/relink、revision 衝突、
損壞／未來 schema／I/O 拒寫、備份失敗、atomic write 失敗不覆蓋原檔、
binding mismatch／trackId 重用、epoch 切換、receipt 先於刪媒體及中斷恢復。
發行測試須涵蓋 v2 bytes 保全、kind 不重判、source reimport 人工覆寫保留、
日期精度／無效曆法、明確 null 與 remove 的差異、total count 衝突、成員清理與 no-op。

新 helper 納入現有遞迴 electron-lib coverage，目標至少 80%，並核對封裝 glob
包含生產檔且排除相鄰測試。編輯入口另以 mounted 行為與可見 Electron 檢查；
以上為已交付 P1–P3 的驗收要求；P4 Single 驗收見本文件詳情頁段落。
