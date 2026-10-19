# 文件導覽與決策現況

先依問題選入口；產品狀態、實作邊界、操作與當輪證據分別維護，避免重複描述形成不同版本。

## 文件權責

| 要查什麼         | 入口                            | 維護範圍                            |
| ---------------- | ------------------------------- | ----------------------------------- |
| 產品／開發起點   | [專案README](../README.md)      | 使用者與contributor入口             |
| 定位與非目標     | [PRODUCT](../PRODUCT.md)        | 穩定承諾與產品邊界                  |
| 功能現況與待決策 | [產品規格](spec.md)             | 唯一產品狀態表與方向                |
| Runtime與依賴    | [架構圖](architecture.md)       | 現行ownership、資料、安全與封裝邊界 |
| 視覺與元件規則   | [DESIGN](../DESIGN.md)          | 現行renderer設計系統                |
| 決策原因         | [ADR索引](adr/README.md)        | 決策效力與取捨，非完成清單          |
| 可驗證行為       | [契約索引](contracts/README.md) | Protocol、資料、安全及驗收門檻      |
| 模型／方案研究   | [研究索引](research/README.md)  | 當輪方法、分母、環境與限制          |

產品意圖看規格與有效ADR；目前行為以code、registry、tests與封裝驗證核對。封裝內容以[release inventory](operations/release-inventory.md)為準；研究或tasks不取代以上來源。

## 目前產品快照

只維護[規格的功能現況表](spec.md#3-目前功能現況)，本入口不再複製各功能的交付狀態。

## ADR 現況對照

26份決策見[ADR索引](adr/README.md)。原文Status描述決策接受／取代，不等於程式、人工驗收或正式啟用都已完成。

## 常用文件

| 工作           | 文件                                                                                                                                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 歌詞模型選型   | [收斂結論](research/lyrics-alignment-summary.md)、[本機研究試用與聽查](operations/lyrics-alignment-research.md)                                                                                                                                          |
| 功能／資料契約 | [契約索引](contracts/README.md)：歌詞、匯入、播放安排、BGM、Output、整合與UI規則                                                                                                                                                                         |
| 發布與安裝     | [release runbook](operations/release-runbook.md)、[安裝／重裝驗證](operations/installer-maintenance-verification-2026-10-18.md)、[更新驗收範本](operations/update-acceptance-template.md)、[release notes範本](operations/release-notes-template.md)     |
| 驗證與效能     | [人工驗收](operations/manual-acceptance.md)、[CI規則](operations/ci-usage.md)、[啟動效能基準](operations/startup-performance-baseline.md)                                                                                                                |
| 錯誤診斷       | [diagnostics操作與rollout](operations/diagnostics-rollout.md)                                                                                                                                                                                            |
| 權利與公開發行 | [合規參考](governance/legal-compliance.md)、[功能說明查核](governance/feature-notice-review-2026-10-18.md)、[服務／模型／元件查核](governance/release-license-review-2026-10-18.md)、[封裝notices補正](governance/packaged-notices-repair-2026-10-18.md) |
| 發行紀錄       | [v0.4.0](releases/v0.4.0.md)、[v0.3.0](releases/v0.3.0.md)、[v0.2.0](releases/v0.2.0.md)、[v0.1.2](releases/v0.1.2.md)、[v0.1.1](releases/v0.1.1.md)                                                                                                     |
| 歷史計畫       | [Lyrics T2計畫](archive/lyrics-t2-implementation-plan.md)；現行行為仍以契約為準                                                                                                                                                                          |

## 目錄結構

`adr/`放決策；`contracts/`放可驗證邊界；`operations/`放可執行操作；`governance/`放權利與治理證據；`research/`放當輪研究；`archive/`放完成計畫；`releases/`放版本紀錄。`docs/`根目錄只保留本入口、規格與架構圖。

## 保留與歸檔判斷

- 更新產品狀態改spec；更新架構／契約改對應文件，不在索引追加一份進度敘述。
- 跨批次研究先更新該題的結論入口；新數據留日期報告與JSON，區分來源、分母及未驗證項。操作命令集中operations或工具README。
- 保留已取代ADR、當輪證據、舊版release與歷史計畫；不因後續結論改變而覆寫舊數字或刪除追溯路徑。
- `tasks/`是ignored的本機scratch，不是持久產品狀態或對外操作來源。
