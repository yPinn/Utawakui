# 本機 MV 取得原型

這個隔離原型用同一套暫存、影片驗證和保存流程驗證本機檔與 yt-dlp 下載。它使用臨時資料夾及自行產生的影片，不需要曲庫、YouTube 登入或外部網路。

先備妥 Utawakui 已啟用的 yt-dlp runtime，以及可用的 FFmpeg 和 ffprobe，再從 repo 根目錄執行：

```powershell
node prototypes/local-mv/verify.mjs
npm exec vitest run -- scripts/local-mv-prototype.test.mjs
```

如果 yt-dlp runtime 位於非預設位置，可以將該 runtime 的 Python 執行檔路徑傳給 `verify.mjs`。

驗證器生成 720p、1080p 和 1440p 的 H.264 MP4，對每一份檔案分別測試本機匯入及透過 loopback 的真實 yt-dlp 下載，再比較解析度、容量和 SHA-256。單元測試驗證 1080p 預選、低於 FHD 時選最高、較高畫質選項、取消與驗檔失敗的暫存清理。

〈晩餐歌〉官方 MV（`oZpYEEcvu5I`）用於唯讀格式查詢。2026-11-10 觀測到 1080p 視訊流為 1536 × 1080、12 fps，格式 137 的來源報告大小為 58,083,776 bytes。影片本身未保存。這項測試沒有接進桌面曲目詳情，也未驗證播放器的畫音同步或正式下載來源權限。
