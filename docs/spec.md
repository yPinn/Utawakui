# Utawakui 產品規格

本文件是產品範圍、功能現況與發展方向的權威來源。穩定定位見
[PRODUCT.md](../PRODUCT.md)，現行技術邊界見 [architecture.md](architecture.md)，
決策狀態與其他文件入口見 [docs/README.md](README.md)。

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
- 本地播放安排；從 playlist／album 建立 session plan，或搜尋曲庫加入 ready item。
  Library／manual occurrence、confirmed playing、完成／略過／中止、連續播放與重啟恢復已實作，
  不依賴OBS。專屬session label／manual公開投影與OBS history commit仍待後續。
- 播放、seek、音量、待播、歷史、shuffle、repeat、previous／next。
- 獨立 BGM standby lane；使用 PlayerBar 之外的控制面，與演唱 Queue／history／chapter
  分離，並與演唱播放器嚴格互斥，同時最多一條 lane 產生可聽輸出。它服務錄製／串流
  session 的曲間休息與找歌，不是一般播放器模式；本機曲庫、單 deck monitor 與互斥
  handoff 基礎已實作，app-owned OBS capture routing 仍待後續決策與實機驗收。
- 本機設定、Windows window／taskbar／SMTC integration。
- 純本機歌詞匯入、編輯、讀取與刪除。

### 2.2 可選工作流

- **Lyrics**：外部歌詞查詢、同步資料、讀音、演出者視窗與 Lyrics Overlay。
- **Audio processing**：pitch／tempo preview、分離 recipe（含尚未實作的
  backing-vocals）、guide vocal 與未來 pre-render assets。
- **Public output**：Setlist、Lyrics、Now Playing Browser Sources；封面型模板歸入
  Now Playing。
- **Provider assist**：候選搜尋、來源匯入、下載與 metadata backfill。
- **External integrations**：唯讀 OBS WebSocket 連線、直播／錄影時間戳與本機
  session history；不影響 Browser Source 或預設播放流程。

每個可選工作流都必須在對應 gate 關閉或依賴缺失時，讓預設核心繼續可用。

### 2.3 明確非目標

完整清單與理由見 [PRODUCT.md](../PRODUCT.md)。外部整合先以 Browser Source 與
adapters 評估，目前不做 OBS native plugin。

## 3. 目前功能現況

| 領域                   | 現況               | 邊界與剩餘工作                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop shell          | 已實作             | Electron、Vite、Vue、secure preload、single instance、production `loadFile` 與 Windows system tray 背景執行已建立。預設按 X 會以 App 內共用 Modal 詢問背景執行、完全結束或取消，並可記住選擇；Renderer 無法呈現時才退回 Windows 原生對話框。Settings 可改為每次詢問、固定背景執行或固定退出。伴奏處理執行或暫停時會顯示一次性離開確認，不套用已記住的退出偏好，並由 Windows taskbar 呈現 aggregate progress／paused／error。背景執行只隱藏既有主視窗，最小化仍進工作列，雙擊／第二次啟動可還原；Tray menu 提供開啟、設定與完整退出，不含登入自動啟動或 Tray 播放控制。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Resource monitor       | 已實作             | Titlebar 每 3 秒顯示 Utawakui 自身 CPU／RAM；平時讀 Electron app metrics，只有人聲分離等 heavy job 執行時才補量子程序。它不顯示整機或 GPU 使用率，yt-dlp 下載程序目前不計入。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Local library          | 已實作             | Structured track folders、metadata index、local import、legacy migration 與 media protocol 已建立。直接匯入支援 MP3、FLAC、WAV／WAVE／BWF（PCM、IEEE float、μ-law）、M4A（AAC）、AAC／ADTS，以及 OGG／OGA／Opus／WebM（Opus、Vorbis）；副檔名、實際 container、codec、audio-only stream 與正時長必須同時相容。WMA、AIFF／AIFF-C、M4A／ALAC、APE、WavPack 與 CAF 經相同實檔驗證後會進入明示的 FLAC 相容轉檔；原檔不修改，直接匯入不依賴 FFmpeg。DRM、MIDI、CDA、播放清單與含影片媒體不在此流程。本機匯入會在 tag 存在時保留 title、artist、album、year 與通過圖片驗證的 embedded artwork；缺少 title 時才退回檔名。每個曲庫目錄在單次 App session 首次讀取時，會先以已保存的 provider sidecar 自動整理名稱、歌手、專輯、年份與缺少的時長；不連線、不覆蓋可辨識的手動編輯，失敗也不阻斷曲庫載入。Settings 只說明此自動化邊界，不再提供日常手動整理入口。Settings 另顯示歌曲／去人聲／其他資料與磁碟可用空間；可選的去人聲自動管理只清除可重新產生的分離結果，不刪歌曲、歌詞、封面或未知檔案。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Playback／queue        | 已實作             | Audio element 是 timing 權威；queue、全系統最近播放、paused 啟動恢復、Signalsmith pitch／tempo preview 與 Windows shell controls 已連線。最近播放只記 qualified playback event，介面不承諾固定數量；重啟會過濾缺檔曲目且不自動發聲。節拍器以獨立 AudioContext 與 lookahead scheduler 發聲，會在未手動覆寫且停止時套用可信的曲目分析 BPM；實際音質與長時間 drift 仍待人工聽感驗收。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| BGM standby lane       | monitor 基礎已實作 | 本機曲庫單一 track-id、scalar 設定與 position 持久化、固定 loop 的單 deck BGM bus、fade-in／fade-out、預設 25% 的正常音量、mute、初始關閉且相對降低 12 dB 的手動 Talk、Emergency Cut、`live > record` session 投影與獨立右側 BGM MiniPlayer 已接線。播放器有專屬 Titlebar 入口；完整 player 的開關與 source picker 展開是正交狀態。inactive 展開後可用完整 transport 明確試播本機 monitor，關閉選曲仍保留 compact controls；使用者明確關閉完整 player 即使在試播／handoff／deferred restore／error／active session 期間也優先生效，但不停止 deck 或取消 handoff，重新開啟時投影目前狀態。曲名使用單行截斷，session／phase／restore／time 與 primary action 保留穩定空間，狀態或錯誤內容切換不改變 player 外框或推動相鄰控制。它以 18–22rem 水平照片物件在 shell safe boundary 內移動／Pin，desktop 始終避開 persistent Right Dock bay，compact viewport只在Dock overlay展開時避讓；BGM 與 Right Dock presentation state 互不關閉，不嵌入場次面板，也不共用場次外觀或底部 PlayerBar。換歌以 atomic `set-track` 取代唯一來源並重設 position，不建立 BGM Queue。所有主播放器 new-track 與 resume start 路徑都經同一個 cancellable pre-start gate；BGM 可能發聲或仍有 request 時會立即重置 BGM 主控制、保存獨立的曲後恢復 intent，再以 0.6 秒 fade-out 歸零並 pause、保留完整 0.75 秒 pre-roll。BGM 控制不得取消已取得優先權的 performance handoff；沒有 BGM intent 的一般播放／resume 不增加延遲。confirmed playing 才鎖定演唱 lane，ended／明確 stop 後依 deferred restore 保留 1 秒 post-roll，再以 1 秒 fade-in 恢復 BGM；pause／buffering／seek 不會恢復。兩條 lane 不做 crossfade，BGM 不寫入演唱 Queue、Recently Played、chapter、SMTC 或既有 Output metadata。現行 deck 只送系統預設 monitor，不宣稱抵達 App 選定的 OBS capture；accompaniment variant、loudness、A／B deck、自動 mic ducking、獨立錄音軌、confirmed-start session snapshot／公開投影與實際 OBS 聽感驗收仍待後續。完整邊界見 [ADR 0021](adr/0021-bgm-standby-audio-and-handoff.md) 與 [BGM 待機播放契約](contracts/bgm-standby-lane.md)。 |
| Session preparation    | 本地播放流程已實作 | Performance「播放安排」提供頂部單曲 NP 與待播／已完成累積清單；不需 OBS、直播或錄製，可搜尋曲庫加入、來源匯入、排序、播放、暫停、連續播放／單首後停止、手動項目開始／完成、略過及中止。同曲使用獨立 occurrence，confirmed playing 與 ended 以 request identity／playbackRevision 關聯；main 保存獨立 progressRevision，重啟保留結果並把未結束項目恢復為中止，不自動發聲。設定按需開啟並沿用正式 UI primitives。PlayerBar／SMTC 與安排共用 transport；已接上公開來源名稱／committed label／manual／completed 投影；Right Dock 共用 Queue surface 提供安排 variant 與可選 OBS 連線顯示偏好，不影響本地播放。OBS 章節仍為獨立時間標記紀錄。完整邊界見 [播放安排契約](contracts/performance-session-preparation.md)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Playlists／albums      | 已實作             | 全部曲目、本機檔案與播放清單可依曲目、時長等可見欄位重新排序track rows；來源型 album 與 artist 參照維持固定canonical row order，且 album membership唯讀。曲目有 album metadata、但沒有來源 collection membership 時，Album 欄會開啟以目前曲庫 scalar metadata 即時分組的唯讀專輯參照；這個參照不建立播放清單、不持久化 membership，也不取代來源型 album。Sidebar 分為播放清單與參照兩區，參照區以藝人名稱混排專輯與藝人（藝人列在其專輯之前）；藝人列與 artist 頁是唯讀參照，artist index 先依演唱 credit 衍生分組，再以 `artists.json` 的 stable entity 投影使用者確認的跨語言 merge（擁有專輯或至少 2 首者列入 sidebar，搜尋可找到其餘藝人）。Artist 頁可整理顯示名稱、merge／split 與 undo；原始 track credit 不被改寫。`provider-flow` 開啟且已接受新版自動查詢告知後，第一個 artist-aware projection 與曲庫變更會由 Main 以 MusicBrainz 背景整理；只自動接受唯一 exact name／alias 且有 title＋duration recording 佐證的候選，保存 bounded catalog facts，相同 MBID 自動合併。Split 會保存 negative evidence 防止回併；弱或歧義結果仍可在整理視窗重新查詢與人工合併。藝人照片在 provider-flow 開啟時先自動取自藝人官方 YouTube 頻道頭像（Topic 頻道不採用）；仍缺圖時，artist 頁可明確啟動匿名 YT Music 候選搜尋，最多三張驗證後預覽一律由使用者選擇確認，不會背景查詢或自動套用。可改用本機圖片或移除；identity 變更會相容讀取並非破壞性提升 legacy／stable 照片狀態。沒有照片時顯示人像圖示而非專輯封面。主動弱 alias 建議、本機 tags 與實機視覺驗收仍待後續，見 [ADR 0022](adr/0022-artist-identity-and-organization.md) 與 [artist photo provider contract](contracts/artist-photo-provider.md)。Collection 頁提供曲目試聽：全視窗直向卡片逐首播放副歌片段（依段落分析、逐行歌詞重複段推估或時長估算，並對齊小節淡入），藝人頁以隨機順序呈現，操作與曲目右鍵選單一致（加入佇列、播放清單等）；它是只供監聽的第三條 lane，不寫入最近播放、Queue、Output 或 OBS history，錄影／直播中停用。同步歌詞卡、音量條與封面主色尚未實作，見 [曲目試聽契約](contracts/track-preview.md)。                       |
| Lyrics                 | 主路徑已實作       | T0／T1／T2、LRCLIB／實驗性 NetEase／Better Lyrics 公開快取多來源平行搜尋、來源中立排序、同錄音來源替代與唯讀時間軸差異提示、LRCLIB＋NetEase exact-only 背景自動取得、持久化來源偏好、讀音、authoring、具三段閱讀距離與 ±0.1 秒窄域同步微調的 responsive Self-View，以及 segment-aware Overlay 已建立。演唱工具「歌詞」以紙面譜架呈現（螢光筆標目前行、讀音印在上方），來源、讀音與字級收在「顯示」選單，缺讀音時可直接產生，並提供前往曲庫「歌詞編輯」的入口；這超出 ADR 0023 的現場職責，分工待之後一併決定。Self-View 仍不持有 playback／lyrics 權威，手機 transport／pairing 尚未開放。provider-authored timing 皆只在完整驗證通過時標示逐字同步。T1 聲學估計的獨立資料驗證與本機詞塊預覽基礎已實作，目前使用合成驗證資料，保留正式 T2 優先與 T1 回退；手動選配環境生命週期（準備、載入驗證、修復、取消、移除）已實作，但正式 catalog 仍受權重證據 gate 限制，不提供預設下載；歌曲模型產生與 Output 接入尚未提供。Better Lyrics 維持手動，既有 AMLL 來源仍可讀取與刪除但不再提供線上搜尋。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Audio processing       | 基礎產品能力已實作 | `quick`／`general` recipe、獨立 FFmpeg／model lifecycle、guide vocal、本機 BPM／節拍分析，以及可從目前播放順序、播放清單或專輯建立的 main-owned serial separation queue 已可用；來源選擇固定先顯示目前播放順序，再以共用分組選擇器顯示播放清單與專輯。選取來源或模式會立即依來源順序分區顯示尚未準備與已有伴奏，主要動作只處理尚未準備曲目，已有伴奏由分區內的明確重新準備動作處理；同模式已在 Queue 的曲目不重複顯示。Window Titlebar 的「曲目準備」controlled toggle 是 Import／Separation 的共用入口；它開啟 shell-owned Preparation Right Dock 並以分頁切換任務，Separation 的進行中、暫停或未完成狀態投影到同一個 trigger，不建立第二個常駐按鈕。工作清單依 native compact／standard density 調整，維持有界並由清單內部捲動。清單顯示 active／pending／needs-attention／completed；Pending 沿用 Queue 的整列拖曳與 drop indicator，可清除所有pending而不取消active。逐列低頻動作不常駐ellipsis，只由右鍵或Context Menu鍵／Shift+F10開啟，並支援暫停下一首、取消、移除、重試與清除session紀錄；清除不刪除已產生的伴奏。只有時長資料完整時才顯示本次尚未準備工作的「最多新增」容量。`quick`／`general` 已採用 DirectML GPU acceleration（預設開啟、自動 CPU fallback，見 [ADR 0017](adr/0017-directml-execution-provider-for-mdx-separation.md)），並已通過 Windows x64 封裝版執行與 CPU／GPU 輸出驗收；跨重啟持久化、平行處理、ETA、完成通知、Refined、pre-render 與高品質可選包仍受後續產品／benchmark／dependency gate 限制。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Provider assist        | 核心路徑已實作     | App-managed Python `yt-dlp` runtime、plugin/provider sidecar、YT Music Songs 優先＋一般 YouTube 補足的文字搜尋、評分後最多十二筆候選、弱化觀看數排序、release-only 自動選取、YouTube／YT Music URL 解析、recording-first import/backfill 與 main-owned YT Music 系統瀏覽器探索已連線。外部來源清單最多同時取得兩首，Main 會再度限制全域並行、合併同曲工作並支援逐首停止；下載完成後的曲庫提交固定逐首執行。來源草稿與已確認單曲／批次工作分離；Dock 延遲顯示固定下載件數並可重開原批次明細，Modal 執行中可關閉；新搜尋不清除工作，清單整理完成後才算成功，失敗／停止可重試且保留成功曲目。不提供任意執行緒設定或重啟續傳。曲目資訊視窗另提供 MusicBrainz／Cover Art Archive 封面搜尋：有界跨文字 fallback、release-level 排序、main-owned 圖片驗證、人工候選確認與本機 sidecar provenance；不會自動套用或修改曲目 metadata。整體只能作為 gated advanced flow；這不是官方 YT Music API 整合，Spotify／Apple Music URL 轉換、內嵌帳號與帳號歌單仍未開放。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| OBS output             | MVP 已實作         | Loopback HTTP/WebSocket、三個固定 slot、Gallery、Workbench、URL copy、content/state split、Lyrics template capability registry、Live Stage 可選歌詞呈現策略、明確載入的本機字體預覽／選取、安全 fallback、Output workspace 共用的最近／常用 raw Hex 色票與 source-mapped T2 顯示邊界已建立；Browser Source 仍是支援基線。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Feature gates          | 已實作             | Renderer 提示與 main enforcement 共用五個 gate 的 registry；local core 不需 gate。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Diagnostics            | 已實作             | Main-owned persistence/redaction、renderer capture、Settings 控制、dependency IPC boundary 與顯式 redacted export（單一 JSON support bundle）已建立；dev-only F6 結構化檢視工作台（F5／F7／F8 為音樂分析、歌詞來源檢查與視覺系統型錄，皆同屬 dev-only）與獨立單檔 HTML 檢視工具已提供；其他 domain wrappers 持續增量導入。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 使用者回饋             | 已實作             | 錯誤回報／功能請求／使用體驗意見／內容問題共用一套預覽後送出流程，僅錯誤回報可選附最近錯誤紀錄；Settings 常駐入口、錯誤紀錄行動選單、歌詞候選列與來源管理均可觸發；歌詞入口只建立可編輯內容草稿，保留來源選擇、偏移與人工校時，案例經人工重現才回到回歸測試。Relay 獨立部署於 Cloudflare、不隨 App 打包，需另行設定 Discord webhook 與 KV namespace 才能實際送達；送出前一律強制預覽，不做自動或背景上傳。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Distribution           | 已公開測試         | v0.3.0（2026-09-15）與 v0.4.0（2026-09-26）已發布至公開 stable feed，各提供 installer、blockmap、`latest.yml` 與 `SHA256SUMS.txt`。Unsigned channel 是 owner 明確接受的現行產品邊界，目前沒有購買 Authenticode 憑證的規劃，也不是待完成 gate。App-level signed manifest 已完成 installer metadata exact binding、可輪替多簽章與 package／sign／publish 分權，但目前只有 development public key，production gate 明確關閉。Ordinary CI 會從 `scripts/release-baselines.json` 釘選的每個已發布 installer 覆蓋安裝候選版，檢查資料保留、installed startup 與 uninstall cleanup；v0.3.0 → v0.4.0 的 production stable-feed 應用內更新證據仍待補齊。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| OBS integration        | 初始唯讀路徑已實作 | `obs-integration` 啟用後可連線 OBS WebSocket 5，讀取直播／錄影狀態與時間戳；連線與狀態請求均有期限，逾時後會淘汰 transport 並重連。密碼由 OS-backed secure storage 保存，不可用時設定會失敗，並可由 Settings 明確移除。曲目切換與手動 marker 會寫入本機 session history，場次時間標記目前可輸出為 YouTube 章節文字；OBS 活動期間會防止系統休眠。尚未提供 scene／source 寫入或遠端播放控制。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| VOD／clip rights state | 規劃中             | OBS session history 只記錄時間戳，不代表已確認錄影、VOD、clips 或精華的素材權利；仍未提供每個 session 的權利狀態與輸出 review。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Native adapters        | 實驗性原型         | Windows x64 已有固定 `Utawakui.Lyrics` Spout2 sender；Browser Source 仍是支援基線，實機 receiver／alpha／GPU／安裝版驗收前不列為正式支援。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## 4. 產品與資料邊界

### 4.1 曲庫

預設 library root 是使用者 Music 目錄下的 `Utawakui`，也可在 Settings 選擇其他
資料夾。檔案系統決定 track 是否存在；metadata index 只補充 scalar fields。

```text
<library>/
  library.json
  playlists.json
  folder-page-assets.json
  performance-session-plan.json
  folder-page-assets/
    <assetId>/
      image.<ext>
  tracks/
    <trackId>/
      audio.<ext>
      info.json
      thumbnail.<ext>
      artwork.json
      lyrics/
      analysis/
      separations/
```

- `library.json` 不保存 absolute media paths，也不是未來持續擴張的完整資料庫。
- `playlists.json` 保存使用者有順序的 collections 與 track ids。
- `folder-page-assets.json`（v4）以單一 `objects[]` 保存 playlist／album／artist Folder 頁面的懸浮物件：object key、`type`（目前 `photo`／`note`）、`source`（`user` 可刪除／`derived` 只存位置）、bounded page identity、paper／side／bottom placement 與 region-local anchor、Pin、rotation、同頁共用的有限 layer order、依類型驗證的 payload 與時間；圖片本體位於 `folder-page-assets/<assetId>/`，不保存原始路徑或遠端 URL。每頁最多 12 個使用者物件（衍生物件不計），照片須為經 main 驗證的 JPEG／PNG／WebP；刪除 collection 時一併清理物件與照片。`pdf`／`embed` 類型保留給後續階段，目前會被拒絕。
- `performance-session-plan.json` 保存一份 bounded current draft，只含 source identity、item ids、track ids、session-local labels、verification、cursor、revision 與 timestamp；不保存 media path／URL。
- 封面 provenance、歌詞、分析與分離結果是 main-owned sidecars；renderer 只傳 track id 與產品 intent。`artwork.json` 不保存遠端圖片 URL 或完整 provider response。
- 所有 renderer media URL 經 `utawakui-media:` 的 track-id allowlist resolver。
- Collection entity 頁以紙張正下方Folder底材右上角的方形`Plus` Command icon control作為單一新增入口，展開共用選單選擇照片或便條；便條只在便條編輯視窗建立與編輯：選填標題（最多80字）與內文，按「儲存」且標題或內文非空才建立，不留下空白便條；再次編輯只從物件右鍵選單進入，重疊物件不會被誤點進編輯。長便條在紙上最高為與寬度相同的正方形，標題完整、內文底部淡出並以「…」標示；只有實際被截斷的便條可以點擊、Enter或右鍵「閱讀便條」開啟閱讀頁：與照片相同的展開方式，以便條自己的紙材做成信紙比例的紙張，內文超過一頁時分頁，右下角或←／→、PageUp／PageDown翻頁並顯示頁碼；閱讀與編輯分開，右側按鈕為關閉、編輯、刪除。物件右鍵（或鍵盤選單鍵）提供依類型的操作：照片展開／編輯照片文字／固定／移除、便條（閱讀）／編輯／固定／刪除、衍生摘要只能固定；刪除一律經共用確認視窗。控制直接屬於Folder背景，不繪製dock surface，與既有extension共用第2列，也不新增top seam、額外底部row或無效高度。Floating artifacts畫在它上方，因此可自然覆蓋該背景入口；外層Scrollbar仍為最高paint owner。Collection action rail維持播放／試聽／佇列／entity／更多與search，不承接頁面資產。縮圖與衍生藝人摘要共用一個 Folder-wide drag／Pin／stacking owner，短按或 Enter／Space 以共用 Modal mechanics 的 image-only media presentation 展開，drag 不會誤觸展開。所有物件不論是否Pin都保存paper／side／bottom region-local placement，放開或鍵盤移動後立即貼齊該placement；Pin只鎖定移動。Side reserve不足以容納rotation-aware物件集合時只在render階段投影到底部，變寬即回到原side placement；resize不保存、不自動捲動，fallback時Pin或取消Pin以可見位置保存。物件版面變更以單一批次寫入，重排一次送出完整順序。照片與衍生摘要都按頁面保存，A→B→A與app重啟各自還原。新使用者物件由main放在紙張下方bottom region的4×3格點，加上±0.04 normalized jitter，並以同一次隨機向左或右傾斜0.75°–4°；重開與render不重新隨機。衍生摘要尚未保存時以固定的bottom預設位置排在最底層。本次新增的物件由canvas從bottom region最上層物件往右下以共用最小可抓取尺寸階梯錯開並保存，讓先前物件保留可抓取邊緣。便條是薄紙：一律使用半透明材質（重疊時可隱約看到下層），並依key的穩定hash取四種顆粒偏移之一，重繪與重開不變；便條不繪製摺痕線。使用者便條的紙材（藍紫／粉紅／鵝黃／牛皮紙／橫線紙，皆帶顆粒）在便條編輯視窗左側的紙張色票選擇，右下角按鈕依序輪流切換；新便條預設隨機一種，main只接受既有紙材；缺少或未知紙材的舊便條依key取得固定紙材並寫回，衍生摘要固定為Folder色薄棉紙。照片建立時由main依原圖顯示方向（含JPEG EXIF旋轉）歸到最接近的比例（4:3、3:4、1:1、16:9、9:16）並保存；照片大小依實體相紙換算（一般相紙4×6吋、archival 3R、拍立得依instax mini／SQUARE／WIDE的底片與影像區比例），紙上為實體的0.5倍、展開為1.25倍（仍受畫面與原圖像素限制），彼此大小關係與桌上實物一致；舊照片第一次讀取時補量一次並寫回。相框同樣在建立時隨機選定並保存：一般相紙、深色細框加黑白濾鏡的archival，或下緣較寬的拍立得（只配1:1、3:4、4:3）；展開時沿用同一種相框。照片右鍵或展開畫面的「編輯照片文字」可填兩段選填文字：拍立得下緣的短文字（最多16字，紙上與展開都顯示），以及說明便條（與頁面便條相同：標題最多80字、內文最多2000字）。紙上只從相框右下角後方露出一小角紙；展開時完整便條排在照片與右側按鈕之間的獨立欄位，上緣對齊、不與照片重疊，內文過長時在便條內捲動；說明紙色在照片文字編輯視窗以照片右下角的小色票輪流切換（第一次填寫時預設隨機），並保存，清空欄位即移除該段文字。約三分之一的使用者物件帶文具（照片為膠帶、便條為撕邊），衍生的藝人資料卡固定別上迴紋針；文具參數由物件key決定，每次繪製相同，隨物件移動與旋轉，不可點擊。縮圖與Preview共用`UiPhotoFrame`的mat padding、strong semantic border、paper surface、artifact shadow與vintage filter；縮圖依照片的比例cover crop，Preview保留intrinsic ratio並以contain完整顯示。展開層不繪製raised dialog shell、canvas stage或內容scrollport；圖片在共享`72dvw × 70dvh`與viewport inset範圍內完整縮小，小圖不強制放大，任何橫／直／方形比例都不得裁切。關閉與移除重用影像frame外、inline-end且上緣對齊的垂直方形Overlay `UiIconButton` rail；DOM、Tab與視覺順序都是close→remove，移除使用shared `danger` intent，關閉維持neutral，media bounds會預留rail與gap。Media以既有motion tokens成對展開／收合，reduced motion直接呈現最終狀態。只有media backdrop的self-click可收合，圖片與controls不會誤觸，一般dialog backdrop仍保持inert。從Preview開啟的移除確認沿用shared Modal的有限open-order stack，視覺與鍵盤頂層一致。全部曲目／本機檔案與 workspace mode 不提供 durable page asset。
- Settings 的曲庫空間摘要依實際檔案大小分類；無法辨識的資料只列為「其他」，不進自動清理候選。
- 去人聲自動管理預設關閉，預設上限為 25 GiB。啟用後只在去人聲超過上限或磁碟低於安全空間時清理到 85%，先移除非目前選用的結果，再依 qualified playback 的最久未播放順序移除目前結果。歌曲本體、歌詞、封面、分析與未知檔案不會被自動刪除。
- 播放中、待播與正在處理的曲目不進清理候選。完整行為見 [曲庫空間管理契約](contracts/library-storage-management.md)。

未來需要 pitch／tempo memory、lyrics offset 與更複雜查詢時，再將 scalar metadata
遷移至 SQLite；不繼續擴張 `library.json` 的責任。

### 4.2 播放與投影

- HTML audio element 是播放時間、播放狀態與錯誤的唯一權威。
- Queue、playing track 與 lyrics 狀態由 renderer owner 管理。
- 全系統最近播放只在實際播放累計達 10 秒或正常 ended 後寫入；同一曲目只保留最新
  一筆，再次播放會更新時間、來源並移到最前。它與 Queue previous stack、OBS session
  history 分離；從紀錄重播只插播該曲，不重建來源 Queue。清單不提供選取、排序或清除，
  清除能力集中在 Settings「曲庫與儲存」並要求確認。
- 啟動恢復只保存 bounded ids／scalar snapshot；完整重啟時過濾缺檔曲目並保持 paused，
  不把持久化資料升格為第二個播放權威。完整契約見
  [播放紀錄與啟動恢復](contracts/playback-history-and-resume.md)。
- Main Projection Hub 只接受版本化、受驗證的投影；Self-View 與 Overlay 不建立
  第二份播放狀態。
- Browser Source WebSocket 為唯讀輸出通道，不能傳入播放命令。
- 節拍器是 renderer-owned session state，使用獨立 AudioContext，不接入歌曲的
  monitor／capture graph；曲目 BPM 只作可信估算值，使用者手動調整後不再自動覆寫。
- 已實作的 session preparation 基礎層擁有單次 current draft、逐曲 occurrence、明確
  `library-track`／`manual` mode 與 session-local display label；playlist／album 只提供 canonical
  source order，playback Queue 仍是一般播放 owner。預設從曲庫搜尋，選取後 main 以 canonical
  metadata 建立 ready item；自行伴奏／外部音訊使用次要 manual 入口，BGM 不是 session item。
  舊版 text placeholder 或失效 item 只作 recovery，不能開始；修正曲庫 metadata 必須是另一個
  明確 intent，不能由 session label save 暗中回寫。未來 active-session control surface 的 app-played／manual
  confirmed-start 分支與 timestamp commit 尚未實作。完整產品與驗收邊界見
  [演出場次準備契約](contracts/performance-session-preparation.md)。
- BGM standby lane 使用已實作的獨立單 deck owner、BGM bus gain、單一來源／position 與交接狀態，
  不共用或擴張底部 PlayerBar。BGM 與演唱是嚴格互斥的 logical lanes，不允許跨 lane
  crossfade；BGM 自身可 fade、loop 或由 Talk 衰減。BGM 正常音量預設為 25%；Talk 在完整啟動後
  預設關閉，啟用時相對降低 12 dB，仍是手動控制，不偵測 microphone activity。開始曲目前先讓 BGM bus 歸零並
  確認 active deck paused，再保留完整 pre-roll；開始交接時立即重置 BGM transport，曲後恢復
  使用獨立 deferred intent，BGM 控制不得取消已取得優先權的 handoff。以 confirmed playing 同時 commit playback／
  public projection／session timestamp；演唱確認 ended／明確 stop 後先保留 post-roll，才可
  從零輸出啟動 BGM 並 fade-in。演唱 pause 不自動恢復 BGM，但會釋出 lane 讓使用者手動選擇；
  未啟動 BGM 時 resume 不增加等待，已啟動時仍先完成 fade-out／pause／pre-roll。buffering／seek
  不解鎖。它不投影到演唱 Queue、
  Recently Played、chapter、SMTC 或既有 Output routes。離線狀態可明確操作 monitor transport；
  confirmed session 只投影 `live > record` 狀態，不是播放 gate。控制面預設錨定於
  右側 shell utility bay、可 bounded move／Pin，並與 Right Dock 折疊及 PlayerBar 分離。完整產品與驗收邊界見
  [BGM 待機播放契約](contracts/bgm-standby-lane.md)。

### 4.3 音訊處理

- 產品 recipe 使用穩定 intent，不讓 renderer 選擇 paths、models 或 executable args。
- 每個完成的 recipe 產生獨立四聲道結果；聲道順序固定為 accompaniment L/R、
  guide vocal L/R。
- FFmpeg 與每個 active model 是可獨立準備、修復與移除的最小單位。
- Provider Python 與 Audio Python 是不同 runtime family，不共用 activation 或 lifecycle。
- 單曲產生與集合批次處理共用 main-owned serial queue。Preparation Right Dock 明示選擇「目前播放順序」、
  播放清單或專輯；選取來源或模式後立即依來源順序分區顯示「尚未準備／已有伴奏」，同模式已在 Queue
  的曲目不重複顯示。主要動作只快照尚未準備曲目，既有 current result 由分區內的明確重新準備動作處理；
  集合失效時回退到播放順序，單曲仍由情境入口處理。每首開始時重新檢查 gate、依賴、來源與結果 currentness。
- Right Dock 只顯示「等候中／處理中／已完成／未完成」等操作語言；Renderer 不顯示或提交
  model、runtime、path、URL、executable 或任意 engine 參數。Queue 為 session-only 操作狀態，
  separation manifest 仍是結果權威。
- Music Analysis 需要 `audio-processing-flow` 授權與已準備的 BPM 分析元件；Settings
  預設開啟「匯入後自動分析」，成功下載或本地匯入不等待分析，失敗也不回滾歌曲。
- Refined 只有在 dependency、授權、離線、安全與品質 gate 通過後才能成為可執行
  產品能力。

### 4.4 Output

- Output server 只綁定 loopback，並以 exact route allowlist 提供資產。
- 實驗性 Spout2 Lyrics sender 由獨立 helper 發布相同 Lyrics route；固定為 `Utawakui.Lyrics`、1920×1080、BGRA8／premultiplied alpha／sRGB SDR，提供 session-only 30／60 FPS 與顯式 start／stop，不取代 Browser Source。`sending` 只代表首幀已送入 sender，不代表接收端狀態。
- Snapshot 不包含 filesystem path、provider payload 或任意 renderer HTML。
- Artwork 只透過 public track id 解析 allowlisted thumbnail。
- 現行三個固定 slot（Setlist／Lyrics／Now Playing）是 MVP 基線；Now Playing 提供
  `art-card`（星染黑膠，預設）、`cover-player` 兩個模板。Output
  Instance／Presentation Pack 是未來擴充方向，不應提前宣稱已完成。
- Lyrics 提供 `karaoke-stack`（經典伴唱，預設）、`live-stage`、
  `kinetic-pop`、`ornate-vertical`、`manga-frame` 五個模板。各 slot 的預設模板在模板庫
  標示「建議」，其餘標示「可用」。
- 模板庫所有模板共用 `src/constants/outputPreviewSample.json` 的同一份示例曲目與歌詞，
  只呈現動畫與樣式差異；預覽依模板的擷取尺寸（Lyrics 1920×1080、widget 480 寬）
  等比縮放，縮圖與詳情使用同一比例，並可切換暗色、亮色與透明背景。
- Setlist 的基礎公開契約只顯示目前演唱曲目與已唱紀錄，不投影待唱佇列，預設模板為
  `queue-board`（黑幕歌單）。480×810 是 large widget 的擷取尺寸，非模板本身的固定
  版面：模板以約兩成高度保留目前歌曲焦點區，已唱紀錄取得其餘可用高度；兩區只以
  固定 spacing 分隔，不保留無語意的比例空白列。最近八首已唱紀錄依正常播放順序向下
  排列，只有實際內容超出下方區域時才自動垂直滾動。
- Session preparation 的 reserve／upcoming、placeholder、未開始的 manual／library item 與 prepared selection
  不進 public Output。演唱 confirmed playing 後，Now Playing、Lyrics 的曲目 identity 與 Setlist
  current／completed history 才使用該次演出的 committed display label；media、lyrics timing 與
  artwork 仍由 canonical track id 解析。BGM／留白期間採透明留白或 bounded session status，
  由各 template policy 決定，不以未開始曲目填補畫面。
- OBS WebSocket integration 是獨立、可停用的唯讀 adapter。Main 持有 endpoint、
  credential、request deadlines、reconnect、狀態與本機 session history；Renderer 只提交 bounded
  enable／設定／marker／export intents。它不經 Browser Source 公開 WebSocket，也不
  取得任意 OBS request 能力。

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
  在 `POST https://api.utawakui.llazypilot.com/feedback/submit` 重新驗證整個
  payload，並依 IP 做必要的 KV 速率限制後轉發成 Discord embed；KV 缺失或
  故障時 fail closed，不會略過限制繼續送出。Discord presentation 會把使用者
  文字中的 Markdown 控制符號轉為 literal 顯示、保留 bare source URL，並停用
  mention；App 內預覽與原始 payload 不因此被改寫。
- `environment` 固定包含 `appVersion`／`electronVersion`／`platform`／`locale`；
  即使目前沒有 i18n，語言仍先納入使用情境以備未來需要。
- 完整 `reportId` 維持 main-generated UUID，用於 payload、relay response、renderer
  state 與 diagnostics filename；App 成功畫面與 Discord footer 只顯示其前
  12 個 hex 字元組成的 `XXXX-XXXX-XXXX` 回報碼，作為人類可讀、
  可搜尋的對照值。

詳細 runtime ownership、依賴切分與 diagnostics flow 見
[architecture.md](architecture.md)。

## 5. Feature Gates 與依賴

| Gate                    | 保護的產品動作                            | 依賴原則                                                            |
| ----------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| `provider-flow`         | 外部候選、下載、來源匯入與 backfill       | Provider runtime 四個 artifact 原子準備；不得阻擋本機匯入。         |
| `lyrics-flow`           | 外部歌詞查詢與保存                        | 每次 external request 都在 main 再檢查；不需要安裝 binary。         |
| `audio-processing-flow` | Separation、本機音樂分析與未來 pre-render | FFmpeg 與 active model 各自管理；缺一項只影響該能力。               |
| `public-output-flow`    | 啟動 Output server 與發布狀態             | 內建 Overlay 不需外部 binary；stop／status 永遠可用於復原。         |
| `obs-integration`       | 連線 OBS 並讀取直播／錄影狀態與時間戳     | `obs-websocket-js` 隨 App 提供；密碼只進 OS-backed secure storage。 |

Gate confirmation 只保存 `featureId`、notice version、confirmed time 與 enabled 狀態。
它不保存素材權利判斷，也不能成為 main trust boundary 的替代品。「Gate 內預設偏好」
與「不受 gate 保護的預設背景行為」兩種易混淆狀態的定義與現有案例見
[PRODUCT.md 的 Feature Gate 語意](../PRODUCT.md#feature-gate-語意)。

## 6. 方向與優先順序

### 6.1 近期：公開測試發布後的穩定與安全

- 持續量測 dev、production-like、unpacked 與 installed startup。
- 持續稽核 v0.3.0／v0.4.0 公開資產、update metadata、checksum、secret、dependency 與 license 邊界；已發布版本不可覆寫，發現問題時以更高版本修復。
- App-level signed manifest 的程式與 workflow foundation 已完成；production activation 前仍須由 owner 配置 active／recovery key、protected `update-signing` environment 與 signing secrets，並以 public draft 驗證多簽章資產。
- 補齊從 v0.3.0 經 production stable feed 更新到 v0.4.0 的應用內更新、資料保留與 unsigned-channel 操作證據；後續每個新版發布前，hosted-runner installed-upgrade gate 必須通過。
- 補齊 Lyrics、Self-View、Workbench 與 OBS 的人工視覺 walkthrough。
- 擴大 diagnostics domain coverage、匯出與可恢復錯誤狀態。
- 完成缺檔、corrupt sidecar、dependency repair 與 library maintenance UX。
- 補齊 WMA、AIFF／AIFF-C、M4A／ALAC、APE、WavPack 與 CAF 相容轉檔的封裝版實檔矩陣；
  新增格式仍須先取得 parser 與 FFmpeg decode 證據，不擴張到 DRM、MIDI、CDA、播放清單或含影片媒體。

### 6.2 中期：完整演出操作

- 在既有 OBS session history 上補齊 VOD／clip 權利狀態與 source output review。
- 本地播放安排的occurrence進度、播放控制交接與manual明確開始／完成已實作；後續收斂
  session-local label、manual與completed history的專屬公開投影及OBS history commit。
  不把這些公開整合變成本地播放前置條件。資料與驗收邊界見
  [播放安排契約](contracts/performance-session-preparation.md)。
- 完成錄製／串流 session 的 BGM standby lane 後續 routing 與場次整合。現行已具備
  PlayerBar 之外的單 deck 控制面、BGM bus fade／Talk／Dim／Emergency Cut，以及嚴格互斥且
  可取消的 fade-out／pre-roll／confirmed playing／post-roll／fade-in 狀態機；第一版
  transition／silence defaults 已由
  [BGM 待機播放契約](contracts/bgm-standby-lane.md#第一版參數預設) 鎖定，仍須通過實際 OBS
  錄製與監聽驗收。右側 shell-owned 獨立 BGM player、離線來源更換、live > record 與
  Right Dock 解耦已實作；後續仍須決定 capture／loudness／accompaniment policy，並完成
  confirmed-start session snapshot 與公開投影。
  A／B deck 與 BGM 曲間 crossfade 留待第一版驗證後再評估。
- Artist 頁面與藝人歸類：artist 與 album 同為唯讀參照，以演唱 credit 分組（cover 歸翻唱者）。
  衍生模型、sidebar 藝人區、artist 頁、`artists.json` stable identity、人工合併／拆分／顯示名稱／undo、
  strict MusicBrainz 自動整理、negative evidence 與人工重新查詢 fallback 已實作（待實機驗收）。整合後的
  artist-aware 曲目呈現統一使用 entity 顯示名稱，搜尋仍同時接受 canonical name 與全部原始 credit；
  `library.json` scalar 不被覆寫。跨語言弱證據主動建議、本機音訊 tag 與翻唱歸屬列為後續階段；見
  [ADR 0022](adr/0022-artist-identity-and-organization.md)。
- Pitch／tempo pre-render cache 與 preset export／import。
- Output Instance 與受限 Presentation Pack／User Variant 模型。
- 在既有 source convergence 上補齊 readiness 與 activation hardening。

### 6.3 後期：經驗證後的擴充

- Music Analysis 持續補強 offline、容量、失敗復原與人工驗收證據；Refined runtime
  仍須通過 license、offline、wheel、容量與固定歌曲品質驗證後才可啟用。
- 只有明確 workflow 需求成立後，才加入 OBS scene／source 寫入、VTube Studio、
  Stream Deck 或其他有 command trust boundary 的 adapters。
- Provider 模組與官方 metadata integrations 保持 optional，不改變 local-first 入口。

## 7. 尚待產品決策

### 7.1 產品範圍決策

1. VOD／clip 權利狀態應每次 session 確認，或保存可見但可重用的 session preset？
   既有 OBS session history 只記錄時間戳，不代表完成此確認。
2. Preset 匯入遇到缺曲時，採提示、略過或 track remapping？
3. Official Presentation Pack 與 User Variant 的版本、簽章與分享邊界如何落地？
4. Refined 的固定品質與容量門檻達到多少才可進產品 catalog？
5. 哪一個 write-capable external adapter 有足夠真實需求，值得新增 command
   capability、credential 與 applied-state confirmation？
6. 是否要投入原生 OBS 音訊輸出（例如自製 libobs plugin），做為 Browser Source／系統音訊
   裝置之外的第三條輸出路徑？這需要一併評估 libobs（GPL-2.0-or-later）的散布條件、
   行程內崩潰風險，以及第三方原生程式碼是否應隔離。見
   [競品調查 §5.2](research/competitive-research.md#52-原生-obs-音訊仍是高成本候選不是追趕項目) 與
   [§6 權利、平台與隱私邊界](research/competitive-research.md#6-權利平台與隱私邊界)。
7. 是否要加入「無伴奏演出」項目，讓清唱／自彈自唱不需要假媒體檔就能進入 now
   playing／待播／已唱？仍需決定 track 的最小必要欄位與手動／計時結束方式。見
   [競品調查 §5.1](research/competitive-research.md#51-bgm-lane-與無伴奏項目已形成重複需求訊號)。
8. BGM monitor 基礎已實作單 deck fade／預設 25% 正常音量／手動 Talk 衰減／Emergency Cut、
   transition／silence 預設與右側獨立 BGM player；仍需決定 accompaniment／loudness policy 與
   預設 capture profile。
   A／B deck 與 BGM 曲間 crossfade 不列入第一版。

### 7.2 系統與環境整合

1. 是否要在直播期間抑制 App 或系統通知？OBS read-only adapter 已可提供直播／錄影
   狀態，但仍需決定觸發條件、抑制範圍與使用者覆寫方式。
2. 是否啟動完整 i18n，或先只依 OS locale 處理數字／日期格式？目前 locale 只收在
   使用者回饋的 environment。
3. 是否偵測系統字型供 Lyrics／Overlay 選擇，並提供 CJK 缺字檢查或保底字型？
4. 是否讓控制台主題跟隨 Windows 深色／淺色模式，並提供手動覆寫？
5. 是否需要額外處理 per-monitor DPI awareness，以及 Self-View／Workbench 跨螢幕
   移動時的版面重算？
6. 是否把 Windows 減少動態效果設定投影到 Self-View／Overlay，並提供 App 內覆寫？
