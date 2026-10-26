# 競品現況與專案文件整理（2026-10-26）

日期：2026-10-26（Asia/Taipei）。本輪依 Owner 確認的文件整理範圍，更新四個競品、盤點文件分類並精簡功能路線；沒有實作產品功能或改變已接受 ADR。來源識別、基線 hashes 與完整文件清單見[證據 JSON](product-and-documentation-review-2026-10-26.json)。

本報告是當輪研究與整理收據。競品現況入口見[競品調查](competitive-research.md)，本案現況與路線只見[產品規格](../../spec.md)，不在此建立第二份長期 roadmap。

後續程式核對補正：manual 無伴奏項目與 confirmed-start 場次時間軸接線已存在，先前列為待新增的分類不準確；以[順序規劃的原始碼依據](player-practice-planning-2026-10-26.md#目前實作核對與分類補正)及現行 spec 為準。下文與原 JSON 保留整理當時的快照，不將既有接線等同實機驗收已通過。

## 方法與範圍

- 全量盤點 212 份受版控 Markdown，其中 178 份在 docs；記錄檔名、標題／章節、行數與原始 SHA-256。
- 檢查目錄角色、入口覆蓋及去除 fenced code 後的本機 Markdown 連結／標題錨點。基線共 1,041 個連結，未發現失效目標／錨點；一份驗證文件沒有其他 Markdown 的引用。
- 語意覆核 README、PRODUCT、spec、architecture、DESIGN、各索引、舊競品報告及與播放、場次、BGM、歌詞、Mic、分析、Output、發布相關的契約／研究。全量結構盤點不等於重跑每份歷史報告或逐項重新驗收程式。
- 競品只採官方網站、GitHub releases、stable manifest 與官方手冊來源。部分託管頁面讀取失敗時，改讀官方文件庫，明確區分文件宣稱與已操作 UI。

## 競品證據快照

| 產品               | 本輪版本依據                                                                                          | 可影響比較的變化                                                                                     | 尚未驗證                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Setlista           | 官方頁 0.26.0，2026-10-21。                                                                           | 分開歌名／藝人與對應 skins，仍是 OBS 內文字歌單工具。                                                | 實際 OBS 操作與穩定性。                                      |
| 聲嶼 Elitesand Pro | Release／tag README 1.1.1，2026-10-18。                                                               | 準備流程、波形對時、全域快捷鍵、常駐視覺與限時活動；本版要求完整安裝。                               | 音訊／視覺品質、快捷鍵衝突、安裝升級及 AI 分離品質。         |
| 歌回救星           | Stable manifest 與 release 2.2.0.2；Launcher 1.3.0.0、runtime 1.0.0.19。Release 在台灣為 2026-10-26。 | 可選觀眾點歌／私人 Studio、身分備份，以及待播／歌詞修正；進階音訊仍分軟體路由與硬體 Direct Monitor。 | 裝置延遲、混音／OBS 實收與線上服務行為。                     |
| KAREOKIE           | Release 0.1.14，2026-10-26；官網與當輪政策頁。                                                        | 本機歡唱／Mic 分析、個人回饋、衍生音訊壓縮與安裝復原。                                               | 音準／評分可信度、壓縮品質、實際離線行為及人聲監聽是否存在。 |

版本來源：[Setlista 官方頁](https://nekosogi.org/setlista3)、[聲嶼 release](https://github.com/z22115554/elitesand-pro/releases/tag/v1.1.1)、[歌回救星 release](https://github.com/NoonIsAwesome/Singing-Stream-Savior-Updates/releases/tag/v2.2.0.2)與[stable manifest](https://github.com/NoonIsAwesome/Singing-Stream-Savior-Updates/blob/master/updates/stable.json)、[KAREOKIE release](https://github.com/a8594755-maker/KAREOKIE-releases/releases/tag/v0.1.14)。

需要保留的來源落差：歌回救星更新庫 README 仍連向 2.1.8.10；聲嶼 README 自稱的模板總數與新增表列不一致；KAREOKIE 首頁 LAN 遙控文字與較新網路遙控紀錄不同，政策頁也仍標草稿。因此版本依 release／stable manifest，模板不作數量排名，遙控與帳號依賴只描述實際讀到的文件。

進階監聽依據為[歌回救星官方手冊來源](https://github.com/NoonIsAwesome/Singing-Stream-Savior-Manual/blob/master/advanced-streaming.md)；線上／本機分工見[觀眾點歌手冊來源](https://github.com/NoonIsAwesome/Singing-Stream-Savior-Manual/blob/master/audience-requests.md)與[隱私聲明資料](https://github.com/NoonIsAwesome/Singing-Stream-Savior-Manual/blob/master/_data/privacy.json)。KAREOKIE 的[條款](https://kareokie.pages.dev/zh-tw/terms/)／[隱私草稿](https://kareokie.pages.dev/zh-tw/privacy/)及[聲嶼 tag README](https://github.com/z22115554/elitesand-pro/blob/v1.1.1/README.md)只作官方揭露證據，不是網路或法律稽核。

## 文件分類與維護責任

| 類別             | 正式位置                                 | 應保存                                                 | 不應混入                               |
| ---------------- | ---------------------------------------- | ------------------------------------------------------ | -------------------------------------- |
| 公開介紹         | README.md                                | 用途、開始方式、簡短能力摘要與正式入口。               | 詳細工程歷史或另一份 roadmap。         |
| 穩定定位         | PRODUCT.md                               | 使用者、以本機播放器為核心的歌唱工作流、原則與非目標。 | 最新版本與逐項完成度。                 |
| 現況與路線       | docs/spec.md                             | 唯一完成度表、已接受方向、前置條件、未決與研究候選。   | 逐次效能數字、演算法與逐檔實作歷史。   |
| 已實作架構／行為 | architecture、contracts                  | Runtime ownership、資料、狀態權威與可驗證邊界。        | 未經接受的功能承諾。                   |
| 視覺規範         | DESIGN.md、正式 CSS tokens               | 現行視覺／元件規則與數值來源。                         | 與現行 tokens 衝突的舊 scaffold 色票。 |
| 決策             | adr                                      | 原因、接受／提案／取代狀態與決策限制。                 | 用程式已存在來推定 Proposed 已獲接受。 |
| 規則與治理       | governance                               | 發行、權利、外觀交付與依賴政策；必要 dated audit。     | 當作排程承諾的市場選項。               |
| 操作與驗收       | operations                               | Runbook、版本／環境受限的驗收收據。                    | 僅因檢查通過而宣稱所有裝置／整場穩定。 |
| 研究／歷史       | research、archive                        | 當輪方法、來源、分母與限制；已完成／取代的歷史計畫。   | 以舊快照代表當前狀態。                 |
| 模組與維護指南   | scripts、tools、resources、src 等 README | 所在模組的操作與維護入口。                             | 重複全產品規格。                       |

日期不是移動檔案的理由。當輪驗收留在 operations，dated governance audit 留在治理主題；研究與原始數據維持原路徑／hash。此次沒有為目錄整齊而搬動歷史資產或大量改寫 release notes；歷史文件只修正一處指向重整後 spec 的連結。

## 發現與處置

| 發現                                                                        | 處置                                                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 舊競品版本、模板分類與本案 BGM／場次規劃已過期。                            | 更新競品入口；移除另一份 Utawakui 完成度矩陣，回連 spec。                                        |
| Spec 的曲庫／歌詞單格塞入大量資料與顯示實作；音樂分析容易被讀成已正式公開。 | 將狀態表縮成可讀摘要，細節回到既有契約；獨立列出實驗估計與分析驗收界線。                         |
| 已接受方向、等待視覺／品質門檻與討論中的候選混在近期／中期／後期。          | 改成驗收優先、既有方向、前置條件與研究候選；保留手機規劃、引導等待視覺及 Mic 兩種用途。          |
| DESIGN front matter 是舊 scaffold 色票／元件值，與現行 CSS、正文不一致。    | 移除過期 scaffold 值，保留現行規範、有效 rem 圓角契約與 Token v2 來源；沒有改 CSS 或 UI。        |
| 來源曲序契約未列入契約索引；製作署名／列舉驗證缺引用。                      | 分別補在 contracts 與 operations 導覽；移除 docs 首頁尾端逐次追加的領域清單。                    |
| 最新原始碼、release-note 檔與已公開版本容易混淆。                           | 本輪官方 release 查得 v0.5.0，工作樹為 v0.5.1；spec 明列差異，其他入口只說明如何判定。           |
| 舊發布段落重複保存現在的驗收狀態。                                          | Runbook／ADR 0007 保留決策與歷史，把動態版本／驗收狀態交回 spec；沒有變更 ADR 的 Accepted 決策。 |
| 產品研究混在工程索引尾端，v0.4.0 網站稿可能被當作現況。                     | 分出產品／競品研究入口，標明網站稿的歷史版本範圍。                                               |

本案公開版本的查核依據為 [v0.5.0 release](https://github.com/yPinn/Utawakui-Releases/releases/tag/v0.5.0)。它證明已存在公開版本與資產，不證明 installed-upgrade、所有格式或真實 OBS 驗收已通過。

## 路線精簡的判斷

本輪保留「本機曲庫／播放器 → 排練與演出 → 可選呈現」主線，沒有將產品縮成純播放器或擴張為評分 KTV。

先做現有能力的可靠性與演出驗收；手機遙控／提詞器、pre-render／preset、Output Instance／Pack 等保留原有方向及條件。引導等待視覺定案。新提出的區段練習、影片音訊入口、衍生音訊減量與 Mic 分析／電平反應留在研究候選，不藉文件整理提高為開發承諾。

Mic 的人聲監聽、音準分析與視覺反應分開；競品有延遲設定不證明監聽問題已解決。成績比較／榜單不投入本輪；chat 自動點歌、雲端協作與全功能音訊工作站仍不因競品新增能力而納入。

## 驗證與限制

最終盤點為 213 份 Markdown、1,056 個本機連結，無失效目標／錨點且 docs 均有入口；相關 DESIGN 文件契約 2 檔、45 項測試通過。Markdown、目標格式與差異檢查收據記錄於證據 JSON 的 verification。初次文件契約測試曾因刪除有效圓角 metadata 失敗，恢復該契約後通過，未更改測試；連結覆核另發現一處舊 spec 錨點，已只修正導航目標。沒有更動 production code、依賴、IPC 或資產；不以未執行的 build、產品測試或競品實機操作作為證據。

本輪未重審平台政策與法規、未安裝競品、未驗音質／音準／低延遲，亦未重跑歷史數據。既有 ADR 0019／0020 的 Proposed 狀態不因已有程式而自動修改；歷史研究、release notes 與原始 JSON 不回改。
