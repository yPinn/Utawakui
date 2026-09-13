# Utawakui 產品規格

本文件是產品範圍、功能現況與發展方向的權威來源。穩定定位見
[PRODUCT.md](../PRODUCT.md)，現行技術邊界見 [architecture.md](architecture.md)，
決策狀態與其他文件入口見 [docs/README.md](README.md)。

實作細節不在此重複；必要的不變量應落在架構文件、ADR、focused contract 或測試。

## 1. 產品定位

Utawakui 是 Windows 桌面歌唱工作流控制台，協助使用者在 OBS 歌回、翻唱錄製與
排練情境中管理本機媒體、歌單、播放、歌詞、音訊處理與畫面輸出。

產品採 local-first：

- 使用者自備的本機音訊是預設入口。
- 曲庫與主要設定保存在使用者電腦，不依賴 Utawakui 雲端服務。
- Provider、歌詞服務、音訊處理與公開輸出必須能獨立啟用、停用與復原。
- OBS Browser Source 是公開呈現面；控制台與演出者視窗是本機操作面。

Utawakui 不是曲庫、授權服務、素材權利管理工具或串流平台替代品。Feature gate
只記錄流程啟用，不表示 Utawakui 已替使用者確認素材或平台權利。

## 2. 產品範圍

### 2.1 預設核心

以下能力不得依賴網路、provider runtime、模型或 Output server 才能啟動：

- 本機音訊匯入與結構化曲庫。
- Track metadata、縮圖與 collections／playlists。
- 播放、seek、音量、待播、歷史、shuffle、repeat、previous／next。
- 本機設定、Windows window／taskbar／SMTC integration。
- 純本機歌詞匯入、編輯、讀取與刪除。

### 2.2 可選工作流

- **Lyrics**：外部歌詞查詢、同步資料、讀音、演出者視窗與 Lyrics Overlay。
- **Audio processing**：pitch／tempo preview、分離 recipe、guide vocal 與未來
  pre-render assets。
- **Public output**：Setlist、Lyrics、Now Playing Browser Sources；封面型模板歸入
  Now Playing。
- **Provider assist**：候選搜尋、來源匯入、下載與 metadata backfill。

每個可選工作流都必須在對應 gate 關閉或依賴缺失時，讓預設核心繼續可用。

### 2.3 明確非目標

- 內建商用曲庫、素材授權代理或權利管理服務。
- 規避平台規則、存取控制或下載限制。
- Twitch／YouTube chat 點歌與退款自動化。
- 多使用者協作、雲端同步或使用者媒體上傳服務。
- 目前不做 OBS native plugin；外部整合先以 Browser Source 與 adapters 評估。

## 3. 目前功能現況

| 領域              | 現況               | 邊界與剩餘工作                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop shell     | 已實作             | Electron、Vite、Vue、secure preload、single instance 與 production `loadFile` 路徑已建立。                                                                                                                                                                                                                                                                                                                    |
| Local library     | 已實作             | Structured track folders、metadata index、local import、legacy migration 與 media protocol 已建立。                                                                                                                                                                                                                                                                                                           |
| Playback／queue   | 已實作             | Audio element 是 timing 權威；queue、pitch／tempo preview、Windows shell controls 已連線。                                                                                                                                                                                                                                                                                                                    |
| Playlists／albums | 已實作             | Collections 可排序；來源型 album 維持 read-only membership。                                                                                                                                                                                                                                                                                                                                                  |
| Lyrics            | 主路徑已實作       | T0／T1／T2、LRCLIB／實驗性 NetEase／Better Lyrics 公開快取多來源平行搜尋、來源中立排序與同錄音來源替代、LRCLIB＋NetEase exact-only 背景自動取得、持久化來源偏好、讀音、authoring、Self-View 與 segment-aware Overlay 已建立；provider-authored timing 皆只在完整驗證通過時標示逐字同步。Better Lyrics 維持手動，既有 AMLL 來源仍可讀取與刪除但不再提供線上搜尋。                                              |
| Audio processing  | 基礎產品能力已實作 | `quick`／`general` recipe、獨立 FFmpeg／model lifecycle、guide vocal 與本機 BPM／節拍分析可用；Refined、pre-render 與高品質可選包仍受 benchmark／dependency gate 限制。                                                                                                                                                                                                                                       |
| Provider assist   | 核心路徑已實作     | App-managed Python `yt-dlp` runtime、plugin/provider sidecar、YT Music Songs 優先＋一般 YouTube 補足的文字搜尋、評分後最多十二筆候選、弱化觀看數排序、release-only 自動選取、YouTube／YT Music URL 解析、recording-first import/backfill 與 main-owned YT Music 系統瀏覽器探索已連線，只能作為 gated advanced flow；這不是官方 YT Music API 整合，Spotify／Apple Music URL 轉換、內嵌帳號與帳號歌單仍未開放。 |
| OBS output        | MVP 已實作         | Loopback HTTP/WebSocket、三個固定 slot、Gallery、Workbench、URL copy、content/state split、Lyrics template capability registry、Live Stage 可選歌詞呈現策略與 source-mapped T2 顯示邊界已建立；Browser Source 仍是支援基線。                                                                                                                                                                                  |
| Feature gates     | 已實作             | Renderer 提示與 main enforcement 共用 registry；local core 不需 gate。                                                                                                                                                                                                                                                                                                                                        |
| Diagnostics       | 已實作             | Main-owned persistence/redaction、renderer capture、Settings 控制、dependency IPC boundary 與顯式 redacted export（單一 JSON support bundle）已建立；dev-only F6 結構化檢視工作台與獨立單檔 HTML 檢視工具已提供；其他 domain wrappers 持續增量導入。                                                                                                                                                          |
| 使用者回饋        | 已實作             | 錯誤回報／功能請求／使用體驗意見／內容問題共用一套預覽後送出流程，僅錯誤回報可選附最近錯誤紀錄；Settings 常駐入口與錯誤紀錄行動選單均可觸發。Relay 獨立部署於 Cloudflare、不隨 App 打包，需另行設定 Discord webhook 與 KV namespace 才能實際送達；送出前一律強制預覽，不做自動或背景上傳。                                                                                                                    |
| Distribution      | 已實作基礎         | NSIS、AUMID、package contracts、startup trace 與 unsigned updater runtime 已建立；受信任簽章與連續版本 update acceptance 尚未完成。                                                                                                                                                                                                                                                                           |
| Session／VOD mode | 規劃中             | 尚未提供每次 session 的 live、recording、VOD 與 clips 狀態管理。                                                                                                                                                                                                                                                                                                                                              |
| External adapters | 實驗性原型         | Windows x64 已有固定 `Utawakui.Lyrics` Spout2 sender；Browser Source 仍是支援基線，實機 receiver／alpha／GPU／安裝版驗收前不列為正式支援。其他控制 adapter 尚未成為產品能力。                                                                                                                                                                                                                                 |

## 4. 產品與資料邊界

### 4.1 曲庫

預設 library root 是使用者 Music 目錄下的 `Utawakui`，也可在 Settings 選擇其他
資料夾。檔案系統決定 track 是否存在；metadata index 只補充 scalar fields。

```text
<library>/
  library.json
  playlists.json
  tracks/
    <trackId>/
      audio.<ext>
      info.json
      thumbnail.<ext>
      lyrics/
      analysis/
      separations/
```

- `library.json` 不保存 absolute media paths，也不是未來持續擴張的完整資料庫。
- `playlists.json` 保存使用者有順序的 collections 與 track ids。
- 歌詞、分析與分離結果是 main-owned sidecars；renderer 只傳 track id 與產品 intent。
- 所有 renderer media URL 經 `utawakui-media:` 的 track-id allowlist resolver。

未來需要 pitch／tempo memory、lyrics offset 與更複雜查詢時，再將 scalar metadata
遷移至 SQLite；不繼續擴張 `library.json` 的責任。

### 4.2 播放與投影

- HTML audio element 是播放時間、播放狀態與錯誤的唯一權威。
- Queue、playing track 與 lyrics 狀態由 renderer owner 管理。
- Main Projection Hub 只接受版本化、受驗證的投影；Self-View 與 Overlay 不建立
  第二份播放狀態。
- Browser Source WebSocket 為唯讀輸出通道，不能傳入播放命令。

### 4.3 音訊處理

- 產品 recipe 使用穩定 intent，不讓 renderer 選擇 paths、models 或 executable args。
- 每個完成的 recipe 產生獨立四聲道結果；聲道順序固定為 accompaniment L/R、
  guide vocal L/R。
- FFmpeg 與每個 active model 是可獨立準備、修復與移除的最小單位。
- Provider Python 與 Audio Python 是不同 runtime family，不共用 activation 或 lifecycle。
- Music Analysis 需要 `audio-processing-flow` 授權與已準備的 BPM 分析元件；Settings
  預設開啟「匯入後自動分析」，成功下載或本地匯入不等待分析，失敗也不回滾歌曲。
- Refined 只有在 dependency、授權、離線、安全與品質 gate 通過後才能成為可執行
  產品能力。

### 4.4 Output

- Output server 只綁定 loopback，並以 exact route allowlist 提供資產。
- 實驗性 Spout2 Lyrics sender 由獨立 helper 發布相同 Lyrics route；固定為 `Utawakui.Lyrics`、1920×1080、BGRA8／premultiplied alpha／sRGB SDR，提供 session-only 30／60 FPS 與顯式 start／stop，不取代 Browser Source。`sending` 只代表首幀已送入 sender，不代表接收端狀態。
- Snapshot 不包含 filesystem path、provider payload 或任意 renderer HTML。
- Artwork 只透過 public track id 解析 allowlisted thumbnail。
- 現行三個固定 slot（Setlist／Lyrics／Now Playing）是 MVP 基線；黑膠主題與
  Cover Player 是 Now Playing 模板。Output Instance／Presentation Pack 是未來
  擴充方向，不應提前宣稱已完成。
- Setlist 的基礎公開契約只顯示目前演唱曲目與已唱紀錄，不投影待唱佇列。預設
  480×810 `Simple Black B` 模板以約兩成高度保留目前歌曲焦點區，已唱紀錄取得
  其餘可用高度；兩區只以固定 spacing 分隔，不保留無語意的比例空白列。最近
  八首已唱紀錄依正常播放順序向下排列，只有實際內容超出下方區域時才自動垂直
  滾動。

### 4.5 使用者回饋

- 涵蓋錯誤回報、功能請求、使用體驗意見與內容／歌詞來源問題四類，共用同一套
  預覽後送出流程；送出前一律強制顯示將送出的完整內容，不做自動或背景上傳。
- 只有錯誤回報可選附最近診斷紀錄（最多 50 筆，非匯出用的完整 500 筆）；其餘
  三類完全不夾帶診斷資料。使用者自行填寫的說明／聯絡方式／歌曲資訊只做長度
  上限與控制字元過濾，不套用診斷紀錄的 URL／路徑遮蔽——因為使用者會在預覽
  階段親自檢視，且內容問題經常需要引用來源連結才有意義。
- 不受任何 feature gate 保護；每次送出前的強制預覽才是實際防護，理由見
  [ADR 0016](adr/0016-user-feedback-intake.md)。
- 送出對象是獨立部署的 relay（Cloudflare Worker），不隨 App 打包；relay 端會
  重新驗證整個 payload，並依 IP 做速率限制後轉發成 Discord embed。
- `environment` 固定包含 `appVersion`／`electronVersion`／`platform`／`locale`；
  即使目前沒有 i18n，語言仍先納入使用情境以備未來需要。

詳細 runtime ownership、依賴切分與 diagnostics flow 見
[architecture.md](architecture.md)。

## 5. Feature Gates 與依賴

| Gate                    | 保護的產品動作                            | 依賴原則                                                    |
| ----------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| `provider-flow`         | 外部候選、下載、來源匯入與 backfill       | Provider runtime 四個 artifact 原子準備；不得阻擋本機匯入。 |
| `lyrics-flow`           | 外部歌詞查詢與保存                        | 每次 external request 都在 main 再檢查；不需要安裝 binary。 |
| `audio-processing-flow` | Separation、本機音樂分析與未來 pre-render | FFmpeg 與 active model 各自管理；缺一項只影響該能力。       |
| `public-output-flow`    | 啟動 Output server 與發布狀態             | 內建 Overlay 不需外部 binary；stop／status 永遠可用於復原。 |

Gate confirmation 只保存 `featureId`、notice version、confirmed time 與 enabled 狀態。
它不保存素材權利判斷，也不能成為 main trust boundary 的替代品。

## 6. 方向與優先順序

### 6.1 近期：穩定公開測試核心

- 持續量測 dev、production-like、unpacked 與 installed startup。
- 完成 installer／updater 的連續版本 acceptance 與 unsigned-channel 操作驗證。
- 補齊 Lyrics、Self-View、Workbench 與 OBS 的人工視覺 walkthrough。
- 擴大 diagnostics domain coverage、匯出與可恢復錯誤狀態。
- 完成缺檔、corrupt sidecar、dependency repair 與 library maintenance UX。

### 6.2 中期：完整演出操作

- Recording／VOD session mode 與 source output review。
- Pitch／tempo pre-render cache 與 preset export／import。
- Output Instance 與受限 Presentation Pack／User Variant 模型。
- 在既有 source convergence 上補齊 readiness 與 activation hardening。

### 6.3 後期：經驗證後的擴充

- Music Analysis 持續補強 offline、容量、失敗復原與人工驗收證據；Refined runtime
  仍須通過 license、offline、wheel、容量與固定歌曲品質驗證後才可啟用。
- 只有明確 workflow 需求成立後，才加入 OBS WebSocket、VTube Studio、Stream Deck
  或 native transport adapters。
- Provider 模組與官方 metadata integrations 保持 optional，不改變 local-first 入口。

## 7. 尚待產品決策

1. Recording／VOD gate 應每次 session 確認，或保存可見但可重用的 session preset？
2. Preset 匯入遇到缺曲時，採提示、略過或 track remapping？
3. Official Presentation Pack 與 User Variant 的版本、簽章與分享邊界如何落地？
4. Refined 的固定品質與容量門檻達到多少才可進產品 catalog？
5. 哪一個外部 adapter 有足夠真實需求，值得新增 credential 與 command trust boundary？
