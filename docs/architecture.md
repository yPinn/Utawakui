# 現行架構圖

本文件只描述 production code 已採用的 ownership 與 dependency boundaries。產品範圍
以 [spec.md](spec.md) 為準，決策理由保留在 [ADR](adr/)，詳細 protocol 則由 focused
contracts 與 tests 管理。

## Runtime Ownership

| Runtime                               | 責任                                                                                        | 不可持有                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Electron main (`electron/main/`)      | Window lifecycle、IPC trust boundary、feature gate enforcement、local services、diagnostics | Renderer reactive state、client-provided filesystem paths       |
| Pure main libraries (`electron/lib/`) | Filesystem、provider、processing、dependency、sidecar 與 protocol logic                     | BrowserWindow lifecycle、renderer presentation                  |
| Preload (`electron/preload.js`)       | Intent-based、固定 channel 的窄 IPC bridge                                                  | Node API passthrough、任意 channel 或 path API                  |
| Renderer (`src/`)                     | Vue UI、interaction、player／queue／lyrics owners                                           | Node／Electron import、dependency URL、model 或 executable path |
| Shared (`shared/`)                    | Scalar JSON contracts 與純 cross-runtime presentation projections                           | Filesystem、Electron、browser globals、mutable service state    |
| Browser Source (`overlay/`)           | OBS delivery adapters、DOM rendering 與獨立 visual tokens                                   | Control-panel tokens、canonical product-state ownership         |

`electron/main.js` 是 composition root：設定 app identity、註冊 privileged scheme、建立
services，再將具名 dependency 注入各 domain handler。Handler 不以共享 context blob
隱藏依賴，也不彼此直接協調；跨 domain 流程由 composition root 建立的 service 負責。

Machine config、feature confirmation 與 external navigation 分別由獨立 handler registrar
持有。Renderer 開啟外部頁面時只提交 allowlisted target id；vendor URL 固定在 main，且
preload 不提供任意 URL API。

Lyrics IPC 由 `electron/main/lyricsHandlers.js` 保留穩定註冊 facade；實際 channel 依責任
分在 `electron/main/lyrics/`：`documentHandlers.js` 只處理本機歌詞／timing，
`acquisitionHandlers.js` 處理 gated provider、候選與 provider-backed 回填，
`readingHandlers.js` 處理本機 reading worker／sidecar。三者不互相 import，facade 只注入
同一組具名 composition dependencies。

Reading sidecar v3 由 main 持有 `documentId`、normalizer profile、來源 fingerprint 與
line identity。Renderer 載入時只送當前 canonical identity；main 對文字相容的 v1／v2
sidecar 做原子 re-key 並保留人工修正，文字不相容或格式損壞才交回既有重新產生流程。

跨 runtime 的 presentation logic 位於 `shared/presentation/`。`overlay/shared/` 只保留
Browser Source route adapters；Output server 以 exact allowlist 提供兩個目錄的必要檔案，
不把 request path 轉成任意 filesystem path。

Lyrics presentation 分成兩層：第一層保留 canonical 原文與 T0／T1／T2 timing；只有有限
T1 fallback 會經 `lyricsTimingUnits.mjs` 產生唯一共用、無語意標記的 `{ text, weight }`
單元。原有換行、空白與標點無損附著，不在這層判斷斷句、角色或段落。
第二層 `lyricsPresentation.mjs` 才依 versioned Generic／KTV／Manga／Live Stage profile
做模板客製化；Generic 是 identity，其他 profile 才可把換行、標點、speaker label、括號
解讀成 phrase、role、bubble 或 caption page。Browser Source 以 document id、revision、
language、profile id／version 快取靜態結果，`state.mjs` 只投影目前 template 的動態 frame
與下一個 boundary；count-in、beat／section 判斷也只屬於對應模板。Raw LRC／VTT parser
不進模板，模板分句不回寫 canonical timing，T2 永遠優先。Reading Aid 在 reading
document 尚未進入 Output transport 前維持不可套用。

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

本機媒體經 `utawakui-media:` protocol 交付 renderer。Resolver 只接受 track id 與
allowlisted asset names，並由 main 建立正確的 HTTP range response；renderer 不接觸
absolute path。

播放器的 renderer ownership 再分成兩層：`src/composables/usePlayer.js` 是模組單例、
HTML audio event authority、transport actions 與既有 public composable facade；
`src/composables/player/usePlayerAudioGraph.js` 是由 facade 建立的 Web Audio resource
owner，負責四聲道 accompaniment／guide-vocal routing、monitor／capture mix、SoundTouch
pitch processing、capture sink 與 graph cleanup。Audio graph 不註冊 media timing events，
也不直接建立第二份 playback state；所有播放時間與 phase 仍只由 HTML audio events
更新。

Lyrics renderer 同樣維持單一 public owner：`src/composables/useLyrics.js` 保留 library／
playlist scope、選曲、HTML audio playback projection、watchers 與 `useLyrics()` facade；
canonical `lyricsDocument` 仍供 timing／reading authoring，衍生 `displayLyricsDocument` 則供
工作區與 Output；預設開啟的台灣繁體變體只依實際歌詞 script 判斷，不依 provider。
`src/composables/lyrics/useLyricsAcquisition.js` 負責 gated LRCLIB／NetEase 手動候選
acquisition；兩者共用 renderer 候選狀態與搜尋 workspace。Main 的 allowlisted `all` intent
平行執行各來源、容納 partial failure，再以來源中立的錄音相關性與 timing capability 排序，
同錄音只在 presentation group 中提供來源替代項。每個 provider 仍保有自己的 scheduler、
parser、save-time refetch 與 provenance；跨來源不拼接歌詞。成功 discovery 使用 bounded
main-memory TTL cache，相同 in-flight query 去重，同來源的新 query abort 舊 query。NetEase
使用固定 HTTPS origin 的 bounded direct client，先做 metadata gate，再自適應取得足夠候選
的歌詞；逐筆驗證完整 YRC 才建立 T2 canonical timing sidecar，沒有有效 YRC 時只如實保存
T1／T0。完整契約見
[多來源歌詞搜尋契約](contracts/multi-source-lyrics-search-contract.md)。此 composable 也保留沒有
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
`src/composables/import/useImportSourceResolution.js` 負責 provider-backed playlist／single
resolution、candidate selection 與 structured-clone-safe preview；
`src/composables/import/useImportExecution.js` 負責 single／batch download、cancel／retry、
partial failure aggregation 與 playlist／album persistence。兩個內部 composable 只接收同一份
session state 與具名 callbacks，不自行建立 reactive state，也不互相 import。

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
準備／修復／移除 intent。F10 Workbench 保留單曲強制執行、批次重跑與診斷，不再是
新曲分析的必要入口。F10 的 M2 `人工標註` 由
`useMusicAnalysisReferenceAnnotation.js` 單獨擁有 renderer draft；main 以 opaque session
鎖定已驗證的 run config 與固定 `reference-worklist.json`，renderer 不提供路徑，且該路徑
不讀 prediction、不寫歌曲 sidecar。

`electron/lib/audioProcessing/structureAnalysisAutoQueue.js` 是 main-owned、記憶體內、
去重且單工的匯入後佇列。Provider download 與 local import handler 只交付 main-derived
track id；佇列重新檢查自動分析偏好、`audio-processing-flow`、capability readiness 與
sidecar currentness，並在手動 analysis／batch 結束後再執行。排入、檢查或分析失敗均
不得回滾已成功的下載或本地匯入。

## Feature Gates 與最小依賴單位

| 產品動作                               | Gate                    | 最小 managed unit              | Lifecycle boundary                                                            |
| -------------------------------------- | ----------------------- | ------------------------------ | ----------------------------------------------------------------------------- |
| Local import、library、playback        | 無                      | 無                             | 永遠可用，不等待 optional service                                             |
| Provider acquisition／search／backfill | `provider-flow`         | `yt-dlp-provider-tool` runtime | Embedded Python、yt-dlp wheel、provider 與 plugin 原子驗證／啟用              |
| External lyrics lookup                 | `lyrics-flow`           | 無 installed binary            | 每次 external request 檢查；provider failure 不回滾已成功的本機工作           |
| Quick／general separation              | `audio-processing-flow` | FFmpeg + selected model        | FFmpeg 與每個 model 可獨立 install／repair／remove                            |
| BPM／beat analysis                     | `audio-processing-flow` | Beat This! `small0` capability | Settings 管理 lifecycle；ready 後新匯入依偏好進入 main-owned 單工佇列         |
| Audio Python capabilities              | Capability policy       | Immutable lock／generation     | 獨立 runtime family、scheduler 與 lease；不與 Provider 或 ONNX lifecycle 合併 |
| OBS loopback output                    | `public-output-flow`    | Built-in Overlay assets        | Start／publish 受 gate；stop／status 保持可用以復原                           |

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

Renderer Output ownership 分成控制與發布兩層：`src/composables/useOutputRuntime.js`
保留唯一 public singleton facade，負責 status／settings、port recovery、start／stop、slot
persistence、diagnostics 與初始化組合；
`src/composables/output/useOutputProjectionPublisher.js` 負責 player／queue／lyrics／music
structure projection、document-before-state envelope 排序、continuity／`sourceEpoch`、各 stream
revision/reference 與 latest-only watcher publishing。Publisher 只透過具名 callbacks 取得
bridge、gate 與 runtime status 邊界，不持有服務啟停、設定或 slot persistence。

Browser Source 只能讀取 canonical snapshot 與 allowlisted media。Artwork route 由已公開
的 track id 解析縮圖；snapshot 不包含 `utawakui-media:` URL、absolute path 或 provider
payload。Public WebSocket 不接受 playback commands。

`electron/lib/outputServer.js` 保留 public service API、WebSocket lifecycle 與 projection
delivery ownership；`electron/lib/outputServer/http.js` 是獨立的唯讀 HTTP delivery plane，
持有 exact static/artwork route、asset cache、security headers 與 bounded startup telemetry。
HTTP plane 只透過具名 getter 讀取 canonical snapshot／client count，不 import `ws`、delivery
queue 或 mutable projection state。

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

## Packaging Boundary

- `dist/` 是 Vite renderer output；`overlay/` 不進入 Vite bundle。
- `electron/`、`shared/` 與內建 resources 進入 `app.asar`，需要外部解析或執行的檔案
  由明確 `asarUnpack`／`extraResources` 規則交付。
- App-managed Provider、FFmpeg、models 與 Audio Python 存在 user data dependency root，
  不綁入 base installer，也不進入 app startup critical path。
- 完整 package mapping 以 [release-inventory.md](operations/release-inventory.md) 為準。
