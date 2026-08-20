# Utawakui 產品規格

> 本文件定義 Utawakui 的產品定位、功能分類、目前狀態、架構邊界與 roadmap。README 作為專案入口；本文件作為後續設計與實作判斷的主要依據。

## 1. 文件分工

| 文件            | 目的     | 內容範圍                                                |
| --------------- | -------- | ------------------------------------------------------- |
| `README.md`     | 對外入口 | 專案概覽、功能狀態、開發方式、文件連結。                |
| `docs/spec.md`  | 產品規格 | 產品原則、功能分類、現況盤點、架構、資料模型、roadmap。 |
| `tasks/todo.md` | 開發紀錄 | 單次任務的 checklist、驗證與 review。                   |

文件撰寫原則：

- 只提及使用產品時必要知道的邊界。
- 不主動展開使用者應自行掌握的外部背景。
- 功能狀態要明確區分「已實作」「部分實作」「規劃中」「排除」。
- 文字以產品語言為主，避免把規格寫成法律分析或平台評論。

## 2. 產品定位

Utawakui 是給直播主、VTuber、歌回企劃與翻唱工作流使用的 OBS 輔助桌面工具。它協助使用者在本機整理、播放、處理與呈現自己選用的媒體素材。

核心原則：

1. **本機媒體優先**：預設工作流以使用者自行管理的音訊、metadata 與歌詞資料為基礎。

2. **直播操作友善**：UI 應低干擾、易掃描、能在演出中快速操作。

3. **進階流程明確啟用**：Provider-backed acquisition、歌詞來源、Vocal separation、Pitch/Tempo 與 OBS output 等流程，應由使用者清楚啟用。

4. **Overlay 與控制台解耦**：OBS-facing Overlay 應透過本機 HTTP/WebSocket 提供，不與 Electron renderer 綁在同一條 delivery path。

5. **狀態持久化與可復原**：曲庫、歌單、進度與設定應盡量可保存、可遷移、可從缺檔或損壞狀態中恢復。

## 3. 功能分類

### 3.1 預設核心功能

這些功能構成 Utawakui 的主要使用體驗，可作為預設入口：

| 功能                      | 角色                                       | 目前狀態 |
| ------------------------- | ------------------------------------------ | -------- |
| 本機曲庫                  | 保存與列出可播放曲目。                     | 已實作   |
| 播放器                    | 控制播放、暫停、seek、音量與目前曲目。     | 已實作   |
| 播放佇列                  | 管理待播、上一首/下一首、shuffle、repeat。 | 已實作   |
| Playlist / Collection     | 建立使用者集合、保存排序與 track ids。     | 已實作   |
| Metadata 顯示             | 顯示曲名、歌手、duration、縮圖等輔助資訊。 | 已實作   |
| Windows shell integration | 顯示 now-playing 與 taskbar controls。     | 已實作   |

### 3.2 情境功能

這些功能本身是產品能力，但使用上依情境而定：

| 功能                 | 角色                                             | 目前狀態           |
| -------------------- | ------------------------------------------------ | ------------------ |
| Lyrics Workspace     | 管理 synced lyrics、字幕或自用歌詞資料。         | 部分實作           |
| Pitch / Tempo        | 讓使用者調整 key 與速度。                        | 已實作即時 preview |
| Vocal Separation     | 產生分離後的 generated media，支援 guide vocal。 | 已實作             |
| Performer Self-View  | 給表演者看的 lyrics、cue、key、下一首。          | 規劃中             |
| OBS Overlay          | 給觀眾端或錄製畫面使用的 Browser Source。        | 規劃中             |
| Recording / VOD mode | 區分 live-only 與 recording/VOD session。        | 規劃中             |

### 3.3 進階來源功能

這些功能應放在明確啟用的 provider flow 中，不作為預設主入口：

| 功能                                 | 角色                                  | 目前狀態       |
| ------------------------------------ | ------------------------------------- | -------------- |
| YouTube/YT Music candidate import    | 協助從 provider source 建立候選曲目。 | 已實作核心路徑 |
| `yt-dlp` download path               | 目前 provider flow 使用的下載工具鏈。 | 已實作核心路徑 |
| Provider metadata / thumbnail / info | 保存 provider 回傳的輔助資料。        | 已實作部分路徑 |
| Spotify official import              | 讀取 playlist metadata。              | 規劃中         |
| Optional provider module             | 將進階來源能力拆成可控模組。          | 待評估         |

### 3.4 明確排除或延後

- 內建商用曲庫。
- 授權代理或素材授權管理服務。
- Twitch/YouTube chat song request automation。
- 多使用者協作與雲端同步。
- OBS native plugin。
- 以繞行平台規則為目標的功能。

## 4. 目前狀態盤點

### 4.1 已實作

- Electron + Vite + Vue 3 desktop shell。
- Secure preload bridge 與固定 IPC surface。
- `utawakui-media:` custom protocol，支援本機 media 讀取與 seek。
- 結構化曲庫：`tracks/<trackId>/audio.<ext>`、縮圖、來源資訊、lyrics、generated separation files。
- `library.json` scalar metadata index。
- `playlists.json` collection storage。
- 播放器、播放佇列、shuffle、repeat、previous/next。
- Pitch / Tempo 即時 preview。
- Vocal separation worker 與 guide vocal playback graph。
- Import resolver 與 provider candidate selection。
- `youtube-dl-exec` backed download path。
- Lyrics/subtitle 相關基礎路徑。
- Windows taskbar thumbar、SMTC metadata、window title。

### 4.2 尚未完成但已納入規格

- Feature notice modal（provider-flow、lyrics-flow 已部分實作）。
- Feature gate registry（provider-flow、lyrics-flow 已部分實作）。
- Local import first flow（本機音訊檔匯入已部分實作）。
- OBS Browser Source overlay server。
- Overlay theme tokens。
- Performer self-view。
- Recording/VOD session mode。
- Pitch/Tempo pre-render cache。
- Preset export/import。
- Packaging、installer、AUMID（`electron-builder.yml` 與 `npm run dist`/`dist:dir` 已存在，NSIS 安裝檔的 `appId`/`productName` 對齊 `electron/main/windowState.js` 的 AUMID 常數；feature/runtime/package 對照見 `docs/release-inventory.md`）；code signing 與自動更新仍未開始。

## 5. 架構邊界

```text
Renderer Vue app
  - Views, components, composables
  - Playback UI and library UI
  - Feature notices and gates
  - IPC through preload only

Electron main process
  - BrowserWindow lifecycle
  - IPC handlers
  - utawakui-media: protocol
  - Library/config/playlists modules
  - Provider/downloader modules
  - Worker-based audio processing

Local library
  - tracks/<trackId>/
  - library.json
  - playlists.json
  - config-selected download root

OBS overlay server (planned)
  - Local HTTP static delivery
  - WebSocket state updates
  - Plain HTML/CSS/JS Browser Source
```

架構規則：

- Renderer 不直接存取 filesystem。
- Renderer 不啟用 Node integration。
- 所有 filesystem、provider、download、separation 行為都經 main process 或 worker 處理。
- 本機媒體經 `utawakui-media:` allowlist 提供，不直接暴露 arbitrary file path。
- Overlay 是獨立 delivery path，不嵌入 Electron renderer。
- Overlay tokens 使用 `--ovl-*`，控制台 tokens 使用 `--ui-*`，兩者不共用。

## 6. 資料模型

### 6.1 Library Root

預設 library root 位於使用者 Music folder 下的 `Utawakui` 目錄，並可由設定改變。

```text
Utawakui/
  library.json
  playlists.json
  tracks/
    <trackId>/
      audio.<ext>
      thumbnail.<ext>
      info.json
      lyrics/
      separations/
```

### 6.2 檔案角色

| 檔案              | 用途                          | 備註                                     |
| ----------------- | ----------------------------- | ---------------------------------------- |
| `config.json`     | Machine-local settings。      | 不屬於可分享 preset。                    |
| `library.json`    | Track scalar metadata。       | 不保存絕對 asset path。                  |
| `playlists.json`  | Collection、排序、track ids。 | 跟著 library root 移動。                 |
| `audio.<ext>`     | 實際播放音訊。                | 位於 track folder。                      |
| `thumbnail.<ext>` | 曲目圖像輔助資料。            | 由 media protocol 提供。                 |
| `info.json`       | Provider/source sidecar。     | 作為輔助資料，不作為 UI 唯一來源。       |
| `lyrics/`         | 歌詞與字幕相關資料。          | 後續需與 self-view / overlay flow 對齊。 |
| `separations/`    | Generated separation files。  | 依 preset 或模型設定保存。               |

### 6.3 本機音訊入庫

本機音訊匯入採 managed library：使用者選取的來源檔案會複製到 `tracks/<trackId>/audio.<ext>`，Utawakui 後續播放與衍生資料都以曲庫內檔案為準，不依賴原始來源路徑。

本機匯入的最低必要資料，是系統可保證產生、足以播放、顯示與追蹤的 scalar metadata：

- `id`：Utawakui 內部 track identity。
- `title`：優先使用檔名去副檔名；不要求音訊 tag。
- `sourceType`：目前本機匯入為 `local-file`。
- `storageType`：目前預設為 `managed`。
- `audioFilename`：例如 `audio.mp3`，不保存絕對路徑。
- `originalFilename`：來源辨識線索，不作為播放依賴。
- `importedAt`：入庫時間。
- `fileSize`：來源檔案大小，作為基本追蹤線索。
- `contentHash`：音訊內容的 SHA-256，用於批量匯入時辨識同內容重複檔案。

`artist`、`album`、`duration`、`thumbnail`、lyrics、BPM/key/pitch 等資料皆為 optional enrichment，不是本機音訊入庫的必填條件。

本機曲目的 `title` / `artist` 可由使用者手動編輯；這是 `library.json` 的 scalar metadata 更新，不重新命名或搬動實際音訊檔。

本機曲目的縮圖可由使用者手動選擇本機圖片，保存為 `tracks/<trackId>/thumbnail.<ext>`，與 provider 下載曲目的縮圖規格相同；`library.json` 不保存圖片路徑或 `thumbnailUrl`。

批量匯入時，Utawakui 以 `contentHash` 判斷同內容重複：同一份音訊即使檔名或原始路徑不同，也只保留既有曲目並略過新副本；同檔名但音訊內容不同，仍以新的 track id 入庫。

Setlist 以獨立的「本機音訊」虛擬清單呈現本機匯入曲目；一般曲庫清單與本機清單分開排序與瀏覽。

### 6.4 歌詞來源

歌詞來源儲存在 `tracks/<trackId>/lyrics/`，並由 `lyrics.json` manifest 記錄來源列表與 scalar display metadata。來源檔本身仍是 filesystem truth；manifest 只保存 `filename`、`language`、`kind`、可選 `label` 等顯示/選擇需要的欄位，不保存外部 provider URL 或本機原始路徑。

目前來源類型：

- `youtube-cc`：由 provider/backfill 流程保存的字幕。
- `lrclib`：由 LRCLIB 搜尋保存的 LRC。
- `manual`：使用者貼上或選取本機 `.lrc` / `.vtt` / `.txt` 後保存的本機歌詞來源。

手動匯入是本機 library edit，不需 feature gate；外部 lyrics provider 搜尋與保存屬於 `lyrics-flow`，首次執行時需確認。貼上的純文字或 `.txt` 檔會保存為 `manual*.lrc`，沒有 timestamp 時以 untimed lines 顯示，不支援點擊 seek。

### 6.5 Preset 原則

未來 preset export/import 可包含：

- Playlist / setlist 結構。
- Theme / display settings。
- Overlay layout settings。
- 可選的 track reference metadata。

Preset 不應包含：

- Machine-local paths。
- `config.json`。
- 第三方原始 media files。
- 任何由 Utawakui 宣稱已驗證的外部狀態。

## 7. Feature Notice 與 Gate

Feature gate 的目的，是讓使用者在啟用進階流程前看見必要提示，並讓產品能保存啟用狀態。

目前第一版已落地 `provider-flow`：renderer 會在外部來源解析 / 下載前要求確認，main process 也會在 provider IPC handler 前檢查啟用狀態。`lyrics-flow` 已接到 LRCLIB provider search / save / label backfill；手動貼上或本機歌詞檔匯入、來源標籤編輯、刪除來源則維持 ungated，因為它們只操作使用者已有的本機資料。

Import 頁目前採本機優先切分：本機音訊檔匯入是預設入口，不需 feature gate；外部來源匯入維持在 provider flow 中，首次執行 provider action 時要求確認。

### 7.1 Gate 類型

| Gate                  | 適用功能                                                                            |
| --------------------- | ----------------------------------------------------------------------------------- |
| Provider flow         | YouTube/YT Music candidate import、`yt-dlp` download path、provider metadata 保存。 |
| Lyrics flow           | Lyrics provider、字幕保存、self-view、overlay lyrics。                              |
| Audio processing flow | Vocal separation、Pitch/Tempo pre-render cache。                                    |
| Public output flow    | OBS overlay、livestream session、recording/VOD session。                            |

### 7.2 Confirmation Record

```json
{
  "featureConfirmation": {
    "featureId": "provider-flow",
    "noticeVersion": "feature-notice-v1",
    "confirmedAt": "2026-08-13T00:00:00.000Z",
    "enabled": true
  }
}
```

紀錄只表示使用者已啟用該流程。它不應被設計成授權資料庫，也不應讓 UI 暗示 Utawakui 代替使用者完成外部確認。

## 8. Roadmap

### Phase 0：目前基礎

- Desktop control panel。
- 本機曲庫與播放。
- Playlist / collection。
- Pitch / Tempo preview。
- Vocal separation / guide vocal。
- Provider candidate import 與 download path。
- Lyrics/subtitle 基礎路徑。
- Windows shell integration。

### Phase 0.5：產品邊界整理

- Feature notice modal。
- Feature gate registry。
- Local import first flow（本機音訊檔匯入已部分實作）。
- Provider flow 從預設入口移到明確啟用。
- README、spec、UI copy 用語統一。

### Phase 1：OBS MVP

- 本機 HTTP/WebSocket state server。
- OBS Browser Source overlay。
- Performer self-view。
- Overlay theme tokens。
- Now-playing、playlist、lyrics sync。

### Phase 2：Live Operation Polish

- Pitch/Tempo pre-render cache。
- Recording/VOD session mode。
- Preset export/import。
- Library maintenance UI。
- 錯誤復原、缺檔提示與狀態修復。

### Phase 3：Distribution And Integrations

- Windows installer、AUMID（electron-builder + NSIS 已建立，見 §4.2）；signing、自動更新與 release CI 尚未開始。
- 官方 metadata provider flows。
- Optional provider modules。
- OBS plugin 或 Stream Deck integration 評估。

## 9. Open Questions

1. Feature notice 要採 app-wide 一次確認，還是依 feature/source/session 分層確認？
2. `yt-dlp` provider flow 是否應拆成 optional module？
3. Lyrics self-view 與 OBS overlay lyrics 是否需要兩套獨立狀態？
4. Recording/VOD mode 是否應在每次 session 開始前確認？
5. Preset export 是否需要支援缺曲提示與 track remapping？
