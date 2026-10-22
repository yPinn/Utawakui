# 文件導覽

每件事只在一處維護；其他文件連結過去，不複製狀態。

| 要查什麼          | 入口                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------- |
| 定位與非目標      | [PRODUCT](../PRODUCT.md)                                                                 |
| 功能現況與待決策  | [產品規格](spec.md)                                                                      |
| Runtime ownership | [架構圖](architecture.md)                                                                |
| 共用契約與呈現    | [Shared 邊界](architecture.md#shared-boundary)                                           |
| 視覺與元件規則    | [DESIGN](../DESIGN.md)                                                                   |
| 決策原因          | [ADR](adr/README.md)                                                                     |
| 可驗證的行為邊界  | [契約](contracts/README.md)                                                              |
| 當輪研究與證據    | [研究](research/README.md)                                                               |
| 封裝內容          | [release inventory](operations/release-inventory.md)、[資源導覽](../resources/README.md) |

意圖以規格與有效 ADR 為準；實際行為以程式、registry 與測試核對。

## 操作手冊（operations/）

- 開發工具：[scripts 入口與維護邊界](../scripts/README.md)、[tools 發布維護工具](../tools/README.md)、[原型與隔離檢查](../prototypes/README.md)
- 發布：[release runbook](operations/release-runbook.md)、[安裝／重裝驗證](operations/installer-maintenance-verification-2026-10-18.md)、[更新驗收範本](operations/update-acceptance-template.md)、[release notes 範本](operations/release-notes-template.md)
- 驗證：[人工驗收](operations/manual-acceptance.md)、[Output 外觀驗收](operations/output-appearance-acceptance.md)、[CI](operations/ci-usage.md)、[啟動效能基準](operations/startup-performance-baseline.md)
- 診斷與歌詞：[diagnostics](operations/diagnostics-rollout.md)、[歌詞對齊試用](operations/lyrics-alignment-research.md)、[歌詞問題回報](operations/lyrics-issue-feedback.md)、[provider 契約錄製](operations/lyrics-provider-contracts.md)
- 歌詞顯示時鐘：[本地／Output 採樣配對修正與同案例對照](operations/lyrics-clock-fix-2026-10-22.md)
- Output 顯示效能：[deadline 與首字樣式準備修正](operations/lyrics-output-tail-fix-2026-10-22.md)
- T1+ 連續填色：[細時間保留、中日映射與兩端同案例驗證](operations/lyrics-continuous-fill-2026-10-22.md)
- Output 細填色成本：[首字準備、commit 與冷暖重播對照](operations/lyrics-output-fine-cost-2026-10-22.md)
- Output 冷啟動長尾：[同次事件鏈、Focus 量測與舊分組資料診斷](operations/lyrics-output-cold-max-2026-10-22.md)
- 歌詞階段整理：[交付範圍、驗證與尚未解決的時間限制](operations/lyrics-milestone-2026-10-22.md)

## 權利與治理（governance/）

[合規參考](governance/legal-compliance.md)、[外觀 set 計畫](governance/appearance-sets-plan.md)、[依賴查核](governance/community-dependency-boundaries-2026-10-20.md)、[服務／模型／元件授權查核](governance/release-license-review-2026-10-18.md)、[功能說明查核](governance/feature-notice-review-2026-10-18.md)、[封裝 notices 補正](governance/packaged-notices-repair-2026-10-18.md)

## 發行與歷史

- 發行紀錄：[v0.4.0](releases/v0.4.0.md)、[v0.3.0](releases/v0.3.0.md)、[v0.2.0](releases/v0.2.0.md)、[v0.1.2](releases/v0.1.2.md)、[v0.1.1](releases/v0.1.1.md)
- [歷史索引](archive/README.md) 收錄已完成或已取代的計畫與交接快照，並指向現行文件；只供追溯。

## 更新規則

- 產品狀態只改 spec；架構與行為改對應的 architecture 或契約。
- 新研究寫日期報告與 JSON，結論併入該主題入口；舊數字不回改。
- `tasks/` 是 ignored 的本機 scratch，不是產品狀態來源。
