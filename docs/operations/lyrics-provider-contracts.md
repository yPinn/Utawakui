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

## 搜尋失敗的實際診斷

離線重播通過只證明本機契約，不能證明來源當前可用或特定歌曲有覆蓋。
使用者回報重啟後仍失敗時，先對齊本次 diagnostics 的時間、operation、reason、httpStatus 與 stage；不要以版本號相同推定已載入同一份開發程式。

- `stage: network` 的 503 是實際上游回應；`stage: cooldown` 是本機沿用來源冷卻，並非又送出一次 HTTP。429 與 503 不混稱為限流；[LRCLIB 官方錯誤契約](https://lrclib.net/docs#errors)將 503 定義為服務過載，應遵守 `Retry-After`，不能因重啟、換歌曲或換端點而繞過冷卻。
- 同一時間某首官方示例能取得，不代表所有搜尋或錄音都恢復。只記錄實際成功的端點與條件；不得把其他端點的冷卻攔截當成第二次網路失敗。
- 「LRCLIB 503、NetEase 200 但沒有符合錄音、Better Lyrics 401 快取未命中」仍可能沒有任何候選。這不是三個獨立且覆蓋相同曲庫的備援；不要放寬歌手／版本驗證，拿同名歌曲充作成功。
- 需要線上核對時，使用正式 client、少量固定查詢、原有共用間隔／預算／冷卻，保存有界狀態收據。區分真實成功與注入回應的恢復測試，不因未成功而持續輪詢。

2026-10-31 已以真實 client 確認上述失敗組合；另有官方示例 exact 成功，但回報歌曲的 search／exact 實測仍曾回傳 503。這是該次觀察，不是來源可用率或永久覆蓋率結論。`requestPolicy.integration.test.js` 的離線回歸覆蓋整合階段不重試503、替代來源正常未命中、私有body不外傳，以及模擬服務恢復後同查詢無須重啟即可成功；不宣稱該歌曲已在線上取得。

## Kugou受控備援

正式手動整合查詢已包含主要來源未命中時才啟用的Kugou原生LRC備援，保存需要使用者確認。共享預算／限流、完整credit／版本／時長及fresh fingerprint契約見[來源契約](../contracts/lyrics-sources.md#kugou受控備援)。目前Kugou回歸使用離線固定route fixture及研究時的多語身份負例，不宣稱已納入本CLI的live record/replay provider清單；既有`record`命令仍只支援上述明列來源，不增加未受控網路錄製。
