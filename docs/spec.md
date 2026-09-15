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
- 播放、seek、音量、待播、歷史、shuffle、repeat、previous／next。
- 本機設定、Windows window／taskbar／SMTC integration。
- 純本機歌詞匯入、編輯、讀取與刪除。

### 2.2 可選工作流

- **Lyrics**：外部歌詞查詢、同步資料、讀音、演出者視窗與 Lyrics Overlay。
- **Audio processing**：pitch／tempo preview、分離 recipe（含尚未實作的
  backing-vocals）、guide vocal 與未來 pre-render assets。
- **Public output**：Setlist、Lyrics、Now Playing Browser Sources；封面型模板歸入
  Now Playing。
- **Provider assist**：候選搜尋、來源匯入、下載與 metadata backfill。

每個可選工作流都必須在對應 gate 關閉或依賴缺失時，讓預設核心繼續可用。

### 2.3 明確非目標

完整清單與理由見 [PRODUCT.md](../PRODUCT.md)。外部整合先以 Browser Source 與
adapters 評估，目前不做 OBS native plugin。

## 3. 目前功能現況

| 領域              | 現況               | 邊界與剩餘工作                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop shell     | 已實作             | Electron、Vite、Vue、secure preload、single instance 與 production `loadFile` 路徑已建立。                                                                                                                                                                                                                                                                                                                    |
| Local library     | 已實作             | Structured track folders、metadata index、local import、legacy migration 與 media protocol 已建立。                                                                                                                                                                                                                                                                                                           |
| Playback／queue   | 已實作             | Audio element 是 timing 權威；queue、pitch／tempo preview、Windows shell controls 已連線。                                                                                                                                                                                                                                                                                                                    |
| Playlists／albums | 已實作             | Collections 可排序；來源型 album 維持 read-only membership。                                                                                                                                                                                                                                                                                                                                                  |
| Lyrics            | 主路徑已實作       | T0／T1／T2、LRCLIB／實驗性 NetEase／Better Lyrics 公開快取多來源平行搜尋、來源中立排序與同錄音來源替代、LRCLIB＋NetEase exact-only 背景自動取得、持久化來源偏好、讀音、authoring、Self-View 與 segment-aware Overlay 已建立；provider-authored timing 皆只在完整驗證通過時標示逐字同步。Better Lyrics 維持手動，既有 AMLL 來源仍可讀取與刪除但不再提供線上搜尋。                                              |
| Audio processing  | 基礎產品能力已實作 | `quick`／`general` recipe、獨立 FFmpeg／model lifecycle、guide vocal 與本機 BPM／節拍分析可用；`quick`／`general` 已採用 DirectML GPU acceleration（預設開啟、自動 CPU fallback，見 [ADR 0017](adr/0017-directml-execution-provider-for-mdx-separation.md)），並已通過 Windows x64 封裝版執行與 CPU／GPU 輸出驗收；Refined、pre-render 與高品質可選包仍受 benchmark／dependency gate 限制。                   |
| Provider assist   | 核心路徑已實作     | App-managed Python `yt-dlp` runtime、plugin/provider sidecar、YT Music Songs 優先＋一般 YouTube 補足的文字搜尋、評分後最多十二筆候選、弱化觀看數排序、release-only 自動選取、YouTube／YT Music URL 解析、recording-first import/backfill 與 main-owned YT Music 系統瀏覽器探索已連線，只能作為 gated advanced flow；這不是官方 YT Music API 整合，Spotify／Apple Music URL 轉換、內嵌帳號與帳號歌單仍未開放。 |
| OBS output        | MVP 已實作         | Loopback HTTP/WebSocket、三個固定 slot、Gallery、Workbench、URL copy、content/state split、Lyrics template capability registry、Live Stage 可選歌詞呈現策略與 source-mapped T2 顯示邊界已建立；Browser Source 仍是支援基線。                                                                                                                                                                                  |
| Feature gates     | 已實作             | Renderer 提示與 main enforcement 共用 registry；local core 不需 gate。                                                                                                                                                                                                                                                                                                                                        |
| Diagnostics       | 已實作             | Main-owned persistence/redaction、renderer capture、Settings 控制、dependency IPC boundary 與顯式 redacted export（單一 JSON support bundle）已建立；dev-only F6 結構化檢視工作台（F5／F7／F8 為音樂分析、歌詞來源檢查與視覺系統型錄，皆同屬 dev-only）與獨立單檔 HTML 檢視工具已提供；其他 domain wrappers 持續增量導入。                                                                                    |
| 使用者回饋        | 已實作             | 錯誤回報／功能請求／使用體驗意見／內容問題共用一套預覽後送出流程，僅錯誤回報可選附最近錯誤紀錄；Settings 常駐入口與錯誤紀錄行動選單均可觸發。Relay 獨立部署於 Cloudflare、不隨 App 打包，需另行設定 Discord webhook 與 KV namespace 才能實際送達；送出前一律強制預覽，不做自動或背景上傳。                                                                                                                    |
| Distribution      | 已實作基礎         | NSIS、AUMID、package contracts、startup trace 與 unsigned updater runtime 已建立；獨立 manifest 簽章驗證機制（`electron-updater` 之外的第二層完整性檢查）已實作並通過單元測試，見 [ADR 0018](adr/0018-signed-update-manifest.md)——目前僅開發自簽金鑰，尚未接進真正發布流程，等同尚未變成使用者可感知的產品能力；受信任 Authenticode 簽章與連續版本 update acceptance 仍未完成。                               |
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
- 現行三個固定 slot（Setlist／Lyrics／Now Playing）是 MVP 基線；Now Playing 提供
  `now-next`（浮光光碟，預設）、`art-card`、`cover-player` 三個模板。Output
  Instance／Presentation Pack 是未來擴充方向，不應提前宣稱已完成。
- Setlist 的基礎公開契約只顯示目前演唱曲目與已唱紀錄，不投影待唱佇列，預設模板為
  `queue-board`（黑幕歌單）。480×810 是 large widget 的擷取尺寸，非模板本身的固定
  版面：模板以約兩成高度保留目前歌曲焦點區，已唱紀錄取得其餘可用高度；兩區只以
  固定 spacing 分隔，不保留無語意的比例空白列。最近八首已唱紀錄依正常播放順序向下
  排列，只有實際內容超出下方區域時才自動垂直滾動。

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

| Gate                    | 保護的產品動作                            | 依賴原則                                                    |
| ----------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| `provider-flow`         | 外部候選、下載、來源匯入與 backfill       | Provider runtime 四個 artifact 原子準備；不得阻擋本機匯入。 |
| `lyrics-flow`           | 外部歌詞查詢與保存                        | 每次 external request 都在 main 再檢查；不需要安裝 binary。 |
| `audio-processing-flow` | Separation、本機音樂分析與未來 pre-render | FFmpeg 與 active model 各自管理；缺一項只影響該能力。       |
| `public-output-flow`    | 啟動 Output server 與發布狀態             | 內建 Overlay 不需外部 binary；stop／status 永遠可用於復原。 |

Gate confirmation 只保存 `featureId`、notice version、confirmed time 與 enabled 狀態。
它不保存素材權利判斷，也不能成為 main trust boundary 的替代品。「Gate 內預設偏好」
與「不受 gate 保護的預設背景行為」兩種易混淆狀態的定義與現有案例見
[PRODUCT.md 的 Feature Gate 語意](../PRODUCT.md#feature-gate-語意)。

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

### 7.1 產品範圍決策

1. Recording／VOD gate 應每次 session 確認，或保存可見但可重用的 session preset？
2. Preset 匯入遇到缺曲時，採提示、略過或 track remapping？
3. Official Presentation Pack 與 User Variant 的版本、簽章與分享邊界如何落地？
4. Refined 的固定品質與容量門檻達到多少才可進產品 catalog？
5. 哪一個外部 adapter 有足夠真實需求，值得新增 credential 與 command trust boundary？
6. Pitch／tempo 是否要在既有 SoundTouch／WSOLA 之外，另加一條頻域（如 Signalsmith
   Stretch，MIT）路徑？公開評測顯示極端變速時頻域演算法音質優於 WSOLA，且此路徑不涉及
   GPU 或原生程式碼授權疑慮，風險層級低於本節其他項目；尚待決定是否值得投入與如何與現有
   `usePlayerAudioGraph.js` 的 SoundTouch pitch processing 共存或取代。見
   [競品調查 §5.3](research/competitive-research.md#53-對-utawakui-的啟發第三輪更新)。
7. 是否要投入原生 OBS 音訊輸出（例如自製 libobs plugin），做為 Browser Source／系統音訊
   裝置之外的第三條輸出路徑？這是目前三個產品中唯一「別人有、Utawakui 與 EliteSand Pro
   都沒有」的能力，但需要一併評估 libobs（GPL-2.0-or-later）的散布條件、崩潰風險模型
   與 Browser Source 不同（原生行程內程式碼，非獨立 CEF 沙箱），以及是否要比照競品做
   VST3／ASIO 類第三方原生程式碼的獨立行程隔離設計。見
   [競品調查 §5.3](research/competitive-research.md#53-對-utawakui-的啟發第三輪更新) 與
   [§7 合法性疑慮對照](research/competitive-research.md#7-合法性疑慮對照)。
8. 是否要加入「無伴奏演出」項目，讓清唱／自彈自唱不需要假媒體檔就能進入 now
   playing／待播／已唱？這是低風險的資料模型補洞，與現有 library／queue 設計相容；尚待
   決定 track 的最小必要欄位（時長估計、手動結束 vs. 計時自動結束）與是否影響現有
   playback／queue 契約。見
   [競品調查 §5.3](research/competitive-research.md#53-對-utawakui-的啟發第三輪更新)。

Updater 非對稱簽章＋artifact hash 雙層驗證已決定並實作簽章／驗證架構，詳見
[ADR 0018](adr/0018-signed-update-manifest.md)與上方 §3 狀態表；正式金鑰存放位置與
是否接進真正發布流程仍是 ADR 0018 記錄的未決問題，尚未變成產品可用能力。

### 7.2 系統與環境整合

1. 是否要加入本機資源監測（CPU／GPU／RAM 使用率）？這類監測在效能導向的桌面軟體中是
   常見做法，並非單一競品獨有——OBS 本身內建 Stats dock（顯示 CPU／掉幀／編碼耗時）、
   MSI Afterburner／RivaTuner Statistics Server 提供疊圖式硬體監測、Windows工作管理員
   效能分頁與工作列縮圖也都是使用者已熟悉的參照點。核心動機是 Utawakui 常與 OBS
   這類重度佔用 CPU／GPU 的軟體同時執行，讓使用者能及早發現資源競爭（例如編碼與
   音訊分離同時搶 GPU）。監測本身也要避免造成額外負擔：若要投入，建議走低頻率
   輪詢、預設關閉或最小化 UI 佔用，而非常駐即時圖表。若要讓監測產生實際產品效益，
   也應一併評估是否讓結果具備行動力——例如偵測到 GPU／CPU 已被 OBS 編碼佔滿時，
   自動延後或降低背景人聲分離等本機運算工作的優先權，而不只是顯示數字；但這需要
   謹慎判斷何時介入，避免誤判使用者本來就在進行的一般高負載情境。尚待決定監測
   範圍（是否含 GPU，以及如何在無獨立顯卡或多 GPU 環境下取得可靠讀數）、更新頻率
   與呈現位置（Settings 內、獨立浮動面板或 tray tooltip／icon），以及是否要做到
   主動調解資源競爭。
2. 是否要支援縮小到 Windows 系統工作列（system tray）並在背景持續執行？這是 Windows
   桌面應用的通用慣例，多款主流應用（例如即時通訊、音樂與串流輔助軟體）都提供關閉
   視窗時縮小到 tray、而非直接結束程序的選項，對長時間直播情境有實際好處（誤按關閉
   不中斷播放／OBS 連線）；歌回救星等競品也有對應的 tray／背景模式，但這只是眾多
   桌面軟體共通做法之一，不是唯一或最佳參照。尚待決定：關閉視窗鈕的預設行為（縮小到
   tray vs. 直接結束，是否可設定）、tray icon 的最小操作集（顯示／隱藏、結束，是否
   納入播放控制）以及首次縮小時是否需要一次性提示說明行為。
3. 是否要在使用中（尤其背景執行／縮小到 tray 期間）呼叫 Electron `powerSaveBlocker`
   防止系統休眠或關閉螢幕？長時間背景執行若沒有這項保護，系統自動休眠會直接中斷
   OBS 錄製／直播與 Utawakui 本身的播放，這是媒體／串流輔助軟體常見的標準配套，
   與上一項背景執行是搭配關係——只做背景執行而不防休眠，背景執行的實際效益會
   打折。尚待決定：是否預設開啟、是否只在偵測到播放中或 OBS 連線中才啟用（避免
   不必要地阻止系統休眠），以及是否要讓使用者在 Settings 手動關閉。
4. 是否要在直播期間抑制系統層級的通知彈窗（類似 Windows「專注輔助」整合，或
   App 內建 Do Not Disturb 開關）？App 背景執行時若跳出訊息通知（例如回饋送出
   結果、更新提示），在畫面擷取情境下有被 OBS 錄進畫面的風險，這是背景執行／
   資源監測之外容易被忽略的隱私與觀感問題。尚待決定：判斷「直播中」狀態的依據
   （Output server 是否啟用、OBS WebSocket 連線狀態，或使用者手動切換）、抑制
   範圍（僅 App 自身通知，或嘗試呼叫 Windows 專注輔助 API 影響全系統通知）。
5. 是否要偵測 OS 語言／地區（locale），作為未來 i18n 的依據？目前 §4.5 使用者回饋的
   `environment` 已固定收集 `locale` 備用，但尚未真正用於切換介面語言；多語系介面
   （繁中／簡中／日／韓／英）是歌回救星、EliteSand Pro 等同類軟體的常見基礎功能，
   非特殊需求。尚待決定：是否啟動完整 i18n 專案（字串抽取、翻譯流程與維護成本），
   或先以 OS locale 做單一次要功能（例如僅切換數字／日期格式）的低成本起點。
6. 是否要偵測系統已安裝字型，供歌詞／Overlay 模板挑選？OBS 歌詞疊層常見痛點是套用
   的字型缺少日文假名／韓文／生僻字字形而顯示成方框（tofu）；偵測可用系統字型、
   讓使用者從中挑選套用到歌詞模板，或在選到的字型缺字時提醒，是歌詞類軟體常見但
   容易被忽略的細節。尚待決定：偵測範圍（僅列出常見 CJK 字型，或列出全部已安裝
   字型）、是否需要隨附至少一款保底 CJK 字型（例如 Noto Sans CJK）以避免完全依賴
   使用者系統字型庫，以及 Browser Source（CEF）實際能存取哪些系統字型需要先實機
   驗證。
7. 是否要偵測 Windows 深色／淺色模式，讓 App 介面主題跟隨系統？這是現代 Windows
   桌面軟體（含多數 Electron App）的標準做法，成本低，對長時間操作控制台的情境
   有實際舒適度差異。尚待決定：是否提供跟隨系統／手動覆寫兩種模式，以及是否連動
   到 Self-View／Workbench 等其他視窗。
8. 是否要處理 DPI／多螢幕縮放感知？歌回情境常見雙螢幕（控制台一台、OBS／直播畫面
   一台），不同螢幕 DPI 縮放比例不同時，若沒處理好視窗與 Overlay 的定位／字體大小
   會跑掉。尚待決定：是否需要針對 per-monitor DPI awareness 做額外的 Electron／
   Windows API 處理，以及 Self-View／Workbench 視窗在跨螢幕搬移時是否需要重新
   計算版面。
9. 是否要偵測 Windows「顯示動畫效果」／減少動態效果等輔助設定，讓有動暈敏感需求的
   使用者自動退回較靜態的歌詞呈現？現有多款動態歌詞樣式（例如 Kinetic Pop）預設皆有
   進場／滾動動畫；比照網頁 `prefers-reduced-motion` 的精神，讀取 Windows 對應設定
   可以讓使用者不必每個模板各自手動關動畫。尚待決定：偵測依據（對應的 Windows 系統
   設定或 API）、套用範圍（Self-View、Overlay 是否都套用）、以及是否提供 App 內
   獨立開關以覆寫系統設定。

`quick`／`general` separation 的 DirectML execution provider 已決定、實作並通過
Windows x64 封裝版驗收，不再是待決事項。GPU 不可用或初始化失敗時會自動改走 CPU，
使用者也能在 Settings 關閉 GPU 加速；詳見
[ADR 0017](adr/0017-directml-execution-provider-for-mdx-separation.md) 與上方 §3 狀態表。
