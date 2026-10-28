# 診斷關聯 ID：現況與提案

日期：2026-10-29（Asia/Taipei）。基線為 `98e8286f`。
本文是實作前提案，未修改程式；採用後需同步修訂 [ADR 0008](../../adr/0008-local-diagnostics-and-error-handling.md)。

## 結論

ADR 0008 要求 correlation id 從 renderer 意圖經 IPC、main 帶到 worker，並要求 IPC wrapper 記錄 channel、operation、耗時與 correlation id。現況都沒有做到。

同一次 IPC 失敗只會留下一筆紀錄：main 記錄成功時回傳 `diagnosticRecorded`，renderer 就不再寫入。所以缺的不是兩筆紀錄的配對，而是：

- 使用者回報無法指出是哪一筆紀錄，維護者只能依時間戳猜。
- 長任務的多筆事件無法串成同一件工作。

建議改由 main 發號（方案 A），不採 ADR 原文的 renderer 發號。

## 現況

| 位置                                       | correlationId 來源                     |
| ------------------------------------------ | -------------------------------------- |
| `electron/lib/diagnostics.js`              | 呼叫端提供，否則等於事件自己的 id      |
| `electron/main/ipcErrorBoundary.js`        | 不設定，也不記耗時                     |
| `src/composables/useAppDiagnostics.js`     | renderer 紀錄自己的 `record.id`        |
| `electron/main/feedbackHandlers.js`        | 回報的 `reportId`                      |
| `src/composables/usePerformerViewState.js` | 通知 id                                |
| 分離、音樂分析、波形                       | 有 item／batch／request id，未放進紀錄 |

回報流程目前拿不到任何 id：

- 「回報這個問題」收到的是通知項目，只用標題與內文預填描述；通知不保留 code、context 或紀錄 id。
- 回報 payload 沒有放關聯 id 的欄位。
- 附帶的診斷紀錄（最多 50 筆）超過大小上限時，從最舊的刪起，被指到的那筆可能被裁掉。

覆蓋範圍：main 有 240 個 `ipcMain.handle`，wrapper 用在 27 個檔案（40 處直接呼叫、2 處 plan runner）。renderer 有 7 個檔案經 `notifyFailure` 發錯誤通知，另有 32 個檔案直接發 `tone: 'danger'` 通知。

## 方案比較

| 方案                    | 做法                                         | 取捨                                                                         |
| ----------------------- | -------------------------------------------- | ---------------------------------------------------------------------------- |
| A. Main 發號（建議）    | wrapper 失敗時產生 id；長任務沿用既有工作 id | 不動 preload；只在失敗時產生                                                 |
| B. Renderer 發號（ADR） | 每次 invoke 由 renderer 產生 id 傳給 main    | 要改 preload 簽名或改成通用信封，違反具名 intent 邊界；牽動 200 多個 channel |
| C. 事後歸併             | 檢視時依時間與 code 推測                     | 並行操作時會誤配                                                             |

renderer 在呼叫 IPC 前就失敗的情況，已由 renderer 自己的紀錄處理，不需要 B。

## 建議設計（方案 A）

### 第一階段：失敗紀錄與回報

- wrapper 記下開始時間；失敗時以 `crypto.randomUUID()` 產生 correlationId，連同 `durationMs` 寫入事件，並放進公開 AppError 的 context。`PUBLIC_CONTEXT_KEYS` 同步加入。
- main 未記錄成功、renderer 補寫時，沿用 AppError 帶回的 id。
- renderer 自己記錄的錯誤沿用既有 `record.id`，不另外發號。
- `notifyFailure` 把該筆紀錄的 id 存進通知項目；重複通知被合併、沒有新紀錄時，保留原 id。
- 回報 payload 新增選填的關聯 id 欄位，只在附帶診斷紀錄時送出；裁切紀錄時保留被指到的那筆。介面不顯示 id。
- 不記錄成功的呼叫，也不為成功的呼叫產生 id。

已知缺口：直接發 `tone: 'danger'` 通知、不經 `notifyFailure` 的 32 個檔案拿不到 id，隨各 domain 改用 `notifyFailure` 逐步補上。

### 第二階段：長任務

分離（item id）、音樂分析（batch id）、波形（request id）的 main 端紀錄，以既有 id 作為 correlationId。同一工作的進度失敗、worker 異常結束與最終失敗落在同一 id 下。讀音分析在程序內執行、沒有工作 id，不在範圍內。

### 第三階段：檢視

`scripts/diagnostics-viewer.html` 與 F6 診斷工作台支援依 correlationId 篩選。匯出格式不變，correlationId 已是 schema v1 必要欄位。

## Relay 與部署順序

回報 relay（`services/feedback-relay/`）獨立部署：

- 一般回報接受未知欄位，app 可以先上；relay 的驗證與 Discord 呈現更新前，id 不會顯示。
- 自動回報（ADR 0029）只接受固定欄位；若也要附 id，必須先部署 relay 再更新 app。

## 驗收

- wrapper 失敗時，同一 id 出現在診斷事件與公開 AppError，`durationMs` 為非負整數；成功時不產生 id、不寫紀錄。
- renderer 補寫的紀錄沿用 main 的 id；公開 AppError 只多出 `correlationId`，不含路徑、內文或 stack。
- 從錯誤通知開啟回報，payload 的 id 對應到附帶的一筆紀錄，且該筆在裁切後仍保留；未附帶紀錄時不送 id。
- 分離 worker 異常結束時，相關紀錄共用同一個 item id。
- id 格式符合 `SAFE_ID_RE`；匯出 bundle 沒有新的路徑或內容欄位。

## 成本

| 階段 | 範圍                                                                                                  | 估計 |
| ---- | ----------------------------------------------------------------------------------------------------- | ---- |
| 一   | wrapper、AppError 白名單、`useAppDiagnostics`、`notifyFailure`、回報 payload 與裁切、relay 驗證與呈現 | 中   |
| 二   | 分離、音樂分析、波形的 main handler／service                                                          | 中   |
| 三   | viewer 與 F6 工作台                                                                                   | 小   |

wrapper 覆蓋率不在本提案範圍，依 ADR 0008 隨各 domain 的復原需求擴大。

## 待決策

1. 是否以 main 發號取代 ADR 0008 原文；接受則修訂 ADR，並把方案 B 記入 Rejected options。
2. 回報是否自動附上 id（建議附上，介面不顯示）。自動回報要不要一起附，決定 relay 是否必須先部署。
3. 是否先做第一階段。
