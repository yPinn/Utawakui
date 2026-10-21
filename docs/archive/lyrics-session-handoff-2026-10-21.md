# 歌詞分析 session 交接

已歸檔：以下為當輪提交與驗證快照，保留原分母與未完成項目，不作目前接手指令。最新方向見[研究結論](../research/lyrics-alignment/lyrics-alignment-summary.md)，操作見[試用手冊](../operations/lyrics-alignment-research.md)。

日期：2026-10-21。這是當輪交接快照，不取代[產品規格](../spec.md)、[架構圖](../architecture.md)或[歌詞估計契約](../contracts/lyrics-acoustic-estimate-contract.md)。本輪使用者授權分類整理及 commit，沒有授權實作 GPU 路徑或新增模型下載。

## 完成與未完成

| 分類                 | 已完成／目前行為                                                                                                                | 仍待處理                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 既有基線             | 本機研究環境準備、驗證、修復、移除與取消；伴奏成功後自動產生、歌詞頁手動套用／停用；來源語言與校時；T1+ 沿用既有 Output T2 樣式 | 正式模型權重／字典 gate 未解除；人工時間仍 pending，不把本機可用等同正式採用           |
| 本輪英文與驗證       | 沿用 HubertFA＋small＋既有 CMU 字典；純英文詞範圍、縮寫比較、逐句盲轉寫、靜音拒絕、有限漏詞警告；modal 精簡及實際階段進度       | 正常句誤拒、漏詞漏檢、自然錯版本／無人聲與整曲長尾仍不足；不支持任意拉丁語言或未知發音 |
| 本輪混語顯示第一階段 | 長句最多兩段文字候選、原文範圍與可靠起點對應、收合預覽；Kinetic Pop 依既有時間切換                                              | 沒有混語 HubertFA 推論、語意模型或換氣辨識；未放寬 20 秒單句模型上限；其他模板未擴展   |
| GPU 評估             | 確認分離已有 DirectML；提出單一 GPU 偏好、獨立模組環境／回退與資源協調                                                          | 尚未改設定、測新 GPU 推論或量測加速；HubertFA／small／節拍與段落目前仍 CPU             |
| 人工驗收             | 原 15 優先案例與額外 4 漏詞對照有直接聽查入口；使用者表示多數詞塊已查核，要求時間後置                                           | 未確認／未匯入的人工時間一律 pending，不代填、不以 provider 或模型時間冒充真值         |

本輪英文共 9 案、10 個出現位置；兩個刪詞構造僅一個警告。混語曲庫掃描 278 首／285 來源／14,160 行，有 59 句文字候選，其中僅 1 句具有可用原生 T2 邊界、54 句缺時間、4 句切換過快。這些分母不等於一般準確率。

操作及聽查集中於[本機研究試用手冊](../operations/lyrics-alignment-research.md)。證據與限制見[英文實測](../research/lyrics-alignment/lyrics-english-validation-2026-10-20.md)、[混語第一階段](../research/lyrics-alignment/lyrics-mixed-phrases-2026-10-21.md)、[GPU 評估](../research/audio/processing-gpu-shared-preference-2026-10-21.md)；歷史報告保留當時結果，不改寫成新一輪通過。

## 提交與驗證

本輪將英文驗證／進度及混語顯示合為一個功能 commit，GPU 評估與此交接文件另作文件 commit。BGM、演出安排、提詞器、Output F1–F5、MusicBrainz 身分及其他模型配對／LyricFloat 研究屬並行修改，未混入。共用 architecture／spec／release inventory／研究索引／HTTP allowlist／包裝測試只挑選本輪相關段落。原先 staged BGM 文件保持原樣，未推送遠端。

功能提交：`7d985d0`（`feat(lyrics): add English validation and timed mixed phrases`）。文件提交以同日 `docs(lyrics): record GPU assessment and session handoff` 為題；完整 hash 以 Git log 為準。

本輪獨立提交快照通過 960 個測試檔、8,994 項測試，另 1 項既有略過；coverage S88.87／B81.92／F91.56／L91.15，既有 domain／file ratchet 全數通過，沒有降低門檻。全庫 ESLint、功能快照 159 份 Markdown、提交檔案 Prettier、Python 8 項及 production build 通過；GPU／交接文件納入後 161 份 Markdown 亦通過。Build 保留既有 large-chunk warning。此快照排除並行修改，不能把先前混合工作目錄的 9,219 項當成此次提交測試數。

驗證工具的初次沙箱 TEMP rename EPERM、快照未指定 Git root 導致空 inventory，以及挑選 spec 列後的表格對齊失敗均保留紀錄；分別以正常權限驗證、明確的獨立 index／work tree 與該表格式修正後通過，未改產品來掩蓋錯誤。本輪沒有新增可見 App 或 OBS 人工驗收；先前可見 Electron／Browser Source 功能證據與本次原始日誌留在 ignored `tasks/lyrics-english-20261020`、`tasks/lyrics-phrases-20261020`、`tasks/session-handoff-20261021`，不分發私人音訊、歌詞、環境或模型。使用者既有 App 仍需完整重啟才能載入 main／preload／HTTP 變更。

## 後續接手

原接手提示詞已由目前的研究結論、操作手冊與[文件導覽](../README.md)取代。後續工作須先核對現行規格與使用者當輪指示；本快照中的 GPU 下一步、路徑及產品狀態不構成新的執行授權。
