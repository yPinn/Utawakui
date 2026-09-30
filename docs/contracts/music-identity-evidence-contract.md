# Music Identity／Evidence 契約

本契約定義 lyrics、provider import、artwork discovery 與未來 artist／album organization
可共用的音樂識別事實，以及各功能必須自行保有的決策責任。Shared identity 維持純函式；
Phase 5 的 artwork consumer 另以 gated provider、IPC 與最小 provenance sidecar 接線，仍不建立
persistent identity，也不允許自動套用。

## 適用範圍

共享 domain 位於 `electron/lib/musicIdentity/`，由 main process 使用的純函式組成。它可以：

- 從 adapter 提供的 bounded fields 建立 provider-neutral observed track；
- 產生刻意有損的文字比較鍵；
- 從原始文字觀測版本詞；
- 計算 title／artist 等文字關係與 duration 差值；
- 回傳可供 feature policy 解釋的 evidence。

它不得執行網路、檔案、IPC 或 provider lifecycle，也不得輸出跨功能共用的總分、
`exact`／`strong` band、自動儲存決定、canonical artist entity 或 UI 文案。

## Ownership

| Owner                           | 擁有                                                                       | 不擁有                                                   |
| ------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------- |
| `electron/lib/musicIdentity/`   | Provider-neutral observation、lexical keys、version signals、evidence axes | Request、cache、feature score、自動套用、filesystem      |
| `electron/lib/trackIdentity.js` | 舊 provider metadata trust、YouTube title derivation、artist search hints  | 新 shared identity contract、persistent artist entity    |
| `electron/lib/<provider>/`      | Provider schema、request mapping、rate、cache、abort、response hydration   | 跨 provider 的 product policy                            |
| `electron/lib/lyricsProviders/` | Recording band、timing capability、exact-only automatic policy             | Import／artwork 的排序規則                               |
| `electron/lib/import*`          | Playback kind、availability、view count、download recommendation           | Lyrics capability 或 release artwork policy              |
| `electron/lib/artwork/`         | Release／edition／status／cover policy                                     | Recording playback 或 lyrics automatic policy            |
| `electron/lib/library/`         | Track filesystem、sidecar commit 與 generation guards                      | 從相似字串推論 canonical identity                        |
| `electron/main/*Handlers.js`    | Feature gate、dependency injection、bounded IPC projection                 | Provider-neutral identity 演算法                         |
| Renderer                        | Query edits、候選顯示與明確使用者 intent                                   | Canonical identity、路徑、任意 URL、provider credentials |

## Phase 1 public foundation

### Text observation

`normalizeText(value)` 只去除前後空白，不轉換文字、script 或標點。可顯示或需追溯的來源文字
必須保留這類原始 observation，不得只保存 comparison key。

共享的 `normalizeForCompare(value)` 建立 provider-neutral lexical key，只做 NFKC、大小寫折疊、
標點與空白正規化；它刻意保留 `official`、`video`、`live` 與 `session` 等詞，讓 adapter 與
feature policy 仍可觀測其語意。它不能單獨證明兩筆資料是同一錄音，也不能作為
artist／album 的 canonical name。

`musicTitle.js` 的同名 compatibility API 另保留歷史行為，會移除有限的媒體裝飾詞與
`live`／`session`。Lyrics 現有 ranking 仍透過這個 facade 取得舊 comparison key；新 shared
consumer 不得把這個有損 key 當作 canonical identity。

Phase 1 不做繁簡互轉、自動 romanization、音譯或機器翻譯。日後 query variants 必須標記
variant kind、來源與信心，並保留原文優先順序。

### Recording version signals

`versionTerms(value)` 必須在文字被有損正規化前讀取 raw observation。
`candidateIntroducesVersion(sourceTexts, candidateTexts)` 接受 provider-neutral 的文字陣列，
只回報候選是否含來源沒有的版本詞；它的非對稱方向是現行 compatibility evidence。
數值 `0.18` penalty 留在 LRCLIB matching policy，
不由 shared domain 匯出。其他 feature 可以建立更嚴格的衝突規則，但必須自行擁有 penalty、
reject threshold 與 confidence band。

### Observed track projection

`buildObservedTrack(observation)` 只正規化 adapter 已選定的 bounded fields，不解析 upload title、
不推論 provider trust，也不拆 artist credit。它輸出：

| Field              | 意義                                                         |
| ------------------ | ------------------------------------------------------------ |
| `title`／`album`   | 保留 script 與顯示文字的 observation                         |
| `artistCredit`     | 完整 credited form；shared domain 不拆分                     |
| `artistHints`      | Adapter 明示提供、ordered／deduped 的查詢提示                |
| `duration`／`isrc` | 由明示 `durationSeconds` 取得的秒數與經格式驗證的 ISRC       |
| `source`           | Provider／platform／type／id observation；不是 stable entity |
| `confidence`       | Title／artist／album observation 的 bounded confidence       |

現有 `buildTrackIdentity()`、`splitArtistNames()` 與 YouTube trust／title-derived 規則留在
`trackIdentity.js` compatibility owner。它的 artist 拆分結果只能作 query hint；`AC/DC` 等合法
團名可能被拆開，現行 `feat.` 分隔還可能保留標點。任何新 consumer 都必須保留來源 credited
form；不得用拆分結果或 normalized string 自動建立、合併、改名 artist entity。

Shared observation 不以數值大小猜測 duration unit。Adapter 必須把毫秒或 provider-specific
duration 先轉成 `durationSeconds`；legacy `secondsFromDuration()` heuristic 只留在
`trackIdentity.js` compatibility path。

`trackIdentityKey()` 與 `identityArtistKeys()` 只供單次 discovery、cache 或 dedupe。它們會受
正規化規則、低信心 artist、duration 與 metadata 完整度影響，不是 persistent ID，不得寫成
跨版本外鍵或用於 destructive merge。

### Comparison evidence

`compareTextEvidence()` 回傳 normalized keys、exact、contains 與未截斷的 token overlap；
`durationDelta()` 與 `signedDurationDelta()` 回傳 duration axes。Shared domain 不把 overlap
映射成 feature score 或 cutoff。LRCLIB 的 `textMatchScore()` compatibility mapping（1、0.82、
0.75 cutoff）留在 `lrclib/matching.js`。Consumer 必須保留各 axis，並由自己的 policy 組合：

- Lyrics 保留 title／artist／duration gate、timing capability 與 exact-only automatic policy。
- Import 保留 YT Music／YouTube query、recording kind、availability、view count 與人工確認。
- Artwork 必須另外判斷 release group／release、Official／Pseudo／Compilation、Album／Single／EP、
  年份、edition 與 CAA front image。
- Artist organization 必須另有 stable external link、使用者確認、merge／split 與 undo policy。

## Compatibility APIs

`electron/lib/musicTitle.js` 繼續擁有來源標題裝飾解析與有損 compatibility normalization；
`electron/lib/trackIdentity.js` 繼續擁有 provider trust、搜尋提示推論與原 named exports；
`electron/lib/lrclib/matching.js` 繼續擁有 LRCLIB score mapping、version penalty、threshold 與
automatic selection，只從共享層取得 raw evidence primitives。
`electron/lib/musicIdentity.js` 使用靜態 CJS named exports，讓 ESM tests 與既有 CJS consumer
可穩定發現 API。

Phase 1 的驗收條件是既有 export shape、candidate order、threshold、automatic selection、IPC、
library 寫入與 packaging 完全不變。

## Phase 2 profiles and query variants

`buildIdentityProfile(observation)` 在 observed track 上附加 title／artist／album aliases。每個 alias
必須保留 `value`、`kind`、`source` 與 `confidence`；`kind` 只接受 `catalog-alias`、
`script-normalized`、`romanization` 或 `fuzzy`。Primary observation 不降級成 alias，完整
`artistCredit` 也不得被 aliases 或 adapter hints 覆寫。字串 alias 或未明示 kind 的物件預設為
`catalog-alias`；明示但不在 allowlist 的 kind 會被拒絕，不能繞過 romanization／fuzzy opt in。

每個 profile 的 title／artist／album aliases 各自最多 8 筆。`buildIdentityProfiles()` 保留
adapter 輸入順序、以 consumer 指定的 comparison key 去重，預設最多 12 筆、硬上限 24 筆；
相同 profile 的 aliases 與 artist hints 會 ordered merge，alias 的 source／confidence 仍各自保留。
Shared domain 不用固定欄位權重重排 profile；Lyrics compatibility wrapper 自己保留 high-first
排序。Compatibility wrapper 可以使用原本的有損 comparison key，新的 consumer 預設使用
provider-neutral key；這些差異都是明示的 adapter／consumer policy，不藏在 shared normalizer 裡。

`buildIdentityQueryVariants()` 產生 ordered、deduped、bounded 的查詢 intent：原始 title＋artist
優先，其次只替換 title，再只替換 artist，最後才是 title-only。它不建立 title alias × artist
alias 的 Cartesian product；預設最多 6 筆、硬上限 12 筆，provider adapter 可以再縮小 request
budget。每筆 variant 保留 kind、source 與 confidence，供 consumer 顯示或降權，但 shared domain
不將它們映射成 feature score。

Catalog alias 可直接參與查詢；cross-script title pair 與明示啟用的繁簡 forms 是受控的
`script-normalized` fallback。`romanization` 與 `fuzzy` 預設關閉，必須由 consumer 明示 opt in；
目前不自動產生日文／韓文 romanization，也不使用機器翻譯。OpenCC forms 只用於比較或查詢
fallback，不改寫原文 observation、artist credit 或 library metadata。

`compareRecordingIdentity()` 只回傳 title／artist／album 文字 evidence、duration 原值與差值、
ISRC relation、version terms、candidate 是否新增版本詞，以及可稽核的 reason codes。它不輸出
總分、threshold 或 `exact`／`strong`／`related` band。Lyrics、import、artwork 與未來 artist
organization 必須在自己的 policy 層解釋這些 axes。

## Phase 3 lyrics policy adapter

`electron/lib/lyricsProviders/recordingPolicy.js` 是 lyrics domain 的 policy adapter。它把 shared
evidence 映射回既有 lyrics lexical scale（exact `1`、contains `0.82`、token overlap 最低
`0.75`），並以 caller 明示提供的 title／artist／album／duration thresholds 產生
`exact`／`strong`／`related`。因此 shared domain 不知道 band，而 LRCLIB、NetEase 與 Better
Lyrics 仍在各自 candidate owner 定義門檻與 reject gate。

Lyrics adapter 會同時保留 legacy 有損 lexical comparison 與 raw version observation：例如
`Song Live` 的 lexical score 可因 compatibility normalization 維持 `1`，但 raw version evidence
仍必須標示 mismatch，不能因此被自動套用。跨 provider automatic policy 只接受 exact、非
instrumental 且至少 T1／T2 compatible 的候選；capability ordering、grouping、provider request、
parser、refetch、fingerprint 與 save-time guard 仍留在 lyrics consumer／provider owner。

## Phase 4 import policy adapter

`electron/lib/importRecordingPolicy.js` 把 `trackIdentity.js` 或 import resolver 已選定的 canonical
欄位投影成 shared observed track，再把 title／artist／duration evidence 映射回 import 原有的
14／8／0 文字權重與 14／10／4／-18 duration 權重。它不擁有 YouTube／YT Music query shape、
playback kind、view-count bonus、candidate merge、source-first 顯示、推薦門檻或下載確認。

Phase 4 是等價 migration，不啟用 romanization、fuzzy 或新的跨語言 provider query。Preview
identity 只供 discovery／ranking；使用者確認後只傳 playback video id。下載程序重新執行 yt-dlp，
並以 track directory 中的 `info.json` 經 `extractMetadataFields()` 取得 duration；preview duration
不能成為 library timing authority，也不寫入新的 persistent identity。

## Phase 5 artwork discovery consumer

`electron/lib/musicbrainz/` 與 `electron/lib/coverArtArchive/` 只擁有各自的固定 endpoint、
schema normalization、User-Agent、timeout、response bounds、short-lived cache 與 request
scheduler。MusicBrainz 全 App 共用 1.1 秒 request interval；CAA 只接受 `release`／
`release-group` MBID，metadata redirect 每一跳都重新驗證 CAA／Internet Archive allowlist；provider
回傳的 legacy HTTP asset 只會在已 allowlist host 上 canonicalize 為 HTTPS。兩個 adapter 都不接收
Renderer URL、檔案路徑或任意 query field。

`electron/lib/artwork/releasePolicy.js` 是 artwork consumer policy。它使用 shared recording
evidence 的 title／artist／album／duration／ISRC／version axes，但由 artwork 自己評估
Official／Pseudo／Bootleg／Promotion、Album／Single／EP、Compilation／Live／Remix、年份、
CAA front、MusicBrainz search score、總分、`high|medium|low` 與推薦差距。這些分數與 confidence
不得回流為 lyrics／import 的共用 threshold。候選永遠帶 `automatic: false`；只有高信心且明顯
領先時可預選，實際寫入仍需使用者按下「套用所選封面」。

`electron/lib/artwork/discoveryService.js` 擁有 staged query plan 與短期 candidate capability。
原文先查；結果不足時才使用 shared bounded script variants，最多三個 query variants，不做
alias Cartesian product；raw CAA proposals 最多 24，且兩個 MusicBrainz endpoint 同輪失敗時立即
停止 fallback。Service 以 TTL session 保存 CAA URL 與 provider ids，對 Renderer 只投影
opaque candidate id、release 顯示資料、confidence 與 reason codes。Preview／apply／source navigation
都以 `trackId + candidateId` 回 main 解析；Renderer 不能傳 image URL 或 MusicBrainz URL，候選預覽
也由 main 下載驗證後以 bytes 交付，不 hotlink 遠端圖片。

Provider transport failure 只在 main diagnostics 保存有界的 stage、reason、HTTP status 與次數；
不保存 query、URL、MBID、曲名或 track id。Renderer 仍只接收 coarse `provider-unavailable` reason，
使用者介面只說明目前無法搜尋與稍後重試，不揭露 provider、protocol 或 transport 分類。

圖片下載只允許 HTTPS CAA／Internet Archive host，手動檢查每次 redirect，並限制 timeout、
preview／full byte size、JPEG／PNG／WebP magic、declared MIME、寬高、總像素與 aspect ratio。Preview
最多 4 Mi pixels，套用原圖最多 25 M pixels；Renderer CSP 只開放 main 驗證 bytes 所建立的 `blob:`，
不開放 provider host。套用後由 library owner atomic 寫入 `thumbnail.<ext>`，並在 `artwork.json` 保存
schema version、CAA／MusicBrainz 來源、recording／release-group／release MBID、接受時間與固定
MusicBrainz source page；不保存完整 provider response 或遠端 image URL。任何圖片 mutation 會先移除
舊 provenance；晚到的 yt-dlp backfill thumbnail 也不得覆寫既有人工確認封面。本機選圖與清除適用
所有 managed tracks。Artwork search edits 與 metadata drafts 分離，不會因查詢或套用封面修改
title／artist／album。

## Persistence boundary

目前 filesystem 仍是 track existence authority，`library.json` 只保存既有 scalar metadata。
本契約不建立 `identity.json`、alias graph、artist entity 或 database table。

若未來要持久化 identity，必須先以 ADR 決定 versioned sidecar 或 SQLite migration boundary、
stable IDs、provenance、user-confirmed merge／split、undo 與 locale display policy。未完成該決策前，
共享層輸出都是可重新計算的 observations 與 evidence。

## Security and boundedness

Provider adapter 必須先限制 response 大小、欄位與候選數量，再傳入共享 domain。Renderer 只能
提交 bounded product intent 或 query edit；main 自行推導 provider request、URL、cache key 與
filesystem target。共享 domain 不接受 executable、任意 IPC channel、credential 或路徑。

Query profile／variant expansion 同時限制 profile 數量、總 query 數與 provider request budget，
避免 alias Cartesian product、跨語言 fuzzy expansion 或惡意 metadata 造成無界 fan-out。
