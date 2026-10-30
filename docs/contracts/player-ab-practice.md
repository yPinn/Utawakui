# 區段練習的媒體邊界與歌詞 Loop 工具

沿[原第 2 項提案](../archive/ab-practice-detail-2026-10-26.md)推進。現況只見 [spec](../spec.md)，本契約固定 terminal 分派、內部 pause 原因、BGM 占用、來源證據及歌詞頁 Loop 工具的驗證邊界；程式／合成媒體通過不代替真實裝置與 OBS 聽感驗收。

## 現行 owner 邊界

`player/usePlayerMediaBoundary.js` 集中原播放器的 pause／playing／ended 訂閱與投影，HTML audio 仍是狀態與時間權威。Facade 保留 play、時間／seek events、DSP 與唯一 BGM pre-start hook；沒有練習 controller 時，原 terminal consumers 的事件形狀及分派行為保持。

練習原型經 `practiceBoundary.attach()` 掛單一 controller，重複掛載拒絕，舊 detach 不能卸除新 owner。同步 `decideEnded()` 必須在 Queue、場次、BGM 與 history 的 final-ended fan-out 前回 final／return／blocked／ignore。被消費的 EOF 不再流入完成事件；非同步或拋錯的分類 fail closed、保持 paused，不依 listener 註冊先後決定。原生 ended 仍可供 prototype 的 native observer 讀取。

已消費的 EOF 在停用或卸除練習後仍保持已消費，直到同 source／occurrence 的新 confirmed playing 才重置；晚到重複事件不能變成整首完成。明確已非 ended、或 currentSrc 與新 src 不符的舊事件不分派。每輪返回 pause 前先沿原 player flush 尚未上報的實際進度；seek 本身重設連續進度基準，不累加跳躍或等待。

`sample()` 在同一個同步 turn 讀原生 currentTime、duration、paused、ended、seeking、rate 與 seekable；sourceRevision 隨實際 src 改變前進，搭配 trackId／playbackRevision 判定上下文。Observer 沒有 consumer 時不採樣，不建立第二個 clock。新開始／恢復／清除／restart、外部 Play／Pause／取消／seek／換模式都先通知掛載的 controller；內部返回用 opaque lap token 經同一方法進入，不能被解讀成使用者操作。

`pauseForReturn()` 的原因僅在同曲目、occurrence、sourceRevision 及仍有效的 token 下投影為 practice-return；後續使用者 intent 清除舊 pause 證據。不使用 ignore-next-pause 吞事件。反覆練習不新增 playbackRevision，實際 seek 仍由原 discontinuity events 推進 continuityRevision；逐曲演唱值及其手動保存邊界不變。

## 同一 BGM coordinator 的練習占用

`acquirePractice()` 提供一份可釋放的 lease，與 preview lease 分開；重複、正在 preview／交接或 post-roll 時拒絕取得。返回／等待／blocked 持有 lease 時，terminal 通知不啟動 BGM restore，恢復播放仍走原唯一 pre-start hook，沒有每輪整曲 pre-roll。

明確 BGM 或允許的 preview 接手，先同步 preempt 練習、取消未來自動開始並 pause，再沿既有 lane 交接。Live／record 下被拒絕的 preview 不動練習。舊 lease 不能釋放新 holder；單純釋放不製造整首完成或自動恢復 BGM。Dispose 也 preempt，保留原 lane 互斥及裝置 owners。

## 單一練習 owner

`player/usePlayerPracticeRuntime.js` 持有當次標記、返回／等待與取消；`usePlayerPractice.js` 組合既有 player、BGM、場次與 queue owners，由 App lifetime 初始化。歌詞頁只投影，不因離頁／關浮層重建或停止練習。`prototypes/ab-practice/runtime.mjs` 只重匯出同一 factory 作可重現測試，正式 renderer 不 import prototypes。

沿原案使用 500ms 下限與 0／1／2／4 秒等待，預設每輪休息 2 秒，0 秒需使用者自行選擇；只接受有限 duration、本機來源及單一連續 seekable 範圍。時間座標是原始媒體秒，tempo、歌詞 offset 不改 A／B。場次 ownsPlayback／pending start 或隱藏時拒啟用；隱藏時 pause，回前景不自動恢復。場次接手清標記；改 shuffle 或整首模式先停用，不能以舊快照蓋回新選擇。

底層 `enable()` 在 paused 時僅 armed；歌詞工具的「開始」以同一次 `enable({ startPlayback: true })` 驗來源並接原 Play，區間外先 seek A，區間內保留位置。Playing 內側保留進度；外側先 pause／seek 確認再開始，首次沒有每輪等待。16ms timer 只喚醒讀真實媒體位置，currentTime ≥ B 才返回；不提前切尾音。每輪 pause 後等待有效 seeked，驗 token、來源與落點才起算 monotonic gap，0 秒仍通過相同確認。必要路徑由原 Play／DSP 交易確認，native playing 才計返回成功。

Pause 取消倒數／返回／在途自動開始，標記與 enabled 保留；gap 中明確 Play 取消舊倒數。內側 seek 重排觀察，外側停用且不拉回；編輯標記先停用，換曲／restart 清標記，改等待下輪才生效。Native loop 暫停使用，解除時依最新 playbackMode 恢復，不用舊模式快照覆蓋使用者選擇。

來源確認尚未完成時，Pause／取消／清除同樣撤銷該次 generation；確認完成後重驗可見性、場次 owner、pending start 與有效範圍，不能以先前狀態開始播放。確認期間仍可清除；BGM／preview lane 無法取得時以有界 busy 狀態告知，不搶回其他工具。清除在 playing 時保留目前播放，returning／gap 時保持 paused，所有情況清掉標記及未來自動開始，休息偏好保留。

工具列手動開始與每輪續播共用相同的在途 Play 守衛；開始仍在準備時按清除，晚到的 native Play 也須立即停住。更新的明確播放優先，不能讓舊回應暫停後來的新開始。

每個 await 與 timer 驗 generation／lap／source；seek 最多等待十秒，失敗保持 blocked／paused，不無限重試。取消中的 native Play 晚回不得搶回播放；更新的明確 Play 優先。原型 dispose 先取消；若 native Play 尚未 settle，保留該次守衛至 settle 才卸訂閱，避免 teardown 後晚播。原型保留標記但不寫逐曲 sidecar、resume、machine preferences 或任何雲端資料。

主動播放的兩次觀察相隔超過一秒，或 gap timer 比預定期限晚超過一秒，保持 blocked／paused，要求明確 Play；不補跑錯過的輪次。此值是取消自動續播的保守守衛，不是 scheduler 品質或聲學延遲承諾。

## 來源刷新與失效

固定 `performance-settings-verify-source` IPC 僅接受 trackId／原 opaque token，沿既有 Main media verifier 檢查 scope、實體 track identity、fresh 原檔 binding／stamp 與必要的 fresh tag 等價證據；沒有讀最新 baseline、寫 sidecar 或續期保存權限。取消、淘汰及 scope 改變仍失效；保存 CAS 即使在 proof 成功後也不放寬。路徑、hash、備份及原音源證據不跨 IPC。

Metadata 未改 URL 時只驗來源，保留本次值。換 URL 時先取消返回／倒數並 pause，在原 library sync 交接；新來源 metadata／連續 seekable、端點與時長座標一致、seek 確認及再次 Main proof 都通過，才承接新 source generation。原先 playing 可沿原 sync 恢復；原先 gap／paused 不自動開始。原圖導唱／pitch／tempo、playbackRevision 及存檔均保持。

缺檔、未知替換、縮短或來源無法確認時停用／paused，保留 A／B 供修正，不縮 B 或按相同 trackId 猜等價。交接中 Pause／換曲／換庫及晚回不能復活舊來源。

## 歌詞頁 Loop 工具

入口放在演唱工具的歌詞頁 toolbar，與顯示／編輯同用有 label 與 tooltip 的 icon button；PlayerBar 不放入口，演出工具維持調整／導唱／節拍器。浮層只保留「片段練習」標題和一行動態狀態，合併原介紹／操作提示兩區；狀態依優先序呈現錯誤、來源確認、返回、當輪休息，平時顯示每輪休息偏好。

第一層左側為標起點／終點與媒體時間，右側固定由左至右「清除、開始／暫停、進階設定」，分別使用 RotateCcw、Play／Pause、SlidersHorizontal。開始會直接沿原播放器開始練習；播放／返回／休息期間顯示 Pause，暫停後顯示 Play，標記保留且不自行續播。標記只改草稿，不自動開唱；清除結束循環但不停止原本正在播放的曲目。進階設定直接展開／收合，起點與終點的媒體秒數欄位左右同行，每輪休息選項在下方，不再疊更多選單。

使用 `UiPopover`／`UiButton`／`UiIconButton` 等共用 primitives，保留焦點、Escape、outside dismiss、keyboard 與亮暗 tokens；收合不清標記。歌詞頁顯示曲目必須與目前載入曲目一致才允許操作，避免作用到另一首歌。空曲目、metadata 未就緒或場次控制期間停用，錯誤／等待用有界狀態文案；不引入另一條播放進度或歌詞 clock。

起點／終點的時間標記只顯示 `mm:ss`，不顯示毫秒；此格式不量化內部媒體座標、seek 落點或最短區間，精確設定仍使用媒體秒數。

## 驗證與後續 gates

2026-10-27 Owner 確認原型門檻：B 超出 p95≤100ms／max≤250ms；A 落點 p95≤80ms／max≤150ms，均以原始媒體座標計。Probe 記每筆 boundary、seek、gap 與 confirmed-playing 啟動落差，保留失敗；不能只報彙總或事後改門檻。重現方式與當輪證據見[原型入口](../../prototypes/ab-practice/README.md)。

相鄰 boundary／coordinator tests 與 `scripts/ab-practice-prototype.test.mjs` 驗前置仲裁、取消、等待、晚播及原事件相容；原 player／場次／BGM／history 回歸仍須通過。Synthetic 靜音 WAV 只驗真實 Electron seek／排程／路由，不證音色、尾音、click、裝置或 OBS 聽感。

EOF／近 EOF 已沿短／長 WAV、原曲／四聲道、三種速度與三種整首模式跑可見 Electron；每輪不洩漏到 final-ended 或短曲 history。原 player→實際 Main history 的整合另驗累計真實進度滿十秒至多一次，Output 同步取原生 clock 的 A／paused 與 discontinuity，演出 observer 沿 occurrence 去重。來源分離切換、paused 不重開及實體原檔替換亦走真 Main／preload 驗證。

這些證據仍不等於所有真實音樂／容器、冷暖長循環、CPU／RAM 負載、OS 休眠、實際裝置／capture 或 OBS 聽感通過；背景持續循環不開放承諾。節拍 drift 與偶發失真根因維持原未結案邊界。

## 驗收案例

案例編號沿用[原提案](../archive/ab-practice-detail-2026-10-26.md)；表格列完整情境，不是進度表，現況見 [spec](../spec.md)。

實驗前固定長短曲、容器、sample rate、原曲／四聲道、0.5／1／1.5 倍速、冷暖、前景／最小化與負載分母。Owner 於 2026-10-27 接受原型門檻：B 超出 p95≤100ms／max≤250ms；A 落點誤差 p95≤80ms／max≤150ms，均為媒體座標。原型先驗中段，不能測後挑門檻；500ms 正式支援及 EOF 安全範圍仍需通過後續品質 gates。原型以前景為限，隱藏／最小化暫停、回前景手動 Play；可見失焦不因此停止。

另記 seek 耗時、倒數到 playing 落差、取消誤播、停頓／尾音／click、CPU／RAM與全部失敗。clock／mock 不證 scheduler／seek／monitor／capture 聽感，仍需可見 Electron／裝置／OBS。

| ID  | 情境與必要結果                                                         |
| --- | ---------------------------------------------------------------------- |
| A01 | 缺／反向／NaN／越界／不連續 seekable／未知時長拒啟用，不 clamp。       |
| A02 | paused 內／外啟用均不播，下次 Play 才必要回 A。                        |
| A03 | playing 內側到 B、外側明確從 A，不誤播舊位置。                         |
| A04 | 各等待／倍速不改座標，seek 後起算、保留本次演唱值。                    |
| A05 | 同輪 timeupdate／ended／重複 callback 只返回一次。                     |
| A06 | gap Pause／Play／停用／改秒數遵守取消、立即播與下輪快照。              |
| A07 | 內／外 seek、編輯標記不拉回、不晚到重啟。                              |
| A08 | EOF／近 EOF、repeat-one／list／shuffle 不漏到 BGM／history／Queue。    |
| A09 | 改模式／結束循環不蓋較新選擇，gap 不自動播。                           |
| A10 | 下一首、同曲新開始、restart、A→B→A／換庫拒舊 timer。                   |
| A11 | BGM 交接首次一次，每輪無插播、重複 pre-roll 或雙 lane。                |
| A12 | BGM／試聽接手及 Live 拒絕遵共同政策，不讓倒數搶回。                    |
| A13 | 場次／manual 拒啟用；練習轉場次不假完成或另建 occurrence。             |
| A14 | 進度累計至多一次，短區段多輪 EOF 不觸發短曲捷徑。                      |
| A15 | Output／提詞器／時間戳真實 seek／phase，無每輪章節。                   |
| A16 | 來源／分離切換、duration 縮短、缺檔依證據處理，不蓋 Key／縮端點。      |
| A17 | seek／DSP／超時、緊貼 play 的取消／cleanup 不誤播、卡等待或漏 hold。   |
| A18 | 最小化／失焦／負載／睡眠／長循環遵政策，保存完整誤差與失敗、不補輪次。 |
