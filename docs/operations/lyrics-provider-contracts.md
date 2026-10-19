# 歌詞 provider HTTP 契約錄製與離線重播

此工具只供開發驗證，重用正式 LRCLIB／NetEase client。它不改變產品 gate、搜尋政策、來源保存或封裝，不加入執行依賴。

## 日常離線驗證

```text
npm run lyrics:contracts -- replay lrclib
npm run lyrics:contracts -- replay netease
npm test -- --project runtime scripts/lyrics-provider-contracts.test.mjs scripts/lyrics-provider-contract-cli.test.mjs --maxWorkers 2
```

預設測試讀取 `scripts/fixtures/lyrics-provider-contracts/` 的真實回應清理樣本，不連網。缺檔、未錄製請求、請求順序改變、剩餘回應或 normalizer 不再接受格式，都必須失敗，不自動補錄或略過。

目前固定 probe 查詢一首公開歌曲的 title／artist，先 search，再依首筆 id 取 detail；LRCLIB 的 detail 為 get-by-id，NetEase 為既有 lyric route。它不代表完整曲庫命中率、不涵蓋所有端點、語言或錯誤格式，也不驗證文字比對品質。Better Lyrics 尚未加入本批錄製。

## 明確重新錄製

```text
npm run lyrics:contracts -- record lrclib
npm run lyrics:contracts -- record netease
```

只有 `record` 會透過現有 scheduler 連線，host／route 固定，不接受 URL、cookie、token、任意輸入或輸出路徑。只查詢及讀取，不向 provider 上傳資料。

成功時在 ignored `.benchmarks/lyrics-provider-contracts/` 建立帶時間的 JSON，使用 exclusive create，拒絕覆寫；查詢或 schema 驗證失敗不保存本批。CLI 只印 provider、模式、數量、狀態與產物檔名；錯誤不印 provider body、原始例外或請求內容。

確認新樣本的格式變化有合理原因後，將該清理檔更新到相應的 committed fixture，再跑離線驗證與 diff review。不要以更新 fixture 迴避 client 的格式錯誤，也不要把 `.benchmarks/` 整批納入版本控制。

## 保存界線

- HTTP 原文只在記憶體中有界讀取；每個 response 上限 4 MiB，最多 20 次 request，整份 cassette 上限 8 MiB。
- JSON 文字值替換為同 UTF-16 長度的占位文字，保留空白、null、數值、布林、陣列與欄位結構。未知文字欄位也清理；不保留歌曲名稱或歌詞。
- LRC 保留時間戳與數字 offset。YRC 保留行／詞 timing tuple；metadata JSON 的文字也清理。此為格式契約，不保留歌詞語意。
- lyricsfile 經有界 YAML events 檢查，拒絕 aliases、anchors、tags 與多文件；保留必要版本／語言識別、數值與詞塊結構後重新序列化。
- 不保存原始 request URL、query、body 或 headers；只保存精確請求的 SHA-256 signature。HTTP response headers 只保留數字 Retry-After；HTTP failure body 不保存。
- 重播沒有 transport fallback，並檢查 cassette 的完整 schema 與清理結果。這些樣本只用於開發，不放入一般 diagnostics 匯出。

目前 committed 樣本於 2026-10-19 真實錄製：LRCLIB search 20 筆與 detail、NetEase search 10 筆與 detail，各兩個 HTTP 回應。重新錄製時間見各 JSON 的 `recordedAt`。
