# 演出場次準備契約

本契約定義錄製／串流前的 session plan、曲庫快速加入、manual performance、文字 placeholder recovery、
active-session control handoff 與公開投影邊界。Current draft persistence、playlist／album canonical
import、library ready fast path、manual item、session-local label override、duplicate／reorder／remove、
重啟恢復、shell-level 單一入口、Right Dock preparation summary 與 Setlist preparation workspace
已實作。BGM／演唱 transport handoff 已接線；active-session progress、prepared-item start、
confirmed-playing revision、公開投影與 OBS session history 整合仍未實作。

## 產品角色

Session preparation 讓 operator 在 live／record 前快速整理「這一場要唱什麼、對外顯示什麼曲名與第二行、
音訊由 Utawakui 或外部來源控制」。主要路徑直接搜尋本機曲庫，選取後立即採用 canonical metadata
並成為 ready item；只有顯示文字需要不同時才調整。自行伴奏或外部播放器是明確的 manual 例外，
BGM 則由完全獨立的 standby lane 管理。

- 可重用 playlist／album 是來源 collection，不是本場次進度。
- Session plan 是單次演出草稿，擁有獨立 item identity、順序、item mode 與 display label。
- Library track id 仍是 media、lyrics、artwork 與可播放性的權威。
- OBS session history 只記錄已 confirmed playing 的演出結果，不是未唱計畫。
- BGM 清單是另一個 owner，不得和 performance session plan 共用游標、順序或 item state。

現行一般 Setlist／playlist 瀏覽與播放在非 session preparation 情境維持原行為。本契約不把所有
playlist 都改成場次，不把一般 Queue 改名為 Reserve List，也不讓 text-only item 進入播放器。

## Ownership

| Owner               | 擁有內容                                                               | 不擁有內容                                                |
| ------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| Library             | Track identity、title／artist metadata、media、lyrics、artwork、存在性 | 場次順序、item mode、session-local display label          |
| Playlist／album     | 可重用 collection identity 與 ordered member track ids                 | 單次場次進度、重複演出 item、已唱／略過狀態               |
| Session preparation | Current draft、plan items、review cursor、mode、display label、link    | Audio timing、play state、BGM transport、公開歷史         |
| Performance player  | HTML audio timing、play／pause／ended／error                           | Session item mode、公開 label 的作者意圖                  |
| Handoff coordinator | BGM／演唱互斥、silence windows、confirmed-start revision               | Collection 編輯、item review、library metadata mutation   |
| OBS session history | 已發生的 confirmed-start snapshot、stream／record timecode、markers    | 未唱順序、placeholder、prepared selection                 |
| Public projection   | Confirmed current performance 與 bounded completed history             | Reserve／upcoming 清單、未 commit 名稱、operator controls |

Session plan 不能直接借用播放 Queue：既有 Queue 可自動 previous／next，而預設演出流程要求每首
結束後回到 BGM、由使用者手動開始下一首。Plan reorder、duplicate、remove 或 skip 也不得改寫來源
playlist，除非使用者在原 collection 另行執行明確編輯。

## Session plan model

第一版保存一份 current draft。Playlist／album 繼續負責可重用集合；不在第一版建立 session plan
catalog、雲端同步或多人協作。完整 App 重啟後可恢復 draft 與 review cursor，但只恢復為 inactive
preparation，不啟動 OBS session、BGM 或演唱 transport。

每個 plan item 使用獨立 `itemId`，不能以 `trackId` 作 item identity；同一 track 可因安可、重唱
或不同公開名稱在同一場次出現多次。概念欄位如下：

- `itemId`：不透明、穩定且只在本機使用的 item identity；
- `mode`：`library-track`、`manual` 或只供舊資料／失效來源恢復的 `placeholder`；
- `trackId`：可為 null；建立 link 時候選必須是曲庫中當下有效的 canonical track；後續缺檔或
  刪除則保留 item／label，並以 source-unavailable state 阻止開始；
- `displayTitle`：session-local、去除首尾空白後必填，最長 200 字；介面對曲庫項目稱「顯示曲名」，
  對 manual item 稱「曲名／項目名稱」；
- `displayArtist`：session-local、選填，最長 200 字；這是為舊資料相容保留的內部 key，介面一律稱
  「第二行（選填）」，可填原唱、演出者或版本資訊，不宣稱是 canonical artist metadata；
- `verification`：保留 `unreviewed`／`verified` 供舊 draft 相容；新 library／manual item 建立時
  直接是 `verified`，不在主要 UI 暴露重複確認步驟；
- `origin`：來源 collection item、library fast path、manual、舊文字貼上或 duplicate；
- `sourceSnapshot`：library item 建立／重新連結時的 bounded title／artist，用來提示來源已變更；
- `revision`：任何 link、label、mode、順序或 readiness intent 都增加，供 async matching／handoff
  排除舊結果。

Draft 最多 500 個 items。超過上限、單欄超長或資料格式無效時必須在寫入前顯示可處理的錯誤，
不得靜默截斷。Persistence 只保存 bounded ids、labels、enum、順序、cursor、revision 與 timestamps；
不得保存 absolute path、media URL、完整 library metadata 副本、provider payload 或 OBS credential。

## Item state

UI 只顯示會改變操作決策的狀態；正常 library item 不掛「已確認」chip：

| UI state   | Mode／source 條件                                         | Preparation ready |
| ---------- | --------------------------------------------------------- | ----------------- |
| 正常       | `library-track` 且 linked track playable                  | 是                |
| 手動       | `manual`，音訊由外部／自行伴奏控制                        | 是                |
| 需處理     | legacy `placeholder`，尚未選擇曲庫歌曲                    | 否                |
| 音檔缺少   | `library-track` 的 id 缺檔、刪除或無法解析                | 否                |
| 資料已變更 | linked track title／artist 與建立時 `sourceSnapshot` 不同 | 是，但需注意      |

- Library item 的 session-local `displayTitle`／`displayArtist` 可直接儲存，不因 override 回到
  unreviewed，也不回寫 library metadata。
- 重新連結 legacy／失效 item 時，main 驗證 track availability、更新 mode 與 source snapshot，成功
  後直接 ready；不再要求第二次「確認本首」。
- Library metadata 改變不自動覆寫 session label，也不撤銷仍可播放 item 的 ready 狀態；UI 只提示
  「資料已變更」。
- Media 可用性是 derived state。缺檔時不能開始；同一 id 恢復 playable 後可恢復 ready。
- 空白 title、控制字元、超長 label 或 unavailable track 都必須在 main 寫入前拒絕。

## 介面時間層級

Setlista 的 Reserve List、Now Singing 與 Set List 在 Utawakui 中對應三個不同 owner，不是同一清單的
三個篩選，也不在非 active session 時預先顯示三個空頁籤：

| 階段        | 介面名稱           | 資料權威                                    | 主要操作                                           |
| ----------- | ------------------ | ------------------------------------------- | -------------------------------------------------- |
| Reserve     | 待唱安排／待唱清單 | 可編輯 session draft                        | 搜尋、加入、調整顯示、排序、複製、移除             |
| Now Playing | 演唱中             | confirmed-start 後的單筆 committed snapshot | transport 狀態、結束／停止；不由 draft editor 改寫 |
| History     | 已唱紀錄           | committed session history                   | 查閱時間與結果；一般 preparation 不可改寫          |

目前已實作的 preparation workspace 與 Right Dock summary 只呈現「待唱」。active-session control 落地後，
「演唱中」是 active session 的固定主要區塊，「待唱」是主要可操作清單，「已唱紀錄」是次要查閱面；
三者不得和一般 playback Queue／Recently Played 混用。非 live／record 狀態不顯示假的演唱中或空 history，
也不以 `NP`、`Reserve`、`History` 縮寫要求 operator 推測狀態。

## 建立與匯入 workflow

### 從 playlist／album 建立

Titlebar 的「場次」是唯一固定入口。開啟入口只顯示 Right Dock preparation summary，不建立、
取代或修改 draft。Setlist 中選定 collection 後，summary 會將該 playlist／album 顯示為目前來源
候選；使用者必須執行明確的「用此清單／專輯建立場次」才建立 draft：

1. 依 collection 的 canonical member order 建立 items；畫面搜尋、暫時排序與可見篩選不得改變
   匯入順序。
2. 每個 item 連結原本的 track id，並以當下 title／artist 預填 session label，但保持
   ready；缺少的 source id 則投影為 blocked。
3. Album membership 雖是 read-only，也可作為 draft source；後續 plan reorder／remove 不改寫
   album。
4. 若已有 current draft，summary 先顯示既有來源、總數與需處理數量；只有使用者執行
   「以此清單／專輯取代目前草稿」並確認後才可取代，不做隱式 merge。

建立後 playlist 與 draft 分離。來源 collection 新增、刪除或重新排序時只顯示「來源已有變更」；
不得自動插入、刪除、換序或覆寫 authored label。第一版提供明確「由來源重建」並在取代前確認；
細緻 diff merge 留待真實需求成立後再設計。

### 快速加入與例外

- 左欄固定 composer 的 primary action 是搜尋曲庫；輸入曲名、演出者或 track id，選取結果後
  立即 append ready `library-track`、清除搜尋並聚焦新 item。
- 搜尋結果使用 library canonical title／artist／artwork，不先要求選來源模式、重填名稱或逐曲
  驗證；需要時才在 details 展開「調整本場顯示」。
- Secondary「新增手動項目」只要求「曲名／項目名稱」與選填第二行，建立 `manual` item。適用自行伴奏、
  外部播放器或不由 Utawakui 控制的演出；若音檔要由 App 播放，先由 Import 匯入曲庫，再走
  library fast path。
- BGM 不出現在 library／manual 選單，也不成為 plan item。
- 舊版 multiline text-only items 仍可載入、排序、duplicate、刪除與重新連結，但不再是主要新增
  入口；未連結時不能開始、公開或建立 timestamp。

### Live 中臨時新增

Live／record session 作用中時仍可開啟 preparation 搜尋曲庫、加入 manual item 或匯入後加入。
這些動作不停止 BGM；只有開始 item 的明確 handoff intent 才改變 transport。搜尋、匯入或連結
失敗留在 preparation owner，BGM 繼續依最新 transport intent loop 或 manual hold。

## 逐曲 review workflow

Right Dock 只負責單一入口的 preparation summary 與來源 intent，不嵌入完整 editor。Preparation
仍是 Setlist folder 內的完整 workspace，不是 modal、BGM player 或 active-session control expansion；可從任何主要
頁面開啟，完成後返回原本頁面。Desktop 使用 plan list＋focused review editor；窄視窗改為可返回
清單的單欄 drill-in，不把兩欄壓到不可讀。

Workspace 填滿 `AppFolderPage` workspace body 的可用高度；header 與 aggregate state 固定，中間 grid 使用剩餘高度。
左 pane 的 library／manual composer 固定在上方，只有搜尋結果或 plan list 捲動；右 pane 只有 details
body 捲動，必要 action footer 固定。窄視窗一次只顯示 list 或 details，返回動作不隨內容捲走。

Plan list 顯示順序、session label 與只有在需要決策時才出現的 manual／warning state。每列以單一
`…` 入口收納上移、下移、duplicate 與 remove，避免窄欄位被四顆等權重圖示撐成第二列；
`Alt + ArrowUp／ArrowDown` 保留不開選單的鍵盤排序。移除只刪除這個 occurrence，必須先明示不會
刪除曲庫歌曲。Focused details 顯示：

- library source title／artist 與 session output preview；曲庫資料以「曲庫曲名」與「歌手／藝人」
  明確標為唯讀來源；
- 正常 library item 的唯讀 source metadata 與按需「調整本場顯示」；
- manual item 的必填曲名／項目名稱、選填第二行；
- placeholder／失效 item 的曲庫搜尋與重新連結；

Session preparation 不顯示、不轉送也不開啟 global metadata editor。Display save payload 只包含
session item identity、revision 與 `displayTitle`／`displayArtist`；legacy recovery 的 relink payload
才能另外包含既有 `trackId`，而且只建立 identity link，不接受 title／artist／artwork 或其他曲庫
欄位。若使用者要修正 canonical metadata，必須離開場次準備並在一般曲庫情境執行；完成後本場次
label 保持原值並只顯示 source changed。

- 選取 library search result 是單一成功 intent，不再接續 verify screen。
- Display override 與 relink 失敗時以欄位文字說明，不只用顏色或 toast。
- 現行 ordering intent 只接受一次相鄰上移或下移。Pointer drag 必須等 main-owned domain 提供單次
  `itemId + targetItemId + position` 原子 reorder intent 後再加入，不得由 renderer 重播多次 IPC
  模擬一次拖曳；鍵盤相鄰 reorder 繼續使用現行 intent。Reorder 不改 readiness。
- 刪除、duplicate 或替換正在 prepared 的 item 必須以 revision 使舊 handoff no-op，並讓未來
  active-session control 重新解析下一個 ready item。

Preparation header 與 Right Dock 都只顯示總數加上一個 aggregate decision：`全部可演出` 或
`N 首需處理`；逐項原因留在 row／details。場次可以在尚有未完成 items 時進入 live；這些 items
只阻止自己開始，不阻止 ready 曲目或 BGM session。

## Prepared item 與 handoff

- App-played prepared item 必須同時是 current draft 中仍存在、revision current、`library-track`、
  linked 且 playable。Manual item 只代表外部／自行伴奏演出，沒有 App media identity；其未來
  confirmed-start 必須使用獨立 operator intent，不能假裝 HTML audio 已 playing。
- 選定 prepared item 不停止 BGM、不啟動 player、不改 public projection，也不建立 timestamp。
- active-session control 顯示 session label、source availability 與 plan position；它不提供完整 label
  編輯器。需要修正時回到 preparation workspace，BGM 維持既有 transport。
- 使用者執行「開始曲目」時，handoff coordinator snapshot `itemId`、item revision、mode、可選
  track id 與 display label，再依 BGM 契約執行 fade-out／zero／pause／pre-roll。
- pre-roll 完成前 item 被編輯、relink、remove、unverify 或失效時，舊 start intent 取消；不得用
  已過期 label 或 track 繼續播放。
- Library item 只有 performance audio confirmed playing 才 commit；manual item 必須由未來明確的
  manual confirmed-start intent commit。兩者都以同一 revision 寫入 public label 與 OBS history。
- 每首 ended／stop 後 item 可標為 completed，cursor 移到下一個 ready item但不自動開始；blocked
  item 可明確 skip。Completed／skipped 是 active-session progress，不改來源 playlist。

## Presentation 與 timeline

Session label 是 presentation override，不是 library metadata mutation：

- Local library、playlist、一般 PlayerBar metadata 與 track editor 繼續顯示 library title／artist；
- active-session control 顯示 prepared item 的 session label，並可輔助顯示 linked source；
- confirmed start 後，public Now Playing、Lyrics template 中的曲目 identity、Setlist current／
  completed history 與 chapter export 使用 committed `displayTitle`／`displayArtist`；
- media、lyrics timing、artwork resolve、queue exclusion 與 audio graph 仍使用 canonical track id；
- BGM、pre-roll、selected、prepared、unstarted manual／library、placeholder 與 skipped item 都不公開；
- history entry 同時保存 mode、可選 track id、plan item id、committed label snapshot 與 stream／record timecode；
  plan item 後續編輯不回寫已 committed entry。

第一版在 confirmed start 後凍結該次 performance entry 的 label；修改 plan item 只影響未來開始或
duplicate occurrence。若需要修正已開始／已完成 entry，必須另立具 timestamp-stable audit 邊界的
session-history correction flow，不能讓普通 draft autosave 暗中改寫直播中的公開內容或章節。

## Persistence 與 recovery

- Draft 變更以 main-owned serial persistence 保存；renderer 可以 optimistic update，但失敗時回復
  上一個 confirmed snapshot 並顯示可重試錯誤。
- 啟動時以目前 library 解析 linked ids，保留 placeholder，將缺檔 item 投影為 source unavailable；
  不因單一壞 item 丟棄整份 draft。
- 完整重啟不恢復 active／completed／skipped runtime progress，不自動連線 OBS、不 armed item、
  不發聲；只恢復 preparation draft 與 review cursor。
- OBS reconnecting 不改寫 draft。作用中 session 的 runtime progress 由 session coordinator 擁有，
  不能被較舊的 persistence response 覆寫。
- Library track 刪除時不刪 plan item；清除 link 並保留 session label，使使用者能重新連結。刪除
  source playlist／album 也不刪 current draft，只清除 source reference。

## 驗收情境

1. 從 playlist 建立 draft 時使用 canonical member order；搜尋、sort 或只顯示部分 rows 不改變匯入。
2. 搜尋曲庫並選取後，main 以 canonical metadata 建立 ready library item；不要求再填名稱、選 mode
   或按逐曲確認。
3. Manual 入口只接受 bounded display fields，不接受 path／URL／BGM intent；App 要播放的自備檔
   必須先匯入曲庫。
4. 舊 placeholder 可保存與 recovery，但 linked 至有效曲庫歌曲前不能播放、公開或寫 timestamp。
5. 同一 track 可用不同 item id 出現兩次，分別開始並寫入兩筆 history。
6. 修改 session display label 不撤銷 playable library item 的 readiness；relink 由 main 驗證後直接
   ready，reorder 不改 readiness。
7. Library metadata 改變時 session label 不變並顯示 source changed；global metadata 不因 session
   save 被修改。
8. Linked file 缺失時 item blocked，其他 ready items 與 BGM 不受影響；同 id 恢復 playable 後可再次
   prepared。
9. 場次可帶未完成 items 進入 live；active-session control 只開始 ready item，manual item 與
   app-played item 使用不同 confirmed-start 分支；blocked item 可返回 preparation 或 skip，BGM 持續播放。
10. Prepared item 在 fade-out／pre-roll 中被改名、relink、remove 或失效時，舊 revision 取消，
    不播放錯誤 track、不公開舊 label、不寫 timestamp。
11. Library item 只有 confirmed playing 才 commit canonical track identity；manual item 只有明確的
    manual confirmed-start 才 commit。兩者都不因 selected、prepared、按下開始或 buffering 提前投影。
12. confirmed start 後修改 draft 不回寫目前／已完成 entry；duplicate occurrence 可使用新的 label。
13. 完整重啟只恢復 draft／cursor，所有 transport、armed 與 active-session progress 保持 inactive。
14. Desktop split view、窄視窗 drill-in、深淺色、Standard／Compact 與 Windows 100%／125%／150%
    scaling 下，固定 composer／action footer、單一 pane scroll、狀態、focus 與 error 仍可辨識且符合 WCAG AA。
15. 場次 details 只顯示唯讀 canonical metadata 與本場顯示欄位，不存在 library metadata editor
    action／event forwarding；display save 即使收到額外 track 或 metadata 欄位也不得越過 bounded intent。

## 後續文件與實作門檻

- Runtime 實作前以 ADR 鎖定 session plan persistence、confirmed-start payload、session-history schema
  migration、revision cancellation 與 BGM／performance coordinator ownership；只有實作落地後才同步
  `docs/architecture.md`。
- UI 以 focused behavior tests 鎖定 canonical import order、library fast path、manual exception、legacy
  recovery、global metadata separation、fixed viewport composition 與 focus movement。
- 第一版不建立 plan catalog、collaboration、public Reserve List、chat requests、automatic fuzzy link
  或 post-start history correction。這些能力需要各自的產品決策。

## References

- [Setlista 3rd session](https://nekosogi.org/setlista3)：版本、OBS Browser Dock／Source 與 changelog。
- [Setlista Control](https://app.nekosogi.org/setlista3/control.html)：Reserve List 每行一首、Now
  Singing、可編輯 Set List 與前進／返回操作。
- [BGM 待機播放契約](bgm-standby-lane.md)：獨立 BGM player、互斥 handoff、silence 與
  confirmed-start boundary。
