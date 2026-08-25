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

## Feature Gates 與最小依賴單位

| 產品動作                               | Gate                    | 最小 managed unit              | Lifecycle boundary                                                            |
| -------------------------------------- | ----------------------- | ------------------------------ | ----------------------------------------------------------------------------- |
| Local import、library、playback        | 無                      | 無                             | 永遠可用，不等待 optional service                                             |
| Provider acquisition／search／backfill | `provider-flow`         | `yt-dlp-provider-tool` runtime | Embedded Python、yt-dlp wheel、provider 與 plugin 原子驗證／啟用              |
| External lyrics lookup                 | `lyrics-flow`           | 無 installed binary            | 每次 external request 檢查；provider failure 不回滾已成功的本機工作           |
| Quick／general separation              | `audio-processing-flow` | FFmpeg + selected model        | FFmpeg 與每個 model 可獨立 install／repair／remove                            |
| Audio Python capabilities              | Capability policy       | Immutable lock／generation     | 獨立 runtime family、scheduler 與 lease；不與 Provider 或 ONNX lifecycle 合併 |
| OBS loopback output                    | `public-output-flow`    | Built-in Overlay assets        | Start／publish 受 gate；stop／status 保持可用以復原                           |

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

Browser Source 只能讀取 canonical snapshot 與 allowlisted media。Artwork route 由已公開
的 track id 解析縮圖；snapshot 不包含 `utawakui-media:` URL、absolute path 或 provider
payload。Public WebSocket 不接受 playback commands。

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
