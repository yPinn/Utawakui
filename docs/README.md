# 文件導覽

每件事只在一處維護；其他文件連結過去，不複製狀態。

先讀 README 了解用途，再依 PRODUCT → spec → architecture／contracts 查定位、現況與行為。研究結果與契約存在都不代表功能已交付；功能路線分為既有能力驗收、已接受方向、等待條件與尚未接受的研究候選，統一由 spec 第 6／7 節管理。

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

意圖以規格與有效 ADR 為準；實際行為以程式、registry 與測試核對。 規劃閱讀從[播放器／排練入口](research/product/player-practice-planning-2026-10-26.md)進入；索引不重述四份提案或另立 roadmap。

## 操作手冊（operations/）

- 開發工具：[scripts 入口與維護邊界](../scripts/README.md)、[tools 發布維護工具](../tools/README.md)、[原型與隔離檢查](../prototypes/README.md)
- 發布：[release runbook](operations/release-runbook.md)、[安裝／重裝驗證](operations/installer-maintenance-verification-2026-10-18.md)、[更新驗收範本](operations/update-acceptance-template.md)、[release notes 範本](operations/release-notes-template.md)
- 版本證據：[v0.5.1 發行範圍與驗收紀錄](operations/v0.5.1-release-scope.md)；規劃文件不列為本版已交付功能。
- 驗證：[人工驗收](operations/manual-acceptance.md)、[Output 外觀驗收](operations/output-appearance-acceptance.md)、[歌詞逐行批次驗證](operations/lyrics-line-batches-verification-2026-10-24.md)、[CI](operations/ci-usage.md)、[啟動效能基準](operations/startup-performance-baseline.md)
- 歌詞驗證補充：[製作署名與列舉分批](operations/lyrics-cast-enumeration-verification-2026-10-25.md)；屬當輪驗證紀錄，不取代現行文字／時間契約。
- 診斷與歌詞：[diagnostics](operations/diagnostics-rollout.md)、[歌詞對齊試用](operations/lyrics-alignment-research.md)、[歌詞問題回報](operations/lyrics-issue-feedback.md)、[provider 契約錄製](operations/lyrics-provider-contracts.md)

## 權利與治理（governance/）

[合規參考](governance/legal-compliance.md)、[外觀 set 計畫](governance/appearance-sets-plan.md)、[依賴查核](governance/community-dependency-boundaries-2026-10-20.md)、[服務／模型／元件授權查核](governance/release-license-review-2026-10-18.md)、[功能說明查核](governance/feature-notice-review-2026-10-18.md)、[封裝 notices 補正](governance/packaged-notices-repair-2026-10-18.md)

## 發行與歷史

歌詞工程結果集中於[顯示、時鐘與效能](archive/lyrics-display-performance-2026-10.md)及[來源、相容與交接](archive/lyrics-source-and-cues-2026-10.md)；現行操作仍由上列手冊與契約持有。

- 發行紀錄：[v0.5.1](releases/v0.5.1.md)、[v0.5.0](releases/v0.5.0.md)、[v0.4.0](releases/v0.4.0.md)、[v0.3.0](releases/v0.3.0.md)、[v0.2.0](releases/v0.2.0.md)、[v0.1.2](releases/v0.1.2.md)、[v0.1.1](releases/v0.1.1.md)
- Release notes 可先於發布準備，內容須可直接公告；GitHub draft 與內部驗收狀態不寫進版本正文。檔案存在不代表已上架；最新公開版本與工作樹差異只維護在 spec，實際資產以官方 Releases 為準。
- [歷史索引](archive/README.md) 收錄已完成或已取代的計畫與交接快照，並指向現行文件；只供追溯。

## 更新規則

- 產品狀態只改 spec；架構與行為改對應的 architecture 或契約。
- 研究按需保留日期報告與機器可用證據；不為格式另造重複 JSON。活躍提案沿同一主題維護，已被細化取代的草案移除，初始證據保留。
- `tasks/` 是 ignored 的本機 scratch，不是產品狀態來源。
- 分類依文件用途：持續維護的規則放 governance，操作／驗收放 operations，方法／結果放 research，已完成或被取代的計畫放 archive。日期本身不是移動文件的理由。
- 歷史 release notes、研究證據與已接受 ADR 保留原始來源、分母及限制；活躍提案可收斂改寫。後續方向回 spec，不把舊研究建議當當前排程。
