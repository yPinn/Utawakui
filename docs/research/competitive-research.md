# 競品調查:歌回與 OBS 輔助工具

> 研究日期:2026-09-15(第三輪調查,同日內完成;首次調查為 2026-08-13)。本文是產品與工程判斷用的競品整理,不構成法律意見。
> 時效說明:本文的 Utawakui 現況與競品版本固定在研究日期,不會隨實作更新。
> 目前產品狀態請見 [產品規格](../spec.md) 與[文件決策圖](../README.md)。
> 前兩輪調查的完整內容保留在 git history;本次為原地重寫,不另存舊版快照。第三輪的觸發點是使用者提供歌回救星應用程式內建的第三方授權清單(`Licenses` 資料夾),對照第二輪僅憑公開手冊文字描述所得的推論,發現產品實際技術棧遠比手冊揭露的更深——第三輪據此挖掘該產品的兩個公開 GitHub repo(手冊原始碼與更新發布倉庫)逐檔核對。

## 1. 研究範圍

本次主要盤點三個產品,版本錨點皆已於 2026-09-15 重新確認:

1. **Setlista / セトリスタ**
   - 公開手冊:<https://nekosogi.org/setlista>
   - 3rd session 說明:<https://nekosogi.org/setlista3>
   - 3rd control / view:<https://app.nekosogi.org/setlista3/control.html>、<https://app.nekosogi.org/setlista3/view.html>
   - 版本:`0.23.0`(2026-03-25),重新確認後**與首次調查時相同,半年內未發版**。
2. **EliteSand Pro**
   - 依本機資料夾 `E:\elitesand-pro` 盤點,已對照原始碼(非僅文件宣稱)。
   - 本地來源狀態:`v1.0.4`,git HEAD `571bf8ff75b8239d13ced418270e7c1b094ed90c`,commit date `2026-09-14 23:33:06 +0800`(commit message:「版號跳到 1.0.4」)。
   - 首次調查時為 `v0.9.9.1`(`fcc89ba0`,2026-08-07)——一個月內經過 `v0.9.9.5`〜`v0.9.9.7`、`v1.0.0`、`v1.0.3`、`v1.0.4` 共至少 6 個標籤,已越過其「正式 v1.0.0」發版線。
   - 主要參考:`README.md`、`CLAUDE.md`、`package.json`、`server/`、`public/js/`、`ai/`、`native/spout-output/`、`THIRD-PARTY-NOTICES.txt`。
3. **歌回救星 / Singing Stream Savior**
   - 公開手冊:<https://noonisawesome.github.io/Singing-Stream-Savior-Manual/>,原始碼 <https://github.com/NoonIsAwesome/Singing-Stream-Savior-Manual>(第三輪已 clone 逐檔核對,含先前未被 WebFetch 掃到的 `advanced-streaming.md`、`uvr-vocal-removal.md`、`open-source.md` 等頁)。
   - 更新發布倉庫:<https://github.com/NoonIsAwesome/Singing-Stream-Savior-Updates>(第三輪已 clone,逐檔核對 `updates/stable.json` 更新 manifest 內的元件、檔案雜湊與授權清單)。
   - 版本:`2.1.4.3`(2026-09-14);launcher 更新至 **`1.2.0.7`**,並新增獨立 **runtime 元件 `1.0.0.6`**(第二輪僅由手冊文字推得「launcher 1.2.0.5+」,本輪由 Updates repo README 與 manifest 修正為精確版號,且確認 runtime 是與主程式分開更新的元件)。
   - 首次調查時為 `2.0.5.2`(2026-08-06)——一個月內有 **26 個版號**,包含一次標記為「重大更新」的 `2.1.0.0`(2026-09-02,新增整套進階直播音訊子系統)與一次標記為新增功能主軸的 `2.1.1.0`(2026-09-04,新增內建人聲分離)。
   - 本機手冊 `E:\Singing-Stream-Savior-Manual`(git HEAD `ba80e50c`,2026-08-06)**已停在首次調查當時的版本,第二輪起改以公開手冊站為現況來源**,本機資料夾僅作歷史快照對照。
   - 使用者提供的應用程式內建授權清單(第三方元件表)是本輪的觸發來源,已與 `_data/open_source.yml` 及 `updates/stable.json` 的 `licenses/` 檔案清單交叉核對一致。

對照基準:

- `docs/spec.md`:Utawakui 產品定位、功能分類、架構邊界與 roadmap。
- `docs/governance/legal-compliance.md`:Utawakui 的合規姿態與 feature gate 建議。
- 官方平台資料:YouTube API Services Developer Policies、Twitch Music Guidelines / DMCA FAQ、Spotify Developer Policy(本次未重新查核,沿用首次調查引用)。

## 2. 研究當時的 Utawakui 現況摘要(2026-09-15)

依現行 `docs/spec.md` 狀態表:

- **預設核心已完整**:本機曲庫、metadata/縮圖、collections/playlists、播放/queue/待播/歷史/shuffle/repeat、本機設定、Windows shell/SMTC integration、純本機歌詞匯入/編輯/刪除——不依賴網路、provider runtime、模型或 Output server。
- **Lyrics 主路徑已實作**:T0/T1/T2 timing、LRCLIB/NetEase/Better Lyrics 多來源平行搜尋、來源中立排序、讀音、authoring、Self-View 與 segment-aware Overlay;provider-authored timing 只在完整驗證通過才標記逐字同步。
- **Audio processing 基礎產品能力已實作**:`quick`/`general` separation recipe、獨立 FFmpeg/model lifecycle、guide vocal、本機 BPM/節拍分析;Refined 與其他高品質可選包仍受 benchmark/dependency gate 限制。
- **OBS output MVP 已實作**:Loopback HTTP/WebSocket、三個固定 slot(Setlist/Lyrics/Now Playing)、Gallery、Workbench、六種歌詞呈現 profile(Classic KTV、Kinetic Pop、Ornate Vertical、Manga Frame、Live Stage 等);Browser Source 是支援基線。
- **Provider assist 核心路徑已實作,但只是 gated advanced flow**:app-managed Python `yt-dlp` runtime、YT Music 優先+YouTube 補足的文字搜尋、recording-first import;不是官方 YT Music API 整合,不含 Spotify/Apple Music URL 轉換或帳號歌單。
- **External adapters 為實驗性原型**:Windows x64 已有固定 `Utawakui.Lyrics` Spout2 sender,Browser Source 仍是支援基線,正式支援尚待實機相容性驗收。
- **Distribution 僅完成基礎**:NSIS、AUMID、startup trace、unsigned updater runtime 已建立,受信任簽章與連續版本 update acceptance 尚未完成。
- **明確非目標維持不變**:不做內建商用曲庫、授權代理、聊天點歌 automation、OBS native plugin、雲端協作。

與首次調查(2026-08-13)相比,Utawakui 在 OBS output(當時「尚未完成」→現在 MVP 已實作)、lyrics(當時「部分基礎」→現在主路徑已實作,六種模板)、使用者回饋系統(當時未提及→現在已實作)三個面向進度最大;Distribution 的簽章驗證仍是首次調查時就標注的缺口,至今未補。

## 3. Setlista

### 3.1 產品定位

與首次調查結論相同,重新確認未變動:Setlista 是高度聚焦的 OBS setlist 工具,3rd session(`v0.23.0`,2026-03-25)仍標示「試験公開中」(beta),控制端是 OBS 內的 custom browser dock,顯示端是獨立 Browser Source。

### 3.2 功能盤點(2026-09-15 重新確認)

- Reserve List / Now Singing / Set List 三段式操作,一鍵前進與返回。
- 批次複製 setlist,可選附加 timestamp 前綴用於 YouTube 章節。
- 20+ 種 skin;Twitter 投稿輔助。
- Timestamp 透過わんコメ(OneComme)連動直播時間;官方文件明確註明 timestamp 與返回鍵「相容性不佳」,建議謹慎併用。
- 純 Browser Source / Browser Dock,不需安裝桌面 app。
- 不提供本機音訊曲庫、播放、歌詞、pitch/tempo、vocal separation、provider import、Twitch/YouTube chat automation。

半年沒有發版且仍是 beta 標示,是唯一維持原判斷的競品。

### 3.3 對 Utawakui 的啟發

沿用首次調查結論:低導入成本與「OBS 使用情境貼合」仍是 Setlista 的核心優勢,可參考其 Now Singing/Set List/Reserve 心智模型與窄而深的 skin 生態。

### 3.4 合法性與產品邊界

沿用首次調查結論,無新增風險面。

## 4. EliteSand Pro

### 4.1 產品定位

`v0.9.9.1 → v1.0.4` 期間,EliteSand Pro 從「接近 v1.0.0 穩定版前驗證」進化為**已越過 v1.0.0 發版線的正式產品**,且新增了兩個首次調查完全沒看到的重大子系統:**AI 人聲分離**與**Spout2 原生輸出**。定位敘述本身未變——VTuber/歌回直播「動態歌詞助手」,本機 Node/Express+Socket.io server 包 Electron 殼,OBS 走 Browser Source——但功能廣度與工程深度明顯提升。

### 4.2 功能盤點(依原始碼逐項驗證,2026-09-15)

**歌曲與播放**(`server/services/audio-processor.js`、`server/utils/ytdlp-*.js`):

- YouTube 單曲/playlist 匯入,多層下載策略應付 403(bestaudio → HLS audio → HLS combined → Android/iOS client audio)。
- 本機 MP3/FLAC/WAV/M4A/OGG 匯入,metadata 讀取(`music-metadata`)。
- 每曲 ±12 半音 / 0.5x–1.5x 變速,SoundTouch/WSOLA(`public/js/soundtouch-engine.js` + AudioWorklet),loudness normalization(fft.js)。
- FFmpeg 不隨包安裝,首次使用時下載(`ffmpeg-provider.js`)。

**歌詞管線**(`server/services/lyrics-engine.js` 及同層檔案):

- 多來源並行搜尋:BetterLyrics、Apple Music、酷狗、QQ 音樂、LRCLIB、網易雲。
- LRC/KRC/TTML/SRT/純文字 parser,`lyrics-cleaner.js` 清除製作credit 雜訊。
- 日文假名(kuromoji)、中文拼音(pinyin-pro)。
- **「諧音」引擎**:`romanizer.js` + `xieyin.js` 把日/韓歌詞逐音節轉成中文近似發音字,目前已迭代到 **v2**(`xieyin-v2-mapper.js`),有專屬 benchmark 測試(`tests/xieyin-v2-benchmark.test.js`,掛在 `pretest` script)與獨立 Python G2P sidecar `ai/haqumei_sidecar.py`(使用 `haqumei` 函式庫,經確認確實是常駐 process + NDJSON stdin/stdout 協定,啟動即回傳 `{"ready": true/false}` 讓呼叫端明確拿到載入失敗原因)。
- 簡繁轉換(opencc-js),伺服端與 `public/vendor/opencc-cn2t.js` 客戶端各一份。

**OBS 歌詞模板**(`public/js/lyric-template-*.js`,逐檔確認):

- 11 個獨立模板檔案各自 `register()` 自己的 `id`:`aura`、`columnflow`、`drift`、`facet`、`ktv`、`lightboard`、`mirror`、`paperstrip`、`particle`、`pulse`、`typewriter`。
- 另有內建 `classic`(經典疊層)直接在 `karaoke.js:1234` 註冊,是 registry 的 `DEFAULT_ID`。
- 因此實際註冊模板共 **12 個**,與 README 宣稱的「十一種演出模板」的差異在於 classic 是否被算進「演出模板」——README 的數字準確描述了「可選風格化模板」的數量,classic 是預設/基準模板,未計入該數字屬合理分類,**此點與首次調查一致,非新增落差**。

**直播歌單 overlay**(`server/routes/handlers/setlist.js`):

- 已唱/正在唱/接下來曲目,場次歷史,YouTube chapter timestamp 匯出。

**Twitch 整合**(`server/services/twitch-service.js`,原始碼逐行確認):

- **Device Code Flow**(`device_code`/`user_code`/`verification_uri`,`grant_type: urn:ietf:params:oauth:grant-type:device_code`),無需 Client Secret。
- **EventSub WebSocket**(`wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30`),含 keepalive 逾時偵測(30–120 秒)與斷線重連後的「權威對帳」邏輯(補回連線空窗期漏收的 stream.online/offline)。
- 聊天指令/點數點歌進待審核佇列,不直接進正式歌單——與首次調查描述一致。

**遠端控制**:`/controller` 手機遙控、Stream Deck HTTP API(`/api/deck/:action`,與 socket handler 共用同一組 `ctx`)、可選 PIN 閘門(`require-pin.js`)。

### 4.3 AI 人聲分離(首次調查完全沒發現,本次重點驗證項目)

首次調查寫「EliteSand Pro:未見核心公開描述(vocal separation)」——**此結論已不成立**。目前程式碼有一套三層 fallback 的人聲分離引擎,是全庫最大的工程子系統之一:

1. **CUDA 路徑**(`server/services/ai-runtime-provider.js`、`ai-separation.js`、`ai/supervisor.py`、`ai/worker.py`):
   - Hermetic embeddable Python 3.11,`pip install audio-separator[gpu] torch==2.6.0 torchaudio==2.6.0`,`--extra-index-url https://download.pytorch.org/whl/cu124`(原始碼第 50-51 行逐字確認)。
   - 模型檔名 `vocals_mel_band_roformer.ckpt`——**Kim Mel-Band RoFormer**,經 `THIRD-PARTY-NOTICES.txt` 交叉確認為獨立第三方權重(python-audio-separator,MIT)。
   - Supervisor/worker 雙進程:supervisor 常駐、每個分離工作 spawn 全新 worker(`AISeparationSupervisor.separate()`),GPU OOM 時 `separateWithFallback()` 以全新 worker process 強制 CPU 重跑(程式碼註解明確寫出「CUDA_VISIBLE_DEVICES 只有在 torch 建立 CUDA context 之前設定才有效,同一 process 沒辦法半路拔掉 GPU」的技術理由,只有 GPU→CPU 兩級,無中間檔位)。
   - 程式碼內留有一則 2026-08-30 實機踩坑記錄:打包版 asar 虛擬檔案系統下 `.py` 檔案外部 python.exe 讀不到,必須用 `ELITESAND_AI_SCRIPT_DIR` 指到 `extraResources`,顯示這是**近期才修復、仍在打磨中的功能**,非成熟已久的老功能。
2. **WebGPU 路徑**(`server/services/webgpu-runtime-provider.js`,原始碼逐行確認):
   - 非 NVIDIA 顯卡的備援,下載 `syhft_core_folded_fp16_webgpu.onnx` + `.onnx.data`(合計約 746MB),來源 `musetric/vocal-separation-roformer-onnx`(MIT),**pin 死特定 revision**(程式碼註解說明上游曾換模型檔名與輸入張量形狀,若跟 `main` 走會導致使用者端 HTTP 404 或形狀不符,此為 2026-08-29 實際發生過的問題)。
   - SHA-256 逐檔驗證,磁碟空間檢查(需要 1.5GB 餘裕),失敗時整個目錄回滾不留半成品。
   - 在隱藏 `BrowserWindow` 內執行(`electron/webgpu-engine-window.js`),文件描述可自我修復重啟。
3. **CPU 路徑**:同代碼路徑的誠實 fallback,無特殊優化。

批次處理整個歌單、雙軌輸出(伴奏→OBS / 人聲→監聽)的 UI 存在(`public/js/home-ai-separation-panel.js`)。全庫沒有找到任何通用 LLM/對話式 AI 整合——「AI」在這個產品裡完全是音訊分離與日文 G2P 兩個垂直領域,不是聊天機器人。

### 4.4 Spout2 原生輸出(首次調查完全沒發現,README/CLAUDE.md 也未列為功能)

`native/spout-output/`(C++17、Node-API、DirectX 11/DXGI)讓 Electron 把渲染畫面直接以 Spout sender texture 輸出,繞過 OBS Browser Source。已確認:

- `ELITESAND_SPOUT_EXPERIMENT` 環境變數閘門(於 `electron/main.js`、`electron/shell.js`、`package.json` scripts、`tools/test-spout-output-ui.js`、`tests/run-tests.js` 共 5 處引用),**目前仍是明確標記的實驗功能,非預設開啟**。
- 專屬診斷工具(`electron/spout-issue-diagnostics.js`)與 `spout-alpha-lab/` 測試腳本,顯示投入的工程量不小,但尚未進入正式功能清單。

這與 Utawakui `docs/architecture.md` 描述的「Windows x64 已有固定 `Utawakui.Lyrics` Spout2 sender」是**同一條技術路線,兩邊都在做且都還是實驗階段**——這不是 EliteSand Pro 領先 Utawakui 的項目,而是兩個產品各自平行探索同一個外部 adapter。

### 4.5 發布與更新系統(逐項覆核,含一項需修正的描述)

- Windows NSIS installer,多語言(en/zh_TW/ja/ko/zh_CN)。
- **更新簽章機制經覆核,首次調查的描述需要精確化**:`server/services/update-signature.js` 內有真正的非對稱簽章(`crypto.createPrivateKey`/`createPublicKey`,manifest 以 canonical JSON 序列化後簽章,金鑰產生與簽署工具在 `tools/update-signing/`、`tools/update-policy-signing/`);`server/services/signed-update-artifact.js` 則只負責驗證 zip 檔案的 **SHA-256 雜湊**是否符合已簽章 manifest 內宣告的值,本身不含簽章運算。兩者合起來才是完整鏈:manifest 用非對稱金鑰簽章 → manifest 內的 SHA-256 保護實際 artifact 位元組。首次調查籠統寫「安全增量更新、hash 驗證」,實務上比 Utawakui 目前的 unsigned updater runtime 更完整。
- `electron-builder` electronFuses 停用 `runAsNode`、Node CLI inspect 參數、`NODE_OPTIONS`,啟用 cookie 加密與 ASAR 完整性驗證——安全意識明顯高於一般 Electron 預設值。
- MPL-2.0 開源碼,獨立 EULA(v2.0.0,台灣法律管轄),第三方 notices 完整列出 yt-dlp/FFmpeg/SoundTouch JS/Tone.js/OpenCC JS 授權。

### 4.6 對 Utawakui 的啟發(更新)

除首次調查已提出的「本機 HTTP/WebSocket server + 多輸出頁面」「控制面板/OBS display/setlist/controller 分離」「每曲保存 pitch/歌詞 offset」等借鑑點外,本次新增:

- **AI 人聲分離的三層 fallback 架構(CUDA/WebGPU/CPU)、GPU OOM 自動降級、模型 SHA-256 pin 死特定 revision** 是可直接參考的工程模式,尤其 Utawakui 的 `audio-processing-flow` 目前也走「FFmpeg + active model 各自獨立 lifecycle」的方向,兩者哲學接近。
- **更新系統的非對稱簽章 + artifact hash 雙層驗證**,是 Utawakui `docs/architecture.md` 明確列為缺口(「目前 `signExecutable`/`verifyUpdateCodeSignature` 為 false,屬 unsigned updater runtime」)的項目——EliteSand Pro 已經做出一個可參考的落地方案。
- Spout2 原生輸出兩邊都還在實驗階段,不構成需要追趕的差距,但可以互相參考失敗模式(EliteSand Pro 的「asar 讀不到 .py/延伸到 native addon 也可能有類似打包陷阱」踩坑記錄值得留意)。

需要避開或重新設計處與首次調查結論相同:不跟進 Twitch 點歌 automation;provider-backed acquisition、lyrics、public output 需維持 Utawakui 既有 feature gate 分層,不能因為 EliteSand Pro 把這些當核心賣點就跟進。

### 4.7 合法性與產品邊界

與首次調查結論相同,新增一項:**AI 人聲分離的模型授權與分離產物**——Kim Mel-Band RoFormer 與 musetric ONNX 模型皆為第三方訓練權重(非 EliteSand Pro 自行訓練),分離後的 vocals/instrumental 是原始版權音訊的衍生加工品,不是新的可自由散布素材。EliteSand Pro 目前的產品文件（README）將其定位為「實驗性、預設關閉」,語氣上有留意風險,但這仍是 Utawakui 建議中「保持本機 generated media 語言,不稱為可散布素材」原則的直接相關案例。

## 5. 歌回救星 / Singing Stream Savior

### 5.1 產品定位

依公開手冊(`v2.1.4.3`,2026-09-14)重新確認,核心情境未變:直播空檔播放 BGM,開始伴奏自動暫停/淡出 BGM,伴奏結束恢復 BGM,同步更新 OBS 歌單與歌詞。**但一個月內(`v2.0.5.2 → v2.1.4.3`,26 個版號)新增了兩個首次調查完全沒有的重大能力:內建 AI 人聲分離,以及一整套「進階直播音訊」子系統(效果器/Profile/虛擬音訊路由)**——產品範圍已經從「歌回操作打磨」擴張到部分重疊 EliteSand Pro 與 Utawakui 的核心賣點。

### 5.2 功能盤點(依公開手冊逐頁確認,2026-09-15)

**歌曲庫與播放**:

- All Songs / My Favorites / Recently Played / Custom Playlists。
- 本機拖曳匯入、YouTube 單曲/playlist 匯入(YouTube playlist 直接整理成自訂歌單)。
- **無伴奏演出項目**(＋Unaccompanied Performance):手動停止或計時自動結束(10 秒為單位可調)——與首次調查一致,仍是漂亮的資料模型補洞。
- 支援格式擴大為 **MP3/WAV/FLAC/M4A/MP4/AAC/OGG/OPUS/WMA**。
- Display Title(顯示歌名)與底層檔名/YouTube 標題分離。
- YouTube 下載預設 **MP3 320kbps**,可選 WAV(`v2.1.4.1` 起下載預設從其他格式改為 MP3 320kbps)。
- 兩種歌曲清單檢視:傳統列表(預設)、Card 卡片列表(強調封面/來源/歌詞狀態)。

**BGM 與伴奏交接**(核心賣點,與首次調查一致):

- BGM 播放器:單曲循環(預設)/全部循環/全部隨機三種模式,可組織成可摺疊播放清單。
- 伴奏播放器:速度%調整、Key 半音調整,皆每曲記憶且明確聲明「不劣化或重新編碼來源檔案」;四種演出模式(單曲播放/單曲循環/佇列循序/佇列隨機)。
- BGM 遇伴奏自動暫停、伴奏結束自動恢復——`v2.1.3.2`(2026-09-11)的更新日誌顯示這個核心交接邏輯**在 2026 年 9 月初仍有 bug 並剛修復**(「修正伴奏結束不一定能觸發 BGM 自動恢復」),代表這個賣點雖是產品核心但穩定性仍在持續打磨,非長期穩定的成熟功能。
- 新增 **Chat Topic 疊層**(`v2.1.3.0` 起):BGM 播放時,OBS「正在演唱」顯示區可改顯示自訂聊天標題+主題,伴奏開始自動還原。

**新增:內建 AI 人聲分離**(`v2.1.1.0` 起,首次調查完全未見;本輪已對照 [Singing-Stream-Savior-Updates](https://github.com/NoonIsAwesome/Singing-Stream-Savior-Updates) 的 `updates/stable.json` 更新 manifest 逐檔核對,置信度高於前一輪僅憑手冊文字描述):

- **UVR(Ultimate Vocal Remover)架構的人聲分離**,拖放批次佇列,標題編輯、進度追蹤;手冊 `uvr-vocal-removal.md` 附有與 EliteSand Pro 用語幾乎一致的法遵提醒(「請使用您擁有相關權利、授權涵蓋音訊分離,或依法可利用的素材」「本功能不提供歌曲授權」)。
- **技術棧經 manifest 逐檔確認,與首次分析的「MDX/HP 多模型+GPU 加速」推測一致,但實際路線比預期更精確**:
  - **MDX 模型**(`UVR-MDX-NET-Inst_HQ_3.onnx`、`UVR_MDXNET_KARA_2.onnx`,皆為 `.onnx` 格式)透過 **`sherpa-onnx-offline-source-separation.exe`** 推論——manifest 內同時打包 `bin/cpu/` 與 `bin/directml/` 兩份執行檔,`bin/directml/` 下並列 `onnxruntime.dll` 與 `DirectML.dll`。**全部 manifest 檔案清單中沒有任何 `torch`/`cuda` 字樣**,證實 MDX 路徑完全不依賴 CUDA,而是走 ONNX Runtime + DirectML——DirectML 是任何 DirectX 12 顯示卡都能吃的通用後端(AMD/Intel/NVIDIA),不需要像 EliteSand Pro 那樣為非 NVIDIA 顯卡另外做一條 WebGPU 備援與獨立模型檔案。
  - **HP 模型**(`2_HP-UVR.onnx`、`6_HP-Karaoke-UVR.onnx`,同樣已轉成 `.onnx`)透過獨立的 **`vr/S3SHpWorker.exe`** 推論,manifest 同層打包 CPython 3.13.15、PyInstaller 6.21.0、NumPy/SciPy、libsamplerate、pybind11 的授權檔——確認這是一個**獨立凍結封裝的 Python 執行檔**,不是共用 MDX 那支純 C++ 的 sherpa-onnx CLI。
  - 手冊(`uvr-vocal-removal.md`)補充產品面說法:開發者本人聽感推薦 HP「較能保留伴奏細節」,但 HP 實測速度比 MDX 慢;新安裝預設為 HP 保留合音模式,同一批次佇列可逐首指定不同模型。
- 分離結果可**直接匯入回歌曲庫作為伴奏**,與伴奏播放器的四種演出模式共用同一套資料模型;輸出格式 WAV/FLAC/MP3(320kbps),取樣率 48kHz(可選 44.1kHz)。
- **與 EliteSand Pro 的技術路線比較**:EliteSand Pro 是「CUDA 主線(PyTorch,需另外下載 ~2.5GB wheel)+ WebGPU 備援(獨立 ONNX 模型,onnxruntime-web)+ CPU」三層,兩套引擎、兩套模型檔案;歌回救星是「MDX 用純 C++ sherpa-onnx CLI 走 DirectML/CPU 雙執行檔、HP 用獨立 PyInstaller Python worker」,同樣兩條路徑但**不需要為不同 GPU 廠牌準備不同模型**,交付方式(sherpa-onnx 是社群成熟的 C++ 推論框架,非自行維護的 supervisor/worker Python 架構)也更輕量。兩者在使用者可感知的功能面(選模型、批次處理、GPU 加速、CPU 回退)相近,差異主要在底層工程選型。

**新增:進階直播音訊子系統**(`v2.1.0.0`,2026-09-02,標記為「重大更新」;本輪已交叉核對 `advanced-streaming.md` 完整手冊頁面與更新 manifest 的實際檔案,細節遠比首次調查掌握的更深):

- **15 顆內建人聲效果器**,手冊逐一列出用途:Input Gain、Background Attenuation、Noise Gate、Compressor、Equalizer、Saturation、Air Enhancer、De-esser、Voice Changer、Harmony、Doubler、Delay、Reverb、Shimmer、Limiter——每顆都有簡易/進階雙模式與即時訊號圖。
- **VST3 Plugin 主機**:每個 Profile 最多可混合內建效果與 **8 個 VST3 插槽**,參數 state 隨 Profile 一起保存;manifest 內確認有獨立 `Vst3ScannerHelper.exe`——VST3 掃描被隔離成獨立行程,避免第三方外掛崩潰拖垮主程式,是專業 DAW 常見的防呆設計。
- **ASIO 路由與健檢**:manifest 確認 `S3SAsioBridge.exe`、`S3SAsioProbe.exe`、`S3SAudioDeviceScanner.exe` 皆為獨立執行檔(同樣是行程隔離設計)。手冊詳述「App Buffer 健檢」機制(快速健檢測 512/1024 frames 約 25 秒,完整健檢測 128/256/512/1024 frames 約 5 分鐘),128/256 等低延遲值需連續兩輪嚴格觀察通過才會被判定為已驗證——這是會考慮實際音訊中斷率的正式驗收流程,不是單純暴露一個數值滑桿。
- **五軌 Meter**:BGM/伴奏、人聲(Profile 後、Mix 前)、直播輸出、BGM/伴奏監聽、人聲監聽,直播輸出另有 3 秒短期 LUFS-S 讀數。
- **錄音**:可選錄「完整輸出」(沿用正式 Stream Output 時間軸)或「監聽內容」,WAV 16-bit/24-bit PCM/32-bit Float 三種格式。
- **歌曲標籤自動切換 Profile**:歌曲列表可對每首歌指定效果鏈,播放時自動套用。
- **⭐ 確認有真正的原生 OBS 音訊 plugin,不只是虛擬音訊裝置**:更新 manifest 內有完整的 `ObsConnector/` 套件——`S3SObsConnectorInstaller.exe` 安裝程式,以及編譯好的 **`s3s-obs-audio.dll`**(內附 en-US/ja-JP/ko-KR/zh-CN/zh-TW 五語 locale 檔)。手冊(`advanced-streaming.md` 的「OBS DIRECT OUTPUT」段落)說明:安裝此 plugin 後,OBS 內會出現一個名為「Singing Stream Savior 音訊」的音訊來源,直接接收 Stream Output,不需要再透過虛擬音訊裝置轉接;另一條路徑才是 VB-CABLE 等第三方虛擬音源(手冊附完整第三方安裝教學,並明確聲明「本程式不會替你下載、執行或變更驅動」)。**這是本輪最關鍵的修正**:先前兩輪研究都寫「歌回救星與 EliteSand Pro 皆無原生 OBS plugin,只有 Browser Source」,這句話對**歌詞/歌單視覺疊層**仍然正確(那條路徑確實是 Browser Source),但**音訊輸出**這條線,歌回救星已經有一個會安裝進 OBS plugins 目錄、直接連結 libobs 的真正原生 plugin——EliteSand Pro 和 Utawakui 都沒有對應物。
- **音質管線細節**:授權清單同時列出 SoundTouch(LGPL-2.1,含一份 `SoundTouch-2.4.0-S3S.patch` 自訂修改)與 Signalsmith Stretch/Linear(MIT)——代表歌回救星**兩套算法都有保留**,不是單純用 Signalsmith 取代 WSOLA;推測是依情境分工(例如即時預覽/低延遲路徑用 WSOLA,離線/高品質輸出用 Signalsmith 的頻域算法),實際分工方式手冊未說明,需要保留為待確認項,**不宜直接斷言歌回救星的即時 pitch/tempo 體感音質全面優於 EliteSand Pro 與 Utawakui**——公開評測顯示 Signalsmith 演算法本身音質優於 WSOLA 是成立的,但「哪個路徑實際套用哪個演算法」仍是推測。
- 新增「System utility mode」低視窗佔用模式(與既有 System Tray 模式的關係,官方手冊未完全釐清是否為同一機制)。
- 全域鍵盤快捷鍵(播放/Key/速度/Profile 切換),不受目前所在模式限制。

**歌詞**:

- 來源:LRCLIB、YouTube 字幕/自動字幕,本機手動匯入;格式 LRC/SRT/VTT/純文字/YouTube CC。
- 時間校正:「歌詞太晚→提前」/「歌詞太早→延後」+ 毫秒滑桿。
- **動態歌詞樣式從個位數擴張到 9 種**:`v2.1.4.0`(2026-09-11)一口氣新增 7 種(Kinetic Type、Prism Cut、Lumen Drift、Ink Cascade、Silk Script、Verse Stack、Glyph Motion),`v2.1.3.2` 新增 Classic Karaoke 逐字填色與 Vertical Verse(直式歌詞),`v2.1.4.2`(2026-09-13)再新增 Letter Spread、Stagger Signal。
- 日文平假名/羅馬拼音、韓文羅馬拼音(顯示於原句下方,保留詞間空格),皆離線處理。
- **新增版面編輯器**(`v2.1.3.2` 起):歌詞顯示區可即時拖曳/縮放,同步反映到 OBS。
- **新增 YouTube Screen 視窗**(`v2.1.4.3`,2026-09-14):與播放/暫停/seek/變速同步——印證首次調查筆記提到的「YouTube 影片同步視窗」預告已經上線。

**OBS 與主題**:

- 4 步驟流程:選主題→預覽狀態(Now Singing/Set List/Reserve)→調整主題支援項目→拖進 OBS 或複製 Browser Source 路徑,基本疊層不需 WebSocket。
- **主題數量擴張**:基礎 9 種(Default、Transparent Black/White(v1/v2)、Card、CD、Signal Line、Stage Caption)+ 進階 6 種——`v2.1.4.0` 新增 5 種「歌單主題」(Signal Veil、Signal Tide、Cue Line、Margin Set、Oblique Plate,其中 Signal 系列以實際播放音訊驅動波形/光點動畫),`v2.1.4.2` 再新增 Oblique Stream(極簡透明主題)。
- 版面編輯器(`v2.1.3.2` 起)支援拖曳/等比縮放主題框、對齊輔助線,即時同步 OBS。
- 跑馬燈滾動方向改為單向(`v2.1.4.2`:捲到底暫停後從頭開始,取代原本雙向乒乓式)。

**OBS WebSocket 整合**(重新確認,**範圍與首次調查一致,未擴張**):

- 需 OBS Studio 28+(內建 obs-websocket)。
- 功能仍**僅限讀取直播實際時間戳**,記錄伴奏開始時間,顯示於相容的 Set List 主題(僅對已唱曲目,不含待播)。
- 手冊全文檢查後**沒有找到任何場景切換或來源控制功能**——明確是單向時間戳擷取,不是遠端控制/automation 整合,與首次調查判斷相同。

**工作區模式**:

- 完整/精簡/迷你/System Tray 四種,`Ctrl+Shift+M` 循環切換,與首次調查一致。
- `v2.1.0.0` 新增的「System utility mode」與既有 System Tray 模式的關係手冊未完全釐清,可能是同一機制的改名或额外選項。
- `v2.1.4.3` 迷你模式的歌詞視窗/YouTube Screen 按鈕改為單色圖示。

**發布與隱私**:

- 免費 ZIP 發布,獨立 Launcher 元件負責更新(版本化資源包、雜湊驗證、`v2.1.3.2`/`2.1.4.1` 起支援「僅重下載變動檔案」增量邏輯、`v2.1.4.1` 起分一般/建議/緊急三種更新等級)。
- 8 步驟首次使用導覽(`v2.0.2.0` 起),可從 Help 選單重開。
- 專案檔 `.bgmsproj`;無正式隱私權政策公開頁面,僅有「不要把密碼/OBS WebSocket 憑證/API key 寄給客服」的提醒。
- 匯入歌曲的法律免責聲明維持:「僅建立播放項目,不代表取得音樂版權」。
- 介面語言:繁中/簡中/英/日/韓。

### 5.3 對 Utawakui 的啟發(第三輪更新)

首次調查已提出的 BGM/伴奏雙 lane、無伴奏演出、工作區模式、歌詞視窗點擊跳播、主題能力宣告等借鑑點依然成立。第二輪新增的啟發(recipe 多模型選擇、BGM 交接狀態機、樣式擴張的低風險模式、Launcher 增量更新)維持有效。本輪(挖 GitHub repo 原始 manifest 後)新增:

- **原生 OBS 音訊 plugin 是目前唯一被證實、EliteSand Pro 與 Utawakui 都沒有的能力**。Utawakui `docs/architecture.md` 目前的 External adapters 只有實驗性 Spout2 Lyrics sender(視覺輸出);歌回救星額外做了一個連結 libobs 的音訊 plugin,讓 Stream Output 直接以 OBS 音訊來源身分出現,不需要 VB-CABLE 這類第三方虛擬音訊裝置。如果 Utawakui 未來評估「輸出品質高於 Browser Source」的方向,這是比 Spout2(畫面)更早該考慮的音訊對應物——尤其歌回救星的手冊把「安裝/移除 OBS plugin」做成一鍵操作(偵測標準版/Portable OBS 資料夾),使用者導入成本控制得不錯,值得參考其 UX 設計而非只看技術可行性。
- **VST3/ASIO 相關的行程隔離設計**(`Vst3ScannerHelper.exe`、`S3SAsioBridge.exe`、`S3SAsioProbe.exe`、`S3SAudioDeviceScanner.exe` 皆為獨立執行檔)是一個可直接參考的架構模式:任何會載入第三方原生程式碼(VST3 外掛、ASIO 驅動)的功能,都不在主行程內執行,崩潰只影響該獨立行程。Utawakui 現有的 Provider Python / Audio Python 兩個獨立 runtime family 已經是同一種精神,如果未來考慮原生音訊外掛支援,這個先例值得依樣照搬。
- **App Buffer 健檢機制**(快速/完整兩級,低延遲值需連續兩輪嚴格觀察才判定為已驗證)是「音訊延遲設定」這種難以一次講清楚的功能,用「分級驗收+持續觀察」取代單純暴露數值滑桿的一個好範例,對 Utawakui 任何未來牽涉即時音訊路徑的設定 UI 都有參考價值。
- **SoundTouch 與 Signalsmith Stretch/Linear 並存**這件事本身是個提醒:Utawakui 與 EliteSand Pro 目前都只有 WSOLA(`@soundtouchjs/audio-worklet`)一條路徑,若使用者對音質有更高要求(尤其大幅變速時),歌回救星至少展示了「兩套算法依情境切換」是業界可行的做法,但**在沒有實機盲測前,不應假設歌回救星的實際聽感必然更好**——這只是「他們有選項,我們沒有」的架構差距,不是已驗證的音質結論。

需要留意處與前兩輪結論相同:YouTube 匯入、線上歌詞、OBS lyrics/setlist 均應維持 gate;**AI 人聲分離、虛擬音訊路由與新確認的原生 OBS plugin,同樣屬於「處理後素材」與「原生程式碼執行」的雙重風險範圍**,需與 EliteSand Pro 一併納入 Utawakui 對此類功能的產品邊界討論。

### 5.4 合法性與產品邊界

與前兩輪結論相同,本輪新增兩項:

- **內建人聲分離(MDX/HP 模型)與虛擬音訊路由**——分離產物與 Advanced Streaming Mode 的多軌錄製功能,使「加工後音訊被進一步擷取/推流」的路徑比純播放器更直接,風險型態與 EliteSand Pro 的人聲分離功能相近。
- **VST3 SDK 與 ASIO SDK 的授權條款需要留意**:使用者提供的授權清單將 Steinberg VST3 SDK 列為 MIT,但 manifest 內的實際授權檔名是 `Steinberg-VST3-SDK-MIT.txt`,而 ASIO SDK 的授權檔名是 `Steinberg-ASIO-SDK-GPL-or-Proprietary.txt`——兩者授權條件不同,且 Steinberg 對外散布使用其 SDK 的軟體向來有品牌與再散布限制(例如 VST 相容性認證要求),這不是單純的寬鬆開源授權,若 Utawakui 未來考慮 VST3/ASIO 這類專業音訊介面整合,需要另外查證 Steinberg 官方的散布條款,不能只看 SDK 授權檔名稱。libobs(GPL-2.0-or-later)也代表任何連結它的原生 plugin 理論上需符合 GPL 的散布條件,這對 Utawakui 若考慮自製原生 OBS plugin 是需要一併評估的法遵成本,而非只有工程成本。

## 6. 功能矩陣(2026-09-15 全面重算)

| 功能 / 產品                          | Setlista              | EliteSand Pro                                     | 歌回救星                                                          | Utawakui 現況                           |
| ------------------------------------ | --------------------- | ------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------- |
| 本機曲庫                             | 無                    | 有                                                | 有                                                                | 已實作                                  |
| 播放器                               | 無                    | 有                                                | 有,BGM/伴奏分離                                                   | 已實作                                  |
| BGM 自動交接                         | 無                    | 未作為主要公開賣點                                | 有(核心賣點,近期仍在修穩定性)                                     | 未納入 spec                             |
| 播放佇列 / 待播                      | Reserve / Set List    | 有                                                | 待播 / 已唱                                                       | 已實作 queue / playlists                |
| OBS setlist                          | 核心功能              | 有                                                | 有,6 種主題新增於本輪                                             | MVP 已實作(3 固定 slot)                 |
| OBS lyrics                           | 無                    | 強,12 個模板(11 風格化 + classic)                 | 強,9 種動態樣式(一個月內從個位數擴張)                             | MVP 已實作,6 種 presentation profile    |
| 歌詞自用視窗                         | 無                    | 有類似 prompter/lyrics                            | 有,含版面編輯器                                                   | 已實作 Self-View                        |
| 歌詞 provider                        | 無                    | 多來源(BetterLyrics/Apple/酷狗/QQ/LRCLIB/網易)    | LRCLIB / YouTube captions / local                                 | 多來源(LRCLIB/NetEase/Better Lyrics)    |
| Pitch / tempo                        | 無                    | 每曲保存                                          | 每曲保存                                                          | 已實作即時 preview                      |
| **Vocal separation**                 | 無                    | **已實作,三層 GPU/WebGPU/CPU(RoFormer)**          | **已實作,MDX/HP 多模型+GPU 加速(本輪新增)**                       | 已實作(quick/general recipe)            |
| 進階直播音訊(效果器/VST3/ASIO)       | 無                    | 無                                                | **已實作:15 內建效果器+8 VST3 插槽/Profile+ASIO 健檢**            | 未納入 spec                             |
| 原生 OBS 音訊輸出(非 Browser Source) | 無                    | 無                                                | **已確認:`s3s-obs-audio.dll` plugin(連結 libobs)+ VB-CABLE 備援** | 未納入 spec(僅視覺面有 Spout2)          |
| YouTube 匯入 / 下載                  | 無                    | 核心功能                                          | 有                                                                | 已實作 provider path,規格要求進階 gate  |
| Twitch 點歌                          | 無                    | 強(Device Code Flow + EventSub)                   | 未見                                                              | 明確排除                                |
| 手機遙控                             | 無                    | 有                                                | 未見核心                                                          | 未納入近期 spec                         |
| Stream Deck                          | 無                    | HTTP API                                          | 未見                                                              | Phase 3 評估                            |
| Timestamp / chapter                  | 有,3rd + onecomme     | 有                                                | 有,OBS WebSocket(範圍未變:僅時間戳,無場景控制)                    | 規劃中 recording / VOD mode             |
| Theme / skin                         | 強,窄場景             | 強,12 個模板                                      | 強,15 個主題(本輪 +6)                                             | 6 種 presentation profile               |
| 原生輸出(視覺,非 Browser Source)     | 無                    | **實驗性 Spout2(env flag 閘門,未公開列為功能)**   | 無                                                                | 實驗性 Spout2(`Utawakui.Lyrics` sender) |
| 更新簽章/驗證                        | 不適用(純 Browser 端) | **已實作:非對稱簽章 manifest + artifact SHA-256** | 已實作:雜湊驗證 + 增量/分級更新                                   | 未完成(unsigned updater runtime)        |
| Installer / release                  | Browser-based / BOOTH | Installer / updater,已越過 v1.0.0                 | ZIP release,獨立 Launcher                                         | 尚未完成簽章驗收                        |

**本輪矩陣最大的兩個變化**:(1)vocal separation 一列,首次調查時 EliteSand Pro「未見」、歌回救星「無」,Utawakui 是矩陣中唯一實作方,**現在三個「有播放核心」的產品全部都有人聲分離**;(2)新拆出的「原生 OBS 音訊輸出」一列,是三個仍在開發的產品中**目前唯一由歌回救星獨佔**的能力——EliteSand Pro 的 Spout2 與 Utawakui 的 Spout2 都只處理視覺輸出,音訊仍是系統音訊裝置層級,沒有對應的原生 OBS plugin。這兩點在 §9 結論詳細展開。

## 7. 合法性疑慮對照

### 7.1 Provider download / YouTube

沿用首次調查結論,YouTube 官方政策禁止未經書面同意 download/import/backup/cache/store copies of YouTube audiovisual content,也禁止 offline playback。三競品對照無變動:Setlista 不碰、EliteSand Pro 核心功能風險最高、歌回救星中高、Utawakui 已規劃移至 provider flow gate。

### 7.2 Lyrics / captions / visual display

沿用首次調查結論。新增觀察:歌回救星動態歌詞樣式一個月內從個位數擴張到 9 種,顯示歌詞視覺呈現本身不是主要法遵風險點(風險仍在歌詞文字內容是否取得授權),Utawakui 若要擴充 presentation profile 數量,可以不必因樣式數量本身而卻步。

### 7.3 Audio processing / pitch / vocal separation(本次重點更新)

首次調查寫「EliteSand Pro:未見 vocal separation 核心賣點」「歌回救星:每曲保存 key/speed,偏播放體驗」——**兩者皆已過時**。現況:

- **EliteSand Pro**:三層 GPU/WebGPU/CPU 引擎,CUDA 主線需另下載 PyTorch(~2.5GB),模型為第三方訓練權重(Kim Mel-Band RoFormer、musetric ONNX),產品文件標示「實驗性、預設關閉」。
- **歌回救星**:MDX 走 sherpa-onnx CLI + ONNX Runtime + DirectML(無 CUDA/torch 依賴,manifest 逐檔確認),HP 走獨立 PyInstaller 凍結的 Python worker;分離結果可直接匯入回歌曲庫成為伴奏——**產品化程度比 EliteSand Pro 更深**(EliteSand Pro 的分離結果用途偏向「取得乾淨伴奏/人聲用於監聽或後製」,歌回救星則是把分離結果直接接回核心播放/伴奏資料模型)。DirectML 的通用 GPU 廠牌覆蓋率,是三者中對使用者硬體要求最寬鬆的一條路線。
- **Utawakui**:`quick`/`general` recipe,獨立 FFmpeg/model lifecycle,四聲道固定聲道序(accompaniment L/R、guide vocal L/R)。

三者都不是天然非法,但公開使用時都要回到使用者素材權利與平台政策——**這點現在對三個產品同等適用,不再是 Utawakui 獨有的風險/差異化項目**。

Utawakui 建議(更新):

- 保持「本機 generated media」語言,不稱為可散布素材——這條原則現在同樣值得在 Utawakui 的產品文件裡對照競品說法,確認自己的用語沒有比競品更寬鬆。
- Stems/separation 輸出不提供分享或上傳功能。
- 既然三個產品都做了人聲分離,Utawakui 的差異化重點應轉向「recipe 分層(quick/general/refined)與 gate 治理的嚴謹度」,而非「是否有這個功能」本身——詳見 §9。

### 7.4 Public output / OBS / VOD

沿用首次調查結論,無新增風險面;新增兩項觀察:

- EliteSand Pro 的 Spout2 原生輸出與歌回救星的虛擬音訊路由(VB-CABLE),都是「繞過 OBS Browser Source 的替代輸出管道」,這類管道本身風險中性,但需要確認其資產/音訊來源仍遵守相同的 allowlist 與 gate 原則——不能因為換了輸出管道就繞過既有的 public output 治理。
- 歌回救星的**原生 OBS 音訊 plugin**(`s3s-obs-audio.dll`)是三者中風險性質不同的一項:Browser Source 內容執行在 OBS 內建的 CEF(Chromium)渲染器沙箱裡,plugin 崩潰只影響那個來源;原生 plugin 則是直接載入 OBS 主行程的原生程式碼,崩潰或安全問題有機會影響整個 OBS 行程。這不是說原生 plugin 本身不安全(libobs plugin 是 OBS 官方支援的擴充機制,大量正式外掛都是這種形式),而是風險評估模型不同——Utawakui 若未來考慮同類原生輸出(不論音訊或畫面),需要用「原生 OBS 行程內程式碼」的標準做審查,不能沿用 Browser Source allowlist 那一套。

### 7.5 Chat request automation

沿用首次調查結論,無變動:EliteSand Pro 是唯一有完整 Twitch 點歌流程的競品,Utawakui 明確排除跟進。

## 8. 競品完成度排序(2026-09-15 第三輪:改用雙軸評估)

前兩輪用單一「完成度」排序,把 EliteSand Pro 列第一。本輪深挖歌回救星的原始 manifest 後,單一排序已經不夠精確——兩者在不同軸線上互有領先,合併成一個名次會掩蓋真正對 Utawakui 有意義的資訊。改用兩個軸線分開評估:

### 軸線一:功能覆蓋廣度(歌詞來源、外部整合、產品範圍)

**第 1 名:EliteSand Pro**——六個歌詞來源(BetterLyrics/Apple Music/酷狗/QQ音樂/LRCLIB/網易雲)並行搜尋、來源中立排序,逐字歌詞準確性的覆蓋面是三者中最廣;加上完整 Twitch 點歌流程(Device Code Flow + EventSub)、手機遙控、Stream Deck,產品範圍最大。但原始碼內留有多處實機踩坑修補的痕跡(asar 打包後腳本讀不到、supervisor 預設值吃錯 python 導致分離功能整個掛掉、WebGPU 模型上游換檔名沒 pin 死就 404),交付方式偏向「快速迭代、線上發現線上補」,與**歌詞來源廣度**這個真實優勢分開看待。

**第 2 名:歌回救星**——歌詞來源目前只有 LRCLIB + YouTube 字幕兩種,明顯窄於 EliteSand Pro;也未涉足 Twitch 點歌。

**第 3 名:Setlista**——維持原判斷,產品範圍刻意窄。

### 軸線二:核心音訊/播放工程完整度(交付方式、原生整合深度、行程隔離設計)

**第 1 名:歌回救星**——本輪從更新 manifest 逐檔確認:MDX 分離走成熟的 sherpa-onnx C++ CLI(CPU/DirectML 雙執行檔,通用 GPU 廠牌,無 CUDA 依賴),HP 分離走獨立凍結 Python worker;VST3 host(8 插槽/Profile)、ASIO 路由與「快速/完整健檢」驗收流程、五軌 LUFS-S meter、多格式錄音,全部是專業音訊軟體等級的功能,且 VST3 掃描/ASIO 橋接/裝置掃描都拆成獨立行程(崩潰隔離,不拖垮主程式);更確認有真正連結 libobs 的原生 OBS 音訊 plugin(`s3s-obs-audio.dll`),交付方式(Qt 原生應用 + PyInstaller 凍結 Python + 分元件更新包)整體比 EliteSand Pro 更接近傳統桌面軟體工程,而非「Electron 網頁應用外掛 Python sidecar」。但 BGM/伴奏交接這個最核心的歌回賣點,`v2.1.3.2`(2026-09-11)的更新日誌顯示近期才修復穩定性 bug,說明快速擴張的同時核心體驗仍在打磨。

**第 2 名:EliteSand Pro**——AI 分離的模型與批次 UI 做得完整,但 CUDA 主線需要使用者下載 ~2.5GB PyTorch wheel,GPU 廠牌覆蓋率(WebGPU 備援路徑)不如歌回救星的 DirectML 通用性;沒有原生 OBS plugin、沒有 VST3/ASIO 整合,pitch/tempo 仍是 WSOLA 單一路徑。

**第 3 名:Setlista**——不涉及此軸線,不參與排序。

### 綜合判斷(呼應使用者的觀察)

**這與「EliteSand Pro 廣接來源、歌詞逐字準確性佔優,但工程風格偏向快速迭代;歌回救星音訊輸出工程更完整,是更適合對標工程完整性的對手」的判斷方向一致,且本輪的原始碼/manifest 級證據比前兩輪更扎實。** 兩者不是誰全面贏過誰,而是各自在不同維度上更成熟——Utawakui 若要對標,「歌詞覆蓋廣度」該看 EliteSand Pro,「音訊管線工程完整度與原生整合深度」該看歌回救星,兩邊都不該被合併成一個籠統的「誰做得比較好」。

## 9. 對 Utawakui 的產品結論(2026-09-15 第三輪更新)

### 9.1 最重要的變化:vocal separation 不再是 Utawakui 的獨佔差異化,原生音訊輸出也不再是

首次調查(2026-08-13)的結論之一是把 vocal separation 列為 Utawakui 相對 EliteSand Pro 的差異化強項。**這個前提已經不成立**:EliteSand Pro 上線了三層 GPU/WebGPU/CPU 人聲分離引擎,歌回救星也上線了 MDX(sherpa-onnx+DirectML)/HP(獨立 Python worker)人聲分離並直接整合進伴奏資料模型。三個仍在積極開發、覆蓋完整歌回工作流的產品(EliteSand Pro、歌回救星、Utawakui)**現在全部都有本機人聲分離**。

本輪深挖後,還有第二個需要下修的差異化假設:**「原生輸出」不再是 Utawakui 獨有或領先的方向**。Utawakui 的實驗性 `Utawakui.Lyrics` Spout2 sender 處理的是畫面輸出;歌回救星已經有一個會安裝進 OBS plugins 目錄、實際連結 libobs 的原生**音訊** plugin(`s3s-obs-audio.dll`),搭配 VST3 host、ASIO 路由與行程隔離的崩潰防護設計——這條「繞過 Browser Source 做更深度原生整合」的路,歌回救星在音訊這一側走得比 Utawakui 和 EliteSand Pro 都遠。

這不代表 Utawakui 應該放棄或降低這些投資,而是**差異化的論述需要換位置**:

- 不能再說「我們有 vocal separation/原生輸出,別人沒有」。
- 可以說的是「recipe 分層治理」(`quick`/`general`/`refined` 三層,各自獨立 gate 與 benchmark 驗收,而非一次性全開)、「四聲道固定架構」(accompaniment L/R + guide vocal L/R,與播放/queue/Output 架構原生整合,而非附加功能)、「local-first 的 gate 透明度」(每個 active dependency 對應已註冊 gate,使用者清楚知道正在下載/啟用什麼)——這些是 Utawakui spec 已經在做、但競品文件裡沒有對應描述的治理層面差異。
- 建議產品側重新檢視 `docs/spec.md`/`PRODUCT.md` 中任何隱含「vocal separation 是差異化賣點」的敘述是否需要調整措辭,改為強調架構與治理層面的差異,而非功能有無。

### 9.2 三者定位不是單一排名,是三個不同的對標對象

依 §8 的雙軸評估,三個競品現在對 Utawakui 分別代表不同的參考座標,不宜再用單一「誰做得比較完整」概括:

- **EliteSand Pro = 歌詞覆蓋廣度與逐字準確性的對標對象**,但工程交付風格偏快速迭代(原始碼內大量實機踩坑修補痕跡),不是穩定性的對標對象。
- **歌回救星 = 工程完整性與音訊管線深度的對標對象**——VST3/ASIO/libobs 原生整合、行程隔離的崩潰防護、DirectML 通用 GPU 加速、分元件簽章更新,整體交付方式比 EliteSand Pro 更接近傳統桌面軟體工程。但歌詞來源窄(僅 LRCLIB+YouTube 字幕),且核心 BGM/伴奏交接近期仍在修穩定性 bug,不是「全面比 EliteSand Pro 好」。
- **Setlista = 低導入成本與窄場景打磨的對標對象**,範圍最小但沒有明顯技術負債。

### 9.3 兩個競品的更新/簽章系統都比 Utawakui 完整

EliteSand Pro 有非對稱簽章 manifest + artifact SHA-256 雙層驗證,歌回救星有獨立 Launcher + 分元件(application-runtime/uvr-mdx/uvr-hp-models)雜湊驗證 + 分級更新(一般/建議/緊急)。Utawakui 的 `docs/architecture.md` 明確記錄「`signExecutable`/`verifyUpdateCodeSignature` 為 false」。這是目前兩個競品都領先 Utawakui 的可驗證面向之一,建議列入近期優先序評估。

### 9.4 短期建議(第三輪更新)

- 完成 local import first,讓本機媒體優先真的成為預設入口——仍未完全落地。
- 建立/落實 feature notice、gate,把 provider、lyrics、audio processing、public output 拆清楚——現況已優於首次調查時。
- 更新簽章與連續版本 update acceptance 驗證,優先序應提高——兩個主要競品都已有可運作的方案可參考。
- 評估 recipe 分層(quick/general/refined)與 gate 治理是否已經是清楚、可對外溝通的差異化敘述,而不只是內部架構文件裡的描述。
- **原生輸出方向如果要投入,音訊比畫面更值得優先評估**——歌回救星已示範「原生 OBS plugin + VST3/ASIO」這條路徑技術上可行且已有使用者導入 UX(一鍵安裝/移除、自動偵測 OBS 資料夾),但也要一併評估 §5.4 提到的 libobs(GPL-2.0)與 Steinberg SDK 授權的法遵成本,不能只看工程可行性。
- 不追 Twitch 點歌 automation、不追虛擬音訊路由/進階效果器子系統——這些是歌回救星與 EliteSand Pro 各自往「全功能整合」擴張的路徑,與 Utawakui local-first、gate 分層的產品邊界方向相反;若要局部借鑑,應優先參考其行程隔離設計模式,而非直接複製功能範圍。
- 若未來評估 BGM lane 類功能,參考歌回救星近期仍在修的交接穩定性 bug,把邊界情境(暫停時機、快速切歌、交接中斷)當一等公民設計,而非事後補丁。

## 10. Review

第二輪已完成(2026-09-15):

- 重新讀取 `docs/spec.md` 現行狀態表。
- 重新掃描 `E:\elitesand-pro`(git HEAD、`package.json`、`ai/`、`server/services/ai-*.js`、`server/services/webgpu-runtime-provider.js`、`native/spout-output/`、`public/js/lyric-template-*.js`、`server/services/twitch-service.js`、`server/services/update-signature.js`、`server/services/signed-update-artifact.js`、`ai/haqumei_sidecar.py`),逐項核對首次調查與初步 agent 摘要的每個具體宣稱。
- 以 `git log`/`git tag` 確認 EliteSand Pro 與歌回救星本機手冊倉庫的實際版本演進。
- 改用歌回救星公開手冊站(非本機已過期手冊快照)取得現況,交叉比對 changelog 全部 26 個版號。
- 重新查核 Setlista 公開頁面,確認半年未變動。

第三輪已完成(2026-09-15,同日):

- 使用者提供歌回救星應用程式內建的第三方授權清單,據此重新評估其技術棧深度。
- `git clone` 兩個公開倉庫至本機逐檔核對:[Singing-Stream-Savior-Manual](https://github.com/NoonIsAwesome/Singing-Stream-Savior-Manual)(手冊原始碼,含第二輪 WebFetch 未掃到的 `advanced-streaming.md`、`uvr-vocal-removal.md`、`open-source.md` 等頁與 `_data/*.yml`/`*.json`)、[Singing-Stream-Savior-Updates](https://github.com/NoonIsAwesome/Singing-Stream-Savior-Updates)(`updates/stable.json` 更新 manifest,含每個元件的實際檔案路徑、大小與 SHA-256)。
- 逐檔確認 manifest 內的執行檔與模型檔名(`sherpa-onnx-offline-source-separation.exe`、`S3SHpWorker.exe`、`UVR-MDX-NET-Inst_HQ_3.onnx`、`2_HP-UVR.onnx`、`s3s-obs-audio.dll`、`S3SAsioBridge.exe`、`Vst3ScannerHelper.exe` 等),搜尋全文確認manifest 內無任何 `cuda`/`torch` 字樣。
- 以 WebSearch 查證 sherpa-onnx(k2-fsa)專案定位(含 source separation 能力)與 Signalsmith Stretch vs. WSOLA 的公開音質評測,作為技術判斷的外部佐證。
- 比對 Utawakui 自身 `package.json` 確認同樣使用 `@soundtouchjs/audio-worklet`(WSOLA 家族),避免只指出競品技術而漏了 Utawakui 自身的對應狀態。
- 重寫 §8 完成度排序為雙軸評估(功能廣度 vs. 音訊工程完整度),取代前兩輪的單一排名。

限制:

- EliteSand Pro 依本地閉源前資料盤點,未使用公開網站交叉驗證(與首次調查相同限制)。
- 歌回救星的手冊與更新 manifest 皆為廠商自行發布的公開資料,manifest 的檔案清單與雜湊值可信度高(是實際發布的產物資訊),但**功能行為與實際整合品質**(例如 libobs plugin 的穩定性、VST3 host 的相容性)仍未經第三方或本文作者實機安裝驗證,置信度低於對 EliteSand Pro 原始碼的逐行確認。
- sherpa-onnx 在此產品內的確切用途(是否只用於 source separation,或另有涉及語音辨識/自動歌詞等手冊未提及的用途)本文未能完全確認,列為待釐清項,不宜引用為確定結論。
- 本文只做產品/工程/平台政策層級的風險對照,不做司法管轄區法律結論;VST3/ASIO SDK 與 libobs 的授權分析(§5.4)僅止於提醒法遵成本存在,不是完整法律意見。
- 平台政策原文(YouTube API Services Developer Policies、Twitch Music Guidelines/DMCA FAQ、Spotify Developer Policy)本輪未重新查核,沿用首次調查引用,若這些政策本身有更新,需另行查證。
