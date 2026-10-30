# 診斷關聯 ID：現況與決策

日期：2026-10-30（Asia/Taipei）。決策已寫入 [ADR 0008](../../adr/0008-local-diagnostics-and-error-handling.md)。

## 結論

由 main 發號，只做 IPC 失敗這一段；回報整合與長任務關聯延後，條件寫在下文。

ADR 0008 原文要求 correlation id 從 renderer 意圖一路帶到 worker。實際檢查後，這件事的價值比預期小：

- 同一次 IPC 失敗只留一筆紀錄：main 記錄成功時回傳 `diagnosticRecorded`，renderer 不再寫入。
- 分離失敗也只留一筆（wrapper 的 `SEPARATION_RUN_FAILED`）；worker 異常沒有另外記錄，其他紀錄只出現在成功路徑。音樂分析批次已經只寫一筆摘要。長任務沒有多筆事件可以串。
- 回饋 relay 在 spec 中仍列為待部署，沒有真實回報可以對應。

## 已實作

- `runDiagnosticIpcOperation` 失敗時以 `crypto.randomUUID()` 產生 id，寫入事件的 `correlationId`，在 context 加上 `durationMs`，同一個 id 也放進公開 AppError 的 context。
- 成功的呼叫不寫紀錄，也不產生 id。
- renderer 的 `PUBLIC_CONTEXT_KEYS` 加入 `correlationId`。main 未記錄成功、renderer 補寫時，沿用這個 id；renderer 自己的錯誤仍用 `record.id`。
- 所有使用 wrapper 的 handler（27 個檔案）自動受益，不必逐一修改。

## 延後項目與啟動條件

| 項目                                                        | 啟動條件                                     |
| ----------------------------------------------------------- | -------------------------------------------- |
| 通知保存 id、回報 payload 帶 id、裁切紀錄時保留被指到的那筆 | relay 已部署並開始收到真實錯誤回報           |
| 自動回報（ADR 0029）附 id                                   | 同上；relay 只接受固定欄位，必須先部署 relay |
| 長任務沿用 item／batch／request id                          | 某類工作開始在一次失敗中寫出多筆紀錄         |
| viewer 與 F6 工作台依 id 篩選                               | 上述任一項完成                               |

做回報整合時要注意：

- 「回報這個問題」收到的是通知項目，只用標題與內文預填描述；要經 `notifyFailure` 把 id 存進通知。直接發 `tone: 'danger'` 通知的 32 個檔案拿不到 id。
- 附帶的診斷紀錄（最多 50 筆）超過大小上限時從最舊的刪起，被指到的那筆要保留。
- 沒有附帶診斷紀錄時不送 id。

## 不採用

renderer 為每次 invoke 發號：要把具名 preload intent 改成通用信封，牽動 200 多個 channel；renderer 在呼叫 IPC 前的失敗本來就有自己的紀錄。
