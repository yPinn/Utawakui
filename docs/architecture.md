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

跨 runtime 的 presentation logic 位於 `shared/presentation/`。`overlay/shared/` 只保留
Browser Source route adapters；Output server 以 exact allowlist 提供兩個目錄的必要檔案，
不把 request path 轉成任意 filesystem path。

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
`src/composables/lyrics/useLyricsAcquisition.js` 負責 gated Musixmatch／LRCLIB acquisition，
`src/composables/lyrics/useLyricsSourceDocuments.js` 負責本機來源讀取、offset、timing、
label／delete 與手動匯入。兩個內部 composable 接受具名 dependency，不互相 import；
reading aid 與 timing editor 繼續由既有獨立 composable 持有，不建立第二份 Lyrics state。

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

## Feature Gates 與最小依賴單位

| 產品動作                               | Gate                    | 最小 managed unit              | Lifecycle boundary                                                            |
| -------------------------------------- | ----------------------- | ------------------------------ | ----------------------------------------------------------------------------- |
| Local import、library、playback        | 無                      | 無                             | 永遠可用，不等待 optional service                                             |
| Provider acquisition／search／backfill | `provider-flow`         | `yt-dlp-provider-tool` runtime | Embedded Python、yt-dlp wheel、provider 與 plugin 原子驗證／啟用              |
| External lyrics lookup                 | `lyrics-flow`           | 無 installed binary            | 每次 external request 檢查；provider failure 不回滾已成功的本機工作           |
| Quick／general separation              | `audio-processing-flow` | FFmpeg + selected model        | FFmpeg 與每個 model 可獨立 install／repair／remove                            |
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
