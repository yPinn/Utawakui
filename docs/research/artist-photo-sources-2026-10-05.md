# 演出者照片來源實測

日期：2026-10-05

## 研究問題

[ADR 0022](../adr/0022-artist-identity-and-organization.md) 的 artist 頁與 sidebar 演出者列需要一張代表演出者的圖片。初版借用演出者最新專輯的封面，但專輯封面代表的是發行，不是演出者，owner 不希望直接採用。本研究回答：有沒有穩定、合規、覆蓋率足夠的演出者照片來源？

本研究只保存彙總結果；實測對象是一份實際曲庫中會出現在 sidebar 的 21 位演出者（擁有專輯或至少 2 首曲目）。

## 候選與結果

| 來源                                  | 涵蓋（21 位） | 圖片性質                                               | 取得方式                                                                   | 判定                            |
| ------------------------------------- | ------------- | ------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------- |
| YouTube 演出者頻道頭像                | 18            | 演出者自己設定的形象圖，也是 YT Music 演出者頁顯示的圖 | App-managed yt-dlp 讀頻道 `/featured` 分頁的 `avatar_uncropped`（900×900） | 第一順位自動來源                |
| Wikidata P18（經 MusicBrainz）        | 約 7          | Commons 自由授權，多為演唱會或活動照                   | MusicBrainz artist `url-rels` → Wikidata → Commons                         | 待 MusicBrainz 查詢落地後的候選 |
| 本機選圖                              | 全部          | 使用者自選                                             | 與曲目封面相同的選圖流程                                                   | 永遠可用、優先於自動來源        |
| Spotify／Apple／fanart.tv／TheAudioDB | —             | —                                                      | —                                                                          | 理由同封面研究，不採用          |

### YouTube 頻道頭像

- 268／269 首曲目的 `info.json` 已有 `channel_id`，不需要新的搜尋。
- 同一個頻道 ID 在 yt-dlp 頁面上可能標成 `<名稱> - Topic`，但曲目 `info.json` 的 `channel` 名稱能分辨兩種情況：
  - 名稱不以「- Topic」結尾（例如 `Ado`、`周杰倫 Jay Chou`）：頭像是演出者形象圖。
  - 名稱以「- Topic」結尾（例如 `Yitai Wang - Topic`）：頭像是某張專輯封面，YouTube 與 YT Music 都相同。
- 頻道不一定屬於每一位 credited 演出者：客演者會出現在主唱的頻道曲目上，團體也可能使用不同名稱的頻道（例如 `BTS` 對 `BANGTANTV`）。因此配對必須以「該演出者為第一署名的曲目」的多數頻道決定，不能比對頻道名稱。
- 直接讀取頻道頁 HTML 的 `og:image` 也能取得同一張圖，但屬於 [ADR 0015](../adr/0015-recording-first-provider-discovery.md) 拒絕的網頁抓取；產品必須走 app-managed yt-dlp。
- 讀取一個頻道約 1 秒，回傳的圖片位於 `yt3.googleusercontent.com`。

### Wikidata／Commons

- 18 位對到 MusicBrainz，13 位有 Wikidata，約 7 位有 P18 或 MusicBrainz image relation。
- 2 筆是 MusicBrainz 連錯人造成的假命中，再次說明名稱完全吻合不足以自動連結。
- 授權最清楚，但照片多為演唱會或活動照，作為頭像的辨識度不一定好。

## 權利邊界

頻道頭像是演出者在 YouTube 上公開的形象圖，與現有 yt-dlp 縮圖相同，取得不代表 Utawakui 確認了任何使用權利。下載後只作本機控制台的顯示，不自動進入 OBS Output；現有 legal guidance 仍然適用。

## 結論

- 自動來源採 YouTube 官方頻道頭像，條件是演出者為第一署名且頻道名稱不是 Topic。
- 沒有照片時顯示通用人像圖示，不再借用專輯封面。
- Wikidata 圖片留待 MusicBrainz 查詢實作後，作為手動候選。
