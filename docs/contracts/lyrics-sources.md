# 歌詞來源契約

外部歌詞的搜尋、自動取得、保存與各來源邊界。時間層級見[時間契約](lyrics-timing-contract.md)，限流與冷卻見[外部服務請求契約](external-service-request-policy.md)，HTTP 錄製／重播見[操作手冊](../operations/lyrics-provider-contracts.md)。

| 來源          | 狀態                      | 手動搜尋     | 自動取得 |
| ------------- | ------------------------- | ------------ | -------- |
| LRCLIB        | 已實作（2026-08-23）      | ✓            | ✓        |
| NetEase       | 實驗性（2026-08-29）      | ✓            | ✓        |
| Better Lyrics | 實驗性、公開快取（08-31） | ✓            | —        |
| Kugou         | 受控T1備援（2026-10-31）  | 未命中才啟用 | —        |
| AMLL          | 已移除，舊資料轉本機來源  | —            | —        |
| Musixmatch    | 未啟用的官方 API 備用     | —            | —        |

## 共同規則

- 所有外部請求由 main 發出，且每次都重新檢查 `lyrics-flow`；gate 關閉時零請求。失敗、離線或解析錯誤不得阻擋音訊匯入，只有本契約明列的受控備援，不自行新增來源或無界重試。
- Renderer 只傳 allowlisted provider id、track id、bounded query、candidate id 與 preview fingerprint；只收到 bounded summary 與 typed 結果，不會收到原始 body、hash、路徑或例外文字。
- 搜尋結果只是 discovery。保存前一律以 id 或相同查詢重新取得並比對 SHA-256 fingerprint；內容變更時回傳 `record-changed` 與新摘要，需使用者再次確認，絕不靜默保存。取消會保留原畫面、選擇、offset 與人工 T2。
- 保存是 track lyrics tree 內的小 transaction：provider artifact → compatibility LRC → canonical timing sidecar（只在完整 T2 時）→ 最後發布 manifest。寫入原子、可冪等；中途失敗以舊 manifest 為準。刪除來源時一併移除 artifact、timing 與讀音資料。
- Manifest 只保存 scalar metadata 與 provenance，不存 URL 或絕對路徑。
- 不同來源的 line、word、translation 或 timing 永遠不互相拼接。

## 搜尋與排序

「所有線上來源」是手動搜尋主入口：main 對 LRCLIB、NetEase、Better Lyrics 平行 fan-out，在主要階段deadline內等待完成；沒有非related的T1／T2同步候選時，才解析有證據的跨語別名並串接Kugou受控備援，最後合併。T0仍可選但不阻擋T1備援。任一成功即保留其結果，其他來源失敗只形成 bounded partial status。各來源仍可單獨篩選與重試。目前不提供逐來源進度交付。

Provider 原生分數不跨來源比較。Main 以 title、artist、版本 marker 與 duration 重新分級：

1. `exact` > `strong` > `related`。
2. 同級內：完整 T2 > 完整 T1 > partial T2 > T0／instrumental／unsupported。完整 T2 指每一行都有通過 canonical validator 的 segments。
3. 再以 duration delta、warnings、provider id、candidate id 做 deterministic tie-break。

錯誤版本的 T2 不得越過正確版本的 T1。

**錄音分組**：normalized title 相同、artist 高度一致、版本 marker 無衝突、已知 duration 差 ≤ 4 秒時合為一組；Live、Remix、伴奏、翻唱分開。每組首筆是推薦來源，其他來源緊接直接列出；搜尋完成預設展開首組推薦來源的預覽。分組只是呈現，不是新的歌詞 artifact。

**查詢成本**：

- 每個來源有自己的 scheduler 與 request interval；平行 fan-out 不繞過限流。
- Main 依來源共享的實際請求預算、總 deadline、持續速率與 endpoint cache 見[外部服務請求契約](external-service-request-policy.md#重試與安全邊界)。UI 仍只送原有查詢／擴搜意圖，不提供預算、速率或 endpoint。
- 同 provider／track／query／mode 的 in-flight 搜尋共用 promise；完整非空成功結果以 Main 記憶體快取5分鐘、正常空結果最多30秒、最多32筆。部分成功只保留為擴搜合併快照，不可短路下一次正常查詢或當成完整成功。快取只縮短 discovery，不取代保存前重取。
- 明確擴搜按同來源候選 id 合併初查結果，新 fingerprint 取代舊摘要，原有但未重複回傳的候選在每來源20筆上限內保留；fingerprint 改變時不能沿用舊時間軸比較資料。追加失敗仍可檢視先前候選，不把部分失敗變成全空。
- LRCLIB 後續 structured／recovery 查詢失敗時停止該次查詢計畫，保留先前通過驗證的候選，回傳 `status: ok`、`partial: true` 與有界失敗原因；沒有候選仍回失敗。合併搜尋保留該來源 `partial` 狀態與原因。取消回傳 `cancelled`、不發布既有候選、不回填快取，也不記服務故障。
- 同來源的新互動查詢會 abort 舊查詢；背景自動查詢互不取消；renderer 以 request generation 丟棄晚到結果。
- `record-changed` 時同步失效該 provider 的查詢快取與舊在途回填，包含不同曲目共用同一線上 record 的持有者；其他 provider 不受影響。

## 來源時間軸差異提示

手動「所有來源」搜尋中，同錄音組內的 LRCLIB 與 NetEase 完整 T1／T2 可比較行起點，不增加請求、模型、IPC 或持久化。

- Main 每來源暫存最多 128 個分布全曲的唯一文字 SHA-256 與行起點，只存在記憶體與既有 discovery cache；比較時才做繁簡、寬度、大小寫與標點正規化。重複句、短句、超過 2,000 字元的單行與製作 credit 不配對；超過 5,000 行或 100,000 字元不產生 evidence。
- 需 exact artist、合法 fingerprint、同組，至少五句同序配對、覆蓋較大集合一半、兩邊跨度各 ≥ 10 秒、各差 ≤ 15 秒且極差 ≤ 500 ms，才採中位數為偏移；絕對差 > 1 秒才提示。
- 候選列標「時間有差異」，展開說明相對哪個來源早／晚與配對行數，並提醒不代表誰較準。提示不影響排序、推薦、自動取得、保存或 offset；fingerprint 不符或 `record-changed` 時移除，重新搜尋才重建。
- 沒有提示不代表同步準確。

## 自動取得與來源偏好

- Provider 匯入與 metadata backfill 在音訊提交成功後於背景執行；歌詞 miss、gate 關閉或失敗都不延後或回滾匯入。
- 只有 LRCLIB 與 NetEase 參與，只接受 `exact`；`strong`／`related` 即使是 T2 也不自動保存。已有任何來源時，新的 T1 不算升級，只有完整 T2 可新增為自動偏好；已有完整 T2 時不發請求。
- 背景佇列預設一次一首、最多32首待執行、各曲起點至少30秒，每曲single-flight，以main推導的track id為job key。每曲探索加fresh保存最多7次實際HTTP／30秒；來源背景最小間隔5秒、rolling60秒最多12次。滿佇列或達額度回skipped／有界失敗，不自動延後重排。同曲庫、同曲目metadata的背景嘗試完成後五分鐘內不重排，最多保留256筆process-local記憶；刪除／重新匯入會失效，不阻擋手動搜尋。保存前重讀manifest與timing sidecar，並在refetch後、同步寫入前再檢查generation、實際音訊與完整T2狀態；已刪除曲目的舊工作不得重建目錄。
- `lyrics/lyrics.json` 可存 `{ filename, origin }` 偏好，`origin` 為 `user` 或 `automatic`；使用者選擇不被自動偏好覆寫，偏好來源刪除時一併清除。Renderer 選擇順序：目前有效的畫面選擇 → 持久化偏好 → 語言推測 → 第一筆來源。
- Timing metric只記provider、cache hit、duration、候選數與status；整合與背景另記實際HTTP總數。均不記曲名、歌手或歌詞。

## 本機來源清單與顯示設定

- 可用歌詞 Modal 與來源選單共用唯讀排序：T2 逐字 → T1+ 估計 → T1 逐行 → T0 文字 → 待確認；同級保留原順序。代號表示時間細度，不表示正確率；T2 可為部分涵蓋，T1+ 只表示有效的實驗分析，不改寫 canonical T1。
- `useLyricsSourcePresentation` 只在開啟來源／顯示介面後讀取本機來源與已存分析，以來源 fingerprint、normalizer、逐行 identity 與 offset 驗證估計。讀取失敗保持待確認，舊曲目／舊來源回應不更新新清單；不執行模型、不下載或自動套用。
- 顯示排序不切換目前來源，也不保存新的偏好；來源閉合控制只顯示名稱，展開選單才補短等級。使用者明確選擇不顯示歌詞時，同曲目的曲庫刷新保留此選擇。
- 顯示 Popover 由上到下為來源與管理入口、文字、支援的讀音、字級，DOM／鍵盤順序一致。來源使用 select-only `UiCombobox`，文字使用 `UiSelect`，讀音使用 `UiSegmentedControl`；群組標籤使用 `UiField group`，字級由 `UiButtonGroup` 與中性 `UiIconButton` 組合。第一次 Escape 關閉來源選單，第二次才關閉 Popover。
- 歌詞顯示 Popover 與來源 Combobox 使用 `closeOnScroll: false`；背景播放、歌詞自動捲動與來源／文字／讀音／字級操作都保持展開，與 anchor 無關的捲動不重新量測。外部 pointer、再次點擊「顯示」與 Escape 仍明確關閉；開啟管理來源時暫時讓位給 Modal，返回後恢復設定面板，已卸載或無選定曲目時不重開。共用 primitive 的其他 caller 維持原本捲動關閉預設。
- 演唱與歌詞編輯頁的實驗分析開關收在顯示 Popover 字級旁，不在歌詞上方另占狀態列。按鈕固定命名「分析顯示」，以 active／aria-pressed 表示開關狀態，管理來源內的同一開關也採相同名稱；開啟使用已產生的時間提示，關閉恢復原歌詞時間，不啟動分析任務。共用 Tooltip 與 accessible description 保留下一步操作、沿用既有分析及需重新分析的原因；不可用或編輯鎖定時按鈕可聚焦查看原因，但不可啟動。顯示面板只提供操作插槽，分析仍由原歌詞 owner 管理，不因展開、重掛或狀態更新自動套用或切換來源。

## 各來源

### LRCLIB

- 固定 `https://lrclib.net`，User-Agent 含 `Utawakui/<version>` 與專案 URL。單一 Main request policy 串行所有 LRCLIB 流量，請求起點至少相隔 1000ms，有跨佇列／body 的總 deadline 與 body 上限。
- 自動取得先 exact，有結果即交由原跨來源比較，不再額外 search；只有 not-found 才進一次 structured search，不進入跨語別名／title-only recovery。成功候選保存仍另做 fresh refetch。背景與手動的高階搜尋快取分開，但相同 HTTP 探索可在 request policy 合併；背景結果不冒充完整手動搜尋。
- 手動首次以約三筆可用時間同步 best 候選供比較為目標；主要 structured `/api/search` 不足時，才進至多一個別名。單次回應已有的其他候選不因目標三筆而截斷，仍沿每來源20筆上限。明確「擴大搜尋」才允許至多三個 structured 及一個 title-only query，仍受原 real-attempt 預算，不與 `q` 混用。已有可用候選仍可擴搜；資料不足不湊數，到達預算不自動在背景續查。
- Record 正規化為完整欄位（id、name、trackName、artistName、albumName、duration、instrumental、plainLyrics、syncedLyrics、lyricsfile），缺值存 `null`；無效 record 在 search 中略過並計數，在 `/api/get/:id` 直接拒絕。
- Lyricsfile 只解析 1.0，受 byte／深度／節點／行／字上限；拒絕多文件、重複 key、alias、自訂 tag 與不一致結構。未知版本只保存原文；`offset_ms` 只作 provenance；缺少的 end 保持 `null`；重疊不被攤平。
- Artifact：`lyrics/providers/lrclib-<recordId>.json`（schema 1，含完整 record、原始 Lyricsfile、取得時間、能力、相容性、warnings 與各段 SHA-256）。Stable id 為 `lrclib:<recordId>`、`line:<i>`、`line:<i>:word:<j>`。舊 `lrclib-*.lrc` 仍可離線讀寫。
- 既有來源顯示 `saveState: current | update-available | unsaved`；缺有效 artifact 的舊檔保守視為 `current`。

### NetEase

- 只向 `https://interface.music.163.com` POST：`/api/cloudsearch/pc`（最多 10 筆 metadata）與 `/api/song/lyric/v1`（YRC／LRC）。拒絕 redirect，不帶 cookie 或 credential；曲名、歌手各 ≤ 256 字元且拒絕控制字元。
- 先查主要 metadata，通過 identity gate 後逐筆 hydration，手動初查以三筆可用候選為目標；不足三筆 best 才追加至多一個別名。首次最多五次 detail 嘗試，metadata 與 detail 另共用六次實際 attempt 上限。自動取得仍沿原少量搜尋策略，遇限流／服務失敗立即停止後續階段，保留已成功的 partial 候選。
- 明確「擴大搜尋」保留原 hydration 候選，以原有可用數再加三筆為目標、最多20筆；不因已找到三筆而阻止取得其他版本。沒有可保留結果時可做至多三組 structured，另至多一組移除歌手限制的 query。擴搜最多七次 detail 嘗試，合計最多八次實際 attempt；不會因大量空歌詞遍歷所有 metadata。繁簡視為同一身份但不改寫內容。
- 完整 YRC 每行、每個 segment 的時間、範圍、順序與文字都有效才算 T2；任一無效整筆降為 LRC 的 T1，不放寬 validator。2026-09-01 起匿名 YRC 可用率明顯下降，不得描述為穩定逐字來源。
- 保存 `lyrics/netease-<id>[-n].lrc`、完整 T2 的 timing sidecar、`lyrics/providers/netease-<id>.json`（`netease-direct-http-v1` profile）。Hydration cache 依 track／query 隔離，最多 32 組。
- 2026-08-29 owner 決定略過 Sentinel／30 日觀測直接實驗性接入；歷史隔離驗證見[研究報告](../research/lyrics-providers/netease-isolated-technical-validation-2026-08-28.md)。

### Better Lyrics

- 只呼叫 `https://lyrics-api.boidu.dev/getLyrics`，不接受 API key、Apple bearer 或 `media-user-token`。401 是預期的 cache miss。
- Main 由曲目推導 title、artist 與整秒 duration，三者缺一不可；已知 album 在初查與擴大搜尋均保留，不因 broaden 另查無專輯快取。手動改成不同歌名／歌手時不沿用原曲專輯，未知專輯不猜填。每次探索仍最多一次 HTTP，不增加變體輪詢。
- 查詢只正規化明確的跨語括號歌手別名，保留所有合作歌手與分隔符；官方頻道／版本字樣不當別名。只有 feat／ft／featuring 指定的歌手已完整列在 artist credit 時才移除該段歌名，其他括號及 live／remix 等版本標記保留。這些變換限於 Better 的探索查詢，不改曲庫或共用 LRCLIB／NetEase 計畫；候選仍依原查詢身份驗證，保存固定使用已授權的實際查詢。
- 官方可選 `score` 單位是0～1，低於0.8不建立候選；存在但非有限數字、越界或百分制數字均為 `invalid-record`，不推測單位。快取回應缺score不補造分數，仍走原人工預覽及TTML驗證；既有本機artifact保留可讀，不因這次修正重寫或刪除。
- 回應沒有命中的 metadata，無法證明錄音身份，所以只能手動預覽與保存，不參與自動取得。
- 身份／信心不足為安靜的 `low-confidence-match`；TTML 解析不通過才回 `invalid-ttml`，並標示為不可重試。保存重驗的身份拒絕為 `record-mismatch`，解析拒絕仍為 `invalid-ttml`；不以更改 validator 提高命中率。
- 共用 bounded TTML parser；完整 primary spans 才是 T2，否則如實降為 T1。候選 id 是查詢 identity 的 deterministic hash，保存時以相同查詢重抓比對。Provenance 標為 Better Lyrics，不標示為 Apple Music；歌詞內容授權須另行確認。

### 跨語別名解析

- `identityResolver.js`只在手動主要來源無同步候選時執行。曲名須含Latin文字，且原曲名、完整歌手、有效duration已知；不為純原文曲名多送metadata。固定Apple匿名US song search（最多5筆）→最多3個相同trackId的JP lookup，總計最多2次；不下載Apple歌詞／音訊、不輪詢其他storefront或backend。
- US命中先通過原曲名、完整演出者、雙向版本與四秒duration gate；JP回應須同trackId、artistId、duration及歌手。不同native曲名存在歧義時不產生別名。版本詞、錯合作歌手、不同目錄id都不得作證。無證據時維持原身份，不翻譯猜測。
- 正證據cache30天、正常無別名30分鐘、最多64個identity，Main可原子保存於userData的`lyrics-identity/aliases-v1.json`；快取損毀不阻擋歌詞流程。證據綁原title／完整artist／album／duration及policy，不改曲庫metadata。Kugou私有候選保留同一證據snapshot，fingerprint含證據，fresh保存不重跑Apple；過期要求重新搜尋。

### Kugou（受控備援）

- 2026-10-31 owner授權接入原生逐行LRC；只加入手動整合搜尋，registry標記`fallbackOnly`，不參與背景自動探索或保存。整合查詢主要階段沒有非related、非instrumental且可讀T1／T2候選時才啟用，來源故障也可備援。取消或已被新條件取代的查詢不能啟動備援；有主要來源同步候選時不額外要求酷狗補滿三筆。沒有獨立繞過主要來源的酷狗查詢入口。
- 固定HTTPS GET三條route：`mobileservice.kugou.com/api/v3/search/song`、`krcs.kugou.com/search`及`lyrics.kugou.com/download`，最後只要求`fmt=lrc`，不下載KRC、不帶登入cookie。Main推導hash／歌詞id／accesskey；Renderer只取得Main衍生的安全整數candidate id、標示與有界預覽，不接受URL或上游identifier意圖。
- 曲名、歌手與有效長度缺一不可。最多三組探索條件，只取輸入中明確跨語別名、繁簡或完整合作歌手中的主唱；探索條件不能更改預期身份。Catalog須完整匹配已知曲名別名及全部演出者／feat、拒絕額外未知演出者、缺少合作署名、substring誤配及雙向版本矛盾，整秒時長差最多四秒。LRC的ti／ar若存在也須符合catalog／原身份，錯feat與Live矛盾拒絕，版本詞不當跨語別名。缺原文別名時不自動翻譯。
- Catalog最多10筆、歌詞候選最多64筆；只hydration通過身份者。首次目標最多三個可選候選，整合備援階段最多五次實際HTTP／8秒，並受父12次／20秒限制，通常只能取得一至兩個；達預算保留partial。明確擴搜保留舊候選、尋找更多（最多20個），父新增8次／15秒，備援仍受階段5次／8秒限制。相同來源所有route／實例／保存共享1000ms起點間隔、Retry-After、request合併及30秒有界探索快取；主要、別名與備援共同扣父額度。
- UTF-8、base64、body、時間行及描述metadata有界檢查；`hash／sign／qq／total`只允許有界描述行、不作身份證據，保存時移除。正式T1解析尚未套用LRC內建offset，所以非零offset保守拒絕。未知tag、無時間／重複空內容及版本矛盾不因增加覆蓋率而放寬。
- 可見候選不自動保存。手動保存固定使用已授權query、身份證據及所選record，fresh重新取得catalog／同hash歌詞候選／同歌詞id LRC，三次實際HTTP／12秒且不使用探索快取完成。身份改變拒絕；fingerprint改變回`record-changed`、重看預覽再確認。舊hydration不能覆蓋新預覽；Main每track保存鎖、Renderer世代隔離及feature gate保持。
- 保存`lyrics/kugou-<id>[-n].lrc`與`lyrics/providers/kugou-<id>.json`（`kugou-native-lrc-v1`，schema 1），只記T1、metadata、取得時間及fingerprint，不存accesskey／hash或T2 sidecar；來源、artifact、timing清理及manifest交易失敗會還原。離線重開可讀取、標示已保存、更新或刪除；不改寫既有來源或使用者偏好。私有hydration最多32組／8MiB。
- 多語小樣本與選擇性複核只證明當次候選可取得，不保證覆蓋率、授權、服務穩定度或完整同步品質；原始研究收據不改寫為正式接入後的成績。

### AMLL（已退役）

AMLL runtime、client／candidate／storage、renderer標示及可執行研究入口已移除；新的`amll`搜尋／保存回應invalid provider。Better Lyrics改用中立`electron/lib/lyricsFormats/ttml.js`，維持原有界TTML驗證與sax依賴。

既有manifest讀取時，`retiredLyricsSources.js`先把原manifest與有效provider artifact備份至`lyrics/migrations/retired-providers-v1[-n]/`，再原子改成普通本機來源並移走active provider artifact。原LRC、timing、offset、讀音、聲部、偏好及檔名保持，原始TTML／投稿provenance在備份中保留；失敗還原並繼續提供本機讀取，不以遷移失敗刪歌詞。歷史研究文件／fixture保留為歷史資料，無AMLL網路執行入口。

### Musixmatch（未啟用）

`electron/lib/musixmatch.js` 以官方 `ws/1.1` `matcher.subtitle.get` 做 gated probe，只回傳 availability summary、不保存；沒有 `MUSIXMATCH_API_KEY` 時回 `not-configured`，不自動載入 `.env`。Production UI 沒有呼叫點。正式接入前須另有產品決策與付費官方 API 方案；不得加入搜尋、自動取得或可用來源 UI，不使用 cookie、desktop token 或 reverse client。

## Renderer

- 候選以 `providerId:id` 為 `candidateKey`，單一 acquisition state owner 以此保存展開與 saving 狀態。查詢用的曲名／歌手欄位不修改曲庫 metadata。
- 初查保留少量可比較選擇，找到可用歌詞後仍可明確擴搜。追加查詢保留當前列表及仍存在的展開位置，期間鎖定保存；同查詢追加失敗保留候選並顯示 partial，換曲／換條件／正常新搜尋仍重置。成功完成本次擴搜後不自動續查，部分來源失敗可由使用者重試擴搜。
- 候選保存綁定搜尋世代、啟動時選曲與獨立 attempt；gate 等待、重取、清單刷新及 finally 都不得讓晚回操作污染新的搜尋／保存。關閉或開始新查詢使舊 UI 意圖失效，但不撤銷 Main 已完成的交易；已保存資料仍刷新曲庫，只有當前意圖能選來源或更新預覽。
- 保存前連線／限流／逾時失敗明示版本驗證未完成；一般保存例外與已保存但清單刷新失敗使用不同文案，不洩漏私有 context。
- 候選列只顯示判斷所需資訊：身份、專輯／版本、時長差、同步能力與覆蓋、預覽、符合原因與 warnings、保存狀態；分數、hash、路徑與例外不顯示。
- 個別來源的正常零結果、`unavailable`、cache miss、not found、low confidence 都保持安靜；只有 timeout、offline、rate limit 等 `error` 顯示不阻擋其他結果的警告。
- 候選列與來源管理可開啟 `content` 回饋草稿，只預填有界的歌曲／來源資訊、同步層級與已知偏移；不新增網路或 IPC。回流流程見[歌詞問題回報](../operations/lyrics-issue-feedback.md)。

## 驗證

- Unit：record 正規化、惡意 Lyricsfile／TTML／YRC fixture、查詢計畫、分級、fingerprint、canonical projection。
- Integration：headers、timeout／body 上限、串行間隔、Retry-After、gate 關閉零請求、保存重取、原子寫入、刪除。
- Renderer：可編輯查詢欄、晚到回應丟棄、分組、錯誤對應、變更確認、鍵盤焦點、0／1／20 筆版面。
- 封裝：production 依賴存在、封裝版載入、舊來源離線讀取。
