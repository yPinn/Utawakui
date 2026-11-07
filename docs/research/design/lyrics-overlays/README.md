# 字幕風格提案與模板建立入口

本目錄保存字幕風格候選、共用提案格式及進入製作時的建立規格。先從本入口盤點候選，再對照[產品規格第 7.3 節](../../../spec.md#73-研究候選尚未接受為開發路線)與[已實作模板](../../../contracts/output-appearance.md#模板清單)，不可只查 registry 就推定沒有提案。

## 文件角色與來源

- Proposal 描述想達成的體驗與待比較方向，不代表已接受開發、鎖定技術或承諾發布。
- Build Spec 描述選定方向如何接入既有架構；模板程式、行為契約、驗收收據各有自己的權威，不在此建立第二套 runtime 規格。
- 產品採用與交付狀態由 spec 持有；本索引只維護候選身份、來源與文件位置。名稱與 working ID 都仍可在定案前調整，不是已登錄的模板 ID。
- 活躍提案直接在原文件收斂；新版補充須標明取代哪些初步方向，不逐回合新增平行副本。被取代或結案時保留去向與入口，不讓候選只存在於聊天或 `tasks/`。

初始來源為 Codex 聊天「新增魚眼視角歌詞 OVL 模板」，chat ID `01a12d4f-2f5c-7c83-ba3a-d350e72623e7`。2026-11-03 核對原始使用者訊息與回覆後整理入正式文件；下表時間皆為 2026-10-12、Asia/Taipei。

| 順序 | 提案                              | Working ID         | 來源時間／turn ID                                                  |
| ---- | --------------------------------- | ------------------ | ------------------------------------------------------------------ |
| 1    | [魚眼鏡筒](fisheye-lens.md)       | `fisheye-lens`     | 07:32；`01a12d4f-dc61-7bf2-a0a7-e56649e3ac8c`                      |
| 2    | [剪報對白](cutout-dialogue.md)    | `cutout-dialogue`  | 08:03；`01a12d6b-9bab-7d22-9198-14b4fd15da33`                      |
| 3    | [寬銀幕字幕](cinema-letterbox.md) | `cinema-letterbox` | 08:12；`01a12d73-ebdf-7571-8447-71b4900f2b30`                      |
| 4    | [直書白帶](vertical-ribbons.md)   | `vertical-ribbons` | 08:17 提出、08:18 回覆收錄；`01a12d78-5ab5-7a73-9b27-2a655f163e55` |

07:57 的 turn `01a12d66-1001-7042-b12a-f4745cf7c8a7` 將工作改為先收齊提案及共用格式，暫停魚眼實作。因此 07:32 回覆提出的 DOM／CSS 3D、中央偏下等建議只保留為候選，不能視為已確認的 Build Spec。

原始四款中的三張參考圖目前無可讀本機副本。各文件記錄聊天描述、來源與已核對的範圍。外部參考與產品素材分開管理。

2026-11-04 另收錄本次聊天受ヨルシカ《盗作》系列啟發的三款直書方向。各案附《前世》的已回看時間點作為舞台構圖參考。

| 順序 | 提案                               | Working ID            | 本輪保留的比較重點                       |
| ---- | ---------------------------------- | --------------------- | ---------------------------------------- |
| 5    | [黑板直書](chalkboard-vertical.md) | `chalkboard-vertical` | 粉筆白字、右側細線與每欄分向退場         |
| 6    | [中央直書](centered-vertical.md)   | `centered-vertical`   | 單欄、安全邊界與簡易換句                 |
| 7    | [風擬直書](wind-vertical.md)       | `wind-vertical`       | A 同側雙欄在左、右區選一側，B 保留為對照 |

2026-11-07 依使用者提供的 Instagram 歌詞影片，另收錄[固定起點的片語歌詞](anchored-lyric-phrases.md)（Working ID `anchored-lyric-phrases`）。比較直式錨點、字區容量和片語揭示，保留行級時間回退。

## 共用格式

五款正式字幕的現況回填、左中右人物佔位與位置調整候選另見[VTuber 佔位回看](production-vtuber-placement-review.md)。

- [Proposal 格式](proposal-template.md)：先填體驗、參考、構圖、歌詞能力、動態、屬性候選、風險與待決事項。
- [Build Spec 格式](build-spec-template.md)：方向選定後才填精確的資料流、相容性、欄位、runtime、預覽、素材、測試與封裝變更。

未決值寫「待定」，不要為了填滿格式而虛構數字、測試結果或已核准的決策。[黑板直書](chalkboard-vertical-build-spec.md)及[中央直書](centered-vertical-build-spec.md)各有首版 Build Spec，其餘候選仍在 Proposal 階段。

## 從構想到交付

沿原討論的 `Idea → Feasibility → Direction Lock → Build Spec → Implementation → OBS Acceptance → Release／Archive` 分工；Archive 也可作為任一階段停止或被取代的去向。

| 階段             | 應留下的內容                           | 進入下一階段前確認                       |
| ---------------- | -------------------------------------- | ---------------------------------------- |
| Idea             | 來源、體驗、視覺語法、差異與未知       | 候選身份可追溯，使用者補充已收進原文件   |
| Feasibility      | 資料需求、能力缺口、候選技術及風險證據 | 不把概念推演當成已驗證可行               |
| Direction Lock   | 選定構圖、範圍、可調項與保留規則       | 依使用者當輪授權收斂；清楚標記仍待決部分 |
| Build Spec       | 可審查的實作切片與驗收計畫             | 對照既有契約，列出需要新增或修改的邊界   |
| Implementation   | 程式、契約、測試、素材來源與封裝同步   | 自動驗證及實際載入通過，未驗範圍保留     |
| OBS Acceptance   | 可見模式、版本、尺寸、背景與情境收據   | 預覽或純函式測試不能取代指定 OBS 驗收    |
| Release／Archive | 對應版本或停止原因與後續入口           | spec 狀態與實際交付一致                  |

文件整理授權不等於模板實作授權；已明確授權的工作也不需重複詢問。尚未完成的步驟不因提案文件存在而自動通過。

## 對接既有架構

- 模板／Style Set／Pack／Variant 分工見 [ADR 0011](../../../adr/0011-overlay-instances-and-presentation-pack-delivery.md)與 [Pack 契約](../../../contracts/overlay-pack.md)。新增藝術行為由 App runtime 交付，不能透過 Pack 注入任意程式。
- 元素、屬性、配置自由度見 [ADR 0027](../../../adr/0027-output-template-elements-and-property-workspace.md)。採用元素編輯須逐模板宣告與驗證，不能把規劃能力當成已可用工具。
- 實際 ownership 見[架構圖](../../../architecture.md#output-boundary)；外觀、資料與生命週期見 [Output 外觀](../../../contracts/output-appearance.md)、[Output runtime](../../../contracts/output-runtime.md)及[文字處理](../../../contracts/lyrics-text-processing.md)。
- 素材與作品品質見[外觀交付標準](../../../governance/appearance-sets-plan.md)，可見驗收見[操作清單](../../../operations/output-appearance-acceptance.md)。
