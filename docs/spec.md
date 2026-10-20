# Utawakui 產品規格

產品範圍、功能現況與方向的唯一來源。定位見 [PRODUCT](../PRODUCT.md)，技術邊界見[架構圖](architecture.md)，行為細節見各[契約](contracts/README.md)。

## 1. 產品定位

Utawakui 是 Windows 桌面歌唱工作流控制台，協助使用者在 OBS 歌回、翻唱錄製與排練時管理本機媒體、歌單、播放、歌詞、音訊處理與畫面輸出。

產品採 local-first：

- 使用者自備的本機音訊是預設入口。
- 曲庫與設定保存在使用者電腦，不依賴 Utawakui 雲端服務。
- Provider、歌詞服務、音訊處理與公開輸出可獨立啟用、停用與復原。
- OBS Browser Source 是公開呈現面；控制台與演出者視窗是本機操作面。

Utawakui 不是曲庫、授權服務、素材權利管理工具或串流平台替代品。Feature gate 只記錄流程啟用，不代表已確認素材或平台權利。

## 2. 產品範圍

### 2.1 預設核心

以下能力不依賴網路、provider runtime、模型或 Output server：

- 本機音訊匯入、結構化曲庫、metadata、縮圖與 playlists。
- 播放、seek、音量、待播、歷史、shuffle、repeat、previous／next。
- 演出安排：從 playlist／album 或曲庫搜尋建立場次，逐曲記錄完成／略過／中止，可連續播放並在重啟後恢復，不依賴 OBS。
- BGM 待機播放：與演唱播放器嚴格互斥的獨立單 deck，服務曲間休息；控制整合在演出安排。
- 本機設定、Windows window／taskbar／SMTC 整合。
- 純本機歌詞匯入、編輯、讀取與刪除。

### 2.2 可選工作流

- **Lyrics**：外部歌詞查詢、同步資料、讀音、演出者視窗與 Lyrics Overlay。
- **Audio processing**：pitch／tempo preview、分離 recipe、guide vocal 與未來 pre-render。
- **Public output**：Setlist、Lyrics、Now Playing Browser Sources。
- **Provider assist**：候選搜尋、來源匯入、下載與 metadata backfill。
- **External integrations**：唯讀 OBS WebSocket、直播／錄影時間戳與本機 session history。

任一可選工作流在 gate 關閉或依賴缺失時，預設核心仍須可用。

### 2.3 非目標

完整清單見 [PRODUCT](../PRODUCT.md)。外部整合先以 Browser Source 與 adapters 評估，不做 OBS native plugin。

## 3. 功能現況

| 領域                 | 現況         | 已具備                                                                                                                                           | 剩餘工作                                                                                                                                                                                                                                                                    |
| -------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop shell        | 已實作       | Secure preload、single instance、tray 背景執行；關閉時可選背景／結束並記住，伴奏處理中另行確認。                                                 | 不含登入自動啟動與 tray 播放控制。                                                                                                                                                                                                                                          |
| 資源監視             | 已實作       | Titlebar 每 3 秒顯示 App 自身 CPU／RAM，heavy job 時補量子程序。                                                                                 | 不含整機、GPU 與 yt-dlp 程序。                                                                                                                                                                                                                                              |
| 曲庫                 | 已實作       | 結構化曲庫、常見格式直接匯入、少見格式明示轉 FLAC、tag／封面保留、provider sidecar 自動整理、空間管理。                                          | 轉檔格式的封裝版實檔矩陣。[空間管理](contracts/library-storage-management.md)、[ADR 0024](adr/0024-explicit-local-audio-compatibility-transcoding.md)                                                                                                                       |
| 播放與佇列           | 已實作       | Audio element 為時間權威；佇列、最近播放、paused 啟動恢復、pitch／tempo preview、Windows 控制、節拍器。                                          | 節拍器音質與長時間 drift 人工驗收。[播放紀錄](contracts/playback-history-and-resume.md)                                                                                                                                                                                     |
| BGM 待機播放         | monitor 基礎 | 單一來源、位置持久化、loop、fade／Talk／急停與互斥交接；控制在演出安排，跨頁由安排 Dock 提供快捷。                                               | Capture routing、loudness 與實際 OBS 聽感驗收。[BGM 契約](contracts/bgm-standby-lane.md)                                                                                                                                                                                    |
| 演出安排             | 本地流程     | 目前項目、待唱與演出紀錄、排序、連續播放、手動項目、略過／中止、重啟恢復；公開輸出使用 occurrence 名稱。                                         | OBS history commit；最終操作驗收。[演出安排契約](contracts/performance-session-preparation.md)                                                                                                                                                                              |
| 播放清單、專輯與藝人 | 已實作       | 欄位排序、唯讀專輯參照、藝人 identity 與 merge／split、MusicBrainz 自動整理、藝人照片、曲目試聽、Folder 頁面物件。                               | 弱 alias 建議、本機 tags、實機視覺驗收；試聽的同步歌詞卡與音量條。[ADR 0022](adr/0022-artist-identity-and-organization.md)、[照片](contracts/artist-photo-provider.md)、[試聽](contracts/track-preview.md)、[頁面物件](contracts/folder-page-objects.md)                    |
| 歌詞                 | 主路徑       | T0／T1／T2、多來源搜尋與自動取得、讀音、編輯、提詞器（閱讀距離、同步微調、播放／暫停、讀音切換）、Overlay；實驗性 T1+ 聲學估計（手動準備環境）。 | 正式模型 gate 與預設下載、人工時間驗收、手機遙控。[時間契約](contracts/lyrics-timing-contract.md)、[搜尋](contracts/multi-source-lyrics-search-contract.md)、[聲學估計](contracts/lyrics-acoustic-estimate-contract.md)、[提詞器](contracts/performer-prompter-contract.md) |
| 音訊處理             | 基礎能力     | `quick`／`general` 分離（DirectML GPU，自動回退 CPU）、guide vocal、BPM／節拍分析、序列處理佇列。                                                | 跨重啟、平行處理、ETA、Refined 與 pre-render。[ADR 0009](adr/0009-tiered-audio-processing-runtime.md)、[分析契約](contracts/music-analysis-contract.md)                                                                                                                     |
| Provider assist      | 核心路徑     | App 管理的 yt-dlp、YT Music 優先搜尋、recording-first 匯入／backfill、批次下載、MusicBrainz／CAA 封面候選。                                      | 非官方 API；不支援 Spotify／Apple Music 轉換與帳號歌單。[ADR 0015](adr/0015-recording-first-provider-discovery.md)                                                                                                                                                          |
| OBS 輸出             | MVP          | Loopback server、三個固定 slot、八個模板、Gallery／Workbench、字體與色票。                                                                       | 真實 OBS 與耐久驗收；Output Instance／Pack。[顯示契約](contracts/output-appearance-baseline.md)                                                                                                                                                                             |
| Feature gates        | 已實作       | 五個 gate，renderer 提示與 main enforcement 共用 registry。                                                                                      | —                                                                                                                                                                                                                                                                           |
| Diagnostics          | 已實作       | Main 持久化與遮蔽、redacted export、dev-only 檢視工作台。                                                                                        | 其他 domain 持續導入。[ADR 0008](adr/0008-local-diagnostics-and-error-handling.md)                                                                                                                                                                                          |
| 使用者回饋           | 已實作       | 四類回報共用強制預覽流程，經獨立 Cloudflare relay 送到 Discord。                                                                                 | Relay 需另行部署設定。[ADR 0016](adr/0016-user-feedback-intake.md)                                                                                                                                                                                                          |
| 發行                 | 公開測試     | v0.3.0、v0.4.0 已發布到 stable feed；CI 從已發布版本覆蓋安裝驗證；unsigned channel 為現行邊界。                                                  | 正式更新證據；signed manifest 只有 dev key。[ADR 0007](adr/0007-public-release-app-updates.md)、[ADR 0018](adr/0018-signed-update-manifest.md)                                                                                                                              |
| OBS 整合             | 唯讀路徑     | WebSocket 5 讀取直播／錄影狀態，secure storage 密碼，session history 與 YouTube 章節輸出，OBS 活動時防休眠。                                     | Scene／source 寫入與遠端控制。[整合契約](contracts/integration-adapter-contract.md)                                                                                                                                                                                         |
| VOD／clip 權利       | 規劃中       | Session history 只記時間戳。                                                                                                                     | 每場權利狀態與輸出 review。                                                                                                                                                                                                                                                 |
| Native adapters      | 原型         | Windows x64 固定 `Utawakui.Lyrics` Spout2 sender。                                                                                               | Receiver／alpha／GPU／安裝版驗收前不列正式支援。[Spout2](contracts/integration-adapter-contract.md#spout2-native-video-profile)                                                                                                                                             |

## 4. 產品與資料邊界

### 4.1 曲庫

預設 library root 是 Music 目錄下的 `Utawakui`，可在 Settings 更改。檔案系統決定 track 是否存在；metadata index 只補充 scalar fields。

```text
<library>/
  library.json
  playlists.json
  folder-page-assets.json
  performance-session-plan.json
  folder-page-assets/<assetId>/image.<ext>
  tracks/<trackId>/
    audio.<ext>
    info.json
    thumbnail.<ext>
    artwork.json
    lyrics/
    analysis/
    separations/
```

- `library.json` 不保存絕對路徑；`playlists.json` 保存有順序的 collections。
- 封面、歌詞、分析與分離結果是 main-owned sidecars；renderer 只傳 track id 與產品 intent，media URL 一律經 `utawakui-media:` allowlist。
- 自動清理只動可重新產生的分離結果，預設關閉；細節見[空間管理](contracts/library-storage-management.md)。
- 需要更複雜查詢時再遷移 SQLite，不擴張 `library.json`。

### 4.2 播放與投影

- HTML audio element 是播放時間、狀態與錯誤的唯一權威；Queue 與歌詞由 renderer owner 管理。
- 最近播放、啟動恢復見[播放紀錄契約](contracts/playback-history-and-resume.md)；恢復資料不成為第二個播放權威。
- Main Projection Hub 只接受版本化投影；提詞器與 Overlay 不建立第二份播放狀態，Browser Source 通道唯讀。
- 演出安排以 occurrence 記錄每次演唱，不取代一般 Queue；BGM 不是安排項目。見[演出安排契約](contracts/performance-session-preparation.md)。
- BGM 與演唱嚴格互斥、不跨 lane crossfade，也不投影到 Queue、最近播放、章節、SMTC 或 Output。見 [BGM 契約](contracts/bgm-standby-lane.md)。

### 4.3 音訊處理

- Recipe 使用穩定 intent；renderer 不選 path、model 或執行參數，也不顯示這些內部資訊。
- 每個結果是四聲道：accompaniment L/R、guide vocal L/R。
- FFmpeg 與各 model 獨立準備、修復與移除；Provider Python 與 Audio Python 是不同 runtime family。
- 單曲與批次共用 main-owned 序列佇列，每首開始時重新檢查 gate 與依賴。
- Refined 須通過依賴、授權、離線、安全與品質 gate 才能成為產品能力。

### 4.4 Output

- Server 只綁定 loopback，以 exact route allowlist 提供資產；snapshot 不含路徑、provider payload 或任意 HTML。
- 三個固定 slot（Setlist／Lyrics／Now Playing）是 MVP 基線；模板與設定見[顯示契約](contracts/output-appearance-baseline.md)。
- 演出安排中未開始的項目不進公開輸出；confirmed playing 後才使用該次的顯示名稱。
- OBS WebSocket 是獨立、可停用的唯讀 adapter，不經 Browser Source 通道。

### 4.5 使用者回饋

四類回報共用預覽後送出，不做背景上傳；只有錯誤回報可附最近 50 筆診斷。不受 gate 保護，強制預覽即為防護。Relay、速率限制與回報碼見 [ADR 0016](adr/0016-user-feedback-intake.md)。

## 5. Feature Gates

| Gate                    | 保護的動作                            | 依賴原則                                                            |
| ----------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| `provider-flow`         | 外部候選、下載、來源匯入與 backfill   | Provider runtime 原子準備；不阻擋本機匯入。                         |
| `lyrics-flow`           | 外部歌詞查詢與保存                    | 每次外部請求都在 main 再檢查。                                      |
| `audio-processing-flow` | 分離、本機音樂分析與未來 pre-render   | FFmpeg 與各 model 各自管理；缺一項只影響該能力。                    |
| `public-output-flow`    | 啟動 Output server 與發布狀態         | 內建 Overlay 不需外部 binary；stop／status 永遠可用。               |
| `obs-integration`       | 連線 OBS 並讀取直播／錄影狀態與時間戳 | `obs-websocket-js` 隨 App 提供；密碼只進 OS-backed secure storage。 |

Gate confirmation 只保存 featureId、notice version、時間與 enabled，不保存權利判斷，也不取代 main 的 trust boundary。語意見 [PRODUCT](../PRODUCT.md#feature-gate-語意)。

## 6. 方向與優先順序

### 6.1 近期：穩定與安全

- 量測 dev、production-like、unpacked 與 installed startup。
- 稽核已發布資產、update metadata、checksum、secret、dependency 與 license；已發布版本不覆寫，問題以新版修復。
- 啟用 signed manifest 前，由 owner 配置 active／recovery key、protected environment 與 signing secrets。
- 補齊 v0.3.0 → v0.4.0 正式 feed 更新證據；之後每次發布須通過 installed-upgrade gate。
- 歌詞、提詞器、Workbench 與 OBS 的人工視覺驗收。
- 擴大 diagnostics 覆蓋；完成缺檔、損壞 sidecar、依賴修復與曲庫維護 UX。

### 6.2 中期：完整演出操作

- 在 OBS session history 上補 VOD／clip 權利狀態與輸出 review。
- 演出安排接上 OBS history commit；公開整合不成為本地播放前提。
- BGM 完成 capture／loudness policy 與 OBS 錄製驗收；A／B deck 與曲間 crossfade 待第一版驗證後評估。
- 藝人：跨語言弱證據建議、本機 tag 與翻唱歸屬。
- Pitch／tempo pre-render cache 與 preset 匯出入。
- Output Instance 與受限 Presentation Pack／User Variant。

### 6.3 後期：經驗證後的擴充

- Refined runtime 通過授權、離線、wheel、容量與品質驗證後才啟用。
- 有明確需求才加入 OBS 寫入、VTube Studio、Stream Deck 等具 command trust boundary 的 adapters。
- Provider 與官方 metadata 整合維持 optional。

## 7. 尚待產品決策

### 7.1 產品範圍

1. VOD／clip 權利狀態每場確認，或保存可重用的 session preset？
2. Preset 匯入遇到缺曲時提示、略過或 remap？
3. Official Presentation Pack 與 User Variant 的版本、簽章與分享邊界？
4. Refined 的品質與容量門檻？
5. 哪個可寫入的外部 adapter 值得新增 command、credential 與 applied-state 確認？
6. 是否投入原生 OBS 音訊輸出（libobs plugin）？需評估 GPL-2.0-or-later 散布與行程內崩潰風險，見[競品調查 §5.2](research/product/competitive-research.md#52-原生-obs-音訊仍是高成本候選不是追趕項目)與 [§6](research/product/competitive-research.md#6-權利平台與隱私邊界)。
7. 是否加入「無伴奏演出」項目，讓清唱／自彈不需假媒體檔？見[競品調查 §5.1](research/product/competitive-research.md#51-bgm-lane-與無伴奏項目已形成重複需求訊號)。
8. BGM 的 accompaniment／loudness policy 與預設 capture profile。
9. 演唱工具「歌詞」頁含來源切換、讀音產生與編輯入口，超出 [ADR 0023](adr/0023-renderer-destination-and-workspace-model.md) 的現場職責；與曲庫歌詞編輯的分工待定。

### 7.2 系統與環境

1. 直播期間是否抑制 App 或系統通知？
2. 啟動完整 i18n，或先依 OS locale 處理數字／日期？
3. 偵測系統字型供 Lyrics／Overlay，並檢查 CJK 缺字？
4. 控制台主題是否跟隨 Windows 深淺色？
5. Per-monitor DPI 與提詞器／Workbench 跨螢幕重算？
6. 是否投影 Windows 減少動態效果設定？
