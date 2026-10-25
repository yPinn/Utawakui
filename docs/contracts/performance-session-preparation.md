# 播放安排與場次進度契約

## 產品角色

播放安排是獨立於 OBS 的本地工作流。未直播、未錄製、未啟用公開輸出或未連線 OBS 時，
搜尋、加入、排序、播放、暫停、完成、略過與查閱本地結果均可使用。場次來源是可選的
playlist／album 名稱，不是播放權限，也不要求先建立直播場次。

本地 Library 是媒體、canonical metadata、artwork 與可播放性的權威。Playlist／album
是可重用來源；安排擁有單次 occurrence，操作不回寫來源 collection。相同 track 可出現
多次，必須以不同 itemId 區別，不能以 trackId 去重演出進度。BGM 是獨立 standby lane。

## Ownership

| Owner                                    | 責任                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| Library                                  | Canonical track identity、media、metadata、lyrics、artwork 與存在性                      |
| Main plan store                          | Bounded items、順序、顯示名稱、連結、持久化進度、revision 與恢復                         |
| HTML audio／usePlayer                    | 唯一的播放時間與 play／pause／playing／ended／error 權威                                 |
| usePerformanceSessionPlan                | 序列化 IPC 與 main snapshot，不自行產生樂觀完成狀態                                      |
| Performance session playback coordinator | 將明確 item start 與 audio request／playbackRevision 關聯，協調單一 NP 與下一首          |
| usePlaybackTransport                     | PlayerBar、系統媒體鍵、自然 ended 的共用分派；安排作用時使用安排順序，其餘使用一般 Queue |
| OBS history                              | 直播／錄影的附加時間標記與章節，不是本地完成紀錄的權威                                   |
| Public projection                        | 沿用現有 player／lyrics／queue 的 gated projection，不直接發布 operator 的待唱安排       |

安排不複製一般 playback Queue 的去重模型；它保有 occurrence identity，但與一般 Queue
共用播放器與 transport 分派。同一時刻只有一個下一首決策 owner。安排播放中，PlayerBar
的 shuffle／repeat 控制停用，順序及是否接續由安排管理。外部曲庫播放接手時，安排釋放
transport；即使 canonical trackId 相同，也不能把外部播放當成原 occurrence。

## 資料與信任邊界

Main 在 library root 原子保存一份 performance-session-plan.json。Schema 保持 version 1，
舊資料缺少進度欄位時以 queued／progressRevision 0 遷入。不得保存 absolute path、media URL、
完整 library metadata、provider payload 或 OBS credential。

- 最多 500 個 items；同曲可重複，itemId 穩定且獨立。
- mode 為 library-track、manual 或供舊資料／失效來源恢復的 placeholder。
- displayTitle 去除首尾空白後必填，最多 200 字；displayArtist 是選填第二行，最多 200 字。
  兩者拒絕控制字元，且只作本安排的顯示，不修改曲庫 metadata。
- trackId 只接受既有 bounded canonical id；main 重新解析 availability，renderer 不提供路徑或 URL。
- sourceSnapshot 保留建立／重新連結當時的 bounded canonical title／artist；資料變更只提示，不自動覆寫顯示名稱。
- revision 描述 authored data；progressRevision 獨立描述播放進度，避免 reorder 或名稱調整讓合法 ended 失效。
- progressUpdatedAt 由 main 產生，用於結果的時間排序。
- set-progress IPC 只收 itemId、expectedProgressRevision、progress；未知狀態、過期 revision、非法轉換或缺檔開始均在寫入前拒絕。

準備狀態與進度是不同維度。Library item 的 ready 取決於音檔可用，manual 直接 ready；
placeholder／unavailable 必須先修復。正常 ready 不增加重複確認動作。

## 進度與單一目前播放

| 進度        | 行為                                                                         |
| ----------- | ---------------------------------------------------------------------------- |
| queued      | 待唱，可排序、開始或明確略過                                                 |
| playing     | 已收到該 occurrence 的 confirmed audio playing，或使用者明確開始 manual item |
| completed   | 自然 ended，或使用者明確標記完成；暫停與提前切歌不算完成                     |
| skipped     | 尚未開始的 item 被明確略過                                                   |
| interrupted | 已開始後停止、提前切歌、發生錯誤、外部播放接手，或重啟恢復未關閉的 playing   |

Main 同時最多允許一筆 playing。queued 只可轉 playing／skipped；playing 可轉
completed／interrupted；結果不直接改回 queued。
再次加入建立新的 occurrence 並放到待唱尾端，保留原紀錄。

Renderer 為每次開始建立 request identity，並比對 canonical track id 及 playbackRevision。
按下播放、BGM pre-roll 或 buffering 不代表 confirmed playing；只有 playing 事件才寫入進度。
Pause、seek、buffering 與 resume 保持同一 occurrence。重複／過期 ended 不得完成另一首或啟動第二個下一首。

連續播放預設開啟，自然完成或標記完成後接續下一個 ready item；關閉則單首後停止。
略過或停止本身不自動開始下一首；明確下一首會中止目前項目並開始下一個 ready item。
播放失敗不記完成、不自動前進；未確認開始的失敗 item 留在待唱。
保存進度失敗時顯示可恢復錯誤，不冒稱完成或繼續自動前進。

Manual 只代表外部音訊或自行伴奏，以明確開始／完成操作管理，不送入 HTML audio、不假造播放時間。
開始 manual 時停止原本機播放；外部曲庫開始本機播放時中止 manual，避免存在兩份 NP。
BGM 保持既有明確啟用與音訊互斥流程，OBS 狀態不成為本地播放安排的 gate。

## Folder 介面

主頁名為「演出安排」。實際來源（無來源時省略上下文名稱）、總項目數與已知總長由共用工具列集中呈現；未知時長、略過與中止數由同列「安排明細」圖示開啟 UiPopover，不重複分區計數。欄位 validation 留在 Modal，不讓草稿錯誤使主頁／Dock 統計失效。

PerformanceSessionCurrent 同時供主頁與 Dock 使用，共用 occurrence snapshot、phase 與動作 guard。主頁將目前項目與連續播放放在清單之前；場間音樂集中於側欄待唱 footer，主頁更多選項可用「顯示 BGM」直接開啟。空態只顯示提示與開始操作，不增加可見標題。BGM 沿用原音訊 owner，不列入安排項目、時長或紀錄。來源匯入／取代與清除收進最右的 UiActionMenu，保留原確認與 danger 語意。

下方是待唱及完整演出紀錄（completed／skipped／interrupted），所有寬度固定使用 UiTabs 與完整寬度表格，優先驗證預設 1280×850 Compact 與 280px Dock。各清單維持自己的 UiScrollLayout，分頁與計數不進清單捲動，切換分頁保留掛載狀態；搜尋與手動新增共用一列，低寬可換行；搜尋結果有獨立標題與數量，不取代待唱清單。紀錄的再次加入在既有選單中，不保留第二個壓縮曲名的行內操作。

窄視窗的演出安排與開啟的 Dock 各有實際欄位，不以 overlay 遮住主頁操作；一般頁維持原 shell 行為。極短的 session boundary（20rem 以下）沿用 Folder sheet 最小內容高度與工作區 UiScrollLayout，保證控制和清單可捲動到達，不把清單擠為零高度。其他尺寸維持 bounded panes。

主區使用共用 TrackTable，右側使用 UiTrackRow 精簡列，兩者從 canonical track 解析 artwork／metadata，再套 occurrence 顯示名稱。
按鈕、狀態、搜尋、欄位、捲動及編輯視窗沿用正式 primitives 與現有 semantic tokens。
Folder 紙面與 ledger rules 提供分區，不複製 track anatomy、不增加一整欄空白設定。
設定與手動新增透過 UiModal 按需開啟，沿用 PerformanceSessionReviewPane 的 scroll／footer。

搜尋曲庫直接加入 ready item，不強制進入 editor。現有 playlist／album 可經明確取代確認建立安排。
移除／清除只影響本安排；清除／取代會先停止目前項目，main 也拒絕破壞性修改仍在 playing 的 item。
正在播放與已有結果的項目不直接編輯名稱或重新連結；目前顯示使用 start snapshot。
需要不同名稱時再次加入待唱後調整，避免改寫本次或既有結果。

## Persistence、恢復與公開資料

重啟保留待唱、已完成、略過、中止及 review cursor。Main 對每個 library 在該 process
第一次操作時執行一次 recovery，將殘留 playing 記為 interrupted；一般 refresh 不做 recovery。
不自動發聲、不自動開始下一首、不恢復假的 currently playing。

刪除曲庫歌曲保留 occurrence label 並解除連結；缺檔只阻止該項開始。
所有 main mutation 回傳完整 projected snapshot，renderer 序列化操作並在實際執行時解析 progress revision。

本地結果與一般 Recently Played、OBS 章節是不同紀錄。公開輸出沿用既有 feature gate、
queue.document 與 state.snapshot；`performanceSessionOutput.js` 只在安排持有 playback ownership
時從既有 plan progress 與 runtime current snapshot 產生 presentation，沒有另一份可寫 queue。
sourceName 沿用來源清單名稱，無來源時為「播放安排」；不新增獨立可編輯的場次標題。
僅 confirmed playing 的目前項目與 completed 項目使用該 occurrence 的 displayTitle／displayArtist。
同曲多次完成保留多筆，skipped／interrupted／queued 不列為完成，也不公開待唱草稿。
本機曲目仍以 canonical track id 解析 media／artwork／lyrics timing；manual 使用 itemId，
無 audio clock／duration。既有100筆公開上限保留目前與最近完成紀錄。外部播放接手後恢復一般 Queue 投影。
OBS 章節仍是原有獨立時間標記服務，本次不遷移其歷史檔或宣稱與 completed 同義。

## Right Dock

曲庫 metadata、歌詞或封面更新不代表外部播放接手。播放器刷新同一次播放的曲目資料時保留 renderer-owned 場次 request token；以播放 request、revision 與最新讀取識別拒絕晚到結果，包含同曲重唱。EOF 仍由場次 controller 完成該 occurrence 並接續待唱項目，不因此落回一般 Queue。
場次開始只更新一般 Queue 的目前播放投影，不消耗同名待播曲、不將場次歌曲逐首寫入一般 Queue 的上一首歷史，也不推進原來源 cursor；回到一般播放時仍保留原待播順序。一般 Queue 的明確點播／插播行為保持原規則。

沿用 Queue surface，保留一般佇列／最近播放 tabs，另以 Tickets 獨立按鈕切換播放安排 variant，隨時可手動開啟。
安排 Dock 自帶「待唱清單／演出紀錄」tabs（後者僅為 completed 子集；略過／中止在主頁演出紀錄），與一般模式 tabs 共用 Dock header 的位置，兩者都使用 UiTabs。
兩種模式的 header 均維持單行、UiTabs 原生 12px inline padding 與 action group 12px 間距；最小寬度提高為 272px，預設／最大保留 280px，不縮小控制項或將按鈕拆到第二行。
arrangementTab 由 useAppRightDock 持有，header 與側欄 panels 共用它；切換模式／收合不清除選擇。
辨識與引導沿用原排版：Tickets 按鈕的 tooltip 說明目前模式、切換目的地與兩份佇列獨立；加入選單明示「加入一般佇列／加入演出待唱」。一般曲庫播放出現在演出頁目前項目時，在既有 phase 文字標示「一般播放」。完成空態說明須先加入演出待唱並從待唱開始，OBS 自動顯示設定則明示只控制側欄顯示、不自動播放。這些說明不新增區塊或改變播放與紀錄契約。
待唱 tab 的唯一 NP 使用 PerformanceSessionCurrent，直接重用 QueueSection／QueueTrackButton 的現正播放區，
保留選取、封面播放／暫停、Enter／雙擊與更多選項，並以既有 UiButton 顯示場次停止／標記完成。
顯示名稱使用 occurrence snapshot，artwork 來自 canonical 曲目；播放／暫停與狀態仍來自唯一播放器。
manual 顯示手動進行中，不提供假音訊操作；載入時停止仍可取消，未確認開始前不能標記完成。
完成、停止與空狀態的開始播放沿用原 playback owner，不依賴 OBS 或直播／錄製。
QueueSection 新增可選的歌手文字與播放停用／標籤，普通 Queue 預設行為維持原樣。
Dock 不為 OBS 狀態建立獨立 summary 空行。LIVE／REC 由同一個 PerformanceBroadcastStatus 投影有效觀察狀態，整合到待唱頁的「連續播放」資訊列（主區已顯示演出安排時改為「待唱順序」標題），或紀錄頁的「目前場次」標題列、場次操作旁。標記沿用 base 字型、完整 label 角色與 spacing／border／radius tokens；既有資訊列始終有實際內容，最小行高容納單行描邊標記，雙開不換行、不遮擋操作、不改變下方內容起點。無有效狀態時不顯示標記或空 status role，頂部分頁及操作仍維持單行。已完成項目的總數與時長放在演出紀錄固定 footer，待唱 footer 保留 BGM。
有未知時長時標示「已知」，全未知顯示「時長未知」；來源與各狀態／未知時長數明細在 Folder 主頁呈現。
兩個 surface 共用 PerformanceSessionSummary 與同一份純投影，不新增播放或統計狀態 owner。
Dock compact 摘要沿用曲庫 utility caption 與 formatLongDuration；全為曲庫項目顯示「首曲目」，包含手動項目時用「項」。
performanceSessionSummary 只投影既有 plan occurrence、runtime current id 與曲庫 duration；
同曲多次排入各算一筆，顯示總數、已知曲目總長與待唱／目前播放／完成數，略過與中止分列。
載入中的 current 從待唱移除但尚未算完成，已提交的 terminal result 優先，不重複計數。
manual、缺少曲庫資料、零／負／非有限或非數字的 duration 列為時長未知；已有有效長度的缺檔項目仍可計長度。
未知時長不補零，全部未知時主頁已知總長顯示「—」；空安排為 0:00。總長包含各狀態的已知曲目長度，並非實際演唱耗時。
待唱序號從 1 依目前順序顯示，排序／移除後重算；完成依 progressUpdatedAt 升冪顯示並從 1 編號，最早在上、最新在下，略過／中止不占完成序號。
目前安排的 completed 紀錄保持單一連續清單，沿用 RecentPlaybackList／QueueTrackButton；跨日不新增日期標題或重新編號，同曲不同 itemId 各佔一列。紙緣與既有分隔保留收據材質，不以日曆日期替代場次邊界。
序號以 QueueTrackButton 的可選 ordinal／ordinalLabel 使用 UiTrackRow lead；RecentPlaybackList 轉送 entry 序號。
普通 Queue／Recent 不傳序號時不增加 lead 或空白欄位。序號是目前清單位置，不是 durable occurrence identity，刪除紀錄後會重算。
已完成 tab 比照 Recent，是獨立歷史清單，使用同一個 RecentPlaybackList／QueueTrackButton 與 Dock 單一 scroll，
不重複展示 NP、連續播放、結果標題／數量、ordinal 或狀態 badge。僅列 completed，依完成時間升冪、最早在上，itemId 為 entry key；
同曲多次完成不合併，保留該次名稱與歌手、canonical artwork。略過／中止仍可在主區結果清單查看。
選取與更多選項沿用 Recent 外觀；封面是純圖片，不提供播放按鈕、Enter 或雙擊重播。
選單提供再次加入待唱及移除該次紀錄；再次加入僅經既有 duplicate intent 建立 queued occurrence，不立即播放，原 completed 不變。
手動與缺檔／未 ready 項目保留可見；一般 Recent 預設播放能力不變。
一般 Recent 的資料、預設文案、播放／藝人導航與 canonical metadata 操作不因重用而改變。
既有 PlanList 的 track row、排序、略過、移除與再次加入都呼叫相同 owner；Dock 不另持有播放進度。
側欄待唱使用 PerformanceSessionQueueList，沿用 QueueTrackButton 的選取、hover／focus 更多選項與拖放指示。
封面為純圖片，移除封面、Enter 及雙擊的直接開始入口；不增加獨立 play trail 或重製 track anatomy，主區仍使用原 PlanList。
canonical artwork 與 occurrence 顯示名稱分離，缺檔／未 ready 與 manual 項目維持原資料邊界；
相關提示使用既有第二行文字，不另建狀態色或控制樣式。
待唱 selection／menu／drag 都以 itemId 識別，同曲多次排入不合併。
拖放沿用 useDragReorder 的 before／after 與 action exclusion，提交固定 reorder-item intent
（itemId／targetItemId／position）；main 以最新文件確認兩者仍 queued，在同一次原子 mutation 完成搬移。
無效／已開始／已有結果的 target 拒絕；不以 renderer 連續多次 ±1 寫入模擬拖放。選單上下移、複製、略過與移除仍用原操作。
Folder 主區保留搜尋、共用目前項目、場間音樂與待唱／演出紀錄，不因 Dock 展開或模式切換而替換內容。
安排 Dock 待唱底部固定呈現兩段 BGM 來源與 transport，紀錄底部改顯示 completed 統計；切換分頁只隱藏 BGM presentation 並關閉搜尋，不重建播放 owner，清單捲動與 footer 分開。
演出模式使用區域暖白收據 surface、原 header 實線與紙緣；只有 OBS ready／degraded 且對應輸出 active、狀態讀取沒有錯誤時，才顯示 LIVE／REC 描邊章；不在頂部紙緣畫紅線，暖白紙緣與原分頁實線保持中性。
OBS 斷線或讀取失敗清除輸出強調，本地播放及 BGM 不因此停止或開始。
Workspace toolbar 的獨立按鈕只顯示／收合播放安排側欄，依可用寬度自然重排，但不開始歌曲。
主頁可見時，Dock 不重複目前項目、連續播放與 operational Notice，只保留精簡摘要及清單；切至其他頁面才恢復既有快捷控制。其他頁面與 Dock 收合不停止播放。開始一段安排 ownership 顯示安排 Dock，連續下一首不反覆搶回使用者選擇。

OBS 設定提供預設關閉的「OBS 連線後顯示播放安排」，由 main 保存 bounded boolean。
它只消費既有 OBS WebSocket ready／degraded 狀態，不另掃描系統程序；首次 ready 或明確開啟偏好時顯示，
同一連線的時鐘更新、degraded recovery 不再打開。手動收合／切換優先；重新連線可再次顯示。
關閉偏好、OBS 斷線或未直播／未錄製都不停止本地播放，也不自動開始歌曲或啟用 Output gate。

## 表單與動作文案

播放安排的新增／設定表單經 PerformanceSessionReviewPane 組合 UiModal：使用 default 寬度、small 高度上限與自然高度。
標題、body scroll、內距、固定 footer、鍵盤焦點與保存中 dismissal lock 皆由 UiModal 擁有。
手動新增只保留 shell 標題與一段用途說明；不再疊加內層捲動、重複標題或固定空白高度。

主頁與 Dock 的安排啟動按鈕共用「開始播放」動作描述，不以「第一首」綁定當前清單順位。
可用性仍由原 canStart／busy 管理；播放／暫停及顯示／收合等真正不同的動作保留各自準確名稱。

## 驗收

- 無 OBS 的加入、開始、暫停、恢復、自然完成與連續下一首；單首後停止。
- 手動開始／完成、略過、中止、播放失敗、缺檔、同曲重唱與外部播放接手。
- 重複／過期事件、進度 IPC 保存中立即 ended、reorder、結果再次加入與安全恢復。
- PlayerBar、媒體鍵、一般 Queue 的共用 transport；shuffle／repeat 在安排期間不產生另一個進度 owner。
- 1280×850 與 960×650、Dock 開／關、深淺主題、Standard／Compact：單曲區、清單捲動、長曲名、鍵盤焦點與錯誤均可辨識。

## References

- [架構圖](../architecture.md)
- [播放紀錄與恢復](playback-history-and-resume.md)
- [BGM standby](bgm-standby-lane.md)
- [外部整合](integration-adapter-contract.md)

安排 Dock 的待唱分頁只保留目前／待唱與 BGM 兩段控制；演出紀錄分頁在底部顯示 completed 的曲目數與已知媒體總時長，不把 queued／skipped／interrupted 混進完成統計。底部摘要沿用曲庫的 utility 字體、caption tokens 與 formatLongDuration；手動項目用「項」，缺時長保持「時長未知／已知」。切換紀錄隱藏 BGM 呈現並關閉來源搜尋，但保留其展開狀態與音訊生命週期。

## 紀錄頁封存與雙匯出

主頁與 Dock 紀錄頁共用 PerformanceSessionHistoryTools。目前與已封存場次的更多選項提供另存演出歌單、匯出場次時間軸；目前場次另提供結束並封存。Settings 最新 OBS 場次入口仍保留；紀錄頁固定讀取所選安排場次，不回退到另一場最新資料。

目前／封存區塊共用 AppRightDockSection 與 label 文字角色；封存項目直接重用 PlaylistSidebarRow 的52px集合列、40px UiCollageThumb、標題／metadata／選取與鍵盤語意，主區場次封面與列封面消費同一 canonical 曲目圖片。Main 摘要只附最多四個去重的 coverTrackIds，不包含 paths 或完整 items；手動或無圖片場次使用原集合封面 fallback。場次列關閉歌單播放 affordance，尾端更多選項與整列導覽獨立，暖白區重組既有 selection tokens。

點選封存集合由 useAppView.performanceArchiveId 導向主區 PerformanceSessionArchive，支援原本 Back／Forward；返回演出安排或選擇演唱工具會離開封存位置。主區沿用 AppFolderPage document、AppFolderDossier、UiCollageThumb、TrackTable 與共用場次摘要 formatter。每個 row 以 itemId 識別並保持來源順序；同曲連唱、手動、失連、略過與中止均保留，不自動轉為去重的正式 Playlist。兩個匯出入口在主區針對所選場次操作，Dock 更多選項仍保留；播放控制在主區檢視舊場時仍由 Dock 保持可用。

已讀取的空紀錄以精簡空態呈現，沒有固定高度或假曲目；首次讀取無資料時才顯示 UiSkeleton，更新時保留已有內容，錯誤可重試且不混入「尚無紀錄」。usePerformanceArchive 對快速切換與卸載後的回應使用 revision 防護，不讓舊場覆蓋新場，也不讀取另一場最新資料。只有標記的封存明細另提示可在時間軸查看，不製造曲目佔位。

紀錄分頁是這三項工作的共同入口，不另外擴張頂部分頁或常駐工具列：

- **目前場次**：每次演出各一列，依序平鋪，跨日也保持同一清單。主頁維持其完整 completed／skipped／interrupted 結果，Dock 維持 completed 子集，兩者仍各自符合現有 scope。
- **已封存場次**：只有明確結束／封存後才新增一筆集合項目；Dock 集合列顯示名稱與封存日期（YYYY/MM/DD），主區集合列副標與詳情類型仍為「演出歌單」；比照 Playlist 的簡潔層級，首數／時長／完整結束時間集中在主區摘要。點選可檢視該場的完整逐次演出明細。資料身分仍是場次，不冒充已建立的 Playlist。日期只是集合 metadata，不再將目前曲目按天切段。
- **場次操作**：Dock 在該場既有更多選項集中「另存演出歌單」與「匯出場次時間軸」，避免新增兩顆常駐頂部按鈕；主區集合詳情顯示這兩個明確入口。結束／封存後可引導另存歌單；沒有合格資料時提供原因，不呈現假成功。

| 入口           | 用途及保留資料                                           | 執行前必須呈現                                                                       |
| -------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 另存演出歌單   | 下次使用的獨立 user playlist；維持選定曲目第一次出現順序 | 可編輯名稱、完整安排／完成曲目範圍、實際保存數、同曲合併數、手動／未連結或失連排除數 |
| 匯出場次時間軸 | 影片章節；保留每次重唱、標記及對應輸出的真實時間戳       | 明確場次身分、直播／錄影來源、偏移量、章節預覽與缺少時間戳的項目                     |

明確結束／封存是唯一邊界，不依經過多久、日曆跨日、Queue 播完或 OBS 斷線自動封存。確認視窗說明會停止目前演出，經既有 playback.stop 將進行中項目標為 interrupted，不假稱 completed；main 仍拒絕有 playing 的封存。main 在同一 performance-session-plan.json 原子保存完整來源、所有 scalar items、逐次時間軸與 endedAt，再輪替新 sessionId 與空白安排。保存失敗不清目前場次；舊 sessionId 重試不清新場次。舊資料首次讀取只補場次識別，不按日期分場、不回推開始時刻。

Schema version 1 加入 optional sessionId、sessionStartedAt、timeline、archives。封存最多 100 場，每場最多 500 個安排項目、2,000 筆時間軸；達上限拒絕操作而不刪歷史，損壞封存拒絕覆寫。投影只帶封存摘要，明細以 get-session 指定 id 讀取，可用性由 main 曲庫重新解析。

Playlist 是封存資料的一個可重用投影，不是原始演出紀錄的替代品。沿用 playlists.json 唯一 trackIds 與 main 驗證的 canonical ids：重唱依第一次出現位置合併，手動／未連結項目不冒充本機歌曲；保存前明確預覽損失，保存不修改原場紀錄、不開始播放或 OBS。建立與填入需原子化或可續寫同一已建立 id，避免失敗重試產生多份空歌單。若要精確恢復含重唱及手動項目的安排，使用獨立安排快照，而不是修改 Playlist 全域去重契約。

逐次識別已改為 confirmed start，production 不再將 Output publication 接到 sessionHistoryService.handleProjectionChange。安排與手動項目經 main 驗證 queued、progressRevision、可用性及唯一 current 後，以 sessionId＋itemId 去重，擷取 OBS 快照並與 progress playing 原子保存。安排外由 App 唯一 usePerformanceHistoryObserver 訂閱 player.onPlaying，送 UUID epoch、playbackRevision、trackId；main 查 canonical metadata 並拒絕同／舊 revision 及已淘汰 epoch。同曲兩次開始各有 main 產生的 occurrence id；pause／resume、seek、buffering 不增加 revision，投影重送不再是紀錄來源。OBS convenience log 保留既有略過門檻；安排逐次時間軸不因此撤回已確認的開始。

時間戳沿用既有 OBS 輸出 snapshot；沒有時碼就明示缺少，不以 progressUpdatedAt、曲目 duration 或目前時鐘回推真正開始。指定封存場次必須讀該場對應的歷史，不能拿 getLatestSession 的另一場最新 OBS 資料默默合併。直播／錄影 clock 各自保留，標記與重唱原樣保存在封存資料；既有章節格式與偏移預覽只做投影，不回寫原時間。

標記在擷取 OBS 前綁定 main 的 library root 與 sessionId，封存先等待既有擷取完成再輪替，延遲標記不會混入新場。斷線的 stale active flags 不取得快照；缺時碼的 occurrence 仍保存，章節視窗顯示排除數。

固定 IPC：archive（sessionId／name）、get-session（sessionId）、preview-playlist（sessionId／scope）、save-playlist（sessionId／scope／token／name）及 session-history:confirmed-playing（epoch／playbackRevision／trackId）。全部限定 main frame sender；preload 刪除額外 path、trackIds、timeline。Main 序列化安排操作；歌單 preview token 綁定場次、範圍、逐項 revision 及可用性，確認時重算。建立與完整 trackIds 同次原子寫入，token＋名稱形成持久化冪等 key，遺失回應後重試不另建歌單。

驗收涵蓋同曲連唱、pause／seek／過期重送、manual、兩套 OBS clock、標記、離線／缺時碼、封存與重啟讀舊場、封存失敗保留、歌單預覽／失效 token／重試，以及 272px 側欄。合成素材／受控 adapter 測試不代表真實 OBS 連線或聽感驗收。

封存演出歌單的主區使用 TrackTable 的 performance-archive 唯讀 profile，依 itemId 保留每次演出及手動項目，欄位為序號、曲目／歌手、時長、演出狀態。停用排序、欄位操作與播放／伴奏處理／曲庫選單，保持原始順序；窄容器沿用表格量測與欄位收斂，先收起時長、必要時收起主區序號，曲目與演出狀態保留。右側完成紀錄不顯示序號，以 ASC 列順序表達先後；待唱清單仍有順位。一般最近播放與其他集合表格不變。

目前場次主區的待唱／演出紀錄沿用 TrackTable 的 performance-session profile；表格只管理資料欄與列幾何，PerformanceSessionPlanList 以 itemId 擁有選取編輯、Alt 上下移動、播放、略過、複製／再次加入與移除的 intent，透過 entry 事件及 row-actions slot 組合，不冒用 trackId 曲庫操作。歷史列維持原本不直接播放／編輯的規則，使用既有再次加入待唱選單。窄容器先收時長、再將狀態移到曲目副標、最後收主區序號，操作欄常駐；右側待唱與完成紀錄仍是原精簡曲目列。主區歷史內容以獨立 UiScrollLayout 包含目前紀錄與封存集合，避免封存區超出工作區底部。

場次段落間距由單一 owner 設定：目前與封存段落間 gap 使用 ui-space-3，封存分隔線後 padding 使用同一 token，不再另外疊 margin；集合列間使用 ui-track-list-gap，與現有曲目列表節奏一致。AppRightDockSection 繼續擁有標題與內容間距，表格內部維持原 ledger row padding 與零列間 gap。

主區目前場次在所有寬度固定使用「待唱／演出紀錄」分頁，單一表格佔滿工作區內容寬度，不再觀察寬度切換並排欄。兩個面板保持掛載，僅切換顯示，保留各自搜尋、選單與捲動 owner。右側待唱與完成紀錄都不顯示序號，仍以 occurrence id 維持實際順序、拖曳與選單移位；主區表格的序號仍依原欄位收斂規則顯示。

演出表格的 identity 欄以 fluid track 吸收剩餘寬度，原 spacer 在這兩個 profile 僅保留既有分組間距；時長、112px狀態及操作欄形成右側固定群組。純時長列不再預留伴奏處理圖示的 grid lane，數字與表頭同右緣。待唱與紀錄消費相同 profile／gap／padding，不以逐頁 CSS 覆蓋對齊。

Sidebar 歌單／專輯選單提供目的地明確的「加入演出待唱」，一般「新增至佇列」仍只屬一般播放 queue。演出入口只送 sourceId，main 從目前 library 的 playlists 重新解析權威成員，透過 append-from-collection 單次持久化追加，容量不足整批拒絕；同曲成員各自建立 itemId，保留原待唱、正在演出、手動項目、source、review cursor、timeline 與archives，不執行replace或播放。完成後顯示安排Dock待唱頁，錯誤沿用同一plan error owner；OBS直播／錄影狀態或Dock顯示模式不暗中改寫一般queue目的地。

主區紀錄的外層 UiScrollLayout 已保留捲軸空間，內層表格只在真正溢位時保留，避免雙重預留使紀錄表格比待唱少一條捲軸寬度；切頁時右側欄維持共同對齊線。

封存主頁的另存演出歌單／匯出場次時間軸入口，使用 CollectionActionRail 的 actions slot 與 UiIconButton，沿用曲庫操作列的尺寸、間距及 tooltip／無障礙名稱；不新增播放、搜尋或密度工具。曲庫原有操作順序及預設工具不變。封存列更多按鈕可由原生 Enter／Space 開啟，Esc 關閉並將焦點返回原按鈕；focus-within 使按鈕繼續顯示，透明度切換不改變佔位。

封存主頁的「加入演出待唱」同樣使用此操作列及 usePerformanceQueueActions；renderer只送封存sessionId，main從權威archives取出原始items，一次檢查500項上限並原子追加。保留原順序、重唱、手動／未連結項目與顯示snapshot；每次追加都建立新itemId、queued進度及初始revision，不合併或套用另存Playlist的排除規則。重複點選會再次追加完整場次；原待唱、playing occurrence、source、review cursor、timeline與archives不變，不發出播放／暫停意圖。來源不在archives或容量不足時整批拒絕，原檔不部分寫入。

單曲右鍵選單（曲庫、試聽、一般佇列、目前歌曲）及主區歌單／專輯既有更多操作選單也提供明確的「加入演出待唱」。所有入口透過 usePerformanceQueueActions 委派同一個 plan owner：單曲只送 trackId，集合只送 sourceId；不呼叫播放器，不更動一般 queue。單曲即使正在播放或已排入也可再次加入，每次都是新的 queued itemId；新增後依原單曲編輯行為選取新 occurrence，與目前播放 occurrence 分開。保存中入口停用並有 intent guard；失敗由原 plan error owner 呈現。

僅 Right Dock 的目前演出操作以靠右群組排列，主要播放／完成動作在最右側，DOM 與鍵盤順序維持次要到主要。次要停止及開始播放使用 UiIconButton 的既有 tooltip、無障礙名稱、尺寸與間距 tokens；標記完成保留明確文字。主區集合與演出工作區維持原操作順序、按鈕樣式與對齊，只新增明確的加入演出待唱入口。
