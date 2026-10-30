# 曲目試聽契約

> 狀態：lane 仲裁（Step 1）與試聽 player／overlay／入口（P1）已實作；封面主色背景已實作；同步歌詞卡與音量條（P2）尚未實作。

本契約定義 album／artist／playlist 頁的「曲目試聽」：使用者在全視窗 modal 中逐首聽
一段精華片段，用來快速篩選歌曲並以曲目右鍵選單的同一組動作加入佇列或播放清單。它是只供本機監聽的
預覽，不是一般播放、不是 BGM，也不是演出。

## 本地音源與入口資格

試聽只接受 Main 提供的 `utawakui-media://track/` 本地音源。來源 metadata、
未下載位置、缺檔或未通過目前發行音源驗證的曲目不納入序列，不啟動來源串流或下載。
不要求先完成伴奏處理。專輯沿保存的來源曲序，過濾後保留相對順序；從選取的可用
曲目開始，未選取時從第一首可用曲目開始。藝人與全部曲目頁隨機試聽（見下方入口）。

`useTrackPreviewEligibility` 只控制入口，不供封面、統計或曲目展示使用。來源專輯
重用 `LibraryReleaseCatalog` 當頁 Main 投影的全目錄 `availableCount`，不把第一頁
沒有持有誤判為整張沒有持有；其他專輯只對目前選取集合做有界成員驗證。確認中、
確認失敗或全無可用本地音檔時停用入口，不做啟動全庫摘要。換庫、revision／成員
改變、canonical Map 更新與離頁使舊結果失效；展示資料保持可讀。

入口資格是讀取時的快照。每次開啟仍取得 fresh Main admission；若檔案在讀取後
失效，拒絕開啟並更新入口資格。舊 scope 的驗證不得更新新頁或較新的 catalog
快照。已開啟後發生媒體讀取錯誤則沿既有錯誤流程跳過；片段正常結束仍重播，
下一首由使用者操作。試聽不中途轉成線上來源。

非來源專輯的入口檢查使用頁面私有 member resolver／projection，與使用者播放的
fresh resolver 分離，避免兩者互相取代請求 token 而誤判不可用。私有檢查只留當前
集合，換集合後舊結果不採用，下一次檢查及卸載會清理；實際開啟仍走共用操作驗證。

## 現有可聽來源盤點

加入試聽前，App 內只有下列三個實際產生聲音的 owner。開發工具（音樂分析 reference
annotation、歌詞 timing editor）重用演唱播放器，不是獨立來源。

| 來源       | Owner                                                                   | 輸出路由                                                         | 狀態                                                                                                                                                                                                 | 互斥關係                                     |
| ---------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 演唱播放器 | `src/composables/usePlayer.js`＋`player/usePlayerAudioGraph.js`         | 系統預設 monitor；另可經 capture graph 送往使用者選定的 OBS sink | `playbackPhase`：`idle`／`buffering`／`playing`／`paused`／`seeking`／`ended`／`error`                                                                                                               | 經 `registerBeforePlaybackStart` 與 BGM 互斥 |
| BGM deck   | `src/bgm/audioDeck.js`＋`handoffCoordinator.js`＋`sessionController.js` | 只送系統預設 monitor                                             | coordinator `phase`：`idle`／`bgm-playing`／`stopping-bgm`／`manual-hold`／`track-preroll`／`track-active`／`track-paused`／`postroll-silence`／`error`；`audibleLane`：`performance`／`bgm`／`null` | 由 coordinator 仲裁；演唱優先                |
| 節拍器     | `src/utils/metronomeClickEngine.js`＋`useMetronome.js`                  | 獨立 AudioContext，只送系統預設 monitor                          | `isRunning`                                                                                                                                                                                          | 不屬於 lane，可與演唱或 BGM 同時發聲         |

演唱播放器的狀態另有下列訂閱者；任何寫入演唱播放器 state 的行為都會同時觸發它們：
Output projection（Now Playing／Lyrics／Setlist）、由 projection 推導換歌的 OBS session
history、最近播放（`onPlaybackProgress`／`onEnded`）、PlayerBar Queue 自動下一首
（`onEnded`）、BGM handoff（`onPlaying`／`onPaused`／`onEnded`／`onStopped`）、SMTC、
taskbar、視窗標題、啟動恢復、節拍器自動 BPM、歌詞與 Self-View。

### 盤點發現

1. **Pre-start gate 只有一個槽位。** `registerBeforePlaybackStart` 直接覆寫單一
   `beforePlaybackStartListener`，現由 BGM `sessionController` 佔用。試聽若再註冊會靜默
   取代 BGM 仲裁，因此不得註冊第二個 listener。
2. **互斥邏輯分散在 BGM 內部。** 目前「同時最多一條 lane 可聽」只以
   performance↔bgm 兩兩規則實作於 `handoffCoordinator`；`audibleLane` 是唯一能回答
   「現在誰在出聲」的狀態，但它屬於 BGM 模組。
3. **系統預設 monitor 不等於安全。** BGM、節拍器與試聽都只送預設 monitor；若 OBS
   以桌面音訊擷取預設裝置，這些聲音都會進入直播。BGM 已以 session mode 約束此風險，
   節拍器尚未約束（不在本契約範圍）。

## 可聽 lane 規則

- 互斥 lane 擴充為 `performance`、`bgm`、`preview` 三條；任一時刻最多一條可聽。
  節拍器維持輔助來源，不加入 lane，但試聽期間必須停止（見下方進入順序）。
- 自動路徑的優先序：`performance` > `bgm` > `preview`。演唱或 BGM 的任何開始意圖都會
  先結束試聽；任何自動 BGM 恢復都不得在試聽持有 lane 時發聲。
- 開啟試聽本身是使用者的明確意圖，等同按下演唱與 BGM 的暫停：它會取消仍在 pre-roll
  等待的演唱開始，但不會在 `record`／`live` 期間發生（見進入順序第 1 步）。
- 仲裁的單一事實來源是 BGM coordinator 的 `audibleLane`，值域擴充 `preview`。
  Pre-start gate 維持單一 listener：coordinator 的 `beforePerformanceStart()` 開頭先搶占
  試聽，因此不需要第二個 listener，也不新增第二個仲裁器。
- Coordinator 只認識 lease：`acquirePreview({ onPreempt })` 回傳 `{ release }` 或 `null`；
  被搶占時呼叫 `onPreempt`，由試聽 owner 自行停止 element。對外入口是 BGM session
  controller 的 `acquirePreviewLane()`。

## 試聽狀態機

```text
closed ──open──▶ acquiring ──granted──▶ playing ⇄ paused
   ▲                 │                    │
   │              blocked                 ├─ segment end → replay（同一片段）
   │                 │                    │
   └──── releasing ◀─┴──── close／preempted ┘
```

| 狀態                | 意義                                                             |
| ------------------- | ---------------------------------------------------------------- |
| `closed`            | 無試聽 element source，不持有 lane                               |
| `acquiring`         | 正在讓演唱暫停、BGM 淡出、節拍器停止；可被取消                   |
| `blocked`           | session mode 非 `inactive`，或來源無法播放；modal 可瀏覽但不發聲 |
| `playing`／`paused` | 持有 `preview` lane；pause 仍持有 lane，避免 BGM 被意外恢復      |
| `releasing`         | 停止並清空試聽 element，釋放 lane                                |

`acquiring` 使用 generation token；關閉 modal、切換卡片或被搶占時，舊的 acquire
結果一律丟棄，與 coordinator 既有 `nextGeneration()` 模式一致。

## 進入順序（acquire）

1. **檢查 session mode。** `sessionMode` 不是 `inactive`（`record`／`live`／`reconnecting`）
   時回傳 `null` 並進入 `blocked`；此時不得碰演唱播放器，避免暫停正在進行的演出。不提供覆寫。
2. **取消待開始的演唱。** `usePlayer.cancelPendingStart()` 遞增 start revision，靜默丟棄
   仍在 pre-start gate 等待的 `playTrack`／`play`，不發出 terminal stop。
3. **暫停演唱播放器。** 呼叫既有 `pause()`。演唱播放器保留 track、`src` 與 position，
   不卸載、不改 Queue。`pause` 事件是非同步的，coordinator 在 acquire 時直接把
   performance 標為 paused，晚到的 `notifyPerformanceInterrupted` 不會覆寫 lane。
4. **靜音 BGM。** Coordinator 遞增 generation（取消 post-roll／pre-roll 等待與進行中的
   BGM start），清除 `performanceHandoffPending`；若 BGM 可聽或 requested，以正常
   fade-out 停止並清除 `bgmRequested`／`restorePending`。BGM 原本就安靜時保留
   `restorePending`，讓之後的演唱結束仍可依原意圖恢復 BGM。
5. **套用延後的 BGM 換源。** Acquire 淡出期間的 `replaceBgmSource` 會延後，淡出完成後套用。
6. **停止節拍器。** 試聽 owner 在 lane 取得後呼叫 `stop()`。
7. generation 仍有效時記錄 `audibleLane = 'preview'`；phase 投影為 `track-paused`
   （有暫停中的演唱）或 `manual-hold`，試聽 element 才開始播放。

## 退出順序（release）

- 關閉 modal、Esc、或 App 失去試聽 surface 時：停止試聽 element、清空 `src`、釋放 lane。
- **不自動恢復任何來源。** 演唱播放器維持暫停在原 track／position（因為從未卸載，
  不需要另存 snapshot）；BGM 維持 `manual-hold`；節拍器維持停止。理由與啟動恢復契約
  一致：恢復發聲必須來自使用者的新意圖。
- 試聽內的「從這首開始播放」先完成 release，再呼叫演唱播放器 `playTrack`，從此刻起才
  是正式播放並產生所有正常副作用。

## 被搶占（preemption）

下列任一意圖發生時，coordinator 同步呼叫 `onPreempt` 並釋放 lane，試聽 owner 立即
cut（不 fade），原意圖再繼續：

- 演唱播放器任何 start／resume 路徑（PlayerBar、鍵盤、SMTC、taskbar、Queue、場次）——
  經 `beforePerformanceStart()`；`notifyPerformancePlaying()` 也會防禦性搶占。
- BGM `requestBgmPlay()`——在設定 `bgmRequested` 前先結束試聽。
- Session mode 變成 `record`／`live`／`reconnecting`。
- Coordinator `dispose()`。

Acquire 尚未完成時，上述意圖會以 generation 使該次 acquire 回傳 `null`。

## 試聽持有 lane 時的防護

- `notifyPerformanceEnded()`（例如曲目被刪除觸發的 `cleared`）只重設 performance
  旗標，不啟動 BGM、不改 `restorePending` 與 lane。
- `requestBgmPause()`（含 Emergency Cut）只清除 BGM 意圖，不改 lane；deck 已停止。
- `replaceBgmSource()` 在 BGM 未 requested 時只換源，不恢復播放。
- `usePlayer.syncCurrentTrack()` 在曲庫更新換 URL 時，若 start revision 已被取消就不恢復播放。

## 試聽 owner 與 overlay

- Owner 是 `src/composables/useTrackPreview.js`（module-scope 單例，自有 audio element）；
  `src/components/track/TrackPreviewOverlay.vue` 只投影狀態並送出意圖，不 import 演唱播放器。
- 入口：全部曲目／album／artist／playlist 頁 CollectionActionRail 的「試聽」按鈕，位於隨機播放之後。
  曲目清單是目前可見（套用搜尋後）的曲目，從選取中的曲目開始，否則從第一首。
  順序依清單是否經過編排決定（`src/utils/trackPreviewOrder.js`）：album 的來源曲序與
  playlist 的使用者曲序維持清單順序；artist 與全部曲目是衍生集合，每次開啟時隨機排序，
  選取中的曲目固定為第一首，未選取時整份隨機。欄位排序只是瀏覽方式，不算編排。
- 播放曲目原始 `track.url`；`toPlayableTrack()` 會換成分離結果的 stems URL，試聽不使用。
- 音量在開啟時沿用演唱播放器目前音量，之後不回寫；靜音只作用於試聽 element。
- 按鍵以 window capture listener 處理，只在焦點位於試聽 dialog 內時作用：↑／↓ 換卡、M 靜音；試聽沒有任何
  播放／暫停入口（不提供按鈕、點封面或 Space），換到哪張卡就播放哪張，只有 lane 拒絕（錄影／直播）
  時維持靜音；Space 仍被攔下，不傳到演唱播放器；其他按鍵也 `stopPropagation`，不傳到全域快捷鍵，
  避免改到演唱播放器的音量、靜音或移調。Esc、Tab 與焦點交給 `UiModal`；F 鍵放行，換頁會
  unmount 並 release。「更多」選單開啟時鍵盤交給選單。
- 滾輪在卡片區每 450ms 最多換一張。
- 視窗失焦（切到其他視窗）或隱藏（縮到 tray 或最小化）時暫停但保留 lane；焦點回來時只自動續播
  這種失焦造成的暫停，使用者暫停、被搶占或換卡後的暫停不會自動續播；關閉 overlay、換 collection 或
  LibraryBrowseContent unmount 時 release。
- 卡片動作依工作區分組，不使用 modal footer：封面旁直排的曲目操作就是曲目列右鍵選單本身
  （更多＝`TrackActionMenu`，與該列右鍵傳入同一份 per-track 選項：從播放清單移除、前往專輯），
  加上取自該選單的「加入佇列」捷徑；不提供右鍵選單沒有的試聽專屬動作。編輯資訊與前往專輯會先
  關閉試聽。版面依慣例為「目前播放資訊＋媒體（置中成一組）｜一條邊欄」：資訊欄固定 15rem（窄於封面，讓這組有餘寬置中、資訊內縮），含歌名、藝人與進度；正式播放鈕在封面右下角，只在 hover 或鍵盤焦點時出現（`UiArtworkReveal`，無障礙名稱「從這首開始播放」；先 release，再以可見清單建立 Queue 並正式播放）；邊欄內含兩個單位：對齊封面中央的曲目操作，以及在底部、live 尺寸的上一首／下一首；整個視窗表面以封面主色透過 `UiModal` 的 `tint` 淡入（只用於表面，不改變文字或控制項顏色）；封面 hover 時另有角落暗角襯托播放鈕；靜音放在 `UiModal` 標題列的工具區。換卡時只有歌名做方向滑動，藝人列直接更新。在目前封面按右鍵，會在指標位置開啟同一份右鍵選單；選單觸發點須停止開啟用的點擊冒泡，否則選單掛載時註冊的 window 點擊監聽會把它當成外部點擊而立即關閉。
- 歌名與藝人沿用 PlayerBar 的 CTA：有所屬專輯時歌名前往專輯，可配對的藝人 credit 前往藝人頁
  （`TrackArtistCredits`）；無專輯或無法配對時維持純文字。兩者都先關閉試聽再切換頁面。
- 外框使用共用 `UiModal`（`wide`）；`UiModal` 一律掛到所屬 renderer root 的 overlay host，遮罩因此蓋過 Folder 分頁與 Right Dock（見 Token v2 完整替換契約）。`UiActionMenu` 的 z-index 低於 dialog，teleport 到 surface host
  會被蓋住，因此 modal 內容以 `track-preview` surface 提供自己的 overlay host，選單只在開啟時
  mount（host 此時才在 document 內），畫在 dialog 的 stacking context 內。
- `UiModal` 的 Teleport 使用 `defer`：LibraryBrowseContent 與 library host 在同一輪 mount，host 尚未插入
  document，未 defer 時目標為 null，第一次開啟就會讓 Vue patch 崩潰並凍結頁面。
- 播放錯誤以 `TRACK_PREVIEW_PLAYBACK_FAILED` 記錄並跳到下一首；整份清單都失敗時停在錯誤狀態。

## 副作用邊界

試聽 element 不訂閱也不寫入：演唱播放器 state、Queue、最近播放、`playback-usage.json`、
啟動恢復、Output projection、OBS session history、SMTC、taskbar、視窗標題、節拍器 BPM、
歌詞 workspace 與 Self-View。

- 只播放曲目原始音訊，不使用分離結果，不套用 pitch／tempo／guide vocal，不接 capture graph。
- 媒體經既有 `utawakui-media:` track-id allowlist resolver 取得。
- 試聽音量為獨立 session 狀態，預設沿用演唱播放器目前音量的值，但不回寫。

## 精華片段

- 目標點依序取：M2 第一個 `chorus` section 起點 → 逐行時間歌詞推估的副歌起點 →
  時長 30%。每一層都可缺，讀取失敗安靜退回下一層，不記錄診斷。
- 歌詞推估只讀偏好來源的既有檔案與逐行時間（不需逐字）：正規化後以 bigram 相似度
  ≥0.8 容許小改詞，取重複次數 × 行數最高的連續 2–4 行段落，並取其落在全曲 15% 之後
  的第一次出現；時間戳無效或未遞增、涵蓋未達全曲一半、或起點超過 75% 時不採用。
  起點依來源 `offsetMs` 換回音訊時間。
- 進入緩衝一律套用：取目標點前 1–5 秒內最晚的高信心（≥0.5）小節起點，否則目標點前
  2 秒；再滑入曲長內。開始播放時試聽 element 音量以 300ms 淡入。
- 長度：預設 30 秒，不超過曲目結尾；片段結束（含碰到檔案結尾）後從片段起點重播同一首，換卡一律由
  使用者操作。只有無法播放的曲目會自動跳到下一張。
- 進度顯示：播放中試聽 owner 每個 animation frame 讀取試聽 element 的 `currentTime`，
  避免 `timeupdate` 約 4Hz 在 30 秒片段上逐格跳動；片段結束判定仍由 `timeupdate` 負責。
  暫停、載入下一首或關閉時停止讀取，modal 的 progress 不另加補間。
- 畫面只顯示無文字的片段進度條（accessible name「試聽進度」）；不顯示片段如何選出
  （副歌／估算等來源），也不顯示片段起訖或已播放的具體時間。`segment.source` 只供
  owner 內部使用。
- 不因試聽觸發分析、歌詞取得或任何背景工作。

## 驗收

- 演唱播放中開啟試聽：演唱暫停於原位置；關閉後 PlayerBar 顯示原曲與原位置，最近播放
  無新增，OBS Now Playing 與 session history 不變。
- BGM 播放中開啟試聽：BGM 淡出至 `manual-hold`；關閉後不自動恢復。
- 試聽中按 PlayerBar 播放或媒體鍵：試聽立即停止，演唱經既有 BGM handoff 正常開始。
- 試聽中按 BGM 播放：試聽立即停止，BGM 正常 fade-in。
- `record`／`live` 期間開啟：不發聲並顯示原因；試聽中進入 `record`／`live`：立即停止。
- 任何時刻 `audibleLane` 最多一個值，且與實際發聲來源一致。
- 演唱 pre-roll 進行中開啟試聽：演唱不會在試聽中開始；關閉後按 BGM 播放可正常發聲。
- 試聽中按 ↑／↓／M：只影響試聽，演唱播放器音量與靜音不變。
- 「更多」選單顯示在 overlay 上方且可用鍵盤操作。
- 單元測試覆蓋 acquire／release／preemption、generation 取消與每一條防護（已實作：
  `handoffCoordinator.test.js`、`sessionController.test.js`、`usePlayer.test.js`）。
