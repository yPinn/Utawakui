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
LRCLIB 的 Main 診斷另保留固定分類：`stage` 為 `network`／`cooldown`，`status` 為 `background`／`interactive`，並保留實際或冷卻來源的 HTTP status；冷卻攔截不視為另一筆送到網站的請求。此標記由本機 guard 的 WeakSet 判定，不信任回應 headers 提供的分類。
caller 已取消時保留 abort 行為。不同 origin 的狀態互不影響；同 transport／origin 的 client 實例共用狀態。
Kugou備援的catalog、歌詞列表或download任一必要origin已在冷卻時，Main先返回該來源不可用，不再為這次備援額外解析Apple別名或查catalog；唯讀健康檢查不扣HTTP預算。
新的成功 response 只在沒有較新失敗的情況下清除連續失敗計數；較早發出的晚回成功不能解除新的冷卻。
狀態為 process-local，不寫磁碟或新增 telemetry，App 重啟後重新建立。

## 重試與安全邊界

四個正式歌詞 client 與 Apple 別名 metadata 透過 `electron/lib/lyricsProviders/requestPolicy.js`，在相同 fetch transport 下共用每來源的有界排程。LRCLIB／NetEase／Kugou 至少相隔 1000ms 啟動、Better Lyrics 至少相隔 2000ms、Apple 至少相隔 3100ms；背景、互動、保存與重試共用。`requestExecutor.js` 在 source queue 外限制全域最多兩個操作（含排程等待及 body），其中背景最多占一個；佇列最多64個，互動優先於仍在佇列的背景工作。這是本機保守政策，不代表上游配額，也不涵蓋其他 App／程序共用的 IP 流量。

`querySession.js` 是跨來源父預算：整合初查最多12次實際HTTP／20秒，明確擴搜新增8次／15秒，保存另建最多3次／12秒。排程等待、body、來源與別名各階段共用父deadline，不因進入備援重新計時。主要來源階段最多4次／6秒（LRCLIB1、NetEase2、Better1），別名最多2次／6秒，Kugou最多5次／8秒。擴搜主要階段最多3次，先LRCLIB1／NetEase2，讓metadata後仍能取歌詞；再以快取或剩餘額度查Better的相同條件，保留別名2次與備援至少3次額度。各上限同時成立、最先耗盡者停止；已通過的候選保留。整合及背景查詢不啟動503短重試。

背景匯入／metadata backfill 共用一次一首、最多32首待執行的佇列，各曲起點至少30秒，同曲五分鐘內不重排。每曲含fresh保存合計最多7次實際HTTP／30秒，探索LRCLIB最多2、NetEase最多3；不加入Apple、Better或Kugou。各來源背景HTTP起點至少5秒，rolling60秒最多12次，達額度停止而不排延後重試。冷卻、快取及相同flight不重扣父額度；一次物理請求即使有多個同session訂閱者，也只扣該父預算一次。這些控制保留互動容量，不能保證不遇上游限流。

單獨來源操作仍有來源上限：LRCLIB 首次／擴搜／自動／保存為 2／4／2／2 次；NetEase 為 6／8／6／1 次；Better Lyrics 各1次；Kugou首次／擴搜／保存為5／8／3次，不參與背景自動取得。來源搜尋 deadline 分別為20／25／15／25秒，fresh來源預設15秒；由Main整合／保存／背景建立的父及階段預算會進一步收緊。Apple只有兩次 metadata，不取得歌詞或音訊。快取命中與共用冷卻攔截不扣 attempt；單來源503的一次有限重試照樣扣同一預算。到達上限回 `request-budget-exhausted`，已有候選保留 partial，沒有背景自動續查或延後重送。

固定 endpoint／實際參數／驗證 profile 的相同探索請求可跨 client 合併；每個 caller 的 budget／取消互相獨立，最後 caller 離開才 abort 共用底層工作，已取消工作不得回填快取。只有完整成功結果可保留 30 秒，每來源最多 32 筆及 8MiB；資料只在 Main 記憶體。保存使用 fresh lane，成功重取後清除同來源探索快取、阻止舊探索在途回填；暫時驗證失敗保留先前成功探索。保存仍驗 fingerprint，不能從探索快取完成。

guard 本身不重試。LRCLIB 只在首次 503 的有效提示不超過 5 秒及 caller 設定上限時，透過原 scheduler 重試一次；429 不重送，較長期限直接回不可用。
NetEase、Better Lyrics、Kugou、CAA／圖片、Musixmatch、回報 POST、更新 manifest 及 dependency downloader 不因此增加自動重送。
POST 的未明結果不得因 guard 自行再次提交。既有 consumer 的明確人工重試、有限 provider phases、candidate caches 與 timeout ownership 保持原位。

guard 不建立新 endpoint、跟隨 redirect 或解除驗證。原本的 URL allowlists、每跳 redirect 驗證、checksum、response bytes／image dimensions、來源 gate 與 main-owned intents 仍由各 consumer 持有。
它只觀察已回傳的失敗，不代表官方公布了某個固定配額，也不是平台／歌詞／圖片／模型的使用許可。
