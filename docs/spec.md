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
| OBS Overlay          | 給觀眾端或錄製畫面使用的 Browser Source。        | 基本 MVP 已實作    |
| Recording / VOD mode | 區分 live-only 與 recording/VOD session。        | 規劃中             |

### 3.3 進階來源功能

這些功能應放在明確啟用的 provider flow 中，不作為預設主入口：

| 功能                                 | 角色                                  | 目前狀態       |
| ------------------------------------ | ------------------------------------- | -------------- |
| YouTube/YT Music candidate import    | 協助從 provider source 建立候選曲目。 | 已實作核心路徑 |
| App-managed Python `yt-dlp` runtime  | Provider import / backfill 工具鏈。   | 已實作核心路徑 |
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
- App-managed Python `yt-dlp` provider runtime，用於 provider import 與 metadata backfill。
- Lyrics/subtitle 相關基礎路徑。
- Windows taskbar thumbar、SMTC metadata、window title。
- Feature notice modal 與共用 feature gate registry；provider、lyrics、audio processing、public output 已有 renderer/main 雙層 enforcement。
- Local-import-first Import flow；本機音訊為預設入口，provider flow 需明確啟用。
- Loopback HTTP/WebSocket output runtime、四條固定 Browser Source routes 與 canonical snapshot projection。
- 四類獨立 overlay slots、分類 Gallery、真實 iframe Workbench 與 allowlisted appearance settings。

### 4.2 尚未完成但已納入規格

- Performer self-view。
- 進階 overlay 模板與完整 style-set catalog；現有四類 slot、基礎模板與 appearance editing 已完成。
- Recording/VOD session mode。
- Pitch/Tempo pre-render cache。
- Preset export/import。
- Packaging、installer、AUMID（`electron-builder.yml` 與 `npm run dist`/`dist:dir` 已存在，NSIS 安裝檔的 `appId`/`productName` 對齊 `electron/main/windowState.js` 的 AUMID 常數；feature/runtime/package 對照見 `docs/release-inventory.md`）；執行版本與 main-owned 更新 runtime 已建立，但 release gate 維持停用；code signing、公開 release repo、release CI 與兩版本驗證仍未完成，契約見 ADR 0007。

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

OBS overlay runtime
  - Loopback HTTP/WebSocket state runtime (implemented)
  - Local HTTP static overlay delivery (implemented)
  - Plain HTML/CSS/JS Browser Source (implemented foundation)
```

架構規則：

- Renderer 不直接存取 filesystem。
- Renderer 不啟用 Node integration。
- 所有 filesystem、provider、download、separation 行為都經 main process 或 worker 處理。
- 本機媒體經 `utawakui-media:` allowlist 提供，不直接暴露 arbitrary file path。
- Overlay 是獨立 delivery path，不嵌入 Electron renderer。
- Overlay tokens 使用 `--ovl-*`，控制台 tokens 使用 `--ui-*`，兩者不共用。
- App 版本由 main process 的 `app.getVersion()` 提供；renderer 不直接把
  `package.json` 當成 packaged runtime 狀態。
- App update service 只存在 main process。Renderer 只能經 preload 發出固定的
  check/download/install intent，不能指定 feed URL、檔案路徑或 updater options。

## 6. 資料模型

### 6.1 Library Root

預設 library root 位於使用者 Music folder 下的 `Utawakui` 目錄，並可由設定改變。

```text
Utawakui/
  library.json
  playlists.json
  overlays.json
  tracks/
    <trackId>/
      audio.<ext>
      thumbnail.<ext>
      info.json
      lyrics/
        readings/
      separations/
```

### 6.2 檔案角色

| 檔案              | 用途                          | 備註                                     |
| ----------------- | ----------------------------- | ---------------------------------------- |
| `config.json`     | Machine-local settings。      | 不屬於可分享 preset。                    |
| `library.json`    | Track scalar metadata。       | 不保存絕對 asset path。                  |
| `playlists.json`  | Collection、排序、track ids。 | 跟著 library root 移動。                 |
| `overlays.json`   | Overlay profiles 與樣式設定。 | 只保存可攜式 ids 與 scalar settings。    |
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

**讀音輔助（furigana/羅馬拼音）**：每個歌詞來源可對應一份讀音資料，保存於
`tracks/<trackId>/lyrics/readings/<sourceFilename>.json`（用完整來源檔名，而非去
副檔名的 stem，避免 `manual.lrc` 與 `manual.vtt` 互相覆蓋）。內容為逐行的 ruby 段落
（`{ text, segments: [{ t, r? }], romaji, edited }`），與歌詞原文以文字比對方式對齊
——來源文字被取代後，讀音資料視為過期，個別行會停止顯示而不是顯示錯誤的讀音。目前
只支援日文（假名標音、羅馬拼音），分析器實作與相依套件選型見
[ADR 0003](adr/0003-japanese-reading-analyzer-stack.md)；產生/修正動作是純本地文字
運算，不需 feature gate。刪除歌詞來源時，對應的讀音資料一併刪除。

### 6.5 Preset 原則

`overlays.json` 是 versioned slot document，分別保存 `now-playing`、`setlist`、
`lyrics` 與 `artwork` 四類輸出。每個 slot 各自持有 `templateId`、`styleSetIds` 與
scalar appearance settings，彼此可同時使用，不存在全域互斥的「目前 profile」。
讀取時逐類清洗，version 1 profile document 會遷移到對應 slot；損壞文件會保留備份，
寫入採 atomic temp-file rename。較新且不支援的 schema version 會拒絕載入，避免舊版
覆寫新資料。它不保存 live playback state、絕對路徑、media URL、provider id 或
素材內容。

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

### 6.6 Output State Contract

Phase 1 使用 versioned snapshot 在 renderer 與 main-process output server
之間傳遞 now-playing、queue 與 lyrics。Renderer 內既有的 player、playback queue
與 lyrics composables 維持唯一 source of truth；snapshot 只是投影，不建立第二套
播放狀態。

Snapshot 只包含 overlay 顯示所需的 scalar data：revision、canonical timestamp、
顯示同步補償、播放 phase 與時間、曲目的 id/title/artist、queue item state，以及
純文字歌詞行與毫秒 timing。播放 phase 由 `<audio>` 的 `play` / `playing` /
`waiting` / `stalled` / `seeking` / `seeked` / `pause` / `ended` / `error` 事件投影；
`buffering` 與 `seeking` 不推進 overlay clock。共享 parser 會建立 canonical copy，
剝除 renderer-only media URL、
filesystem path、provider metadata、歌詞 filename 與其他額外欄位；未來 main
process 收到 renderer payload 時仍必須重新 parse，不信任 renderer 已完成清洗。

### 6.7 Loopback Output Runtime

Phase 1B 的 runtime 由 Electron main process 持有，但核心實作維持純 Node module。
它使用 Node `http` 與直接 production dependency `ws`，固定 bind
`127.0.0.1`，預設 port `8700`；不對 LAN 或所有網路介面開放。套件選型與
替代方案見 [ADR 0006](adr/0006-loopback-output-websocket-runtime.md)。

Runtime API allowlist 包含 `GET /health`、唯讀 `GET /api/v1/state` 與 `/ws`
upgrade；另外提供 P1C 定義的固定 static overlay routes。WebSocket 只接受相同
loopback HTTP origin，關閉 compression，限制 inbound
payload/fragment/buffer，且不接受 client command。連線建立時先送
`state.snapshot`，之後只送 revision 遞增的 `state.changed`；兩者都包含經共享
contract 再解析的完整 canonical snapshot，因此 OBS scene reload 不依賴遺失前的
增量事件。P1C 已加入明確 allowlist 的 static overlay routes；P1D 已接上
feature gate、preload IPC 與 renderer publish。

### 6.8 Independent Overlay Delivery

Phase 1C 的 Browser Source 檔案位於 root-level `overlay/`，不進 Vite renderer
bundle，也不 import Vue 或 control-panel `--ui-*` tokens。Server 只用固定 route map
提供 `/overlay/lyrics`、`/overlay/now-playing`、`/overlay/setlist`、
`/overlay/artwork` 與其明確列出的 CSS/ES module assets；URL 不會直接解析成
filesystem path。

共用 `runtime.mjs` 使用 CEF/瀏覽器原生 WebSocket，收到完整 `state.snapshot` 後
依 canonical timestamp 與 machine-local display delay 排程渲染，忽略過期的
`state.changed`；補償變更或斷線時會取消尚未套用的舊狀態。斷線以 500ms 起始、
最高 8s 的 backoff 重連。歌詞基本模板顯示目前行與下一個非空白行，背景完全透明，長行可安全換行，
並在 `prefers-reduced-motion` 下停用行切換 motion。所有 track/lyrics/queue 文字只透過
`textContent` 或新建 text element 寫入，不使用 `innerHTML`。

Overlay CSS 分為 `--ovl-primitive-*`、semantic `--ovl-color/font/motion-*` 與
各模板 `--ovl-template-*` 三層。工作台只保存 allowlist option id；overlay runtime
再將 font family、scale、weight、alignment 與 surface id 映射到 CSS data attributes
與 role variables。這讓未來 style set 覆寫 semantic/template roles，而不需要複製
整份 CSS，也不會把公開輸出樣式耦合到控制台 theme 或接受任意 CSS 字串。

### 6.9 Output Workbench Connection

Phase 1D 由 main process 的 `outputHandlers` 提供 start/stop/status/publish 與
portable overlay-slot IPC。Start 與 publish 都會重新檢查 `public-output-flow`；stop
與 status 維持 ungated，讓使用者在 gate/config 狀態異常時仍可停止輸出或診斷狀態。

Renderer 的 `useOutputRuntime` 是 App 層長生命週期 singleton。它從既有
`usePlayer`、`usePlaybackQueue` 與 playing-track `useLyrics` 投影公開 snapshot，
序列化 IPC 並合併尚未送出的中間狀態；切換頁面不會停止 OBS 更新。Main 回報目前
revision，renderer reload 後會接續遞增，不會讓仍存活的 server 拒絕新狀態。

Output 內分為工作台、模板庫與輸出設定，並以工作台作為預設頁。Gallery 先以輸出類型 tabs 限定單一分類，
縮圖與右欄共用控制台內的 `ObsTemplateMockup`，只呈現固定 16:9 的標準化模板示意，
不依賴 runtime 或 iframe，避免實際 overlay 在小尺寸下因原始字級、定位與動畫基準
縮放失真。Workbench 才載入目前類型的真實 served iframe，並以 inspector 編輯該
slot 的文字與背景設定，不改動其他類型。Preview URL 在固定路徑加上 `?preview=1`，
讓 idle 狀態使用 demo fallback 與深色檢視底；複製給 OBS 的 URL 不含該參數，因此
不會發布假狀態，且頁面背景保持透明。Browser Source URL 複製屬於 Workbench 的
目前類型操作，不放在本機服務設定中。

Gallery 右欄與 Workbench inspector 都使用 rem 上下限與 viewport-relative 中間值，
不依賴可折疊／可拖曳的 playlist sidebar 內容寬度；Workbench 的 iframe stage 使用
16:9 與 rem 最大寬度，在 inspector 之外盡量填滿可用空間。輸出設定集中管理
`autoStart`、port、服務啟停與可用 port 建議。四種輸出採固定路徑，URL 是低頻操作，
不讓長網址占用主要資訊層級。服務連線狀態只表示有 Browser Source client 連入，不
推論一定是 OBS 本體。Host 固定為 `127.0.0.1`，port 衝突不會靜默改號。

`config.json` 保存 machine-local `outputRuntime.autoStart` / `port` /
`displayDelayMs`；`overlays.json`
保存四個 slot 各自的 template id、style-set ids 與 scalar settings。模板瀏覽不會
立即保存，只有明確套用才更新目前類型；appearance settings 也只寫回目前 slot。
頁面編排由 `ObsOutputWorkspace` 負責，Gallery、Workbench 與輸出設定元件只接收
props／發出 events，side effects 留在 `useOutputRuntime`。Renderer ESM projector 與
main CommonJS validator 共用 `outputContractValues.json` 的 version/collection limits；
只有 main validator 是 IPC trust boundary。

正常播放同步不是使用者可調的網路延遲設定。Renderer 在 publish request 建立時寫入
`generatedAt`；lyrics overlay 以該時間、`positionMs`、`rate` 與 lyrics offset 推算
目前播放位置，並在下一個歌詞時間邊界自行重繪。`displayDelayMs` 是另一個
machine-local 固定補償：正值延後整份 overlay state，負值在播放中向前投影，範圍為
-2000 至 5000ms；它不改動歌詞檔的 offset，也不重啟 output server。WebSocket 的
500ms 起始等待只用於斷線重連，不可混入 Port、heartbeat 或 display compensation。
目前 publish 維持 serial latest-wins，Browser Source 端只在正補償期間保留有界的待顯示
snapshot。先前 loopback 量測未顯示 transport bottleneck，因此不先拆成 content snapshot
與 clock correction 兩套 protocol；只有 payload size、更新頻率或 OBS 記憶體量測成為
實際問題時才重開此決策。
目前 publish 維持 serial latest-wins，Browser Source 端只在正補償期間保留有界的待顯示
snapshot。先前 loopback 量測未顯示 transport bottleneck，因此不先拆成 content snapshot
與 clock correction 兩套 protocol；只有 payload size、更新頻率或 OBS 記憶體量測成為
實際問題時才重開此決策。

## 7. Feature Notice 與 Gate

Feature gate 的目的，是讓使用者在啟用進階流程前看見必要提示，並讓產品能保存啟用狀態。

目前第一版已落地 `provider-flow`：renderer 會在外部來源解析 / 下載前要求確認，main process 也會在 provider IPC handler 前檢查啟用狀態。`lyrics-flow` 已接到 LRCLIB provider search / save / label backfill；手動貼上或本機歌詞檔匯入、來源標籤編輯、刪除來源則維持 ungated，因為它們只操作使用者已有的本機資料。

Import 頁目前採本機優先切分：本機音訊檔匯入是預設入口，不需 feature gate；外部來源匯入維持在 provider flow 中，首次執行 provider action 時要求確認。

### 7.1 Gate 類型

| Gate                  | 適用功能                                                                             |
| --------------------- | ------------------------------------------------------------------------------------ |
| Provider flow         | YouTube/YT Music candidate import、Python `yt-dlp` runtime、provider metadata 保存。 |
| Lyrics flow           | Lyrics provider、字幕保存、self-view、overlay lyrics。                               |
| Audio processing flow | Vocal separation、Pitch/Tempo pre-render cache。                                     |
| Public output flow    | OBS overlay、livestream session、recording/VOD session。                             |

### 7.2 Confirmation Record

```json
{
  "featureConfirmation": {
    "featureId": "provider-flow",
    "noticeVersion": "feature-notice-v3",
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

### Phase 0.5：產品邊界整理（已完成自動化驗收）

- Feature notice modal。
- Feature gate registry。
- Local import first flow。
- Provider flow 從預設入口移到明確啟用。
- README、spec、UI copy 用語統一。

2026-08-22 已完成 build、lint、format、完整 Vitest coverage 與 Electron
啟動驗證；真實 provider network、Settings 與歌詞讀音等 GUI walkthrough
仍依 `tasks/todo.md` 個別追蹤，不阻擋 Phase 1 開始。

### Phase 1：OBS MVP

- 本機 HTTP/WebSocket state server（P1B runtime、P1D gate/IPC/publish 已完成）。
- OBS Browser Source overlay（P1C 基本模板、P1D Workbench 真實預覽已完成）。
- Performer self-view 與 integration boundary（P1E，下一個實作 phase）。
- Overlay token foundation、四類獨立 slot persistence、template selection 與基礎 appearance editing 已完成；進階模板 catalog 不阻擋 Phase 1 closeout。
- Now-playing、playlist、lyrics sync（P1D 基本 snapshot sync 已完成）。

### Phase 2：Live Operation Polish

- Pitch/Tempo pre-render cache。
- Recording/VOD session mode。
- Preset export/import。
- Library maintenance UI。
- 錯誤復原、缺檔提示與狀態修復；diagnostics foundation 已完成，Settings、
  export 與 domain wrapper 依
  [local diagnostics rollout route](diagnostics-rollout.md) 隨本 phase 推進。

### Phase 3：Distribution And Integrations

- Windows installer、AUMID、執行版本 IPC 與 main-owned update runtime 已建立；
  signed public-release update 契約已由 ADR 0007 固定。Runtime release gate
  維持停用，剩 Authenticode signing、公開 release repo、release CI 與兩版本
  packaged verification。
- 公開 release repo 的 GitHub Pages 產品展示／下載入口（後期 promotion；Pages
  與 updater feed 分離，初期維持純靜態且不加入 analytics）。
- 官方 metadata provider flows。
- Optional provider modules。
- OBS plugin 或 Stream Deck integration 評估。

## 9. Open Questions

1. Feature notice 要採 app-wide 一次確認，還是依 feature/source/session 分層確認？
2. Lyrics self-view 與 OBS overlay lyrics 是否需要兩套獨立狀態？
3. Recording/VOD mode 是否應在每次 session 開始前確認？
4. Preset export 是否需要支援缺曲提示與 track remapping？
