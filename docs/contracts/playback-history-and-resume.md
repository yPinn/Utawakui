# 播放紀錄與啟動恢復契約

本契約定義全系統最近播放與啟動恢復的資料界線。兩者服務不同用途，不與 OBS
session history 或 Queue 的 previous stack 合併。

## 最近播放

- 一個 `trackId` 最多保留一筆最近播放紀錄。每次 qualified playback 仍會更新紀錄，但
  同曲重播會以最新 `playedAt`／來源脈絡取代舊 entry 並移到最前；讀取舊檔時也以檔案
  順序中的第一筆有效 entry 去重。
- HTML audio 的連續實際進度累計達 10 秒時寫入；正常 `ended` 的短曲也寫入。Seek
  跳躍、只載入、播放失敗或快速誤點不計入。
- Renderer 只提交 `trackId` 與 bounded `sourceId`／`sourceName`。Main 產生
  `playedAt`，以原子寫入保存到 user data 的 `playback-history.json`。
- 同一 qualified event 另以原子寫入更新 main-owned `playback-usage.json`，保存完整曲庫的
  `trackId → lastPlayedAt` 與 `trackId → playCount`。兩者都不受最近 50 首顯示上限或
  「清除最近播放」影響；最近播放清單出現的曲目必定至少計一次。
  - `lastPlayedAt` 只供去人聲容量管理的 LRU policy 使用，不跨 IPC。
  - `playCount` 是曲目列「播放次數」的唯一來源，只經固定 channel
    `playback-usage:get-play-counts` 以整份 map 讀出；renderer 不能寫入或重設。
    `usePlaybackHistory` 在 record 成功後於本地同步 +1，失敗則不變；讀取失敗時次數
    視為未知，欄位隱藏而非顯示 0。
  - 早於次數欄位的舊檔，有 `lastPlayedAt` 但無次數的曲目讀取時補為 1。
  - 播放次數只存在本機 user data，不做任何雲端統計或上傳。
- 介面不承諾固定顯示數量；main 目前保留最近 50 首 unique tracks 作為儲存防線。顯示時以
  `trackId` 向目前曲庫解析 metadata，已刪除曲目不顯示。
- 使用者可在 Settings「曲庫與儲存」明確清除最近播放；操作位於 danger overflow
  action 並要求確認。這不清空 Queue、歌單、OBS session history 或診斷紀錄。

## 音量偏好

- `shared/audioControlValues.json` 是演唱 master volume、導唱監聽／擷取 level、BGM base
  volume 與 Talk attenuation 的 canonical default／range／step authority。Main、preload、
  Renderer state、BGM plan 與 audio deck 不得另寫一份現行數值。
- 演唱 master volume／mute 與兩個導唱 level 是 machine-local durable preferences，由 Main
  `config.json.audioPreferences` 保存。啟動解析順序固定為 canonical defaults、通過逐欄正規化的
  config preferences、Renderer／Web Audio runtime projection；合法保存值不得被新版 default
  覆寫，單一欄位損壞也不得清掉其他合法欄位。
- Main 在建立主 BrowserWindow 前完成正規化，並以 bounded `additionalArguments` 交給 preload；
  `usePlayer` 第一個 reactive state 已是 resolved preferences，不得先繪製 defaults 再非同步跳值，
  也不得為了 hydration 建立 `AudioContext`。
- 舊版 `playback-resume.json` version 1 的 volume／mute 只在 config 尚無
  `audioPreferences` 時遷移一次。任何已存在的 audio preferences，即使需要逐欄 fallback，也
  優先於 stale resume snapshot。
- BGM volume／mute／dim／fade／silence settings 仍由完整的 `bgm-standby.json` versioned plan
  持有；它只與演唱設定共用 scalar contract，不拆成第二個 config persistence owner。

## 啟動恢復

- `playback-resume.json` version 2 只保存 current track id、position、playback mode，以及以
  track ids 表示的 source queue、manual queue、previous entries、shuffle order 與 bounded
  source context；volume／mute 不再屬於播放恢復。
- Snapshot 由 renderer owner 投影；preload 與 main 再做 allowlist／bounds 驗證。
  Renderer 不提交 path、media URL、任意 IPC channel 或 library metadata。
- 完整重啟後先向目前曲庫解析所有 ids，過濾缺檔曲目，再恢復 Queue 與 Player。
  Current track 已不存在時清除失效 snapshot。
- 恢復後一律保持 paused，不呼叫播放；背景隱藏同一個主視窗不屬於重啟，因此沿用
  原本仍在記憶體中的 player state。
- Snapshot 以受控頻率更新；corrupt／不相容資料會備份後降級為無紀錄，不得阻止主
  視窗或本機播放啟動。

## UI 與元件邊界

- `UiRangeControl` 只有收到 finite `defaultValue` 才提供 context-menu reset。導唱校準、變調、
  音高、速度與 Output appearance 是可回復設定，可以傳入 canonical default；播放進度、演唱
  master volume 與 BGM volume 是演出中的即時 transport controls，不提供右鍵重設，避免無提示的
  突發 seek 或 gain 跳變。
- Right Dock Queue surface 內使用「佇列／最近播放」兩個真實 tabpanels。`UiTabs`
  只擁有 tab semantics／keyboard；`QueuePanel` 擁有 panel ids、顯示狀態與 scroll。
- Sticky header 的背景、blur 與 shadow 使用共用 Right Dock semantic tokens；只有內容
  離開頂端後顯示 elevation，且 reduced motion 下不轉場。
- 最近播放由 feature adapter 直接組合 `UiTrackRow` 的標準 52／40px recipe，不建立
  history-specific primitive，也不繼承 `QueueTrackButton` 的 selection、double-click、
  reorder、drop target 或 drag attributes。清單順序只反映 main-owned chronological truth。
- 每列只提供 current cue、明確的 artwork replay 與歌曲更多選項。Replay 將該曲作為
  單曲 interrupt 播放，不重建來源 Queue 並保留其餘 Queue 結構；紀錄內的
  `sourceId`／`sourceName` 是歷史脈絡，不構成重建來源歌單的隱含命令。
- Right Dock 不提供 list-level clear。Settings 的播放紀錄 row 顯示目前可解析的紀錄數，
  empty／loading／clearing／error 狀態由同一 `usePlaybackHistory` owner 投影。

## 驗證界線

- Main tests 覆蓋 schema、上限、同曲 upsert、舊檔去重、corrupt recovery、atomic persistence、
  播放次數累加／舊檔補 1／非法次數過濾與 IPC registration。
- Renderer tests 覆蓋 10 秒 qualification、seek exclusion、normal ended、source context、
  direct replay preserves Queue、missing-track filtering、paused restore、tabs／ARIA、
  read-only Recent row、Settings clear confirmation 與 sticky scroll state。另以真實 player
  progress event 接到 main persistence service 的暫存目錄，驗證 qualified event 實際建立
  history JSON。
