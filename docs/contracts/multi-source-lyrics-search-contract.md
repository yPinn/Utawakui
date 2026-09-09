# 多來源歌詞搜尋契約

狀態：已實作。
建立日期：2026-08-29。

## 產品行為

`所有線上來源` 是手動歌詞搜尋的主要入口，仍受 `lyrics-flow` gate 保護。Main 只對
allowlisted 的 LRCLIB、NetEase 與 Better Lyrics 公開快取平行 fan-out；任一來源成功即可回傳可用結果，其他來源
失敗或丟出非預期 exception 時只形成 bounded partial status，不會丟棄成功候選。個別來源入口仍保留供使用者篩選、
重試與確認來源差異。

搜尋只建立候選，不修改曲目或拼接歌詞。儲存仍選定單一 provider candidate，並沿用各來源
的 save-time refetch、fingerprint 與 provenance 契約。

Provider import 與 provider metadata backfill 另使用 main-owned automatic acquisition orchestrator。
自動政策與手動 allowlist 分離：LRCLIB／NetEase 可自動探索與保存；Better Lyrics 因缺少命中
metadata，只能手動預覽／保存。自動流程只接受 `exact`，同 band 仍套用相同的
`full T2 > full T1 > partial T2 > T0` 排序；`strong`／`related` 即使是 T2 也不自動保存。
若曲目已有任何來源，新的 T1 不視為升級；只有完整 T2 可以新增為自動偏好。完整 T2 必須是
每一行都有通過 canonical validator 的 segments；混合 T2／T1 的 document 即使最高 granularity
為 T2，仍屬 partial T2。曲目已存在完整 T2 時不發出 provider request。

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
- NetEase 依既有 query plan 最多送出三個 structured title／artist variants，涵蓋 bounded
  cross-script title aliases；候選 identity 比對會把繁／簡中文視為同一文字身份，但不改寫
  保存內容。每次搜尋先以 metadata gate 過濾最多十筆結果，再依排名最多三筆一批取得
  YRC／LRC；取得三筆可用候選即停止。若高排名項目沒有可用歌詞，繼續下一批直到達標或
  metadata exhausted。
- Better Lyrics 以 title、artist、album 與 duration 執行單筆 cache-first 查詢；401 是預期
  cache miss。回應缺少命中 metadata，因此只提供手動預覽／保存，並沿用相同 TTML validator。
- 每個來源保留自己的 scheduler 與 request interval；平行 fan-out 不繞過 provider rate
  limit。
- 相同 provider／track identity／query／mode 的 in-flight search 共用同一 promise。成功
  discovery 以 main-owned 5 分鐘、最多 32 筆的記憶體 cache 重用；failure 不快取。
- 同一來源的新互動式 query 會 abort 舊 query；background automatic query 不互相取消。
  Renderer 仍以 request generation 忽略任何已越界
  的晚到結果。
- Cache 只縮短 discovery。儲存前永遠重新取得指定 candidate 並驗證 fingerprint。
- NetEase hydration cache 依 track／query identity 隔離並有 32 組上限，其他曲目的搜尋不會使
  已呈現候選在保存前變成 stale。

## 自動取得與來源偏好

Provider 音訊先提交 index 並回傳成功，automatic acquisition 才在背景執行；歌詞 miss、gate
未啟用或 provider 失敗都不延後或回滾音訊 import。Automatic queue 同時最多執行兩首曲目，
每曲 job 維持 single-flight。來源搜尋完成後先重讀 manifest 與 timing sidecar，各 provider 完成
save-time refetch／fingerprint 驗證後、同步 persistence 前還會執行一次 generation、實際音訊與
完整 T2 commit guard。Main 先以 filesystem authority 確認曲目存在，再使 generation 失效並於
同一 turn 同步刪除；即使後續 index 寫入失敗，舊工作也不得重建 lyrics 目錄或寫入同 id
重新匯入的新曲目。Import 與 backfill 都用 main-derived
track id 當 stable job key，service 另以 main-derived track directory basename 防禦漏傳 id；無效或
不存在的 track id 不配置 generation。刪除只清除此曲目的 discovery cache，generation 在相關
新舊工作全數結束後移除。Provider source 一旦成功保存，即使 automatic preference 的第二次
manifest 寫入失敗，也會記錄 bounded failure 並以 bounded refresh options 推送 library update；
不傳送 provider save result 或 timing document。

`lyrics/lyrics.json` 可選擇性保存 `{ filename, origin }` source preference；`origin` 只能是
`user` 或 `automatic`，filename 必須仍存在於 manifest。Renderer 選擇優先序是目前仍有效的
畫面選擇、持久化 preference、語言推測、第一筆 legacy source。使用者選擇不會被 automatic
preference 覆寫；偏好來源刪除時一併清除。舊 manifest 沒有 preference 時維持既有 fallback，
不需要網路 migration。

Main 的 timing metric 只包含 provider、cache hit、duration、candidate count 與 status；不得
記錄 track title、artist、candidate id 或歌詞內容。

AMLL acquisition 已退出 renderer 入口、main provider allowlist 與 `all` fan-out。Main 對
`amll` search／save intent 回覆 invalid provider；退役前保存的 AMLL 本機來源仍由 document
handler 提供讀取與刪除相容，不屬於本搜尋契約。

## Renderer contract

跨來源候選使用 `providerId:id` 的 stable `candidateKey`，避免不同來源相同數字 id 互相覆寫。
Renderer 維持單一 acquisition state owner，保存展開列與 saving state 時均使用此 key。
同一 recording group 預設只顯示推薦來源，使用者可明確展開替代來源。

Aggregate 的每筆 `providerStatuses` 只投影 provider、status 與 reason。Renderer 不為個別
來源的正常零結果或 `unavailable`（例如 Better Lyrics `cache-miss`）增加提示；Better Lyrics
個別面板的 `cache-miss`、`not-found` 與 `low-confidence-match` 也保持完全安靜。只有
`error`（例如 timeout、offline、rate limit）
才顯示不阻擋其他結果的來源警告，不得把 cache miss 描述成來源暫時故障。
