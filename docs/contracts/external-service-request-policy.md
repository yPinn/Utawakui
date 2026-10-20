# 外部服務請求契約

本契約涵蓋歌詞、CAA／圖片與來源 album 縮圖、Musixmatch probe、回報、獨立更新 manifest、
app-managed dependency 及正式／研究歌詞環境的 pinned 下載。
MusicBrainz 的既有專屬 scheduler／短重試政策見 [music identity contract](music-identity-evidence-contract.md)。

## 共用冷卻

`electron/lib/providerServiceCooldown.js` 只保存相同 fetch transport 下各 origin 的失敗狀態，不保存 path、query、credential、body 或內容快取。
每個 request 在真正發送前重查，包含 client scheduler 中已排隊的操作。
HTTP 429／5xx 會記錄失敗；NetEase JSON code 與 Musixmatch API status code 同樣可記錄。
有效 `Retry-After` 秒數／HTTP date 優先，長期限不截短，也不建立對應長 timer。
無有效提示時，429 從 30 秒、5xx 從 5 秒倍增，fallback 最多 5 分鐘。

冷卻中的 request 不送網路，提供僅含 HTTP status 的空 response，交給各 client 原有的 bounded error mapping，避免更改 IPC error 格式。
caller 已取消時保留 abort 行為。不同 origin 的狀態互不影響；同 transport／origin 的 client 實例共用狀態。
新的成功 response 只在沒有較新失敗的情況下清除連續失敗計數；較早發出的晚回成功不能解除新的冷卻。
狀態為 process-local，不寫磁碟或新增 telemetry，App 重啟後重新建立。

## 重試與安全邊界

guard 本身不重試。LRCLIB 只在首次 503 的有效提示不超過 5 秒及 caller 設定上限時，透過原 scheduler 重試一次；429 不重送，較長期限直接回不可用。
NetEase、Better Lyrics、CAA／圖片、Musixmatch、回報 POST、更新 manifest 及 dependency downloader 不因此增加自動重送。
POST 的未明結果不得因 guard 自行再次提交。既有 consumer 的明確人工重試、有限 provider phases、candidate caches 與 timeout ownership 保持原位。

guard 不建立新 endpoint、跟隨 redirect 或解除驗證。原本的 URL allowlists、每跳 redirect 驗證、checksum、response bytes／image dimensions、來源 gate 與 main-owned intents 仍由各 consumer 持有。
它只觀察已回傳的失敗，不代表官方公布了某個固定配額，也不是平台／歌詞／圖片／模型的使用許可。
