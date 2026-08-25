# 競品調查：歌回與 OBS 輔助工具

> 研究日期：2026-08-13。本文是產品與工程判斷用的競品整理，不構成法律意見。
> 時效說明：本文的 Utawakui 現況與競品版本固定在研究日期，不會隨實作更新。
> 目前產品狀態請見 [產品規格](../spec.md) 與[文件決策圖](../README.md)。

## 1. 研究範圍

本次主要盤點三個產品：

1. **Setlista / セトリスタ**
   - 公開手冊：<https://nekosogi.org/setlista>
   - 3rd session 說明：<https://nekosogi.org/setlista3>
   - 3rd control / view：<https://app.nekosogi.org/setlista3/control.html>、<https://app.nekosogi.org/setlista3/view.html>
2. **EliteSand Pro**
   - 依本機資料夾 `E:\elitesand-pro` 盤點。
   - 本地來源狀態：`v0.9.9.1`，git HEAD `fcc89ba0a7e6b2a323bacda5d14d2467456cd550`，commit date `2026-08-07 02:55:26 +0800`。
   - 主要參考：`README.md`、`package.json`、`server/`、`public/`、`electron/`。
3. **歌回救星 / Singing Stream Savior**
   - 公開手冊：<https://noonisawesome.github.io/Singing-Stream-Savior-Manual/>
   - 本機手冊：`E:\Singing-Stream-Savior-Manual`
   - 本地來源狀態：manual git HEAD `ba80e50cd75e71f8cafd05d4024630c0688204bb`，commit date `2026-08-06 03:10:02 +0800`。
   - 公開版本資料：`2.0.5.2`，launcher `1.0.1.3`，更新日期 `2026-08-06`。

對照基準：

- `docs/spec.md`：Utawakui 產品定位、功能分類、架構邊界與 roadmap。
- `docs/governance/legal-compliance.md`：Utawakui 的合規姿態與 feature gate 建議。
- 官方平台資料：YouTube API Services Developer Policies、Twitch Music Guidelines / DMCA FAQ、Spotify Developer Policy。

## 2. 研究當時的 Utawakui 現況摘要

Utawakui 的規格核心是「本機媒體優先」的 Electron + Vue 桌面控制台。已實作本機曲庫、播放、播放佇列、playlist / collection、metadata 顯示、Windows shell integration、pitch / tempo preview、vocal separation / guide vocal、provider candidate import、yt-dlp download path、lyrics/subtitle 基礎路徑。

尚未完成但已納入規格的重點包括 feature notice / gate、local import first flow、OBS Browser Source overlay server、overlay theme tokens、performer self-view、recording / VOD mode、preset export/import、packaging / installer。

合法性與產品邊界的主軸是：

- 預設入口應是本機素材與 metadata 管理。
- Provider-backed acquisition、lyrics、audio processing、public output 應是明確啟用的進階流程。
- 不做內建商用曲庫、授權代理、素材授權管理、聊天點歌自動化、OBS native plugin、雲端協作，且不以繞行平台規則為目標。
- Gate 只記錄使用者已看過提示，不應暗示 Utawakui 代替使用者確認授權。

## 3. Setlista

### 3.1 產品定位

Setlista 是高度聚焦的 OBS setlist 工具。舊版說明將其定位為「在 OBS Browser Source 中運作的 setlist 編輯工具」；使用者下載 zip 或載入線上頁面後，在 OBS 內操作 Reserve、Now Singing、Set List 等區塊。

3rd session 是目前更重要的版本：控制端改為 OBS 的 custom browser dock，顯示端是 Browser Source。官方說明強調 3rd session 不需要舊版的 key connection，操作可在 OBS 內完成。這點和 Utawakui 規格中的「控制台與 OBS overlay 解耦」不同：Setlista 的控制面板本身也進入 OBS 內。

### 3.2 功能盤點

已看到的能力：

- Reserve List：預先輸入待唱曲目，一行一首。
- Now Singing：目前演唱曲目。
- Set List：已唱清單，可直接編輯。
- 一鍵前進與返回。
- 一鍵複製 setlist。
- 多種 skin / theme；3rd session 繼承 2nd season skin。
- Twitter 投稿輔助。
- Time Stamp：3rd session 透過 onecomme 連動直播時間，並支援把 timestamp 加到 setlist 前。
- 純 Browser Source / Browser Dock 使用，不需要安裝桌面 app。

未看到或不是主要定位：

- 不提供本機音訊曲庫。
- 不負責播放伴奏或 BGM。
- 不做歌詞搜尋、同步歌詞、pitch / tempo、vocal separation。
- 不處理 provider import 或下載。
- 不處理 Twitch / YouTube chat request automation。

### 3.3 對 Utawakui 的啟發

Setlista 的優勢不是功能面廣度，而是「低導入成本」和「OBS 使用情境貼合」。它不需要使用者理解 library root、media protocol、桌面 app 與 OBS server 的差異；只要在 OBS 加 dock / source 即可。

對 Utawakui 有三個參考點：

- OBS overlay MVP 要非常快能完成第一次顯示。Setlista 的成功點是把 Now Singing / Set List / Reserve 這三個心智模型做得清楚。
- Theme / skin 生態可以先做窄但好用，不必一開始追求完整設計系統。
- Timestamp 不是播放器核心，但對歌回 VOD 章節很有價值；Utawakui 的 recording / VOD mode 可把這件事納入 Phase 2，而不是塞進播放核心。

### 3.4 合法性與產品邊界

Setlista 基本上不碰音訊、歌詞 provider、下載、音訊處理，因此相對 rights-neutral。主要風險落在使用者手動輸入的曲名、對外顯示 setlist、Twitter 投稿，以及 onecomme 連動的第三方服務條款。

與 Utawakui spec 對照：

- 符合「純 UI overlay 低風險」方向。
- 不涉及 provider flow / yt-dlp download 的高風險區。
- 若 Utawakui 借鑑 timestamp 或社群投稿功能，應維持使用者主動觸發，並清楚標明是外部平台動作。
- Setlista 3rd 把 control 放進 OBS dock；Utawakui spec 則要求 overlay delivery path 獨立於 Electron renderer。Utawakui 不應因此改成「只在 OBS 內控制」，但可以學習其導入路徑。

## 4. EliteSand Pro

### 4.1 產品定位

EliteSand Pro 是三者中範圍最完整、工程量最大的產品。本地 README 將它定位為給 VTuber、歌回實況主與直播演出者使用的 Windows 桌面工具，整合歌曲管理、歌詞搜尋、同步播放、OBS 動態歌詞、直播歌單與 Twitch 點歌流程。

它的產品架構更接近「本機服務 + 桌面殼 + 多個 Browser Source / remote surfaces」：`server/index.js` 提供 HTTP / Socket.IO runtime，`public/display.html`、`public/setlist.html`、`public/controller.html` 分別服務 OBS 歌詞、OBS 歌單與手機遙控，Electron shell 主要包裝本機 server。

### 4.2 功能盤點

歌曲與播放：

- YouTube 單曲 / playlist 匯入，自動下載音訊、metadata、封面、歌詞。
- 本機 MP3、FLAC、WAV、M4A、OGG 等匯入。
- 匯入佇列、取消、重試、重複檢查、時長檢查。
- 播放、暫停、上一首、下一首、seek、迷你播放器。
- 每曲保存 ±12 半音、0.5x-1.5x 速度、時間偏移。
- SoundTouch / WSOLA 變調變速。
- 媒體庫保存播放次數、歌詞、時間校正、播放設定。

歌詞：

- 多來源搜尋：BetterLyrics、Apple Music、酷狗、QQ Music、LRCLIB、網易雲等。
- 支援逐字、逐句、LRC、KRC、TTML、SRT、純文字。
- 可貼上歌詞、時間軸編輯、對齊第一句、來源快取、健康狀態與降級。
- 日文、韓文、中文讀音/拼音相關功能。

OBS 與直播：

- OBS 透明背景 Browser Source。
- 六種動態歌詞模板與大量樣式設定。
- 逐字掃光、逐句切換、倒數、KTV clock。
- OBS 歌詞與歌單連線狀態。
- 直播歌單顯示已唱、正在唱、接下來歌曲。
- 場次保存、YouTube chapter timestamp。

互動與控制：

- Twitch Device Code Flow，不需要 Client Secret。
- Chat command / Channel Points 點歌。
- 使用者點歌先進待確認區，由主播確認後才下載。
- 名額、歌曲長度、重複歌曲、黑名單、公平工作階段。
- 手機遙控器。
- Stream Deck HTTP API `/api/deck/:action`。
- PIN、唯讀/可寫權限、請求大小限制。

發布與營運：

- Windows Installer / Portable。
- 安全增量更新、hash 驗證、manifest、檔案白名單。
- EULA、第三方 notices、log、diagnostic bundle。
- 多語言 UI。

### 4.3 對 Utawakui 的啟發

EliteSand Pro 幾乎是 Utawakui roadmap 的「全量版本」：它已經覆蓋 Utawakui Phase 0 的大半能力，也覆蓋 Phase 1 的 OBS 歌詞/歌單、performer/remote surface，甚至納入 Utawakui 明確排除的 Twitch 點歌 automation。

可借鑑處：

- 本機 HTTP / WebSocket state server + 多個 output page 是正確方向，與 Utawakui spec 的 OBS overlay server 一致。
- 控制面板、OBS display、setlist、controller 分離，可以避免把所有 UI 都塞進一個 Electron renderer。
- 播放器設定與歌詞 offset 以每曲保存，符合歌回實務。
- 匯入/下載/歌詞/OBS 連線都有健康檢查、錯誤復原與狀態持久化，這是成熟產品的差距。

需要避開或重新設計處：

- EliteSand Pro 將 YouTube download、歌詞多來源、Twitch 點歌與 OBS output 做成核心賣點；Utawakui spec 目前要求 provider-backed acquisition 和 lyrics/public output 需要明確 feature gate。
- Twitch 點歌 automation 是 Utawakui 明確排除項，不能直接跟進。
- 多來源歌詞搜尋與公開 lyrics overlay 是高價值能力，但需要和 Utawakui 的 lyrics flow gate、public output gate 分層。
- 如果未來做 remote controller / Stream Deck，要保留 PIN、權限、同區網安全與 request limit，不要只做裸 HTTP endpoint。

### 4.4 合法性與產品邊界

EliteSand Pro 觸及最高風險面：

- YouTube download / cache / offline playback。
- 多來源歌詞搜尋與 OBS 歌詞公開顯示。
- 封面、thumbnail 與歌曲 metadata 顯示。
- Twitch chat / Channel Points request 導向 YouTube URL。
- 自動 timestamp、場次與 VOD chapter workflow。

平台對照：

- YouTube API Services Developer Policies 明確禁止在未取得 YouTube 事前書面同意時，download、import、backup、cache 或 store YouTube audiovisual content，也禁止 offline playback 與促進侵權材料利用。
- Twitch Music Guidelines 對 karaoke recording、lip sync、lyrics / notation / tablature visual depiction、使用他人 instrumental tracks 的 cover song performance 都相當保守。
- Twitch DMCA FAQ 也說明 VOD mute 不等於 DMCA notification / strike，但不代表內容合法或不會收到權利人通知。

與 Utawakui spec 對照：

- EliteSand Pro 的高完成度來自「大整合」，但 Utawakui 若照搬會直接碰到 spec 的合法性邊界。
- Utawakui 應維持 local import first，provider flow 預設不開，且不把 YouTube / YT Music 顯示成授權來源。
- 歌詞與封面可以是本機資料或候選資料，但 OBS output 前應有 public output / lyrics gate。
- Vocal separation、pitch / tempo 與 render cache 應維持本機工作流，不宣稱加工素材可公開散布。

## 5. 歌回救星 / Singing Stream Savior

### 5.1 產品定位

歌回救星是為歌回直播設計的本機播放器與 OBS 輔助工具。它的核心情境很明確：直播空檔播放 BGM，開始伴奏時自動暫停或淡出 BGM，伴奏結束後恢復 BGM；同時更新 OBS 上的歌單與歌詞。

它不像 Setlista 那樣只做 overlay，也不像 EliteSand Pro 那樣把 Twitch request 與多來源歌詞做得很深。它的強項是「歌回當下最容易出錯的操作」被產品化：BGM/伴奏交接、待播/已唱、歌詞視窗、OBS 顯示、工作區模式。

### 5.2 功能盤點

歌曲庫與播放：

- 全部歌曲、我的最愛、最近播放、自訂歌單。
- 本機音訊匯入與拖曳。
- YouTube 單曲與 playlist 匯入；playlist 會整理成自訂歌單。
- 無伴奏演出項目，不建立假靜音檔。
- 顯示歌名與來源分離，直播畫面優先使用顯示歌名。
- BGM 播放器與歌唱伴奏播放器分離。
- BGM playlist、單曲循環、全部循環、隨機循環。
- 每首伴奏保存速度與 key。
- 待播與已唱清單，異常中斷後可復原快照。

歌詞：

- LRC、SRT、VTT、純文字、YouTube CC / auto captions、LRCLIB。
- 線上搜尋最多 50 筆，優先同步歌詞，並依長度接近度排序。
- 播放無歌詞歌曲時可自動整理候選，但需要使用者確認才附加。
- 獨立歌詞視窗，可點擊同步歌詞跳播。
- 歌詞預覽與 OBS 共用版面設定；主播自用歌詞視窗可用不同讀音設定。
- 日文平假名 / 羅馬拼音、韓文羅馬拼音。
- 語意化時間校正。

OBS 與主題：

- 歌單與歌詞是兩個獨立 Browser Source。
- 主題包含 Default、Transparent、Card、CD、Signal Line、Stage Caption 等。
- 主題能力宣告：不支援的設定不顯示。
- 自動展示以假資料 preview Now Singing、Set List、Reserve / Next On、timestamp。
- OBS WebSocket 預設關閉，主要用於直播時間戳。

工作區：

- 完整、精簡、迷你三種模式。
- 模式記住視窗尺寸與分隔位置。
- 迷你模式保留伴奏播放器、key / speed / volume、待播 / 已唱、歌詞視窗。

發布與隱私：

- ZIP 發布，版本 `2.0.5.2`，約 406 MB。
- 未商業程式碼簽章，文件說明 SmartScreen 提示。
- 文件明確寫出不使用 YouTube、線上歌詞或封面搜尋時，播放與專案功能可離線；程式不主動上傳歌曲、歌詞、專案或個人檔案。

### 5.3 對 Utawakui 的啟發

歌回救星與 Utawakui 的產品精神最接近：本機播放器、歌回操作、OBS output、歌詞與 setlist 同步。

可借鑑處：

- BGM 與伴奏自動交接是很強的歌回專屬 workflow，Utawakui 目前 player/queue 已有基礎，但可評估未來是否加入「BGM lane」。
- 無伴奏演出項目是很漂亮的資料模型補洞：它讓清唱、自彈自唱仍能進入 now singing、待播與已唱，而不需要 fake media。
- 工作區模式直接服務直播中空間壓力，比一般 responsive layout 更貼近桌面直播場景。
- 歌詞視窗點擊跳播是一個高價值的練歌功能，且不必先碰 OBS output。
- 主題能力宣告可避免 UI 顯示無效控制，適合 Utawakui 未來 overlay theme system。

需要留意處：

- YouTube 伴奏與 playlist 匯入仍屬 provider-backed acquisition，Utawakui 應維持 feature gate。
- YouTube CC / auto captions 和 LRCLIB 是 lyrics flow，需要確認來源、清洗與顯示用途；OBS output 應另有 public output gate。
- Card / CD 顯示封面時，若進 OBS，需提醒 artwork public display 風險。

### 5.4 合法性與產品邊界

歌回救星的風險介於 Setlista 與 EliteSand Pro 之間。它碰 YouTube 匯入、線上歌詞、YouTube CC、封面搜尋與 OBS lyrics / setlist output，但目前沒有看到 Twitch chat request automation、Channel Points refund 等更深的外部平台自動化。

與 Utawakui spec 對照：

- 本機播放器 + OBS Browser Source 方向一致。
- BGM/伴奏、自用歌詞視窗、工作區模式可作為低風險產品能力。
- YouTube 匯入、lyrics provider、OBS lyrics、封面顯示都應分 gate。
- 文件中「本機功能可離線、只有對應功能需要連線、不主動上傳使用者檔案」的說法值得 Utawakui 採用。

## 6. 功能矩陣

| 功能 / 產品         | Setlista              | EliteSand Pro            | 歌回救星                          | Utawakui 現況                             |
| ------------------- | --------------------- | ------------------------ | --------------------------------- | ----------------------------------------- |
| 本機曲庫            | 無                    | 有                       | 有                                | 已實作                                    |
| 播放器              | 無                    | 有                       | 有，且 BGM / 伴奏分離             | 已實作                                    |
| BGM 自動交接        | 無                    | 未作為主要公開賣點       | 有                                | 未納入 spec                               |
| 播放佇列 / 待播     | Reserve / Set List    | 有                       | 待播 / 已唱                       | 已實作 queue / playlists                  |
| OBS setlist         | 核心功能              | 有                       | 有                                | 規劃中                                    |
| OBS lyrics          | 無                    | 強                       | 有                                | 規劃中 / lyrics 基礎                      |
| 歌詞自用視窗        | 無                    | 有類似 prompter / lyrics | 有                                | 規劃中 self-view                          |
| 歌詞 provider       | 無                    | 多來源                   | LRCLIB / YouTube captions / local | 部分基礎                                  |
| Pitch / tempo       | 無                    | 每曲保存                 | 每曲保存                          | 已實作即時 preview                        |
| Vocal separation    | 無                    | 未見核心公開描述         | 無                                | 已實作                                    |
| YouTube 匯入 / 下載 | 無                    | 核心功能                 | 有                                | 已實作 provider path，但規格要求進階 gate |
| Twitch 點歌         | 無                    | 強                       | 未見                              | 明確排除                                  |
| 手機遙控            | 無                    | 有                       | 未見核心                          | 未納入近期 spec                           |
| Stream Deck         | 無                    | HTTP API                 | 未見                              | Phase 3 評估                              |
| Timestamp / chapter | 有，3rd + onecomme    | 有                       | 有，OBS WebSocket                 | 規劃中 recording / VOD mode               |
| Theme / skin        | 強，窄場景            | 強                       | 強                                | 規劃中 overlay theme tokens               |
| Installer / release | Browser-based / BOOTH | Installer / updater      | ZIP release                       | 尚未完成                                  |

## 7. 合法性疑慮對照

### 7.1 Provider download / YouTube

YouTube 官方政策禁止未經書面同意 download、import、backup、cache、store copies of YouTube audiovisual content，也禁止 offline playback 與使用 API services 促進侵權材料利用。

競品對照：

- Setlista：不碰 YouTube download，低風險。
- EliteSand Pro：YouTube 單曲 / playlist download 是核心功能，風險最高。
- 歌回救星：支援 YouTube 單曲 / playlist 匯入，風險中高。
- Utawakui：已有 yt-dlp path，但 `docs/spec.md` 已要求移到 provider flow，這是正確方向。

Utawakui 建議：

- Local import first 必須先完成，provider flow 預設關閉。
- UI 使用「候選來源」「匯入候選」「provider flow」，避免「合法音源」「可用伴奏」這類暗示。
- 不加入 cookies、登入限制繞行、DRM / geo bypass、rate-limit 規避。

### 7.2 Lyrics / captions / visual display

Twitch Music Guidelines 對 lyrics、music notation、tablature 或其他受保護音樂的 visual representation 明確要求使用者擁有或取得授權。歌詞不是「因為只是文字就安全」。

競品對照：

- Setlista：通常只顯示曲名，不顯示完整歌詞。
- EliteSand Pro：多來源歌詞與 OBS 動態歌詞是核心，高風險但高價值。
- 歌回救星：歌詞功能完整，且區分主播自用視窗與 OBS lyrics source。
- Utawakui：lyrics workspace 部分實作，OBS lyrics 規劃中。

Utawakui 建議：

- 先把 lyrics workspace 做成本機/自用工作流。
- OBS lyrics source 啟用 public output gate。
- 歌詞 provider 結果要保留來源與使用者確認，不自動覆蓋既有歌詞。
- 將「自用歌詞視窗」和「觀眾看到的 lyrics overlay」在狀態與提示上分開。

### 7.3 Audio processing / pitch / vocal separation

Pitch / tempo、vocal separation、stems 與 render cache 都可能形成加工版本或新副本。它們不是天然非法，但公開使用時需要回到使用者素材權利與平台政策。

競品對照：

- Setlista：不碰。
- EliteSand Pro：pitch / tempo 深度較高，但未見 vocal separation 核心賣點。
- 歌回救星：每曲保存 key / speed，偏播放體驗。
- Utawakui：vocal separation 是差異化強項。

Utawakui 建議：

- 保持「本機 generated media」語言，不稱為可散布素材。
- Stems / separation output 不提供分享或上傳功能。
- Public output / recording 前提示處理後素材仍需確認授權。

### 7.4 Public output / OBS / VOD

OBS Browser Source 本身通常是低風險 delivery path；真正風險來自送進 OBS 的內容：音訊、歌詞、封面、MV、字幕、VOD、clips。

競品對照：

- Setlista：OBS UI output 最清楚，內容窄。
- EliteSand Pro：lyrics、setlist、cover、timestamp、Twitch workflow 都會連到公開輸出。
- 歌回救星：setlist / lyrics 是獨立 Browser Source，OBS WebSocket 預設關閉。
- Utawakui：規格已要求 overlay 與 Electron renderer 解耦，這點正確。

Utawakui 建議：

- Overlay server 用本機 HTTP/WebSocket，但保持來源 allowlist 與清楚的 public output gate。
- Recording / VOD mode 和 live output 分開確認。
- Timestamp / chapter export 屬高價值低侵入功能，可在 VOD mode 中做。

### 7.5 Chat request automation

Twitch request automation 是功能價值很高但產品邊界複雜的區域，尤其當 request 直接導向 YouTube download 或自動處理 Channel Points refund。

競品對照：

- EliteSand Pro：完整 Twitch 點歌流程，包含 Device Code Flow、chat command、Channel Points、pending confirmation、限制與 refund。
- Setlista / 歌回救星：本次資料未見同級別功能。
- Utawakui：`docs/spec.md` 明確排除 Twitch/YouTube chat song request automation。

Utawakui 建議：

- 不跟進 chat song request automation。
- 若未來評估 integration，先做 metadata-only 或手動匯入，不能讓聊天室輸入直接觸發下載或污染正式曲庫。

## 8. 競品完成度排序

完成度以「產品可用性、功能覆蓋、直播 workflow 完整性、錯誤復原/發布成熟度、文件完整度」排序，不以功能範圍大小單獨決定。

### 第 1 名：EliteSand Pro

完成度最高。它已接近 `v1.0.0` 穩定版前驗證，具備 installer / portable、更新器、EULA、第三方 notices、測試與 smoke scripts。功能面覆蓋歌曲匯入、播放、歌詞、OBS lyrics / setlist、Twitch request、手機遙控、Stream Deck、錯誤復原、狀態遷移與多語言。

但它也是合法性/平台邊界風險最高的競品。Utawakui 可以學其工程成熟度與本機 server 架構，不應照搬其 provider download + Twitch automation 的產品預設。

### 第 2 名：歌回救星 / Singing Stream Savior

完成度第二。它有公開手冊、下載版本 `2.0.5.2`、清楚的第一次使用流程、工作區模式、BGM/伴奏交接、OBS setlist / lyrics、歌詞視窗與 preview。它不像 EliteSand Pro 那樣包辦所有外部平台 automation，但對歌回當下 workflow 的打磨很實在。

對 Utawakui 最有參考價值的是 BGM/伴奏雙 lane、無伴奏演出、工作區模式、歌詞視窗與 OBS output 分離。

### 第 3 名：Setlista

完成度第三，但不是因為品質差，而是它的產品範圍刻意很窄。Setlista 在「OBS 內 setlist 顯示與推進」這件事上很成熟，3rd session 也持續更新到 2026-03-25，skin 多、導入簡單、timestamp 實用。

若只比較 setlist overlay，它非常完成；但若以 Utawakui 的完整歌回控制台範圍比較，它缺少本機曲庫、播放、歌詞、音訊處理、provider flow、self-view 與桌面狀態管理，因此排在第三。

## 9. 對 Utawakui 的產品結論

短期最該補的不是「更多來源」，而是把既有能力排成更清楚、更可直播使用的流程：

- 完成 local import first，讓本機媒體優先真的成為預設入口。
- 建立 feature notice / gate，把 provider、lyrics、audio processing、public output 拆清楚。
- Phase 1 overlay server 先做 Now Singing、Set List、Reserve / Next On，學 Setlista 的窄而順。
- Lyrics self-view 可以早於 OBS lyrics overlay，學歌回救星把「主播自用」和「觀眾輸出」分開。
- 評估 BGM lane / 無伴奏演出，這比更深 provider integration 更貼近歌回痛點。
- 不追 Twitch 點歌 automation；這是 EliteSand Pro 的強項，但和 Utawakui 目前 spec 邊界相反。

## 10. Review

已完成：

- 讀取 `docs/spec.md` 與 `docs/governance/legal-compliance.md`。
- 檢視 `E:\elitesand-pro` 本地 README、package 與主要目錄。
- 檢視 `E:\Singing-Stream-Savior-Manual` 本地手冊與版本資料。
- 查閱 Setlista 舊版、3rd session 與 app control / view 公開頁面。
- 查閱 YouTube API Services Developer Policies、Twitch Music Guidelines / DMCA FAQ、Spotify Developer Policy。

限制：

- EliteSand Pro 依本地閉源前資料盤點，未使用公開網站交叉驗證。
- 本文只做產品/工程/平台政策層級的風險對照，不做司法管轄區法律結論。
