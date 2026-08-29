# 多來源歌詞搜尋契約

狀態：已實作。
建立日期：2026-08-29。

## 產品行為

`所有線上來源` 是手動歌詞搜尋的主要入口，仍受 `lyrics-flow` gate 保護。Main 只對
allowlisted 的 LRCLIB 與 NetEase 平行 fan-out；任一來源成功即可回傳可用結果，另一來源
失敗只形成 bounded partial status，不會丟棄成功候選。個別來源入口仍保留供使用者篩選、
重試與確認來源差異。

搜尋只建立候選，不修改曲目或拼接歌詞。儲存仍選定單一 provider candidate，並沿用各來源
的 save-time refetch、fingerprint 與 provenance 契約。

## 來源中立排序

Provider-native score 不得跨來源比較。Main 以同一組 bounded metadata 重新判斷 title、
artist、recording-version marker 與 duration，先分成 `exact`、`strong`、`related`，再排序：

1. 錄音相關性；`exact` 優先於 `strong`，兩者皆優先於 `related`。
2. 同一相關性內，完整 T2 優先於完整 T1，完整 T1 優先於 partial T2，最後才是 T0／
   instrumental／unsupported。
3. 再以 duration delta、bounded warnings、provider id 與 candidate id 作 deterministic
   tie-break。

因此錯誤版本的 T2 不得越過正確版本的 T1。Partial T2 也不得以技術層級名稱壓過完整可用
的 T1 fallback。

## 錄音分組

跨來源只在 normalized title 相同、artist 高度一致、版本 marker 無衝突，且已知 duration
相差不超過四秒時合併為同一 recording group。Live、Remix、伴奏、翻唱或時長明顯不同的
版本保持分離。每組第一筆是推薦來源；同組的其他來源緊接其後直接列出，不以
揭露控制隱藏。

Group 是搜尋 presentation，不是新的歌詞 artifact。不同來源的 line、word、translation
或 timing 永遠不互相拼接。

## 查詢成本與生命週期

- LRCLIB search response 已包含候選歌詞，直接 normalize／analyze，不製造第二輪 hydration。
- NetEase 先以 metadata identity gate 過濾最多十筆搜尋結果，再依排名最多三筆一批取得
  YRC／LRC；取得三筆可用候選即停止。若高排名項目沒有可用歌詞，繼續下一批直到達標或
  metadata exhausted。
- 每個來源保留自己的 scheduler 與 request interval；平行 fan-out 不繞過 provider rate
  limit。
- 相同 provider／track identity／query／mode 的 in-flight search 共用同一 promise。成功
  discovery 以 main-owned 5 分鐘、最多 32 筆的記憶體 cache 重用；failure 不快取。
- 同一來源的新 query 會 abort 舊 query。Renderer 仍以 request generation 忽略任何已越界
  的晚到結果。
- Cache 只縮短 discovery。儲存前永遠重新取得指定 candidate 並驗證 fingerprint。

Main 的 timing metric 只包含 provider、cache hit、duration、candidate count 與 status；不得
記錄 track title、artist、candidate id 或歌詞內容。

## Renderer contract

跨來源候選使用 `providerId:id` 的 stable `candidateKey`，避免不同來源相同數字 id 互相覆寫。
Renderer 維持單一 acquisition state owner，保存展開列與 saving state 時均使用此 key。
同一 recording group 預設只顯示推薦來源，使用者可明確展開替代來源；partial provider
failure 以不阻擋結果的提示呈現。
