# 播放紀錄與啟動恢復契約

本契約定義全系統最近播放與啟動恢復的資料界線。兩者服務不同用途，不與 OBS
session history 或 Queue 的 previous stack 合併。

## 最近播放

- 一筆紀錄代表一次 qualified playback event；相同曲目重複播放會形成不同事件。
- HTML audio 的連續實際進度累計達 10 秒時寫入；正常 `ended` 的短曲也寫入。Seek
  跳躍、只載入、播放失敗或快速誤點不計入。
- Renderer 只提交 `trackId` 與 bounded `sourceId`／`sourceName`。Main 產生
  `playedAt`，以原子寫入保存到 user data 的 `playback-history.json`。
- 介面不承諾固定顯示數量；main 目前保留最近 50 筆作為儲存防線。顯示時以
  `trackId` 向目前曲庫解析 metadata，已刪除曲目不顯示。
- 使用者可明確清除最近播放。這不清空 Queue、OBS session history 或診斷紀錄。

## 啟動恢復

- `playback-resume.json` 只保存 current track id、position、volume、mute、playback
  mode，以及以 track ids 表示的 source queue、manual queue、previous entries、shuffle
  order 與 bounded source context。
- Snapshot 由 renderer owner 投影；preload 與 main 再做 allowlist／bounds 驗證。
  Renderer 不提交 path、media URL、任意 IPC channel 或 library metadata。
- 完整重啟後先向目前曲庫解析所有 ids，過濾缺檔曲目，再恢復 Queue 與 Player。
  Current track 已不存在時清除失效 snapshot。
- 恢復後一律保持 paused，不呼叫播放；背景隱藏同一個主視窗不屬於重啟，因此沿用
  原本仍在記憶體中的 player state。
- Snapshot 以受控頻率更新；corrupt／不相容資料會備份後降級為無紀錄，不得阻止主
  視窗或本機播放啟動。

## UI 與元件邊界

- Right Dock Queue surface 內使用「佇列／最近播放」兩個真實 tabpanels。`UiTabs`
  只擁有 tab semantics／keyboard；`QueuePanel` 擁有 panel ids、顯示狀態與 scroll。
- Sticky header 的背景、blur 與 shadow 使用共用 Right Dock semantic tokens；只有內容
  離開頂端後顯示 elevation，且 reduced motion 下不轉場。
- 最近播放沿用 `QueueTrackButton → UiTrackRow` 的標準 52／40px recipe，不建立
  history-specific row primitive。單擊選取，雙擊或 artwork 啟動。
- 有 `sourceId` 的紀錄會向目前 playlists state 解析同一來源；來源仍存在且該曲仍是
  成員時，依歌單目前成員、排序與名稱重建 Queue，再由該曲續播。來源已刪除、該曲已
  移出來源或原事件沒有來源時，才作為單曲 interrupt 插入現有播放脈絡。History 本身不
  成為另一個 queue source，也不復原事件發生當時的過期歌單快照。

## 驗證界線

- Main tests 覆蓋 schema、上限、重複事件、corrupt recovery、atomic persistence 與 IPC
  registration。
- Renderer tests 覆蓋 10 秒 qualification、seek exclusion、normal ended、source context、
  source playlist rehydrate／fallback、missing-track filtering、paused restore、tabs／ARIA、
  sticky scroll state 與 shared component reuse。另以真實 player progress event 接到 main
  persistence service 的暫存目錄，驗證 qualified event 實際建立 history JSON。
