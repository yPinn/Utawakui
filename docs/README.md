# 文件導覽

每件事只在一處維護；其他文件連結過去，不複製狀態。

| 要查什麼          | 入口                                                 |
| ----------------- | ---------------------------------------------------- |
| 定位與非目標      | [PRODUCT](../PRODUCT.md)                             |
| 功能現況與待決策  | [產品規格](spec.md)                                  |
| Runtime ownership | [架構圖](architecture.md)                            |
| 視覺與元件規則    | [DESIGN](../DESIGN.md)                               |
| 決策原因          | [ADR](adr/README.md)                                 |
| 可驗證的行為邊界  | [契約](contracts/README.md)                          |
| 當輪研究與證據    | [研究](research/README.md)                           |
| 封裝內容          | [release inventory](operations/release-inventory.md) |

意圖以規格與有效 ADR 為準；實際行為以程式、registry 與測試核對。

## 操作手冊（operations/）

- 發布：[release runbook](operations/release-runbook.md)、[安裝／重裝驗證](operations/installer-maintenance-verification-2026-10-18.md)、[更新驗收範本](operations/update-acceptance-template.md)、[release notes 範本](operations/release-notes-template.md)
- 驗證：[人工驗收](operations/manual-acceptance.md)、[Output 外觀驗收](operations/output-appearance-acceptance.md)、[CI](operations/ci-usage.md)、[啟動效能基準](operations/startup-performance-baseline.md)
- 診斷與歌詞：[diagnostics](operations/diagnostics-rollout.md)、[歌詞對齊試用](operations/lyrics-alignment-research.md)、[歌詞問題回報](operations/lyrics-issue-feedback.md)、[provider 契約錄製](operations/lyrics-provider-contracts.md)

## 權利與治理（governance/）

[合規參考](governance/legal-compliance.md)、[外觀 set 計畫](governance/appearance-sets-plan.md)、[依賴查核](governance/community-dependency-boundaries-2026-10-20.md)、[服務／模型／元件授權查核](governance/release-license-review-2026-10-18.md)、[功能說明查核](governance/feature-notice-review-2026-10-18.md)、[封裝 notices 補正](governance/packaged-notices-repair-2026-10-18.md)

## 發行與歷史

- 發行紀錄：[v0.4.0](releases/v0.4.0.md)、[v0.3.0](releases/v0.3.0.md)、[v0.2.0](releases/v0.2.0.md)、[v0.1.2](releases/v0.1.2.md)、[v0.1.1](releases/v0.1.1.md)
- [archive/](archive/) 放已完成或已取代的計畫，只供追溯。

## 更新規則

- 產品狀態只改 spec；架構與行為改對應的 architecture 或契約。
- 新研究寫日期報告與 JSON，結論併入該主題入口；舊數字不回改。
- `tasks/` 是 ignored 的本機 scratch，不是產品狀態來源。
