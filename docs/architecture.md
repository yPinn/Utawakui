# 現行架構圖

本文件只描述 production code 已採用的 ownership 與 dependency boundaries。產品範圍
以 [spec.md](spec.md) 為準，決策理由保留在 [ADR](adr/)，詳細 protocol 則由 focused
contracts 與 tests 管理。

## Runtime Ownership

| Runtime                                               | 責任                                                                                        | 不可持有                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Electron main (`electron/main/`)                      | Window lifecycle、IPC trust boundary、feature gate enforcement、local services、diagnostics | Renderer reactive state、client-provided filesystem paths       |
| Pure main libraries (`electron/lib/`)                 | Filesystem、provider、processing、dependency 與 sidecar logic                               | BrowserWindow lifecycle、renderer presentation                  |
| Preload (`electron/preload.js`)                       | Intent-based、固定 channel 的窄 IPC bridge；部分 dev-only channel 依 flag 條件註冊          | Node API passthrough、任意 channel 或 path API                  |
| Renderer (`src/`)                                     | Vue UI、interaction、player／queue／lyrics owners                                           | Node／Electron import、dependency URL、model 或 executable path |
| Performer window (`electron/main/performerWindow.js`) | 第二個 sandboxed BrowserWindow：Self-View 呈現、獨立 preload、snapshot 讀取                 | Core playback／queue／lyrics 權威狀態                           |
| Shared (`shared/`)                                    | Scalar JSON contracts 與純 cross-runtime presentation projections                           | Filesystem、Electron、browser globals、mutable service state    |
| Browser Source (`overlay/`)                           | OBS delivery adapters、DOM rendering 與獨立 visual tokens                                   | Control-panel tokens、canonical product-state ownership         |
| Spout helper (`electron/main/spoutHelperEntry.js`)    | Windows offscreen Lyrics surface、native Spout sender、texture release                      | Core state、renderer IPC、Spout receiver ownership              |

`electron/main.js` 是 composition root：設定 app identity、註冊 privileged scheme、建立
services，再將具名 dependency 注入各 domain handler。Handler 不以共享 context blob
隱藏依賴，也不彼此直接協調；跨 domain 流程由 composition root 建立的 service 負責。

主視窗 density 由 `electron/main/windowState.js` 的原生 `BrowserWindow` 狀態擁有：
windowed／restored 投影 `compact`，maximize／full-screen 投影 `standard`。初始 bounded 值
經 `additionalArguments` 同步提供給 preload，後續只透過固定 `ui-density:changed` channel
更新；`src/composables/useUiDensity.js` 驗證後寫入 document root。Renderer 不取得
`BrowserWindow`、不依 viewport 猜測狀態。現行 active tokens 不消費 density attribute，
只有 opt-in Token v2 surface 會改變尺寸，因此此投影不代表 production Token v2 adoption。
該 surface 由 dev-only 型錄視圖（`DemoView.vue`／`VisualSystemView.vue`／
`StudioLibraryPrototypeView.vue`）呈現；owner 檢查順序與現況見
[Token v2 元件檢查契約](contracts/token-v2-component-review.md)，本文件不重複其細節。

Windows notification-area lifecycle 由 main-owned
`electron/main/windowsTrayController.js` 持有；`windowState.js` 仍是唯一主
`BrowserWindow` owner。`windowCloseBehavior` 是 `ask`／`tray`／`quit` 三態 machine config，
預設 `ask`；Renderer 只經固定 config IPC 提交 allowlisted intent。`ask` 由 main 產生一次性
request id，再透過 `electron/main/windowCloseDecisionBridge.js` 請 Renderer 以 production
`UiModal` 呈現背景執行、完全結束、取消與記住選擇。Bridge 只接受目前主視窗 sender、目前
request id、`tray`／`quit`／`cancel` 與 boolean；Renderer 只負責呈現，Tray、config、hide 與
quit 仍由 main 執行。若 Renderer 未在期限內確認已呈現、失去回應或已毀損，才退回 main-owned
Windows 原生 dialog，避免關閉流程因 UI runtime 故障而鎖死。背景執行先確保 Tray 可建立，再
隱藏同一個主視窗，因此 renderer-owned 播放／queue／lyrics 與 OBS／Output service 不會重建；
未記住的一次性 Tray 在視窗還原後銷毀。最小化行為不變。Tray 開啟、設定、雙擊與
second-instance 都 restore／show／focus 同一視窗；設定動作另送固定 `settings` 導頁事件，
不接受任意 route。Close prompt 維持 single-flight；記住選擇的 config write 或 Tray 建立失敗
時保持視窗可見並顯示 bounded error。
Tray 完整退出、app update install、正常 `before-quit` 及 Windows
`query-session-end`／`session-end` 會先同步設定 sticky quitting state，close handler 才放行；
這讓 updater 先關閉視窗、prompt 延遲完成及 Windows 關機／登出不發 `before-quit` 的路徑
都不會被誤攔為背景隱藏。

Machine config、feature confirmation 與 external navigation 分別由獨立 handler registrar
持有。Renderer 開啟固定說明頁面時只提交 allowlisted target id；provider discovery 則只提交
bounded query，由 `providerDiscoveryHandlers.js` 在 main 建立固定 YT Music search URL 並重查
`provider-flow` gate。Vendor origin／path 均固定在 main，preload 不提供任意 URL API。

OBS WebSocket integration 由 main-owned `obsAdapter.js` 持有。SDK 只在
`obs-integration` 已啟用且 desired state 開啟時 lazy-load；adapter 只讀取版本、直播／錄影
狀態與按需時間戳。連線握手與狀態請求各有期限，逾時會淘汰 transport 再以
bounded backoff 重連；disconnect／reconfigure 會取消進行中工作，舊連線完成不能回寫新狀態。
它不提供任意 OBS request 或 scene／source 寫入。Endpoint scalar 驗證後保存在 machine
config，密碼只由 Electron `safeStorage` 加密後寫入獨立 credential file；OS 加密不可用
時優先拒絕設定變更，Settings 另提供明確的密碼移除動作。密碼不進 config、preset、
renderer state 或 diagnostics。
`sessionHistoryService.js` 消費既有 Output projection 的曲目變更，在 OBS 活動時向 adapter
取得當下時間戳並原子保存本機 session JSON；Renderer 只取得 public projection，並在本機
將場次時間標記投影為 YouTube 章節文字。OBS 顯示直播或錄影中時，`obsPowerSaveBlocker.js` 才啟用
`prevent-display-sleep`，兩者都停止後立即解除。

Titlebar resource projection 由 `appUsageService.js` 每 3 秒發布一次。平時只讀
`app.getAppMetrics()`；只有 `heavyJobScheduler` 忙碌時才透過 Windows process tree 補量
Python／FFmpeg 等 descendants。Renderer 只顯示 bounded CPU／RAM 百分比，不取得程序表，
也不把這份觀測值當成排程或播放權威。

Lyrics IPC 由 `electron/main/lyricsHandlers.js` 保留穩定註冊 facade；實際 channel 依責任
分在 `electron/main/lyrics/`：`documentHandlers.js` 只處理本機歌詞／timing，
`acquisitionHandlers.js` 處理 gated provider、候選與 provider-backed 回填，
`readingHandlers.js` 處理本機 reading worker／sidecar。三者不互相 import，facade 只注入
同一組具名 composition dependencies。

Reading sidecar v3 由 main 持有 `documentId`、normalizer profile、來源 fingerprint 與
line identity。Renderer 載入時只送當前 canonical identity；main 對文字相容的 v1／v2
sidecar 做原子 re-key 並保留人工修正，文字不相容或格式損壞才交回既有重新產生流程。
日文 worker 先由 package adapter 將 kuromoji raw fields 轉成 analyzer-neutral token，再交給
純 reading builder；quality evaluator 與 correction shadow resolver 只存在本機 benchmark
路徑，尚不套用第三方修正、不改 sidecar，也不進 startup critical path。

跨 runtime 的 presentation logic 位於 `shared/presentation/`。`overlay/shared/` 只保留
Browser Source route adapters；Output server 以 exact allowlist 提供兩個目錄的必要檔案，
不把 request path 轉成任意 filesystem path。

Output 外觀欄位由 `shared/outputAppearance.mjs` 單一擁有型別、預設、選項、數值邊界與
模板相容性。所有 template kind 都由 registry 投影這份欄位 metadata；Lyrics 再額外組合
presentation profile 與 availability，非 Lyrics 不依賴該 profile。固定藝術版型只宣告其 CSS
實際消費的欄位，避免無效 control。Electron 在 slot persistence boundary 驗證 recognized
appearance key，Renderer 依模板欄位 metadata 建立 control，Browser Source 則在套用前再次 normalize；enum 只進
root dataset，顏色只接受六位 hex，位置 offset clamp 後才進 `--ovl-*`。這層不依賴控制台
Token v2，Overlay semantic token 也不回頭消費 `--ui-*`。
所有可用模板都以 `paletteId` 取得同一組 bounded semantic palette 選項；Browser Source 的
appearance layer 只重映射 text／surface／stroke／KTV／Kinetic／Manga／Ornate 等既有角色，不覆寫
模板 DOM 或 timing。Workbench 依 `groupOrder`／`order` 固定以色彩、文字、可讀性、背景、版面、
動態、內容顯示排序，空群組省略；間距密度、內容寬度與文字對比仍只在具有實際 CSS consumer 的
模板公開。Ornate 的 raw hex 欄位是 palette 後的進階角色 override，不是全模板共用色票入口。
歌詞呈現策略則由 `lyricsPresentationPolicies.mjs` 另行擁有；它不是 appearance 欄位，也不借用
尚未實作的 Style Set。現行只有 Live Stage 宣告轉播精簡、平衡分行與忠實原文三個 bounded
policy，slot persistence 依 template capability 驗證，Workbench 將它排入「內容顯示」群組，
仍與 appearance normalization 分開。
Renderer 的 `useOutputAppearanceAutosave` 將 Workbench 完整 scalar snapshot 以 350ms
debounce、single-flight 與 latest-wins 規則送入既有 slot persistence boundary；切頁、切換
Output kind 或套用模板前必須 flush，失敗則保留本地 draft 與 retry payload。Persistence
回傳只在狀態重新成為 saved 後同步經正規化的 slot，不得用較舊的 in-flight response 覆蓋
較新的本地輸入。模板套用與 Output runtime settings 仍是明確操作。

Lyrics presentation 分成兩層：第一層保留 canonical 原文與 T0／T1／T2 timing；只有有限
T1 fallback 會經 `lyricsTimingUnits.mjs` 產生唯一共用、無語意標記的 `{ text, weight }`
單元。原有換行、空白與標點無損附著，不在這層判斷斷句、角色或段落。
第二層 `lyricsPresentation.mjs` 才依 versioned Generic／KTV／Kinetic Pop／Ornate Vertical／Manga／Live Stage profile
做模板客製化；Generic 是 identity，其他 profile 才可把換行、標點、speaker label、括號
解讀成 phrase、role、bubble 或 caption page。Browser Source 以 document id、revision、
language、profile id／version 快取靜態結果，`state.mjs` 投影目前 template 的動態 frame
與下一個 boundary。`lyricsTemplateCapabilities.mjs` 是各模板 T1／T2、source mapping、music cue
consumer 與 scheduler wake 的唯一宣告；Workbench metadata 與 runtime 不另維護 template-id
清單。所有 Lyrics profile 都取得同一個 bounded `lyricsRhythm`：它以當前行、
lyrics offset 與 canonical playback clock 對照 current-track M1 cues；只在局部四拍連續、
confidence 至少 0.5 且間距落在 median 的 75%–125% 時輸出 beat-grid phase，否則只以可信
BPM 輸出無 phase cadence，再失敗便完全省略。Runtime 在每個可信 beat boundary 重投影，
但相同歌詞 identity 不重播換句動畫；模板只讀 current／next beat、行內拍序、拍長與限制在
0.75–1.35 的 motion scale，仍保有自己的視覺語彙。Scheduler 只為 capability 宣告的 consumer
喚醒；目前 beat phase／section boundary 只驅動 Classic KTV，Focus Line／Quiet Caption 只讀
bounded cadence，不再讓未消費節拍的模板逐拍重投影。Raw LRC／VTT parser 不進模板，模板
分句不回寫 canonical timing，T2 永遠優先。獨立 Reading Aid profile
仍未開放給 Output；Manga Frame 則可從 `lyrics.document` 的 optional reading projection
取得已存在、identity-matched 的日文 `{ text, reading }` segments。Publisher 只讀 sidecar，
不因 OBS 啟動 reading worker，缺少或 stale 時維持純文字。

Classic KTV 的 karaoke-stack 呈現封裝 `jf-open-huninn-2.1.ttf`（justfont open-huninn
2.1，OFL 1.1）；字型、來源 checksum 與授權隨 `shared/assets/fonts/` 封裝並只經 Output
server exact allowlist 提供，與其他模板字型共用同一分發邊界。

Live Stage profile 在相同 adapter 中提供三個 presentation policy：轉播精簡可移除可判定的
filler／連續重複與 CJK 顯示標點，平衡分行保留內容但重排 rows，忠實原文保留 authored rows。
三者都維持 canonical `sourceText`，不改 line／segment identity。Caption layout 先枚舉完整
1／2、2／1、2／2 候選，再以容量、作者邊界／跨語邊界、附著性與整體幾何選解；不以歌曲
專名例外修補。多頁且有 validated T2 時，`lyricsSourceMapping.mjs` 先把顯示頁文字安全映回
來源區間，再插值作者 segment 時間；映射失敗才使用 T1 視覺權重 page progress。

Manga Frame 的共享 layout contract 以 document language、實際假名或既有 reading segment
投影 `ja`／`other` 呈現提示。Browser Source 與 Renderer 預覽只在 `ja` bubble 套用封裝的
GenEi Antique 6.0a 一般版；ruby `rt` 繼承相同字體，繁中與其他內容維持 profile font
fallback。字型、固定來源 checksum 與 OFL 1.1 授權隨 `shared/assets/fonts/` 封裝，並只經
Output server exact allowlist 提供，不依賴遠端 webfont。

Ornate Vertical profile 同樣留在 Lyrics Output route 內。共享 adapter 以 grapheme
邊界保留原文：連續漢字合成一個 reveal unit，假名逐字，標點附著前一單元，拉丁字母與數字
成詞；整份 document context 只允許一個有足夠證據的漢字群組成為同尺寸藝術詞。視覺長句
可依原文斷點、標點、日文 word／助詞邊界自動拆成至多兩欄，不切連續漢字，也不建立新的
canonical／T2 timing；第一段留在右欄，第二段只向左展開。所有行使用右側安全區的
上／中／下錨點，並只接受受限 X／Y 微調；字型可在封裝的 Hina Mincho 與 GenEi Antique
間選擇，字級與主文字／同尺寸墨影色也由 safe appearance 設定提供。
`ornateVerticalMotion.mjs` 提供 Browser Source 與 Gallery 共用的短
stagger／裁切揭示，不使用位移、旋轉或縮放；換句以 outgoing 完整淡出作為單一 handoff，
incoming 到達該點才進入 DOM，兩個 source line 不同時可見；seek、source discontinuity 與
reduced motion 直接 commit。`overlay/lyrics/ornateVertical.mjs` 只擁有 DOM 與可中斷 GSAP swap，Hina Mincho、
來源 checksum 與 OFL 1.1 授權隨 `shared/assets/fonts/` 封裝並經 exact allowlist 提供。
模板不保存或載入 MV 場景素材。

Kinetic Pop profile 保持在同一 Lyrics Output route 內：共享 projection 依 source line
index 輪替三種材質，並以 grapheme-aware unit 判斷短句。每個已計時 source line 在任一時刻
只輸出一個橫向 row；此日文優先模板會把來源行內的作者空白編譯成 sequential phrases，依各段視覺
字重占比分配既有 `lineProgress`，先顯示前段再替換後段；有 validated T2 時則以共用的 source
range mapping 對齊作者片段起點，只有安全映射失敗才回退到 T1 權重估算。這個顯示排程不建立或回寫 canonical／
T2 timing；無空白的過長內容仍必須由上游 lyrics document／timing pipeline 斷成下一個 timed
line，模板不以第二列掩蓋來源問題。Kinetic Pop 的 Overlay、line、row 與三個材質 track 使用同一
份左右對稱 safe stage 寬度；glyph 群以完整輸出畫布為中心，背景圖不參與定位，超寬 `nowrap`
內容則由中心向兩側等量溢出。Output scheduler 會把下一個 phrase progress boundary 納入
喚醒時間。`overlay/lyrics/kineticPop.mjs` 只擁有 row／視覺字元 DOM 與 GSAP cross-swap；每個
caption／punch 與 phrase 替換都沿用 presentation-owned grapheme units 做逐字進場；T2 只決定
phrase 何時替換，不改字元動畫語彙。
DOM 以全行 depth／rim／fill track 分層，同一字的三個材質副本共用相同的 deterministic
interleaved phase；`kineticPopMotion.mjs` 讓 Browser Source 與 Renderer Gallery 共用 28ms
內重複的 burst delay contract。字元固定在最終水平排版位置，以奇偶相反的垂直位移、旋轉與縮放
短促回彈，不依字串長度累積成由左至右掃描；reduced motion 與 seek／source discontinuity 直接
commit。同一 shared motion module 也提供可選的 deterministic 八相位 rest pose；`端正`／缺值／
無效值落到零偏移，只有明確選擇 `些微偏移` 才保留幅度受控的字元傾斜、基線與尺寸差。設定經
appearance normalization 投影到 Overlay root dataset，既有可見行可由 CSS 即時切換，不重編
歌詞 presentation 或建立新的播放狀態；後續 GSAP 進場則直接落到相同 rest pose，且三個材質 track
共用每字姿態。樣式 2 使用 `0.03em` 白色 rim，最上層漸層 fill 則使用 hairline `0.0125em` 白色
stroke；fill 先畫、stroke 後畫，讓白框只作為漸層字面與黑色深度之間的薄分隔線，不能形成高份量
白色帶，fill 也不得使用黑色 stroke。M PLUS Rounded 1c 與漸層材質專用的
Keifont、來源 checksum 及各自的 OFL／Apache 2.0 授權都隨 `shared/assets/fonts/`
封裝，並由 Output server exact allowlist 提供；Renderer 預覽與 Browser Source
使用同一份字型檔。

Canonical document 與模板 profile 之間另有單一 renderer-owned 文字顯示變體：
`useLyrics` 預設把實際內容判定為中文的任一來源，以 bundled `opencc-js` 的 `s2tw-v1`
離線投影為台灣繁體，並保留可切回原文的 session intent。來源種類不參與語系判定；日文、
韓文與拉丁文字不套用。這個 display document 使用變體專屬 identity，控制面板與 Output
共用同一投影；原始 LRC／VTT／YRC、canonical document、timing sidecar、line／segment id
與來源 provenance 均不改寫。T2 優先整行轉換後依等長字元邊界切回原 segment；若無法安全
等長切分，才逐 segment 轉換並以其串接結果保持 line／segment 文字一致。

## 權威狀態與資料

| 資料                                  | 權威 owner                        | 投影／持久化                                      |
| ------------------------------------- | --------------------------------- | ------------------------------------------------- |
| Track existence                       | Library filesystem                | `library.json` 只補 scalar metadata               |
| Playback timing/state                 | Renderer HTML audio element       | Main、taskbar、SMTC 與 Output 只接收狀態投影      |
| Queue／playing track／lyrics state    | Renderer composables              | Projection Hub 驗證後供 Self-View 與 Overlay 消費 |
| Feature confirmation                  | Main config state                 | Renderer 只顯示與提交 allowlisted intent          |
| Lyrics／analysis／separation sidecars | Main library services             | Renderer 只提供 track id 與產品 intent            |
| Dependency registry                   | `shared/featureDependencies.json` | Main 解析 URL、hash、path、model 與 arguments     |
| OBS endpoint／credential              | Main config／encrypted file       | Renderer 只提交 bounded settings intent           |
| OBS session history                   | Main session history service      | 本機 JSON；Renderer 只讀並輸出場次時間標記        |
| App CPU／RAM observation              | Main usage service                | Titlebar 只接收 bounded percentage projection     |

本機媒體經 `utawakui-media:` protocol 交付 renderer。Scheme 與 handler 註冊在
`electron/main/mediaScheme.js`／`mediaProtocol.js`；`electron/lib/` 只提供其呼叫的
path／range 工具函式。Resolver 只接受 track id 與 allowlisted asset names，並由 main
建立正確的 HTTP range response；renderer 不接觸 absolute path。

播放器的 renderer ownership 再分成兩層：`src/composables/usePlayer.js` 是模組單例、
HTML audio event authority、transport actions 與既有 public composable facade；
`src/composables/player/usePlayerAudioGraph.js` 是由 facade 建立的 Web Audio resource
owner，負責四聲道 accompaniment／guide-vocal routing、monitor／capture mix、Signalsmith
Stretch pitch processing、capture sink 與 graph cleanup。Audio graph 不註冊 media timing events，
也不直接建立第二份 playback state；所有播放時間與 phase 仍只由 HTML audio events
更新。

節拍器由 `useMetronome.js` 擁有 session state，並以獨立 AudioContext 與 lookahead
scheduler 發聲，不接入 player monitor／capture graph。`useMetronomeTrackTempo.js` 是唯一
曲目分析接線：只接受既有 confidence gate 通過的 tempo，且在節拍器停止、使用者尚未
手動覆寫時套用；它不回寫 analysis sidecar 或播放 tempo。

Lyrics renderer 同樣維持單一 public owner：`src/composables/useLyrics.js` 保留 library／
playlist scope、選曲、HTML audio playback projection、watchers 與 `useLyrics()` facade；
canonical `lyricsDocument` 仍供 timing／reading authoring，衍生 `displayLyricsDocument` 則供
工作區與 Output；預設開啟的台灣繁體變體只依實際歌詞 script 判斷，不依 provider。
`src/composables/lyrics/useLyricsAcquisition.js` 負責 gated LRCLIB／NetEase／Better Lyrics
手動候選 acquisition；三者共用 renderer 候選狀態與搜尋 workspace。Main 的
allowlisted `all` intent
平行執行各來源、容納 partial failure，再以來源中立的錄音相關性與 timing capability 排序，
同錄音只在 presentation group 中提供來源替代項。每個 provider 仍保有自己的 scheduler、
parser、save-time refetch 與 provenance；跨來源不拼接歌詞。成功 discovery 使用 bounded
main-memory TTL cache，相同 in-flight query 去重，同來源的新 query abort 舊 query。NetEase
使用固定 HTTPS origin 的 bounded direct client，先做 metadata gate，再自適應取得足夠候選
的歌詞；逐筆驗證完整 YRC 才建立 T2 canonical timing sidecar，沒有有效 YRC 時只如實保存
T1／T0。Provider import 與 metadata backfill 另共用 main-owned automatic acquisition
orchestrator：只平行搜尋 LRCLIB／NetEase、只保存最佳 exact candidate，同一錄音內完整
T2 優先於 T1；Better Lyrics 不在自動 policy。最多同時處理兩首曲目並維持每曲 single-flight；
完整 T2 要求每一行都有 validated segments。Provider save-time refetch／fingerprint 後、同步保存
前再次檢查完整 T2、曲目音訊與 main-derived track-id generation，防止舊工作在曲目刪除或同 id
重建後提交；刪除先確認 filesystem record、失效該曲目的工作與 discovery cache，再同步移除，
generation 會在相關工作完成後回收。音訊 import 不等待此背景工作；provider source 保存成功
就以 bounded refresh options 刷新 library，後續 automatic preference 寫入失敗只記錄 bounded
diagnostic，不隱藏已提交來源。歌詞
manifest 的可選 preference 由 main 持久化，renderer 採 user preference 優先，
automatic preference 不覆寫使用者選擇。完整契約見
[多來源歌詞搜尋契約](contracts/multi-source-lyrics-search-contract.md)與
[Better Lyrics 快取來源取得契約](contracts/betterlyrics-acquisition-contract.md)。Better Lyrics
使用固定公開 cache-first API，不接受
API key 或 Apple token；其回應缺少實際命中 metadata，因此維持手動預覽／保存且不自動取得。
Bounded SAX TTML parser 只把完整 primary authored spans 投影為 T2，背景／翻譯／羅馬字 lane
不混入單線 canonical timing。退役前保存的 AMLL source／timing／artifact 維持可讀與可刪除，
但 `amll` 不在 renderer 入口、main allowlist 或 `all` fan-out；相容邊界見
[AMLL 退役相容契約](contracts/amll-acquisition-contract.md)。
此 composable 也保留沒有
production UI caller 的 Musixmatch official-API probe compatibility path；
`src/composables/lyrics/useLyricsSourceDocuments.js` 負責本機來源讀取、offset、timing、
label／delete 與手動匯入。Musixmatch path 不加入 candidate search／save 或自動取得；它只
作為未來取得付費 API 後的備用接線，詳細邊界見
[Musixmatch reserve adapter contract](contracts/musixmatch-reserve-adapter.md)。兩個內部
composable 接受具名 dependency，不互相 import；reading aid 與 timing editor 繼續由既有
獨立 composable 持有，不建立第二份 Lyrics state。

Import renderer 也維持單一 session state：`src/composables/useImportSession.js` 保留
`useImportSession()` readonly public facade、computed UI projection、selection／filter、共用
status/error 與 download-directory adapter；
`src/composables/import/useImportSourceResolution.js` 負責 provider-backed text／URL、
playlist／single resolution、candidate selection 與 structured-clone-safe preview；main 的
`electron/lib/importInput.js` 先將 bounded intent 分類，`playbackSearch.js` 只組合固定
YT Music `#songs` URL 與 bounded flat `ytsearch` 查詢。前者完整解析最多三筆結構化歌曲
資訊，後者每個 query 最多取八筆一般 YouTube 版本；runner 回傳後再次截到各來源上限，
同 video id 合併 provider evidence，再由 `importResolver.js` 對完整 bounded pool 評分後
最多投影十二筆。YT Music hostname 或搜尋命中本身不覆蓋 live／MV／variant 證據；
Topic／auto-generated music fields、官方音源、title／artist、duration 與弱化封頂的
`view_count` 共同決定 recording fit 與順序。純文字搜尋只有 finite-duration
release recording 可自動選取，其他版本保留人工選擇。Renderer 只顯示來源、版本、
長度與精簡觀看數，不揭露內部分數或 confidence badge。
Spotify／Apple Music URL 目前只回傳 deferred 狀態，不觸發外站 request。需要人工探索時，
現有 session owner 只發出
「以目前文字開啟 YT Music」意圖；系統瀏覽器的帳號／cookie 不進入 Electron，結果必須由
使用者複製回既有 allowlisted input；
`src/composables/import/useImportExecution.js` 負責 single／batch download、cancel／retry、
partial failure aggregation 與 playlist／album persistence。兩個內部 composable 只接收同一份
session state 與具名 callbacks，不自行建立 reactive state，也不互相 import。

候選搜尋的 duration 是預覽資訊；下載階段會由 yt-dlp 對 main-derived video id 再做 metadata
phase，完成後 `info.json` 的 duration 才是 library index 與 optional lyrics acquisition 的本機
權威。Renderer 不提供 executable、provider option、任意 URL 或最終 duration。

Music Analysis Workbench 同樣以 `src/composables/useMusicAnalysisWorkbench.js` 作為唯一
session state 與 public facade，負責 track selection、library／isolated signal owner、共用
phase/error/notice、初始化順序及既有 `useMusicAnalysisBatch.js` composition；
`src/composables/analysis/useMusicAnalysisCapability.js` 負責 capability status、準備／修復／
移除與 bounded setup progress；`src/composables/analysis/useMusicAnalysisJob.js` 負責單曲
analysis progress、status polling、run／cancel 與 sidecar reconciliation。兩個內部 owner
只接收具名 dependencies 與同一份 session state，不自行建立 reactive state、不互相 import，
也不取代獨立的 batch owner。

一般使用者的 Music Analysis lifecycle 位於 Settings：
`src/composables/useMusicAnalysisSettings.js` 負責 boolean-only 自動分析偏好與既有
capability owner 的組合，`MusicAnalysisSettingsRow.vue` 只呈現用途、安裝狀態與
準備／修復／移除 intent。F5 Workbench 保留單曲強制執行、批次重跑與診斷，不再是
新曲分析的必要入口。F5 的 M2 `人工標註` 由
`useMusicAnalysisReferenceAnnotation.js` 單獨擁有 renderer draft；main 以 opaque session
鎖定已驗證的 run config 與固定 `reference-worklist.json`，renderer 不提供路徑，且該路徑
不讀 prediction、不寫歌曲 sidecar。

`electron/lib/audioProcessing/structureAnalysisAutoQueue.js` 是 main-owned、記憶體內、
去重且單工的匯入後佇列。Provider download 與 local import handler 只交付 main-derived
track id；佇列重新檢查自動分析偏好、`audio-processing-flow`、capability readiness 與
sidecar currentness，並在手動 analysis／batch 結束後再執行。排入、檢查或分析失敗均
不得回滾已成功的下載或本地匯入。

## Feature Gates 與最小依賴單位

| 產品動作                               | Gate                    | 最小 managed unit              | Lifecycle boundary                                                                            |
| -------------------------------------- | ----------------------- | ------------------------------ | --------------------------------------------------------------------------------------------- |
| Local import、library、playback        | 無                      | 無                             | 永遠可用，不等待 optional service                                                             |
| Provider acquisition／search／backfill | `provider-flow`         | `yt-dlp-provider-tool` runtime | Embedded Python、yt-dlp wheel、provider 與 plugin 原子驗證／啟用                              |
| External lyrics lookup                 | `lyrics-flow`           | 無 installed binary            | 每次 external request 檢查；provider failure 不回滾已成功的本機工作                           |
| Quick／general separation              | `audio-processing-flow` | FFmpeg + selected model        | FFmpeg 與每個 model 可獨立 install／repair／remove                                            |
| BPM／beat analysis                     | `audio-processing-flow` | Beat This! `small0` capability | Settings 管理 lifecycle；ready 後新匯入依偏好進入 main-owned 單工佇列                         |
| Audio Python capabilities              | Capability policy       | Immutable lock／generation     | 獨立 runtime family、scheduler 與 lease；不與 Provider 或 ONNX lifecycle 合併                 |
| OBS loopback output                    | `public-output-flow`    | Built-in Overlay assets        | Start／publish 受 gate；stop／status 保持可用以復原                                           |
| OBS status／session timestamps         | `obs-integration`       | `obs-websocket-js`             | Main-owned lazy adapter、encrypted credential、bounded connect／request／reconnect；read-only |

BPM／beat analysis 的「依偏好」是 gate 內的預設開啟行為，不是獨立於 gate 之外；
app update 的啟動時自動檢查則不受本表任何一個 gate 保護，兩者的定義與理由見
[PRODUCT.md 的 Feature Gate 語意](../PRODUCT.md#feature-gate-語意)。

Research-only reverse-provider validation runs from `scripts/` in an ignored,
separately locked runtime and is not part of either product gate, Electron startup,
packaging, preload, renderer acquisition, or the fixed lyrics-provider registry.

`electron/lib/featureDependencies.js` 是 compatibility barrel；實作依責任拆為 registry、
download、safe archive、manifests、provider runtime、FFmpeg、models 與 lifecycle service。
每個 active dependency 必須對應一個已註冊 gate，deprecated model 不屬於 active state。
Registry-derived id、version 與 relative asset path 必須在 main 驗證後才能解析到
`userData/dependencies`；remove 以 dependency family root 為單位清除既有版本、暫存與
legacy model，不接受 renderer path，也不觸碰曲庫或已產生的分離結果。

## Output Boundary

Renderer 是 player／queue／lyrics 的來源，Main Projection Hub 則是所有外部投影的
收斂邊界。Envelope 使用 `bootId`、`sourceEpoch` 與 revision 排除 stale source；Output
server 分開呈現 liveness、source readiness 與 content/state updates。

Renderer Output ownership 分成三層：`src/composables/useOutputRuntime.js` 保留唯一
public singleton facade，負責 status／settings、port recovery、start／stop、slot
persistence、diagnostics 與初始化組合；
`src/composables/output/useOutputProjectionPublisher.js` 負責
player／queue／lyrics／既有日文 reading／music structure projection、document-before-state
envelope 排序、continuity／`sourceEpoch`、各 stream
revision/reference 與 latest-only watcher publishing；
`src/composables/useSpoutOutput.js` 只負責 Spout2 sender 的 status／FPS intent／
start-stop renderer IPC，不持有 canonical projection。三者都只透過具名 callbacks 取得
bridge、gate 與 runtime status 邊界，不持有服務啟停、設定或 slot persistence（除
`useOutputRuntime.js` 本身）。

Browser Source 只能讀取 canonical snapshot 與 allowlisted media，路由涵蓋
`overlay/lyrics/`、`overlay/setlist/` 與 Now Playing。Now Playing 的封面模板由已公開
的 track id 經 `/media/artwork/` 解析縮圖；snapshot 不包含 `utawakui-media:` URL、
absolute path 或 provider payload。Public WebSocket 不接受 playback commands。

App-owned Overlay choreography 透過 exact allowlist 提供的 GSAP browser asset 執行；
GSAP recipe 持有可中斷的 playhead、sequencing、reduced-motion 與 lifecycle cleanup，
但只消費 canonical projection，不建立第二份播放狀態。CSS 仍持有 layout、material、
transform origin、靜態 state 與簡單且非歌曲同步的 transition；兩個引擎不得同時持有
同一 animated property。控制面板的 Gallery mockup 可使用輕量 CSS preview，真實
Workbench iframe 則沿用 Browser Source runtime。

`electron/lib/outputServer.js` 保留 public service API、WebSocket lifecycle 與 projection
delivery ownership；`electron/lib/outputServer/http.js` 是獨立的唯讀 HTTP delivery plane，
持有 exact static/artwork route、asset cache、security headers 與 bounded startup telemetry。
HTTP plane 只透過具名 getter 讀取 canonical snapshot／client count，不 import `ws`、delivery
queue 或 mutable projection state。

Spout2 重用 canonical Lyrics route。Main 推導固定 surface／loopback URL、重新檢查 gate 並監督 helper；helper 才載入 native bridge、擁有 sandboxed offscreen BrowserWindow／sender、驗證 shared texture 並釋放每個 frame。Renderer IPC 只有 status、30／60 FPS intent、start 與 stop。名稱碰撞、連續 texture defect 或 renderer failure 都回傳 bounded error；`sending` 只代表首幀已送入 sender。Browser Source 獨立運作，Output server 重建前會先停止 helper。

## 錯誤與 Diagnostics

1. Handler 在 gated operation 開始前先 enforcement；gate-disabled 是預期控制流，不記錄
   為 failure。
2. Operational failure 由 main diagnostics service 保存原始 error 與有限的 categorical
   context。
3. IPC 只回傳 bounded `UTAWAKUI_APP_ERROR`，不包含 path、URL、stderr 或 provider body。
4. `diagnosticRecorded: true` 防止 renderer 重複保存；若 main recording 失敗，renderer
   才保存 safe public fallback。
5. Cross-runtime download-failure values 位於 `shared/downloadFailureValues.json`；main
   負責分類，renderer 負責顯示文案。

使用者回饋建立在同一 diagnostics service 上，但不共用它的 IPC boundary：
`electron/lib/feedback/{constants,payload,client}.js` 是純函式與注入式
`fetch` client，`electron/main/feedbackHandlers.js` 才是唯一的 IPC 邊界，
沿用 `diagnosticsHandlers.js` 的 `{ok, errorCode}` result object 慣例，不跨
IPC throw。Payload 建構重用既有 `buildDiagnosticsSupportBundle` 與
`service.listRecent`；只有錯誤回報可夾帶最近 50 筆事件，其餘三種回饋類別
完全不夾帶。Renderer 端 `src/composables/useFeedbackReport.js` 是唯一
module singleton，任何入口（錯誤通知的 action、Settings 常駐入口）都呼叫
同一個 `openReport()`，不建立第二份草稿狀態。CSP 沒有 `connect-src`，所以
上傳請求只能由 main 發出；relay（`services/feedback-relay/`）獨立部署，不
在 `electron-builder.yml` 的封裝範圍內，也不受任何 feature gate 保護——
每次送出前的強制預覽才是實際防護。Production client 固定送到
`https://api.utawakui.llazypilot.com/feedback/submit`，並帶公開、版本化且不視為
驗證秘密的 client marker；relay 只接受該 exact POST route，對 streamed body
設上限，且在 KV binding 缺失或操作失敗時 fail closed。Wrangler 關閉平行的
`workers.dev` route，Custom Domain 是唯一 production origin。決策細節見
[ADR 0016](adr/0016-user-feedback-intake.md)。

## Packaging Boundary

- `dist/` 是 Vite renderer output；`overlay/` 不進入 Vite bundle。
- `electron/`、`shared/` 與內建 resources 進入 `app.asar`，需要外部解析或執行的檔案
  由明確 `asarUnpack`／`extraResources` 規則交付。
- App-managed Provider、FFmpeg、models 與 Audio Python 存在 user data dependency root，
  不綁入 base installer，也不進入 app startup critical path。
- 完整 package mapping 以 [release-inventory.md](operations/release-inventory.md) 為準。
- App update 由 `electron/main/appUpdateService.js`／`appUpdateHandlers.js` 經
  `electron-updater` 驅動，`shared/appUpdateValues.json` 提供 renderer 快照；
  `src/composables/useAppUpdate.js` 是唯一 renderer owner。目前 `signExecutable`／
  `verifyUpdateCodeSignature` 為 false，屬 unsigned updater runtime，尚無連續版本
  update acceptance 驗證。
- `electron/lib/updateManifestClient.js`、`updateManifestVerification.js` 與
  `tools/update-signing/` 提供 app-level signed manifest foundation。Main-private
  descriptor 將 installer basename／size／SHA-512 exact-bind 到
  `electron-updater` 的 `UpdateInfo`；schema v2 使用 Ed25519 多簽章、SPKI SHA-256
  key id 與 RFC 8785 相容 canonical bytes，可讓 active／retiring key 在跳版 client
  間重疊驗證。Release workflow 已拆成無 secret package、protected sign 與 protected
  publish jobs。`signedManifestEnabled` 目前仍為 false，registry 只有 development key，
  因此尚未改變已發布版本的安全邊界。Installer 維持 owner 明確接受、目前不規劃購買
  Authenticode 憑證的 unsigned channel。
- `obs-websocket-js` 隨 production dependency closure 封裝，但 disabled adapter 不在
  startup 載入 SDK，也不開 socket 或 timer。
- 「有什麼新變化」公告內容隨版本內建於 `shared/releaseAnnouncement.json`
  （`version`／`summary`），不在 runtime 解析或下載遠端 release notes；
  `src/composables/useAppAnnouncement.js` 是唯一 renderer owner，比對 main 存的
  `lastSeenAnnouncementVersion` 決定是否顯示一次。`shared/releaseAnnouncement.test.js`
  斷言 `version` 與 `package.json` 同步；發版流程見
  [release-notes-template.md](operations/release-notes-template.md)。
