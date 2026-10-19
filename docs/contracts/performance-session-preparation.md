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
| Public projection                        | 沿用現有 player／lyrics／queue 的 gated projection，不直接發布 operator 的待播安排       |

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
| queued      | 待播，可排序、開始或明確略過                                                 |
| playing     | 已收到該 occurrence 的 confirmed audio playing，或使用者明確開始 manual item |
| completed   | 自然 ended，或使用者明確標記完成；暫停與提前切歌不算完成                     |
| skipped     | 尚未開始的 item 被明確略過                                                   |
| interrupted | 已開始後停止、提前切歌、發生錯誤、外部播放接手，或重啟恢復未關閉的 playing   |

Main 同時最多允許一筆 playing。queued 只可轉 playing／skipped；playing 可轉
completed／interrupted；結果不直接改回 queued。
再次加入建立新的 occurrence 並放到待播尾端，保留原紀錄。

Renderer 為每次開始建立 request identity，並比對 canonical track id 及 playbackRevision。
按下播放、BGM pre-roll 或 buffering 不代表 confirmed playing；只有 playing 事件才寫入進度。
Pause、seek、buffering 與 resume 保持同一 occurrence。重複／過期 ended 不得完成另一首或啟動第二個下一首。

連續播放預設開啟，自然完成或標記完成後接續下一個 ready item；關閉則單首後停止。
略過或停止本身不自動開始下一首；明確下一首會中止目前項目並開始下一個 ready item。
播放失敗不記完成、不自動前進；未確認開始的失敗 item 留在待播。
保存進度失敗時顯示可恢復錯誤，不冒稱完成或繼續自動前進。

Manual 只代表外部音訊或自行伴奏，以明確開始／完成操作管理，不送入 HTML audio、不假造播放時間。
開始 manual 時停止原本機播放；外部曲庫開始本機播放時中止 manual，避免存在兩份 NP。
BGM 保持既有明確啟用與音訊互斥流程，OBS 狀態不成為本地播放安排的 gate。

## Folder 介面

上方為精簡的單曲 NP 橫列，同時只能顯示零或一首曲目及真實播放階段。
下方主要空間是待播與已完成兩個累積清單，使用各自的 UiScrollLayout；標題與數量不進清單捲動。
略過／中止以明確結果標示，不加入已完成數量。窄版壓縮單曲區與分區間距，保留兩個並排清單的可用高度。

曲目使用 UiTrackRow，從 canonical track 解析 artwork／metadata，再套 occurrence 顯示名稱。
按鈕、狀態、搜尋、欄位、捲動及編輯視窗沿用正式 primitives 與現有 semantic tokens。
Folder 紙面與 ledger rules 提供分區，不複製 track anatomy、不增加一整欄空白設定。
設定與手動新增透過 UiModal 按需開啟，沿用 PerformanceSessionReviewPane 的 scroll／footer。

搜尋曲庫直接加入 ready item，不強制進入 editor。現有 playlist／album 可經明確取代確認建立安排。
移除／清除只影響本安排；清除／取代會先停止目前項目，main 也拒絕破壞性修改仍在 playing 的 item。
正在播放與已有結果的項目不直接編輯名稱或重新連結；目前顯示使用 start snapshot。
需要不同名稱時再次加入待播後調整，避免改寫本次或既有結果。

## Persistence、恢復與公開資料

重啟保留待播、已完成、略過、中止及 review cursor。Main 對每個 library 在該 process
第一次操作時執行一次 recovery，將殘留 playing 記為 interrupted；一般 refresh 不做 recovery。
不自動發聲、不自動開始下一首、不恢復假的 currently playing。

刪除曲庫歌曲保留 occurrence label 並解除連結；缺檔只阻止該項開始。
所有 main mutation 回傳完整 projected snapshot，renderer 序列化操作並在實際執行時解析 progress revision。

本地結果與一般 Recently Played、OBS 章節是不同紀錄。公開輸出沿用既有 feature gate、
queue.document 與 state.snapshot；`performanceSessionOutput.js` 只在安排持有 playback ownership
時從既有 plan progress 與 runtime current snapshot 產生 presentation，沒有另一份可寫 queue。
sourceName 沿用來源清單名稱，無來源時為「播放安排」；不新增獨立可編輯的場次標題。
僅 confirmed playing 的目前項目與 completed 項目使用該 occurrence 的 displayTitle／displayArtist。
同曲多次完成保留多筆，skipped／interrupted／queued 不列為完成，也不公開待播草稿。
本機曲目仍以 canonical track id 解析 media／artwork／lyrics timing；manual 使用 itemId，
無 audio clock／duration。既有100筆公開上限保留目前與最近完成紀錄。外部播放接手後恢復一般 Queue 投影。
OBS 章節仍是原有獨立時間標記服務，本次不遷移其歷史檔或宣稱與 completed 同義。

## Right Dock

沿用 Queue surface，保留一般佇列／最近播放 tabs，另以 MicVocal 獨立按鈕切換播放安排 variant，隨時可手動開啟。
安排自帶待播／已完成 tabs，與一般模式 tabs 共用 Dock header 的位置，兩者都使用 UiTabs。
arrangementTab 由 useAppRightDock 持有，header 與側欄 panels 共用它；切換模式／收合不清除選擇。
待播 tab 的唯一 NP 使用 PerformanceSessionCurrent，直接重用 QueueSection／QueueTrackButton 的現正播放區，
保留選取、封面播放／暫停、Enter／雙擊與更多選項，並以既有 UiButton 顯示場次停止／標記完成。
顯示名稱使用 occurrence snapshot，artwork 來自 canonical 曲目；播放／暫停與狀態仍來自唯一播放器。
manual 顯示手動進行中，不提供假音訊操作；載入時停止仍可取消，未確認開始前不能標記完成。
完成、停止與空狀態的播放第一首沿用原 playback owner，不依賴 OBS 或直播／錄製。
QueueSection 新增可選的歌手文字與播放停用／標籤，普通 Queue 預設行為維持原樣。
Dock header 下方以 AppRightDockPanel 的可選 summary slot 固定顯示來源與精簡統計，待播／已完成共用。
performanceSessionSummary 只投影既有 plan occurrence、runtime current id 與曲庫 duration；
同曲多次排入各算一筆，顯示總數、已知曲目總長與待播／目前播放／完成數，略過與中止分列。
載入中的 current 從待播移除但尚未算完成，已提交的 terminal result 優先，不重複計數。
manual、缺少曲庫資料、零／負／非有限或非數字的 duration 列為時長未知；已有有效長度的缺檔項目仍可計長度。
未知時長不補零，全部未知時已知總長顯示「—」；空安排為 0:00。總長包含各狀態的已知曲目長度，並非實際演唱耗時。
待播序號從 1 依目前順序顯示，排序／移除後重算；完成先按完成順序編號，再以最新在上顯示，略過／中止不占完成序號。
序號以 QueueTrackButton 的可選 ordinal／ordinalLabel 使用 UiTrackRow lead；RecentPlaybackList 轉送 entry 序號。
普通 Queue／Recent 不傳序號時不增加 lead 或空白欄位。序號是目前清單位置，不是 durable occurrence identity，刪除紀錄後會重算。
已完成 tab 比照 Recent，是獨立歷史清單，使用同一個 RecentPlaybackList／QueueTrackButton 與 Dock 單一 scroll，
不重複展示 NP、連續播放、結果標題／數量、ordinal 或狀態 badge。僅列 completed，最新在上，itemId 為 entry key；
同曲多次完成不合併，保留該次名稱與歌手、canonical artwork。略過／中止仍可在主區結果清單查看。
選取、封面重播與更多選項沿用 Recent 互動；重播經既有 duplicate intent 建立新 queued occurrence，再交給原 playback owner 開始，
原 completed 不變。新增 ID 只從該次序列化 main response 解析，不從未來的 renderer snapshot 猜測。
手動項目以「開始」明確啟動，缺檔／未 ready 項目保留可見但不可直接播放；選單提供再次加入待播及移除該次紀錄。
一般 Recent 的資料、預設文案、播放／藝人導航與 canonical metadata 操作不因重用而改變。
既有 PlanList 的 track row、排序、略過、移除與再次加入都呼叫相同 owner；Dock 不另持有播放進度。
側欄待播使用 PerformanceSessionQueueList，直接沿用 QueueTrackButton 的選取、封面開始／播放、Enter／雙擊、
hover／focus 更多選項與拖放指示。無 ordinal、獨立 play trail 或重製 track anatomy；主區仍使用原 PlanList。
canonical artwork 與 occurrence 顯示名稱分離，缺檔／未 ready 禁止播放，manual 以「開始」明確執行；
相關提示使用既有第二行文字，不另建狀態色或控制樣式。
待播 selection／menu／drag 都以 itemId 識別，同曲多次排入不合併。
拖放沿用 useDragReorder 的 before／after 與 action exclusion，提交固定 reorder-item intent
（itemId／targetItemId／position）；main 以最新文件確認兩者仍 queued，在同一次原子 mutation 完成搬移。
無效／已開始／已有結果的 target 拒絕；不以 renderer 連續多次 ±1 寫入模擬拖放。選單上下移、複製、略過與移除仍用原操作。
Folder 主區維持既有搜尋、單曲 NP 與待播／已完成雙清單，不因 Dock 展開或模式切換而替換內容。
Workspace toolbar 的獨立按鈕只顯示／收合播放安排側欄，不重排主區，也不開始歌曲。
其他頁面與 Dock 收合不停止播放。開始一段安排 ownership 顯示安排 Dock，連續下一首不反覆搶回使用者選擇。

OBS 設定提供預設關閉的「OBS 連線後顯示播放安排」，由 main 保存 bounded boolean。
它只消費既有 OBS WebSocket ready／degraded 狀態，不另掃描系統程序；首次 ready 或明確開啟偏好時顯示，
同一連線的時鐘更新、degraded recovery 不再打開。手動收合／切換優先；重新連線可再次顯示。
關閉偏好、OBS 斷線或未直播／未錄製都不停止本地播放，也不自動開始歌曲或啟用 Output gate。

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
