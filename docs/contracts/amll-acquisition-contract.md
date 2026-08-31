# AMLL TTML 退役相容契約

狀態：產品 acquisition 已退役；既有本機來源相容仍保留。
建立日期：2026-08-31。

## 目前狀態

2026-08-31 比較本機 Elitesand 早期原始碼後確認：Elitesand 沒有 AMLL provider；其固定來源
為 BetterLyrics、Paxsenix／Apple Music、Kugou、QQ Music、LRCLIB 與 NetEase。其前端也會
在沒有 authored word spans 時，把 line interval 平均分給 tokens，因此畫面上的逐字掃動
不能當成 AMLL 或其他來源的原生逐字命中證據。

Utawakui 對 AMLL 的 live smoke 證明命中時可取得完整 authored T2，但沒有完成的 aggregate
corpus 報告能證明其達到原訂增量覆蓋門檻；實際日常使用也回報命中偏低。因此 `amll` 已從
renderer 線上來源、main provider allowlist、save dispatch 與 `all` fan-out 移除，新的
search／save intent 會被視為 invalid provider。

退役不破壞既有資料：已保存的 `amll-*.lrc`、canonical timing sidecar 與 provider artifact
仍可讀取、顯示來源名稱並由 provider-owned deletion 一併刪除。原 bounded TTML parser 也
保留供 Better Lyrics 共用。以下章節保留退役前的網路、驗證、儲存與品質契約，作為歷史
artifact 格式與相容行為的依據；它們不表示 AMLL 仍是可搜尋產品來源。

## 來源與產品邊界

`AMLL TTML` 指 [AMLL TTML Database 官方 HTTP API](https://amll.dev/reference/http-api/overview)，
固定 origin 為 `https://api.amll.dev`，provider id 為 `amll`。它不是 Apple Music 私有
`amp-api`、Apple bearer token、Better Lyrics、Paxsenix 或任一社群 mirror。AMLL 是
退役前是 `lyrics-flow` 下的手動候選來源，不自動改寫本機曲目，也不在啟動路徑執行。

Utawakui 只實作獨立的 HTTP client、bounded XML parser 與 canonical timing projection，
沒有納入 AMLL 的 renderer／player 套件或 Apple credential。API server source 採
[MIT／Apache-2.0](https://github.com/amll-dev/amll-ttml-api) 雙授權；歌詞內容則是另一個
權利層，不能由 API 程式授權推論。

## 網路與信任邊界

Main 只使用兩個無需鑑權的固定 HTTPS GET endpoint：

- `/v1/lyrics/search`：以 bounded `musicName`、`artistName`、`albumName` 與分頁搜尋
  metadata；
- `/v1/lyrics/get?id=<safe-integer>`：以搜尋取得的固定 id 取回完整 TTML。

請求拒絕 redirect，不接受 renderer URL、header 或 credential。Query 各欄最多 256
字元並拒絕 control characters；搜尋、TTML response、metadata array、XML depth、element、
line 與 segment 皆有固定上限。Scheduler 保守限制 request 起始間隔；同來源新查詢會取消
舊查詢。所有搜尋與保存仍由 main 重新檢查 `lyrics-flow`。

## 逐字準確度

候選的 T2 來自 AMLL TTML 中每個 primary lyric span 的 authored `begin`／`end`，不是
Utawakui 平均切字或語音辨識推估。Parser 只在下列條件全部成立時宣稱完整 T2：

- XML namespace、line interval、每個 primary span 的 interval／parent bounds／順序及文字
  覆蓋完整有效；
- translation、romanization 與 concurrent background-vocal lane 不混入單線 canonical
  segment；原始 TTML 仍完整保存在 provider artifact；
- 相鄰 segment 不重疊，唯一例外是已在官方資料觀察到的 1 ms authored boundary jitter；
  此時只把前一 segment end 對齊下一 segment start，並留下
  `normalized-boundary-jitter` warning；
- 任一 primary 文字沒有 authored timing 時，整筆降為 T1，清除所有 segment，不保存
  partial T2。

DOCTYPE／ENTITY、BOM、錯誤 namespace、越界 interval、超過 1 ms 的 overlap、超量資料或
無法解析的 TTML 都會被拒絕。Compatibility LRC 只承載逐行文字與時間；真正 T2 保存於
source-fingerprinted canonical timing sidecar。

## 候選、保存與 provenance

Search 先以 title、artist、album 與 recording-version marker 排序，最多 hydrate 五筆
metadata、輸出三筆可用候選。保存前固定以 id 重取完整記錄並比較 SHA-256 preview
fingerprint；若 upstream 內容不同，回傳 `record-changed` 要求使用者再次確認。

保存成功後：

- `lyrics/amll-<id>[-n].lrc` 保存 compatibility source；
- 完整 T2 另保存 canonical timing sidecar；
- `lyrics/providers/amll-<id>.json` 保存完整原始 TTML、metadata、作者 GitHub username／id、
  retrieval time、hash 與 `amll-http-v1` profile；
- 搜尋候選展開區顯示 bounded TTML contributor usernames，並保留 `AMLL TTML` 來源名稱。

寫入採 snapshot／rollback；刪除來源會一併移除 timing 與 provider artifact。固定 id 的內容
依官方契約不可變，但 Utawakui 仍在保存時重取並比對，避免 preview／save 競態或服務契約
漂移。

## 內容權利與品質限制

[AMLL TTML DB](https://github.com/amll-dev/amll-ttml-db) 說明：投稿者自行製作部分以
CC0 1.0 分享，外來資料部分沿用原資料提供方條款；因此不能把整個詞庫概括為單一 CC0
歌詞庫，也不能因可透過公開 API 取得就宣稱具有公開演出、重製或商用權利。Utawakui 的
`lyrics-flow` 確認與既有外部歌詞權利提示持續適用。

上游只對檔案內有效 NetEase id 所對應音源提供預設逐字品質保證，其他平台 id 除非有特供
版本，不應假設音源時間完全一致；2024 年前投稿也可能不符合目前標準。Utawakui 的 strict
parser、錄音 identity 排序、手動選擇與 offset 編輯是額外防線，不是新的歌詞正確性保證。

2026-08-31 live smoke 以 production client 搜尋 `ME!`，取得三筆 metadata；固定 id
`269710089745311` 成功取回 41,909-byte TTML，解析為 70 行、497 個 primary authored
segments、完整 T2。原檔另有 concurrent background-vocal lane；一個 1 ms primary boundary
jitter 依上述規則對齊並留下 warning。此證據只驗證 endpoint、schema 與真實 T2 路徑，不
代表曲庫覆蓋率或長期可用率。
