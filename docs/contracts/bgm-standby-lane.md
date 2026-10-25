# BGM 待機播放契約

本契約定義 BGM standby lane 的產品行為、控制面、音訊交接與驗收邊界。本機曲庫 plan、
單 deck monitor／shared capture、互斥 handoff 與演出安排內的 BGM 控制的基礎 slice 已實作；
confirmed-start session snapshot／公開投影、完整現場導覽與實際 OBS 錄音聽感仍
是 release gate。競品證據見
[競品調查 §5.1](../research/product/competitive-research.md#51-bgm-lane-與無伴奏項目已形成重複需求訊號)。

## 產品角色

BGM 是本地 session 待唱清單的配套，用於演唱前、曲間與演唱結束後場間音樂，讓使用者可在休息、
說話、準備或臨時找歌時維持節目聲音。它是 local-first 的第二條播放 lane，不是一般聆聽
播放器的模式，也不是 Queue、Recently Played、chapter 或無伴奏演出項目的特殊 track。

BGM 與演唱播放器嚴格互斥。任一時刻只有一條 logical lane 可以向 programme／capture bus
產生可聽輸出；禁止的是 BGM 與演唱曲目之間的 crossfade 或重疊，不是 BGM lane 自身的
fade、dim 或曲目切換。跨 lane 交接仍以 BGM bus 歸零、純留白與演唱 lane 的明確開始建立
可剪輯的 timeline boundary。任何 BGM fade tail 都必須在 pre-roll 開始前結束。

第一版 BGM transport 使用單 deck，支援 fade-in、fade-out、loop、手動 Talk／Dim 與
Emergency Cut。BGM A／B deck、曲間 crossfade、cue／預聽與 beat-matched transition 保留為
後續能力；runtime contract 以 logical BGM bus 為邊界，不把未來實作永久綁死成單一 audio
element。實作仍可使用不造成額外尾音的 sample-safe de-click，但不得縮短留白、改變
timestamp，或讓 BGM 與演唱 lane 重疊。

- BGM 只引用現有曲庫中的本機 track id，不複製媒體，也不建立 BGM 專用假媒體格式。
- 同一首曲目可同時存在於一般 playlist 與目前 BGM；一般播放順序與 BGM 播放位置互不影響。
- 現行 monitor slice 使用曲目的原始立體聲 playable asset；是否允許使用者明確選定既有
  accompaniment variant 留待 media policy 決策。BGM 不套用 guide vocal、pitch、
  tempo、lyrics timing 或 Music Analysis transport 行為，也不在播放時隱式排程分離。
- BGM 來源、參數與明確的 monitor 試播不依賴 provider、外部歌詞、Audio Python、Output server
  或作用中的 OBS session。inactive 試播是現場前檢查，不是一般聆聽用的常駐背景播放模式；
  是否進入 live／record 不得成為 transport permission。
- BGM 不加入公開點歌、遠端控制、Utawakui-owned 錄音引擎、VST、ASIO 或原生 OBS 音訊
  plugin 範圍；OBS 仍可從設定的 capture route 收進串流／錄影 programme mix。

無伴奏演出項目仍是另一個產品與資料模型問題，不得以空白 BGM entry、靜音檔或特殊
track 代替。

## Session workflows

### 預先設定演唱清單

- 演唱清單保留既有順序，但 session policy 不在一首結束後自動播放下一首。
- 曲目結束後先保留 post-roll silence，再啟動持續 loop 的 BGM。使用者可休息、說話、
  調整設定或準備下一首。
- 下一首可以先 selected／prepared，但不因此停止 BGM、不成為 public Now Playing，也不寫入
  session timestamp。
- 使用者明確執行「開始曲目」後，先停止 BGM，再保留 track pre-roll silence；留白結束後才
  正式播放曲目並建立該曲的 session start。

### 臨時找歌

- 沒有預先完成的演唱清單時，BGM 可在曲庫搜尋、provider 搜尋、匯入、下載、metadata
  編輯與音訊準備期間持續 loop，時間不設短上限。
- 搜尋結果、候選選取與下載完成都不搶占 BGM。只有使用者明確執行「開始曲目」才進入
  stop → pre-roll silence → track start 的交接。
- 搜尋或準備失敗不停止 BGM；錯誤留在原 feature owner，BGM 只在自身 media／routing
  失敗時進入 error。

BGM 不因 OBS read-only adapter 偵測到 streaming／recording 就自動發聲。Session 可顯示 OBS
狀態，但第一次播放仍需使用者 intent，避免開啟應用程式、恢復視窗或重新連線時意外出聲。

### Session activation 與模式優先級

第一版以 OBS read-only adapter 的 streaming／recording 狀態啟用 operational BGM session；
這是現場運作邊界，不阻止使用者在 session 前選擇 BGM 來源；音量與 transition 參數由既有設定恢復。

| Session mode   | OBS 觀測條件                           | 控制面與 transport 行為                                    |
| -------------- | -------------------------------------- | ---------------------------------------------------------- |
| `inactive`     | streaming 與 recording 都確認為 false  | 展開後可明確試播；依所選裝置送出，不能代表 OBS 已收音。    |
| `record`       | recording 為 true、streaming 為 false  | 開啟時顯示 REC 主狀態；仍須手動開始。                      |
| `live`         | streaming 為 true，不論 recording      | 開啟時顯示 LIVE 主狀態；若同時錄影，REC 只作次要狀態。     |
| `reconnecting` | 作用中 session 後 OBS 狀態暫時無法確認 | 開啟時投影 reconnecting；安全狀態持續但不強制顯示 player。 |

- 優先級固定為 `live > record > inactive`。從 record 升為 live，或 live 結束但 record 仍作用中時，
  只更新模式投影，不重新載入 deck、不重置來源，也不中斷正在進行的 BGM／演唱 lane。
- App 啟動時 OBS 未連線或狀態未知，不得憑 `reconnecting` 啟用新 session。只有先前已有 confirmed
  active session 才能在短暫 transport loss 期間保留 `reconnecting` latch；重新確認 inactive 後
  立即執行正常 session exit。
- 進入 record／live 只更新 session 投影，不得開啟已由使用者關閉的 player；兩條 lane 仍維持 paused，不得自動播放 BGM、開始
  prepared performance item 或恢復重啟前 transport。
- record／live 都確認停止時，取消尚未開始的 pre-roll／post-roll、play promise 與自動恢復。
  若 BGM 正在發聲，使用設定的正常 fade-out 歸零後停止；若演唱已 confirmed playing，既有
  演唱播放器繼續由自己的 owner 控制，不因 BGM session 退場而被停止。BGM 歸零、pending
  handoff 清理完成後，presentation state 仍由目前頁面及既有 Dock 的顯示位置決定。

## 控制面邊界

BGM 使用獨立控制面，不共用也不擴張底部 `PlayerBar`。`PlayerBar` 繼續只投影演唱
播放器的 artwork、metadata、progress、transport、音量與演出工具；BGM 不得讓其中任何
控制變成雙重用途或依 lane 切換語意。

`BgmPlayer.vue` 是演出安排的場間音樂組合，重用 `BgmCurrentSource`、`BgmPlayerTransport`、`BgmTrackPicker` 與 `bgmPresentation`。App 在生命週期開始初始化唯一 `useBgmSession`；頁面及 Dock 的 mount／unmount 只改 presentation，不初始化、停止或重建 deck。BGM 操作集中於安排 Dock footer；主頁移除重複控制，既有更多選項的「顯示 BGM」開啟側欄並選取待唱分頁。Dock 提供來源、單一 operational status、播放／暫停、Talk 與立即停止；進度與音量常駐 transport，移除調整圖示及其 Popover；選曲搜尋仍按需展開。安排 Dock 透過固定 footer 呈現，待唱分頁保留兩段顯示；演出紀錄分頁隱藏 BGM 並關閉來源搜尋，返回待唱仍保留原收展狀態，清單獨立捲動。沒有 titlebar BGM disclosure、浮動面板、拖曳或 Pin，也不擴張 PlayerBar。

Dock 僅 source picker 使用搜尋浮層；進度／音量直接排列在 transport。Dock 依序呈現共用曲目列、固定時間欄／進度 Range、狀態／更換／急停一行、壓低／靜音／音量一行。播放／暫停整併到封面，Dock 不重複顯示獨立播放按鈕。最窄 272px Dock 也保留兩行底部控制，不另外換出第三行；排列不得由曲名、來源、metadata 或播放狀態決定。來源按鈕以共用 `UiPopover` 向上開啟搜尋浮層，不把搜尋／結果插入 footer flow；空查詢、搜尋結果、無結果及更換來源前後，曲目區與 transport 保持固定位置。開啟時焦點進入搜尋，Escape 關閉並返回來源按鈕，點擊外部沿用 Popover 關閉規則。選曲只取代單一 BGM 來源與位置，不開始播放；失敗保留搜尋與錯誤，成功後收起搜尋並把仍在 picker 的鍵盤焦點回到來源按鈕。Dock 急停後仍保留固定控制；Talk 與急停沿用相同 transport，不複製 phase map 或按鈕條件。

Dock 預設收合為曲目資訊區，保留共用封面、曲名、歌手、目前時間／總長、可拖曳進度及展開按鈕。封面與其他 Track Row 共用 `UiTrackArtworkButton` 及 `RightDockTrackArtworkCue`，同一實心圖示、scrim、hover／focus reveal、外側焦點框與 click／double-click 邊界；hover 或 keyboard focus 顯示播放／暫停；與完整 transport 共用 primary-action 投影，演唱交接期間仍鎖定，不能由封面繞過。展開才揭露來源搜尋、狀態與混音工具／音量；收合僅隱藏細節並關閉搜尋，不重建 transport、不發出音訊 intent。展開／收合沿用同一按鈕與焦點，提供 aria-expanded／aria-controls；收合期間的錯誤以按鈕 danger 語意與完整 accessible label 保留提示。主頁保留演唱操作，不再掛載 BGM 控制。

曲目 identity 與底部 PlayerBar 共用 `PlaybackTrackIdentity`：封面、曲名省略／完整提示、專輯導覽與歌手 credits 都取自 canonical track，BGM 狀態由 feature 在進度下方的 context row 保留單一固定行，不插入共用曲目元件，也不改變封面／標題／歌手幾何。BGM 與 PlayerBar 仍各自消費原本的 audio owner，僅共用呈現元件，不共享播放狀態或增加音訊元素。

播放權限不依賴 OBS live／record。BGM 不進一般 Queue、演出 occurrence、統計或公開畫面；Space、media keys 與既有播放快捷仍只控制演唱播放器。LIVE／REC 由既有 titlebar 呈現，不在 BGM 重複資訊。只顯示頁面、改來源、收合 Dock、切頁與清除安排都不隱式播放或刪除 BGM 設定；若清除停止正在演出的曲目，仍由既有 terminal handoff 決定恢復。

## Runtime ownership

演唱播放器維持既有 HTML audio owner。BGM owner 在第一版擁有單一 deck、單一可替換來源
與 BGM bus gain；session coordinator 只依 logical lane 狀態仲裁，不直接依賴 deck 數量。
各 owner 的 `play`、`playing`、`pause`、`ended`、`timeupdate`、metadata 與 error events 只更新
自己的 reactive state；自然 EOF 的 pause 不作操作暫停通知，由真正 ended 事件保留曲後留白邊界。兩條 lane 都不得用 timer 或另一條 lane 的 snapshot 建立第二個播放
時鐘。未來若加入 A／B deck，只能改變 BGM owner 內部，不能放寬跨 lane 互斥契約。

交接 coordinator 只仲裁 intent、互斥 transport 與 silence window：

- 演唱播放器永遠具有輸出優先權。
- coordinator 訂閱兩個 owner 的明確事件，但不接管 seek、duration、current time、Queue
  navigation 或 BGM navigation。
- BGM 單曲來源、演唱 Queue、播放紀錄與 OBS session history 是四個分離的 owner。
- `bgmRequested` 只表示 BGM 現在應開始／維持播放；`restorePending` 只表示演唱 terminal event
  後是否允許恢復。兩者不得共用，UI transport 也不得從 `restorePending` 推導 Pause 狀態。
- 跨 lane 操作必須可取消並以 generation／revision 排除舊 promise、舊 pre-roll／post-roll
  timer；快速操作不得讓先前排程的 BGM 或演唱曲目晚到生效。

### Mutual-exclusion invariant

- coordinator 啟動演唱 element 前，必須確認 BGM bus gain 已歸零、所有 BGM gain automation
  已取消或完成，且第一版的 active deck 已 paused／ended。
- BGM 處於 `bgm-playing`／`stopping-bgm` 時，演唱 element 必須尚未開始或已 paused；演唱
  element active 時，BGM bus 必須維持零輸出，第一版 active deck 必須 paused。
- `track-preroll` 與 `postroll-silence` 期間兩條 logical lane 都沒有可聽輸出；BGM fade-in 只能
  在演唱已 ended 或明確 stop 且 post-roll 完成後開始。
- 較新的 performance start 可取代較舊的 performance request，session exit 也可取消 pending
  transition；但 BGM Pause／Play、source replacement 或 Emergency Cut 不得取消已取得優先權的
  performance fade／pre-roll。Emergency Cut 只能縮短 BGM 歸零時間，不能跳過 silence window。
  任一時刻不得同時向 BGM 與演唱 lane 發出未完成的 start intent。
- 若無法確認 BGM bus 已歸零且 active deck 已 paused，coordinator 不得啟動演唱 element；
  若無法確認演唱已 paused／ended，coordinator 不得啟動 BGM bus。

[ADR 0021](../adr/0021-bgm-standby-audio-and-handoff.md) 已鎖定獨立 element、logical BGM gain
bus、lazy context 與可取消 coordinator；第二個 element 不得塞進現有 `usePlayer` state 或
`PlayerBar` component。共同 capture output bus 仍需後續 amendment 與實機驗證。

## Session handoff state

| 狀態               | 可聽輸出 | 說明                                                                  |
| ------------------ | -------- | --------------------------------------------------------------------- |
| `idle`             | 無       | 尚未提出 BGM intent，或 transport 正在待命。                          |
| `bgm-playing`      | BGM      | 曲間／找歌階段；可包含 fading-in、playing 或 dimmed substate。        |
| `stopping-bgm`     | BGM      | 正在 fade-out 或 Emergency Cut；演唱 element 尚未播放。               |
| `track-preroll`    | 無       | BGM 已確認 paused，正在保留曲目前置留白。                             |
| `track-active`     | 演唱曲目 | 曲目已 confirmed playing；BGM 維持 paused。                           |
| `track-paused`     | 無       | 演唱 element 明確 paused；BGM 不自動開始，但恢復手動 Play。           |
| `postroll-silence` | 無       | 曲目已 ended／stop，正在保留恢復 BGM 前的後置留白。                   |
| `manual-hold`      | 無       | 使用者明確停止 BGM 或取消 deferred restore；後續 event 不得自動覆寫。 |
| `error`            | 無       | BGM media／routing 或 handoff 失敗；不得改變已確認的演唱播放。        |

HTML audio events 仍是實際播放 phase 的權威。上表是 coordinator 的交接投影，不得用來偽造
audio element 正在播放、已暫停或已結束。

### BGM transport substate

第一版 BGM owner 另外維護 `paused`、`fading-in`、`playing`、`dimmed`、`fading-out` 與
`error` substate。這些狀態不取代上方 session handoff state：

- fade-in／fade-out 使用 BGM bus gain automation，不修改原始音訊或 item gain trim；
- Talk／Dim 是使用者明確控制的 BGM bus attenuation，不偵測 microphone activity；
- 操作面以無麥克風圖示的「壓低 BGM」按鈕呈現，pressed state 表示衰減已啟用；啟用後的 accessible name 保留可見名稱，並提示「按下恢復 BGM 音量」。Dock 沿用此標示及原有衰減邏輯；
- Talk／Dim 解除後只能回到當時有效的 BGM target gain，不能越過 mute、item trim 或 master
  volume；
- 更換 BGM 時若正在播放，依序執行 current fade-out、原子替換 deck source、play confirmed、
  next fade-in；若原本為 manual hold，則替換後停在起點。不在兩個 BGM source 間 crossfade；
- Emergency Cut 取消 BGM gain automation、立即把 bus 設為零並停止 active deck，但不能跳過
  後續 track pre-roll；
- mute 永遠優先於 fade／Talk／Dim；任何 automation 都不能自行解除 mute；
- 在 dimmed 狀態改變 master volume 或 item trim 時，Dim 繼續相對衰減最新 effective target；
  解除 Dim 不得跳回舊音量；
- 新 intent 從當下 effective gain 接續，不先跳回完整音量。設定值在 transition 進行中被修改
  時只套用到下一次 transition，不重排已開始的 automation。

### 第一版參數預設

| 參數             | 預設值  | 可調範圍     | 步進    | 說明                                            |
| ---------------- | ------- | ------------ | ------- | ----------------------------------------------- |
| BGM 正常音量     | 25%     | 0–100%       | 1%      | 未啟用 Talk 時的 base gain                      |
| BGM fade-in      | 1.0 秒  | 0.1–5.0 秒   | 0.1 秒  | BGM confirmed playing 後，從零到 effective gain |
| BGM fade-out     | 0.6 秒  | 0.1–5.0 秒   | 0.1 秒  | 終點明確設為零後才可 pause deck                 |
| Talk attenuation | -12 dB  | -6 至 -30 dB | 1 dB    | 相對於最新 effective BGM target                 |
| Talk attack      | 100 ms  | 20–500 ms    | 10 ms   | 啟用 Talk 時的衰減時間                          |
| Talk release     | 600 ms  | 100–2000 ms  | 50 ms   | 解除 Talk 時回到最新 effective target           |
| Track pre-roll   | 0.75 秒 | 0.5–10.0 秒  | 0.25 秒 | BGM 歸零且 paused 後才開始計時                  |
| Track post-roll  | 1.0 秒  | 0.5–10.0 秒  | 0.25 秒 | 演唱 ended／stop 且無可聽輸出後才開始計時       |

這些是第一版實作預設，不是素材 loudness 保證。fade／silence 設定是使用者偏好，可跨 session
保存；Talk 的 active state、active automation 與剩餘時間只存在記憶體。完整重啟後 deck
保持 paused、不自動發聲，Talk 回到預設關閉；開始播放時使用最新 base gain。UI 可以提供
「恢復預設」，但不能用未經確認的 preset 覆寫正在進行的 transition。

Persisted plan schema v3 採用上述預設。讀取 v1／v2 時，只有仍完全等於該版舊預設
tuple 的資料會整組遷移；任何使用者已調整的數值都保留並只升級
schema version，避免 migration 覆寫明確偏好。

Transport fade 使用可在排程終點精確設值的 AudioParam automation；不能以漸近但永不到零的
target curve 作為跨 lane safety gate。fade-out 終點必須再次將 BGM bus 設為零，再 pause
active deck。pre-roll／post-roll 使用 monotonic deadline；背景 timer 若延遲，只能延長留白，
不得補算成較短留白或讓下一條 lane 提前發聲。

## 交接規則

### 準備與開始演唱曲目

1. Prepared performance item 必須是 current session draft 中 revision current、linked、verified 且
   playable 的 item；selected 或不完整 item 不具開始權。Prepared selection 只存在於本機控制面；
   BGM 繼續播放，public Now Playing、session history 與 chapter 不提前切換。
2. 使用者明確執行「開始曲目」時，coordinator 取消舊的 pre-roll／post-roll timer 與不相容
   的 BGM gain automation，進入 `stopping-bgm`。正常模式先將 BGM bus fade-out 至零；
   Emergency Cut 則立即歸零。此時立即清除目前 BGM play request、重置主控制，並將曲後是否
   恢復保存為獨立 deferred intent。兩種模式都禁止跨 lane crossfade。
3. coordinator 確認 BGM bus 已歸零且 active deck 已 paused 後，才進入 `track-preroll`。
   fade-out 所花時間不計入 pre-roll；完整 pre-roll window 內兩條 lane 都保持無聲。
4. pre-roll 完成且 intent revision 仍 current 時，才可對演唱 element 呼叫 `play()`。
5. 演唱 element confirmed playing 時，將 performance track、public Now Playing 與 OBS
   session start timestamp 以同一 revision commit。選曲時間、按下開始時間與 buffering
   開始時間都不是正式曲目時間點。
6. 若 pre-roll 被取消或演唱無法 confirmed playing，不能寫 session start；BGM 是否恢復由
   最新 user intent 與 post-roll policy 決定，舊 timer／promise 只能 no-op。

### 演唱暫停

演唱 pause 不自動恢復 BGM。HTML audio element 發出明確 `pause` event 時，coordinator 投影
`track-paused`、釋出演唱 lane 並恢復 BGM 手動 Play；使用者可自行決定是否在休息期間啟動 BGM。
若使用者不啟動 BGM，演唱 resume 不增加 fade 或 pre-roll；若已手動啟動，resume 必須先讓
BGM fade 至零、確認 deck paused，再完成 pre-roll。buffering／stalled／seek 等可能自行恢復的
暫態不釋出 lane，BGM 控制仍保持鎖定。視窗隱藏與 Output／OBS 狀態變化也不會自動開始 BGM。

### 演唱停止或結束

- 只有演唱正常 `ended`、使用者明確 stop／clear current，或不可恢復的播放 error 使演唱
  lane 離開 active session，才可進入 `postroll-silence`。
- coordinator 先確認演唱 element 已 paused／ended，再開始完整 post-roll window。這段留白
  屬於錄製 timeline，不可被 buffering、舊 BGM promise 或下一首 metadata 提前填滿。
- post-roll 完成時，只有 BGM source 仍有效、不是 `manual-hold`，且沒有新的開始曲目 intent，
  才可將 BGM bus 保持在零、啟動 active deck，並在 confirmed playing 後 fade-in 到有效 target
  gain。BGM fade-in 不得提前侵入 post-roll。
- track pre-roll 與 post-roll 是兩個獨立、有界的 session 設定，使用「第一版參數預設」中的
  初始值與範圍；兩者不可因 UI 未完成而合併成一個隱含常數。
- 預先設定清單的下一首只進入 prepared state，不自動 play。BGM 可持續 loop，直到使用者
  明確開始該曲。

### 手動介入

- BGM `pause`／stop 或取消 deferred restore 是 user-owned intent；第一版先 fade-out 再進入
  `manual-hold`，Emergency Cut 則立即歸零。後續演唱結束不得自動覆寫。
- performance handoff、演唱 active 與 post-roll 期間，BGM 主控制顯示 disabled Play，不接受
  會搶回 lane 或取消 performance timer 的操作；曲後恢復由交接前保存的 deferred intent 決定。
- 演唱明確 pause 是例外：它不消耗 deferred restore，也不自動發聲，但將同一 primary action
  恢復為可用 Play。演唱 resume 後 performance lane 重新取得優先權。
- 更換 BGM 在演唱 active 或 `manual-hold` 時只替換來源並保持靜音；在 `bgm-playing` 時先完成
  單 deck fade-out，再替換 source、confirmed play 並 fade-in，不改變演唱 Queue。
- 使用者重新按 BGM play 才解除 `manual-hold`。若演唱仍 active，僅 armed；若演唱 inactive
  且不在 silence window，從零輸出啟動 active deck 並 fade-in。

## Media source and audio preparation

- 本機曲庫是 BGM 的支援基線與播放權威。目前 BGM 只引用一首已完成匯入、可由
  `utawakui-media:` 解析的 track id。
- 既有 provider assist 可作為選用取得路徑，但候選必須先經使用者確認、下載並匯入本機，
  才能加入 BGM。BGM deck 不直接串流遠端 YouTube URL，也不新增自動下載或權利宣告。
- 純音樂／instrumental source 是預設選擇。系統不因曲目被加入 BGM 就自動做人聲分離；
  separation 成本、等待時間與 artifact lifecycle 仍由既有 audio-processing flow 管理。
- 若曲目已有可用 accompaniment result，BGM item 可明確選擇該 variant。沒有結果時只能使用
  原始音訊，或由使用者先執行既有分離流程；不得在按下 play 後才隱式排程處理。
- BGM 需要獨立 volume／mute，並可為單一 item 保存 bounded gain trim；不得改寫原始音訊。
  自動 loudness normalization 目前未實作，若後續加入，必須保存分析 metadata、使用
  non-destructive gain、設定 true-peak ceiling，且不把一般播放音量或演唱 mix 一起改掉。
- Utawakui 不偵測、擷取或推論 microphone activity，因此 MVP 不做 app-owned 自動 mic
  ducking。第一版提供手動 Talk／Dim；任何依 mic activity 自動觸發的 ducking 仍由明確取得
  mic signal 的外部 mixer／OBS source 擁有。

## Audio routing

Monitor 可繼續使用同一個系統預設 destination，因為 BGM 與演唱播放器嚴格互斥。OBS-facing
capture 已由使用者確認採用 `shared-capture`；獨立裝置 profile 保留後續決策：

- `shared-capture`：BGM 跟隨現有演唱 capture device。設定最少，也能靠前後留白剪出曲目，
  但 OBS 只看見一個音訊 source，不能只對 BGM 套 mic sidechain／ducking，也不能把 BGM 與
  演唱伴奏分配到不同錄音軌。
- `separate-bgm-capture`：BGM 使用獨立、明確選取的 capture device／logical bus；演唱仍走
  既有 capture。OBS 可將兩者作為不同 sources，串流時混入同一 programme mix，錄製時另分
  tracks，並只在 BGM source 套 mic ducking。這通常需要第二個虛擬音效裝置。

目前 shared capture 重用演唱 capture AudioContext／所選 sink。BGM post-gain bridge 透過獨立
gate 接入，不經演唱音量、靜音、導唱或 pitch；pause／cut／fade-out 完成時同步關閉 gate，
避免 bridge 緩衝尾音跨越 lane。開始前等待既有裝置選擇完成，重連保留 gate 狀態。

演唱與 BGM 在 capture 最後共用「直播擷取總音量」，範圍 0–100%、預設 50%（−6.02 dB），
由 config audio preferences 保存；舊設定補 50%，不改既有監聽或導唱值。此控制不影響
monitor，亦不提供 limiter 或 normalization。BGM 本身仍預設 25%；兩個 gain 相乘。

Routing 必須遵守：

- BGM mute／volume、stop 與 silence windows 在 monitor／capture 同步生效，不能只在本機
  靜音而讓 OBS-facing route 殘留。
- capture device 遺失、sink change 或 native render error 時，關閉受影響的 capture route、
  清除失效選擇並顯示 bounded error；active BGM 同步停止 monitor／capture。演唱保留既有
  monitor 復原行為。不 fallback 到系統預設喇叭，也不自動改接另一條 capture bus。
  明確未啟用 capture 時可 monitor 試播；裝置失效後不得靜默當作 monitor-only 成功。
- BGM graph lazy initialize；載入 module、讀取保存設定或只顯示控制面時不得建立
  `AudioContext` 或開始播放。

## 單曲保存與曲庫變更

- BGM 只保存一個 track id；不擁有 membership、順序、previous／next、shuffle 或自動換歌，
  也不得借用演唱 Queue 的 source queue、manual queue 或 previous stack。
- BGM 保存內容只包含一個 bounded current track id 與 scalar intent，例如 position、volume、mute、
  item gain trim 與 pre-roll／post-roll 設定；repeat 固定為 loop，不是 renderer 可寫設定。Prepared performance
  item／label／revision 由 session preparation owner 保存與解析；BGM 不複製其資料。不得保存
  absolute path、media URL、library metadata 副本或可在重啟後自動開始的 armed transport state。
- BGM base volume 與 Talk attenuation 的 default／range／step 消費
  `shared/audioControlValues.json`；Main plan、Renderer fallback、audio deck 與 transport 不得各自
  定義現行值。BGM plan 仍是這整組設定唯一的 durable owner，不因共用 scalar contract 而改存
  `config.json.audioPreferences`。
- 完整 App 重啟後先以目前曲庫解析 ids、過濾缺檔，再恢復為 paused／`manual-hold`；不得在
  啟動、更新或還原視窗時自動發聲。隱藏既有主視窗到系統匣不屬於重啟，記憶體中的 BGM
  可繼續播放。
- 曲目被刪除時，清除失效 reference 與 position，並進入 `idle`；不自動選擇替代曲目，
  也不可阻止曲庫載入。
- BGM 播放不寫入一般 Recently Played、main-private playback usage、演唱 Queue previous
  stack 或 OBS session history。

## Projection 與 Windows integration

- selected／prepared item 只留在本機 session control；在 pre-roll 完成且 audio confirmed
  playing 前，不得成為 Lyrics、Now Playing、Setlist、Performer Self-View 或 public Output 的
  current track。
- confirmed playing 是 canonical performance track、verified session label、公開投影與 OBS session
  start timestamp 的共同 commit boundary。現行僅依 output projection track-id change 建立 session
  entry 的行為不足以支援本契約，實作時必須改為有 playback revision 的 confirmed-start event。
- BGM 與 silence window 期間，既有 public Output 不投影 BGM title、position 或 artwork；
  previous／completed history 可保留，但不得把 prepared item 偽裝成已開始。
- BGM player 是本機 operator surface；它的 LIVE／REC、BGM transport、Talk／Dim、
  routing、error 與 handoff controls 都不得進入 public projection。公開畫面是否在 BGM／留白
  期間顯示既有 history、bounded session status 或透明留白，仍由各 Output template policy 決定。
- OBS session history 與 YouTube chapter export 只記錄 confirmed performance start；BGM
  切歌、選曲、按下開始與 pre-roll 起點都不是 session marker。
- SMTC、media keys、taskbar thumbar 與既有 `PlayerBar` 繼續只控制演唱播放器。MVP 不為
  BGM 註冊第二個 Windows media session。
- 背景執行可保留 BGM playback 與 handoff；完整退出會停止兩條 lane 並關閉 audio resources。
- Tray 不因本功能新增播放控制。若未來新增，必須明確區分演唱與 BGM 命令。

## Error and recovery

- 單一 BGM 媒體失敗時先將 BGM bus 歸零並停止 active deck、記錄 main／renderer 私有診斷，
  再顯示可行動的 bounded 訊息；由使用者重試或更換來源，不自動選擇另一首曲目。
- BGM error 不 pause、stop、seek 或換掉演唱 track，也不把演唱 Output 標成 unavailable。
- 演唱錯誤若使 active session 結束，可走正常 post-roll；若錯誤發生在 confirmed start 前，
  不建立 session entry，並依最新 user intent 回到 BGM 或 `manual-hold`。
- 所有 silence timer 與 async play promise 都必須可由較新的 user intent 或 performance
  revision 取消。舊工作只能安全 no-op，不能在晚到時重新發聲或補寫 timestamp。

## 驗收情境

1. 預先設定清單播放完一首後不自動開始下一首；曲目 confirmed ended、完整 post-roll 後，
   BGM 從零輸出 confirmed playing 並 fade-in，之後持續 loop；下一首只顯示為 prepared。
2. 臨時找歌、provider 搜尋、下載或音訊準備持續數分鐘時，BGM 不被 feature state change
   中斷；只有明確「開始曲目」intent 觸發交接。
3. 正常開始曲目時先完成 BGM fade-out，Emergency Cut 則立即將 BGM bus 歸零；兩者都必須
   確認 active deck 已 paused，才開始計算完整 pre-roll。pre-roll 期間沒有 BGM tail 或跨 lane
   crossfade。
4. pre-roll 結束後只有 confirmed playing 才同時 commit current track、public Output 與 OBS
   session start；selected、prepared、按下開始與 buffering 都不提前寫 timestamp。
5. 演唱 pause、seek、buffering 與 stalled 都不會自動讓 BGM 恢復；只有明確 pause 會恢復手動
   Play，seek／buffering／stalled 仍鎖定。Pause 後不啟動 BGM 的 resume 無額外等待；已啟動
   BGM 的 resume 必須完成 fade-out、deck pause 與 pre-roll。
6. 演唱正常 ended 或明確 stop 後保留完整 post-roll，再從零輸出啟動 BGM 並 fade-in 到有效
   target gain；BGM 不得提前侵入曲目 clip tail。
7. post-roll 或 BGM 播放期間準備下一首不會自動 play；新的開始 intent 會停止 BGM、重新跑
   pre-roll，舊 timer／promise 不得晚到生效。
8. 使用者手動 pause BGM 後，即使演唱結束也維持 `manual-hold`；只有新的 BGM play intent
   才解除。
9. BGM current track 缺檔或 decode 失敗時，演唱播放、Queue、lyrics、Output 與 session
   chapter 均不受影響。
10. capture device 中斷時，合法 monitor route 可繼續；失效 capture 不 fallback 到預設
    喇叭，也不暗中改接另一個 bus。
11. 隱藏到系統匣後 BGM 與 handoff 繼續；完整重啟後所選來源與位置可恢復，但兩條 lane 都保持
    paused，不自動發聲。
12. BGM 播放超過 10 秒、切歌或播完都不新增 Recently Played、playback usage、OBS session
    entry 或 YouTube chapter。
13. 鍵盤 Space、media keys、SMTC 與 taskbar thumbar 在 BGM 播放時仍只控制演唱播放器；
    BGM control focus 內的局部鍵盤操作不影響演唱 transport。
14. 深色／淺色、compact／standard、窄視窗與 Windows 100%／125%／150% scaling 下，獨立
    控制面仍能辨識 BGM、prepared item、pre-roll／post-roll、manual-hold／error，並維持可見
    focus 與 WCAG AA 對比。
15. 在 fade-out、Emergency Cut、pre-roll、演唱 play promise、post-roll、BGM play promise 與
    fade-in 各階段快速連續操作，任一觀測點都最多只有一條 logical lane 有可聽輸出；舊
    promise／timer／gain automation 不會造成跨 lane 重疊或錯誤 timestamp。
16. `shared-capture` 能輸出完整 programme audio，但 UI 清楚說明無法在 OBS 只 duck／分軌
    BGM；`separate-bgm-capture` 則能以不同 OBS source 驗證 BGM-only ducking 與獨立錄音軌。
17. Talk／Dim 只衰減 BGM bus；解除後回到原有效 target gain，不改變 item trim、演唱音量或
    timestamp，也不需要 microphone permission／activity detection。
18. BGM 更換來源時若正在播放，先 fade-out，原子換 source，再 confirmed play／fade-in；
    不在兩個 BGM source 間 crossfade。無論在任一階段收到開始曲目 intent，最終都必須先讓
    整個 BGM bus 歸零再進入 pre-roll。
19. fade-out 終點明確將 BGM bus 設為零後才 pause deck；不能只等待漸近 target curve 或 UI
    animation 結束。正常 handoff 的 pre-roll 不包含 fade-out 時間。
20. background timer 延遲、視窗隱藏或系統忙碌時，pre-roll／post-roll 可以晚結束但不能早於
    configured monotonic deadline；session timestamp 仍只取 confirmed playing。
21. Talk active 時調整 master volume／item trim，解除後回到最新 effective target；mute
    期間啟用／解除 Talk 都不會自行解除 mute。完整重啟時 deck 保持 paused，Talk 回到預設關閉，
    base gain 預設為 25%。
22. transition 進行中修改 fade／Dim／silence 設定，只影響下一次 transition；當前 automation
    依其建立時的 snapshot 完成或被新 transport intent 明確取消。
23. inactive 可由演出安排中的相同 transport 明確試播 monitor；不得宣稱 OBS capture 已驗證。進度／音量常駐，本機搜尋按需展開，不遮蔽 Talk／急停。
24. live／record 模式變化保留既有 coordinator policy，不建立第二份頁面 session 或 deck；第一次發聲仍需明確 intent。
25. App 啟動離線不建立 reconnecting session，confirmed inactive 沿用原 session-exit 與取消 pending transition 邊界。
26. BGM 控制僅由安排 Dock 待唱底欄呈現；主頁不重複掛載，更多選單可直接開啟 BGM，不因切頁或收合停止音訊。
27. 切頁及 mount／unmount 不改音訊。成功選曲有明確焦點返回，不新增浮動外框／移動／Pin。
28. 曲名單行截斷，phase／deferred restore／public error 使用同一句 operational status，Play／Pause 不依待唱順位命名。
29. Text placeholder、unreviewed、unlinked 或 source-unavailable item 不能進入 prepared handoff；
    其他 ready item 與 BGM 不受影響，operator 可回到 preparation 修正或 skip。
30. Prepared item 在 fade-out／pre-roll 期間被改名、relink、remove、unverify 或失效時，舊 item
    revision 取消；不能播放錯誤 track、公開舊 session label 或寫入 timestamp。
31. 主播放器的 new-track、paused／ended／restored resume、PlayerBar toggle、Space／media command
    都必須經同一 pre-start gate。BGM 有聲或 armed 時先完成 exact-zero／pause 與 pre-roll；沒有
    BGM intent 時立即通過。較新的 start request 必須使較舊的 pending resume 失效。

## 後續文件與實作門檻

- UI placement 已整合於演出安排及 Dock 固定底欄；可見 Electron 視窗與 native media handoff 另記驗收證據。
- Prepared performance item、session-local label、verification 與 draft persistence 的 owner 依
  [演出場次準備契約](performance-session-preparation.md)；BGM coordinator 只 snapshot current
  eligible revision 並執行互斥 handoff，不建立第二份 plan state。
- 第一版使用本契約的 pre-roll／post-roll、BGM fade 與 Talk／Dim 參數；release 前必須以實際
  OBS 錄製與監聽做人工聽感／timeline 驗收。Owner 仍需確認 `shared-capture`／
  `separate-bgm-capture` 的預設 routing profile。
- Runtime 依 ADR 0021 採既有 performance audio owner、單 deck BGM owner、BGM bus gain、session
  handoff coordinator、monitor-only lazy context 與 teardown strategy；confirmed-playing timestamp
  commit 與 capture bus 留在後續，A／B deck 不列入第一版但不得被架構永久阻斷。
- Pure state-machine、audio owner、Queue／history exclusion、persistence validation 與 stale async
  tests 已覆蓋基礎 slice；實際時間線與錄音仍不可由自動測試代替。
- Web Audio 自動測試不能取代實際監聽／capture 聽感驗收；至少要人工檢查交接時間、漏音、
  click／pop、快速切歌與裝置中斷。

## References

- [OBS Compressor Filter](https://obsproject.com/kb/compressor-filter)：OBS source 可選 microphone
  作為 Sidechain／Ducking Source。
- [OBS Multiple Audio Track Recording Guide](https://obsproject.com/kb/multiple-audio-track-recording-guide)：
  不同 OBS audio sources 可分配到個別錄音 tracks，同時保留 programme mix。
