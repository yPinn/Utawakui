# Better Lyrics 快取來源取得契約

狀態：實驗性接入。
建立日期：2026-08-31。

## 來源與產品邊界

`betterlyrics` 只呼叫 Better Lyrics 公開、固定 origin 的
`https://lyrics-api.boidu.dev/getLyrics`。目前產品不接受 API key、不加入 Apple bearer 或
`media-user-token`，也不嘗試預熱未命中的上游快取。HTTP 401 是預期的 `cache-miss`，只讓
此來源 unavailable；本機匯入、播放與其他歌詞來源不受影響。

Better Lyrics 是獨立 provenance，不標示為 Apple Music。公開 API 與服務程式碼的授權不
等同歌詞內容授權；正式散布或商業使用前仍需確認保存與 OBS 顯示條件。

## 查詢與符合門檻

- Main 由本機 track identity 推導 `title`、`artist`、`album` 與整秒 `duration`；renderer
  不提供 URL、header、key 或 transport 選項。
- Title、artist 與有效 duration 缺一不可。`broaden` 只移除 album，不移除 artist 或
  duration。
- API 目前可能只回傳 `ttml`，文件中的 `score` 與 `X-Provider` 視為可選；若存在則必須
  符合 bounded schema，且低於 80 的 score 不建立候選。
- 因回應沒有實際命中的 title／artist／album metadata，候選只能證明「此查詢取得一份
  TTML」，不能獨立證明上游錄音 identity。UI 必須保留預覽與手動保存，不得自動取得。

## TTML 與保存

Better Lyrics 共用既有的 bounded SAX TTML parser，但保存為獨立
`betterlyrics` artifact。只有完整 primary authored spans 通過 canonical validator 才建立
T2 timing sidecar；line timing 如實降為 T1，unsafe／invalid TTML 不保存。

候選 id 是查詢 identity 的 deterministic bounded hash。搜尋授權綁定 track identity、id、
query 與 fingerprint；保存前以完全相同查詢重抓，重新解析並比較 fingerprint。變更回傳
`record-changed`，不一致或跨曲目重放回傳 bounded unavailable。

本機保存包含 compatibility LRC、canonical timing sidecar 與原始 TTML provider artifact。
刪除來源會一併移除 timing 與 artifact；manifest 不保存 absolute path。

## 已驗證限制

2026-08-31 的四首唯讀 smoke test 中，`Shape of You` 為公開 `HIT` 且通過完整 T2 驗證；
`Lemon`、`アイドル` 與 `告白氣球` 皆為 `cache-miss`。這只證明接線與失敗分類，不能推論
總體覆蓋率。Better Lyrics 維持手動、實驗性、cache-first 來源。

單一 Better Lyrics 面板遇到 `cache-miss`、`not-found` 或 `low-confidence-match` 時不顯示
空結果或錯誤提示；這些是正常無候選狀態。只有 timeout、offline、rate limit、服務異常或
資料驗證失敗才顯示操作提示。Better Lyrics 不加入 automatic acquisition fan-out。
