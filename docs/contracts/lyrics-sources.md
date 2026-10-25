# 歌詞來源契約

外部歌詞的搜尋、自動取得、保存與各來源邊界。時間層級見[時間契約](lyrics-timing-contract.md)，限流與冷卻見[外部服務請求契約](external-service-request-policy.md)，HTTP 錄製／重播見[操作手冊](../operations/lyrics-provider-contracts.md)。

| 來源          | 狀態                      | 手動搜尋 | 自動取得 |
| ------------- | ------------------------- | -------- | -------- |
| LRCLIB        | 已實作（2026-08-23）      | ✓        | ✓        |
| NetEase       | 實驗性（2026-08-29）      | ✓        | ✓        |
| Better Lyrics | 實驗性、公開快取（08-31） | ✓        | —        |
| AMLL          | 已退役，只保留本機相容    | —        | —        |
| Musixmatch    | 未啟用的官方 API 備用     | —        | —        |

## 共同規則

- 所有外部請求由 main 發出，且每次都重新檢查 `lyrics-flow`；gate 關閉時零請求。失敗、離線或解析錯誤不得阻擋音訊匯入，也沒有隱藏的 fallback 請求。
- Renderer 只傳 allowlisted provider id、track id、bounded query、candidate id 與 preview fingerprint；只收到 bounded summary 與 typed 結果，不會收到原始 body、hash、路徑或例外文字。
- 搜尋結果只是 discovery。保存前一律以 id 或相同查詢重新取得並比對 SHA-256 fingerprint；內容變更時回傳 `record-changed` 與新摘要，需使用者再次確認，絕不靜默保存。取消會保留原畫面、選擇、offset 與人工 T2。
- 保存是 track lyrics tree 內的小 transaction：provider artifact → compatibility LRC → canonical timing sidecar（只在完整 T2 時）→ 最後發布 manifest。寫入原子、可冪等；中途失敗以舊 manifest 為準。刪除來源時一併移除 artifact、timing 與讀音資料。
- Manifest 只保存 scalar metadata 與 provenance，不存 URL 或絕對路徑。
- 不同來源的 line、word、translation 或 timing 永遠不互相拼接。

## 搜尋與排序

「所有線上來源」是手動搜尋主入口：main 對 LRCLIB、NetEase、Better Lyrics 平行 fan-out，任一成功即回傳，其他來源失敗只形成 bounded partial status。各來源仍可單獨篩選與重試。

Provider 原生分數不跨來源比較。Main 以 title、artist、版本 marker 與 duration 重新分級：

1. `exact` > `strong` > `related`。
2. 同級內：完整 T2 > 完整 T1 > partial T2 > T0／instrumental／unsupported。完整 T2 指每一行都有通過 canonical validator 的 segments。
3. 再以 duration delta、warnings、provider id、candidate id 做 deterministic tie-break。

錯誤版本的 T2 不得越過正確版本的 T1。

**錄音分組**：normalized title 相同、artist 高度一致、版本 marker 無衝突、已知 duration 差 ≤ 4 秒時合為一組；Live、Remix、伴奏、翻唱分開。每組首筆是推薦來源，其他來源緊接直接列出；搜尋完成預設展開首組推薦來源的預覽。分組只是呈現，不是新的歌詞 artifact。

**查詢成本**：

- 每個來源有自己的 scheduler 與 request interval；平行 fan-out 不繞過限流。
- 同 provider／track／query／mode 的 in-flight 搜尋共用 promise；成功結果以 main 記憶體快取 5 分鐘、最多 32 筆，失敗不快取。快取只縮短 discovery，不取代保存前重取。
- 同來源的新互動查詢會 abort 舊查詢；背景自動查詢互不取消；renderer 以 request generation 丟棄晚到結果。
- `record-changed` 時同步失效該 provider／track 的查詢快取，在途的舊查詢不得回填。

## 來源時間軸差異提示

手動「所有來源」搜尋中，同錄音組內的 LRCLIB 與 NetEase 完整 T1／T2 可比較行起點，不增加請求、模型、IPC 或持久化。

- Main 每來源暫存最多 128 個分布全曲的唯一文字 SHA-256 與行起點，只存在記憶體與既有 discovery cache；比較時才做繁簡、寬度、大小寫與標點正規化。重複句、短句、超過 2,000 字元的單行與製作 credit 不配對；超過 5,000 行或 100,000 字元不產生 evidence。
- 需 exact artist、合法 fingerprint、同組，至少五句同序配對、覆蓋較大集合一半、兩邊跨度各 ≥ 10 秒、各差 ≤ 15 秒且極差 ≤ 500 ms，才採中位數為偏移；絕對差 > 1 秒才提示。
- 候選列標「時間有差異」，展開說明相對哪個來源早／晚與配對行數，並提醒不代表誰較準。提示不影響排序、推薦、自動取得、保存或 offset；fingerprint 不符或 `record-changed` 時移除，重新搜尋才重建。
- 沒有提示不代表同步準確。

## 自動取得與來源偏好

- Provider 匯入與 metadata backfill 在音訊提交成功後於背景執行；歌詞 miss、gate 關閉或失敗都不延後或回滾匯入。
- 只有 LRCLIB 與 NetEase 參與，只接受 `exact`；`strong`／`related` 即使是 T2 也不自動保存。已有任何來源時，新的 T1 不算升級，只有完整 T2 可新增為自動偏好；已有完整 T2 時不發請求。
- 背景佇列預設一次一首，每曲 single-flight，以 main 推導的 track id 為 job key。同曲庫、同曲目 metadata 的背景嘗試完成後五分鐘內不重排，最多保留 256 筆 process-local 記憶；刪除／重新匯入會失效，不阻擋手動搜尋。保存前重讀 manifest 與 timing sidecar，並在 refetch 後、同步寫入前再檢查 generation、實際音訊與完整 T2 狀態；已刪除曲目的舊工作不得重建目錄。
- `lyrics/lyrics.json` 可存 `{ filename, origin }` 偏好，`origin` 為 `user` 或 `automatic`；使用者選擇不被自動偏好覆寫，偏好來源刪除時一併清除。Renderer 選擇順序：目前有效的畫面選擇 → 持久化偏好 → 語言推測 → 第一筆來源。
- Timing metric 只記 provider、cache hit、duration、候選數與 status，不記曲名、歌手或歌詞。

## 本機來源清單與顯示設定

- 可用歌詞 Modal 與來源選單共用唯讀排序：T2 逐字 → T1+ 估計 → T1 逐行 → T0 文字 → 待確認；同級保留原順序。代號表示時間細度，不表示正確率；T2 可為部分涵蓋，T1+ 只表示有效的實驗分析，不改寫 canonical T1。
- `useLyricsSourcePresentation` 只在開啟來源／顯示介面後讀取本機來源與已存分析，以來源 fingerprint、normalizer、逐行 identity 與 offset 驗證估計。讀取失敗保持待確認，舊曲目／舊來源回應不更新新清單；不執行模型、不下載或自動套用。
- 顯示排序不切換目前來源，也不保存新的偏好；來源閉合控制只顯示名稱，展開選單才補短等級。使用者明確選擇不顯示歌詞時，同曲目的曲庫刷新保留此選擇。
- 顯示 Popover 由上到下為來源與管理入口、文字、支援的讀音、字級，DOM／鍵盤順序一致。來源使用 select-only `UiCombobox`，文字使用 `UiSelect`，讀音使用 `UiSegmentedControl`；群組標籤使用 `UiField group`，字級由 `UiButtonGroup` 與中性 `UiIconButton` 組合。第一次 Escape 關閉來源選單，第二次才關閉 Popover。
- 歌詞顯示 Popover 與來源 Combobox 使用 `closeOnScroll: false`；背景播放、歌詞自動捲動與來源／文字／讀音／字級操作都保持展開，與 anchor 無關的捲動不重新量測。外部 pointer、再次點擊「顯示」與 Escape 仍明確關閉；開啟管理來源時暫時讓位給 Modal，返回後恢復設定面板，已卸載或無選定曲目時不重開。共用 primitive 的其他 caller 維持原本捲動關閉預設。
- 演唱與歌詞編輯頁的實驗分析開關收在顯示 Popover 字級旁，不在歌詞上方另占狀態列。按鈕固定命名「分析顯示」，以 active／aria-pressed 表示開關狀態，管理來源內的同一開關也採相同名稱；開啟使用已產生的時間提示，關閉恢復原歌詞時間，不啟動分析任務。共用 Tooltip 與 accessible description 保留下一步操作、沿用既有分析及需重新分析的原因；不可用或編輯鎖定時按鈕可聚焦查看原因，但不可啟動。顯示面板只提供操作插槽，分析仍由原歌詞 owner 管理，不因展開、重掛或狀態更新自動套用或切換來源。

## 各來源

### LRCLIB

- 固定 `https://lrclib.net`，User-Agent 含 `Utawakui/<version>` 與專案 URL。單一 main scheduler 串行所有 LRCLIB 流量，請求間隔 ≥ 250 ms，有 timeout 與 body 上限。
- 背景請求起點至少距前一請求 1000 ms，尚未開始的背景請求讓位給互動請求；不取消已發出的請求。自動取得最多一次 exact 與一次 structured search，不進入跨語別名／title-only recovery；成功候選保存仍另做一次 refetch。互動搜尋維持原本較完整的查詢範圍，兩者的搜尋快取與 in-flight key 分開，背景精簡結果不冒充完整手動結果。這是 App 的請求預算，不代表來源官方配額。
- 查詢：有可信 title／artist 時先做一次 `/api/get` 簽章查詢（自動取得不直接保存，仍交給跨來源比較）；再做一次 structured `/api/search`（不與 `q` 混用）；結果弱或空時才允許使用者明確「擴大搜尋」一次。
- Record 正規化為完整欄位（id、name、trackName、artistName、albumName、duration、instrumental、plainLyrics、syncedLyrics、lyricsfile），缺值存 `null`；無效 record 在 search 中略過並計數，在 `/api/get/:id` 直接拒絕。
- Lyricsfile 只解析 1.0，受 byte／深度／節點／行／字上限；拒絕多文件、重複 key、alias、自訂 tag 與不一致結構。未知版本只保存原文；`offset_ms` 只作 provenance；缺少的 end 保持 `null`；重疊不被攤平。
- Artifact：`lyrics/providers/lrclib-<recordId>.json`（schema 1，含完整 record、原始 Lyricsfile、取得時間、能力、相容性、warnings 與各段 SHA-256）。Stable id 為 `lrclib:<recordId>`、`line:<i>`、`line:<i>:word:<j>`。舊 `lrclib-*.lrc` 仍可離線讀寫。
- 既有來源顯示 `saveState: current | update-available | unsaved`；缺有效 artifact 的舊檔保守視為 `current`。

### NetEase

- 只向 `https://interface.music.163.com` POST：`/api/cloudsearch/pc`（最多 10 筆 metadata）與 `/api/song/lyric/v1`（YRC／LRC）。拒絕 redirect，不帶 cookie 或 credential；曲名、歌手各 ≤ 256 字元且拒絕控制字元。
- 最多三組 structured title／artist 變體，含跨文字曲名 alias；繁簡視為同一身份但不改寫內容。Metadata gate 先過濾，再三筆一批取得歌詞，湊滿三筆可用候選即停。「擴大搜尋」保留原候選並加入移除歌手限制的 recovery query。
- 完整 YRC 每行、每個 segment 的時間、範圍、順序與文字都有效才算 T2；任一無效整筆降為 LRC 的 T1，不放寬 validator。2026-09-01 起匿名 YRC 可用率明顯下降，不得描述為穩定逐字來源。
- 保存 `lyrics/netease-<id>[-n].lrc`、完整 T2 的 timing sidecar、`lyrics/providers/netease-<id>.json`（`netease-direct-http-v1` profile）。Hydration cache 依 track／query 隔離，最多 32 組。
- 2026-08-29 owner 決定略過 Sentinel／30 日觀測直接實驗性接入；歷史隔離驗證見[研究報告](../research/lyrics-providers/netease-isolated-technical-validation-2026-08-28.md)。

### Better Lyrics

- 只呼叫 `https://lyrics-api.boidu.dev/getLyrics`，不接受 API key、Apple bearer 或 `media-user-token`。401 是預期的 cache miss。
- Main 由曲目推導 title、artist、album 與整秒 duration，三者缺一不可；「擴大搜尋」只移除 album。Score 若存在且 < 80 不建立候選。
- 回應沒有命中的 metadata，無法證明錄音身份，所以只能手動預覽與保存，不參與自動取得。
- 共用 bounded TTML parser；完整 primary spans 才是 T2，否則如實降為 T1。候選 id 是查詢 identity 的 deterministic hash，保存時以相同查詢重抓比對。Provenance 標為 Better Lyrics，不標示為 Apple Music；歌詞內容授權須另行確認。

### AMLL（已退役）

命中率偏低且沒有覆蓋率證據，已從 renderer、main allowlist、保存與 fan-out 移除；新的 `amll` 搜尋／保存回應 invalid provider。既有 `amll-*.lrc`、timing sidecar 與 `lyrics/providers/amll-<id>.json`（`amll-http-v1`，含原始 TTML 與投稿者）仍可讀取、顯示來源名並刪除。TTML parser 保留給 Better Lyrics。

### Musixmatch（未啟用）

`electron/lib/musixmatch.js` 以官方 `ws/1.1` `matcher.subtitle.get` 做 gated probe，只回傳 availability summary、不保存；沒有 `MUSIXMATCH_API_KEY` 時回 `not-configured`，不自動載入 `.env`。Production UI 沒有呼叫點。正式接入前須另有產品決策與付費官方 API 方案；不得加入搜尋、自動取得或可用來源 UI，不使用 cookie、desktop token 或 reverse client。

## Renderer

- 候選以 `providerId:id` 為 `candidateKey`，單一 acquisition state owner 以此保存展開與 saving 狀態。查詢用的曲名／歌手欄位不修改曲庫 metadata。
- 候選列只顯示判斷所需資訊：身份、專輯／版本、時長差、同步能力與覆蓋、預覽、符合原因與 warnings、保存狀態；分數、hash、路徑與例外不顯示。
- 個別來源的正常零結果、`unavailable`、cache miss、not found、low confidence 都保持安靜；只有 timeout、offline、rate limit 等 `error` 顯示不阻擋其他結果的警告。
- 候選列與來源管理可開啟 `content` 回饋草稿，只預填有界的歌曲／來源資訊、同步層級與已知偏移；不新增網路或 IPC。回流流程見[歌詞問題回報](../operations/lyrics-issue-feedback.md)。

## 驗證

- Unit：record 正規化、惡意 Lyricsfile／TTML／YRC fixture、查詢計畫、分級、fingerprint、canonical projection。
- Integration：headers、timeout／body 上限、串行間隔、Retry-After、gate 關閉零請求、保存重取、原子寫入、刪除。
- Renderer：可編輯查詢欄、晚到回應丟棄、分組、錯誤對應、變更確認、鍵盤焦點、0／1／20 筆版面。
- 封裝：production 依賴存在、封裝版載入、舊來源離線讀取。
