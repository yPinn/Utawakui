# 手機遙控與提詞契約

手機在同一區網內看歌詞並遙控播放。決策與威脅模型見 [ADR 0033](../adr/0033-mobile-companion-local-network.md)。此契約定義可驗證的行為；已實作，實機驗收見下方清單，現行狀態以[產品規格](../spec.md)為準。

## 範圍

- 提供：手機讀詞（沿用桌面提詞器呈現）、播放遙控、已配對裝置管理。
- 不提供：佇列編輯、拖曳進度、刪除或任何破壞性操作、曲庫瀏覽、上傳、雲端轉送、帳號、觀眾點歌。
- Output server、`/ws`、提詞器 preload 與 renderer IPC 一律不對區網開放，也不與此功能共用連接埠或憑證。

## 啟用與網路

- 功能受 `mobile-companion` gate 保護，預設關閉。gate 關閉時不建立 listener，也不讀取裝置清單。
- 啟用時在設定選擇一個 IPv4 網路介面。Main 只綁定該位址；Windows 將該網路列為公用或無法判定時拒絕啟動，並說明改成私人網路的方法。
- 連接埠預設 8710，可在 1024–49151 內更改；衝突時顯示錯誤，不自動換埠。
- 每個 HTTP 請求的 `Host` 必須等於 `<所選位址>:<埠>`；WebSocket 的 `Origin` 必須等於 `http://<所選位址>:<埠>`。不送 CORS 標頭。
- 第一次監聽時 Windows 防火牆會詢問，說明文字建議只允許私人網路。
- 啟用中，設定與狀態列顯示「手機遙控已開啟」及連線中的裝置數；關閉或 App 結束時立即停止監聽並關閉連線。

## 配對

1. 使用者在設定按「配對手機」。配對碼預設隱藏，按「顯示配對碼」才繪製 QR 碼與同一網址的文字版，配對完成、過期或取消後收起；隱藏時畫面不含任何可掃描內容，直播或擷取到設定視窗也不會外洩。
2. 網址形如 `http://<位址>:<埠>/m/#pair=<code>`。`code` 為 128 位元隨機值，120 秒內有效、只能用一次；關閉對話框或產生新碼時舊碼作廢。片段不隨請求送出，伺服器不記錄。
3. 手機頁讀取片段後立刻從網址列移除，再以 `POST /m/api/v1/pair` 提交 `{ code, label }`。`label` 為裝置名稱，1–40 字，預設取瀏覽器平台字串。
4. 有效的碼只會開啟一個待確認要求，回 `202 { claimToken, matchCode, expiresAt }`，不發放憑證。`matchCode` 為 4 位數，手機與電腦同時顯示；`claimToken` 為 256 位元，只用來取回結果。同一時間只允許一個待確認要求，其他掃描回 `pairing-busy`。
5. 電腦設定顯示「允許「名稱」連線？」與對照碼。使用者核對手機顯示相同代碼後按「允許」才建立裝置；按「拒絕」或 60 秒未處理即失效。允許需要 gate，拒絕隨時可用。QR 碼外流時，他人掃描只會出現一個可拒絕的要求。
6. 手機每 1.5 秒以 `POST /m/api/v1/pair/status { claimToken }` 查詢，允許後只取得一次 256 位元裝置憑證並存在 `localStorage`；拒絕、逾時或未知都回 403 並請使用者重新掃描。Main 只保存憑證的 SHA-256、名稱、建立與最後連線時間，以 `safeStorage` 加密寫入 userData。
7. 掃描失敗一律回同一個有界錯誤，不透露是過期、已用或錯誤。同一碼連續失敗 5 次即作廢。最多保留 8 台裝置，超過時允許會失敗並自動拒絕該要求。

## 裝置與撤銷

- 設定列出每台裝置的名稱、建立時間與最後連線時間，可個別撤銷或全部撤銷。
- 撤銷立即關閉該裝置的連線，之後的請求回 401；手機頁清除本機憑證並回到「請重新掃描配對」。
- 關閉功能不刪除已配對裝置；關閉 gate 時同樣保留，重新開啟後仍可連線。

## 讀取通道

- 手機以 WebSocket `/m/ws`（子協定 `utawakui.companion.v1`）連線，3 秒內須送出 `{ type: "auth", credential }`，否則以 1008 關閉。驗證後只由伺服器送出訊息；其後任何客戶端訊息都關閉連線。
- 內容為已驗證的提詞器快照（`parsePerformerSnapshot` 的同一 schema），含 `bootId`、`sourceEpoch` 與 revision；不含路徑、網址、曲庫清單或 provider 資料。
- 快照發布不依賴桌面提詞器視窗是否開啟。沒有曲目時送出空狀態。
- 每台裝置最多 2 條讀取連線；單訊息上限 64 KiB；30 秒心跳。

## 遙控指令

指令以 `POST /m/api/v1/command` 送出，標頭 `Authorization: Bearer <credential>`，內容固定為：

```json
{ "command": "player.next", "sequence": 42, "revision": 17, "trackId": "abc" }
```

| command                                                 | 對應                        |
| ------------------------------------------------------- | --------------------------- |
| `player.play-pause`                                     | 播放／暫停                  |
| `player.previous`、`player.next`                        | 上一首／下一首              |
| `player.transpose-up`、`player.transpose-down`          | 升降 Key 1 個半音（±12 內） |
| `player.volume-up`、`player.volume-down`、`player.mute` | 監聽音量與靜音              |
| `lyrics.offset-up`、`lyrics.offset-down`                | 歌詞快慢微調                |
| `reading.off`、`reading.furigana`、`reading.romaji`     | 讀音顯示                    |

- `sequence` 為每台裝置單調遞增的整數，重複或倒退即拒絕；`revision` 與 `trackId` 必須對應最近發布的快照之一，否則回 `stale`。
- Main 依序檢查 gate、憑證、能力 `player.transport.write`、schema、速率與 renderer 是否就緒，再交給既有的快捷指令執行器或提詞器指令路徑。
- 回應狀態為 `rejected`（含有界原因：`unauthorized`、`invalid`、`stale`、`rate-limited`、`unavailable`、`busy`）、`accepted` 或 `applied`；2 秒內未套用回 `timed_out`。renderer 不可用時直接拒絕，不排隊。
- 每台裝置每秒最多 8 個指令，同一指令每 100 ms 最多 1 個；請求本文上限 1 KiB。
- 直播或錄影中不另加確認；指令只限上表，不含破壞性操作。

## 手機頁

- 專用 renderer entry，由 listener 以精確檔案清單提供，CSP 只允許同源的 script、style、font、img 與 `connect-src` 自身 WebSocket。
- 版面沿用 `PerformerSurface`（`mode="combined"`）、`selectPerformerFrame` 與提詞器 tokens，加上手機外殼：安全區域、直橫向、閱讀距離存在手機本機。
- 遙控按鈕使用既有 Ui 元件與觸控尺寸（`--ui-control-height-live`）；結果以短暫狀態文字回報，`stale` 時自動重新讀取快照。
- 連線中斷時顯示重新連線狀態並以退避重試；收到 401 時停止重試並提示重新配對。

## 驗收

1. gate 關閉時 8710 無 listener；開啟後只在所選介面監聽，其他介面與 `127.0.0.1` 無回應。
2. 公用網路設定檔拒絕啟動並顯示原因。
3. 錯誤 `Host` 或 `Origin`、缺少或錯誤憑證、超時未驗證的 WebSocket 都被拒絕。
4. 配對碼過期、重用、第 5 次錯誤後作廢；網址片段不出現在伺服器紀錄或診斷匯出。配對碼預設隱藏；未在電腦允許前手機拿不到憑證，拒絕或 60 秒逾時後要求失效，雙方顯示的對照碼一致。
5. 撤銷後該裝置連線立即中斷，舊憑證回 401；其他裝置不受影響。
6. 每個指令在已載入曲目時生效，並回 `applied`；切歌後送出舊 revision 回 `stale`；重送相同 sequence 被拒。
7. 超出速率回 `rate-limited`；不在清單的指令與多餘欄位回 `invalid`。
8. 桌面提詞器關閉時手機仍收到快照；renderer 重新載入期間指令回 `unavailable`。
9. 手機頁在 320 px 直向與 568×320 橫向可完整操作，深淺主題可讀。
10. 關閉功能或結束 App 後連線關閉且不再監聽；重新開啟後已配對裝置可直接連線。
