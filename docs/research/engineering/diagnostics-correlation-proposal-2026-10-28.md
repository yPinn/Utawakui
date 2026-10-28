# 診斷關聯 ID：現況與提案

日期：2026-10-28（Asia/Taipei）。基線為 `fd987af2`。
本文是實作前提案，未修改程式；採用與否待決策，決策後需同步修訂 [ADR 0008](../../adr/0008-local-diagnostics-and-error-handling.md)。

## 結論

ADR 0008 要求「操作的 correlation id 從 renderer 意圖經 IPC、main 一路帶到 worker」，並要求 IPC wrapper 記錄 channel、operation、耗時與 correlation id。現況兩者都沒有做到：同一次失敗在 renderer 與 main 各有一個互不相關的 id，wrapper 也不記耗時。

建議**不**採用 ADR 原本的 renderer 發號方式，改為：

1. IPC 失敗由 main 的 wrapper 發號，並把這個 id 放進回傳的公開 AppError。
2. 長任務直接沿用既有的 job id／item id／request id。

這樣不必更動 preload 的任何 intent 簽名，也不會為成功的呼叫多寫紀錄。

## 現況

| 位置                                       | correlationId 的實際來源                      | 問題                                  |
| ------------------------------------------ | --------------------------------------------- | ------------------------------------- |
| `electron/lib/diagnostics.js`              | 呼叫端有給就用，否則等於事件自己的 id         | 未提供時無法跨事件關聯                |
| `electron/main/ipcErrorBoundary.js`        | 不設定                                        | 記錄裡沒有 correlation、channel、耗時 |
| `src/composables/useAppDiagnostics.js`     | renderer 紀錄自己的 `record.id`               | 與 main 的同一次失敗無關聯            |
| `electron/main/feedbackHandlers.js`        | 回報的 `reportId`                             | 只關聯回報本身                        |
| `src/composables/usePerformerViewState.js` | 通知 id                                       | 僅限表演者畫面                        |
| 分離、分析、波形、讀音 worker              | 有 jobId／itemId／requestId，但未放進診斷紀錄 | 長任務的多筆事件無法串起              |

覆蓋範圍：Main 共 238 個 `ipcMain.handle`；IPC 錯誤邊界 wrapper 只用在 27 個檔案、41 處。renderer 公開 AppError 的 context 白名單（`PUBLIC_CONTEXT_KEYS`）目前沒有可攜帶關聯 id 的欄位。

實際影響：

- 使用者回報附上最近 50 筆紀錄時，維護者只能依時間戳猜哪幾筆屬於同一件事。
- main 記錄失敗、renderer 退回自行記錄時，兩邊各有一筆紀錄卻無法對應。

## 方案比較

| 方案                         | 做法                                                                                         | 優點                                                                                  | 缺點                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| A. Main 發號（建議）         | wrapper 在失敗時產生隨機 id、寫入紀錄，並放進公開 AppError 的 context；長任務沿用既有 job id | 不動 preload 與 renderer intent；只有失敗才產生；與既有 `diagnosticRecorded` 去重相容 | 無法關聯「呼叫 IPC 之前」renderer 端自己的事件                                               |
| B. Renderer 發號（ADR 原文） | 每次 invoke 都由 renderer 產生 id 並傳給 main                                                | 可涵蓋呼叫前的 renderer 事件                                                          | 必須修改 preload 的 IPC 簽名，或改成通用信封，違反「具名 intent」邊界；改動 200 多個 channel |
| C. 只做事後歸併              | 匯出或檢視時依時間與 code 推測關聯                                                           | 不改 runtime                                                                          | 不可靠，並行操作時會誤配                                                                     |

B 的成本與邊界風險遠高於收益：renderer 在呼叫 IPC 前就失敗的情況，本來就由 renderer 自己的紀錄（Vue／window／rejection 捕捉）處理，不需要跨程序關聯。

## 建議設計（方案 A）

### 第一階段：IPC 失敗

- `runDiagnosticIpcOperation` 在進入時記下開始時間；失敗時以 `crypto.randomUUID()` 產生 correlationId，連同 `durationMs` 一起寫入診斷事件。
- 公開 AppError 的 context 加上 `correlationId`，renderer 端 `PUBLIC_CONTEXT_KEYS` 同步加入。值是隨機 UUID，不含任何內容資訊。
- `useAppDiagnostics.recordError` 在 main 未記錄成功（`diagnosticRecorded` 不為 true）而需要自行記錄時，沿用 AppError 帶回的 correlationId，不再用自己的 `record.id`。
- 錯誤通知的「回報這個問題」把 correlationId 帶進回報內容，維護者可以直接在附帶的 50 筆紀錄中定位。**介面上不顯示**這個 id。
- 不記錄成功的呼叫，也不為成功的呼叫產生 id。這符合 ADR 0008「不記所有狀態變化」的原則。

### 第二階段：長任務

- 分離（item id）、音樂分析（job id、批次 id）、波形（request id）、讀音（job id）的 main 端紀錄，以既有的 id 作為 correlationId。
- 同一個工作的進度失敗、worker 異常結束、最終失敗會落在同一個 id 下。
- 這些 id 已經是 main 自己產生的，不需要另外發號。批次摘要（例如音樂分析批次）使用批次 id。

### 第三階段：檢視

- `scripts/diagnostics-viewer.html` 與開發模式的 F6 工作台，支援依 correlationId 分組或篩選。
- 匯出格式不變，因為 correlationId 已經是 schema v1 的必要欄位。

## 驗收

- 單元測試：
  - wrapper 失敗時，產生的 id 同時出現在診斷事件與公開 AppError，`durationMs` 為非負整數。
  - wrapper 成功時不產生 id、不寫入紀錄。
  - main 記錄失敗時，renderer 退回的紀錄沿用同一個 id。
  - 公開 AppError 只多出 `correlationId`，沒有路徑、訊息內文或 stack。
- 回報：以假造的失敗觸發「回報這個問題」，預覽內容的 correlationId 能對應到附帶的紀錄。
- 長任務：分離 worker 異常結束時，相關紀錄共用同一個 item id。
- 隱私：匯出 bundle 掃描不出新的路徑或內容欄位；correlationId 格式符合 `SAFE_ID_RE`。

## 成本

| 階段 | 範圍                                                                                                                                    | 估計                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 一   | `ipcErrorBoundary.js`、`appError.js`、`appErrors.js`、`useAppDiagnostics.js`、notice reporter 與測試；文件為 ADR 0008、diagnostics 指南 | 小。所有已採用 wrapper 的 41 處自動受益，不必逐一修改 |
| 二   | 分離、分析、波形、讀音的 main handler／service 與測試                                                                                   | 中。每個工作類型約 1 到 2 個檔案                      |
| 三   | viewer 與 F6 工作台                                                                                                                     | 小。只動開發與支援工具                                |

wrapper 覆蓋率（目前 41 處）不在本提案範圍；依 ADR 0008 原則，仍隨各 domain 的實際復原需求逐步擴大。

## 待決策

1. 是否接受「main 發號」取代 ADR 0008 原文的「renderer 意圖發號」。接受的話，ADR 需要修訂這一段，並在 Rejected options 記錄方案 B。
2. 回報時是否自動附上 correlationId。建議附上，但介面不顯示。
3. 是否三個階段一起排程。建議先做第一階段：改動小，而且所有使用者回報都能立即受益。
