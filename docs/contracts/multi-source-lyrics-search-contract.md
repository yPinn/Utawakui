# 多來源歌詞搜尋契約

狀態：已實作。
建立日期：2026-08-29。

開發用 HTTP 契約錄製／離線重播見[操作手冊](../operations/lyrics-provider-contracts.md)。樣本只供格式回歸，不改產品取得政策，不作命中率或語意品質證據。

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

## 來源時間軸差異提示

手動 `all` 搜尋在既有同錄音 group 內，另提供唯讀的來源行起點比較。目前只重用 LRCLIB
與 NetEase 已取得的完整 T1／T2 原文行資料；不增加 hydration、網路請求、模型、IPC channel
或持久化資料。比較基準取排序中第一筆具有有效 evidence、已知正時長與 fingerprint 的來源，
獨立於推薦來源；Better Lyrics 仍依原流程提供預覽，不因缺少 evidence 遮蔽其他來源間的比較。

Main 暫存每來源最多 128 個全曲分布的唯一文字 SHA-256／行起點，繁簡、Unicode 寬度、大小寫
及標點只在比較時正規化，不改寫歌詞。重複句、短句、超過 2,000 字元的單行與可辨識的製作
credit 不作配對；輸入超過 5,000 行或總文字 100,000 字元時不產生 evidence。簽章只留 main 記憶體與
既有有界 discovery cache，個別來源與 aggregate 的公開結果均不暴露此資料。

兩來源須具有 exact artist identity、合法 fingerprint，並符合原同錄音分組。至少五個唯一句
依相同順序配對，覆蓋較大樣本集合至少一半，兩邊配對跨度各至少十秒，所有時間差不超過
十五秒且最大與最小差距不超過 500 ms，才接受其中位數作為相對偏移。只有絕對差超過一秒
才回傳提示；renderer 只收到相對來源 key、兩份 fingerprint、偏移與配對行數。

既有候選列以「時間有差異」標記，展開後說明相對哪個來源早／晚與比對行數，並提醒這不代表
哪份較準。提示不進入排序 warnings，不改推薦、自動取得、儲存、使用中來源、來源偏移或人工
T2；儲存仍經使用者操作與既有 refetch／fingerprint 驗證。任一 fingerprint 不符時隱藏；
save-time 發現 `record-changed` 會在目前 track／search generation 移除相關摘要，取消更新也
不恢復，重新搜尋才重新建立。不影響其他比較，晚到舊 save 回應也不移除新搜尋的摘要。
Main 在 `record-changed` 時同步失效該 provider／track identity 的各查詢與模式快取；已在途的
舊查詢不再被重用、回填快取或提供時間比較 evidence，也不會清掉取代它的新查詢。
NetEase 的 broaden 會保留 hydrated records，因此只更新其記憶體中的已 refetch 預覽，
不寫入來源或接受更新。重新取得仍須明確搜尋，不自動增加請求或保存。

此提示比較 provider 原始行起點，不比對本機校時後結果，不做逐字對齊或準確度判定。
抽樣、文字差異、重複句、局部漂移或資料不足都可能沒有提示；沒有提示不代表同步準確。

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

候選展開列與來源管理可開啟既有 `content` feedback 草稿，僅預填有界歌曲／來源 metadata、
同步層級與已保存來源的已知偏移。更新待確認時只回報當下預覽，不確認保存；取消回報保留
原畫面、選擇、offset 與人工 T2。此入口不新增網路、IPC channel 或 relay schema，送出仍由
使用者在既有預覽流程明確操作；失敗可沿用 JSON fallback。回報不自動進入 reviewed corpus，
人工重現與清理回歸流程見[歌詞問題案例回流](../operations/lyrics-issue-feedback.md)。

跨來源候選使用 `providerId:id` 的 stable `candidateKey`，避免不同來源相同數字 id 互相覆寫。
Renderer 維持單一 acquisition state owner，保存展開列與 saving state 時均使用此 key。
同一 recording group 直接列出推薦與其他來源；搜尋完成預設展開首組推薦來源的預覽，其他列由使用者展開。

Aggregate 的每筆 `providerStatuses` 只投影 provider、status 與 reason。Renderer 不為個別
來源的正常零結果或 `unavailable`（例如 Better Lyrics `cache-miss`）增加提示；Better Lyrics
個別面板的 `cache-miss`、`not-found` 與 `low-confidence-match` 也保持完全安靜。只有
`error`（例如 timeout、offline、rate limit）
才顯示不阻擋其他結果的來源警告，不得把 cache miss 描述成來源暫時故障。
