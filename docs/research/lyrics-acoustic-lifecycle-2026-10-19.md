# T1 聲學估計：手動選配環境生命週期驗證

本文保留當輪研究與分母；目前跨批次選型及未決項集中在[研究結論](lyrics-alignment-summary.md)。

日期：2026-10-19。接續[環境完整性稽核](lyrics-acoustic-environment-readiness-2026-10-19.md)，本輪完成環境準備、載入驗證、修復、取消與移除。保留先前研究數據，不重跑歌曲品質比較，也不擴充聲部、段落或 Output。去識別數據見[驗證紀錄](data/lyrics-acoustic-lifecycle-2026-10-19.json)。

## 結論與產品邊界

Basic 保留原有歌詞讀取、parser、T0／T1／T2、校時與獨立預覽框架。候選模型仍採獨立選配，不加入預設下載；開機、Settings 掛載及重啟只讀狀態，不安裝套件、不載入模型。

本輪交付可測的產品生命週期與設定入口，但正式 catalog 仍為 `productUse: blocked`／`weights-evidence-pending`。上游程式碼授權與權重使用／分發證據是不同 gate；本輪沒有放寬判定。設定頁顯示「尚未開放準備」，不提供下載按鈕。[上游 release](https://github.com/wolfgitpr/HubertFA/releases/tag/v0.0.7) 與[模型提供討論](https://github.com/wolfgitpr/HubertFA/discussions/2) 不作為本專案已接受權重分發的聲明。

環境 ready 只代表固定資產完整、Python 套件及 ONNX CPU warmup 可載入。它不表示歌曲內容匹配、詞界精度合格或研究模型結果已被產品接受。正式 loader 仍拒用研究 profile；沒有歌曲產生按鈕、批次推論或預設套用。錯歌／伴奏假接受與韓文／混語限制沿用[第二階段報告](lyrics-acoustic-phase2-2026-10-19.md)。

## 完整操作路徑

| 操作       | 行為與失敗邊界                                                                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 狀態       | 六個固定零參數 IPC 之一；無環境是 missing，重啟是 unverified，成功載入才 ready；缺檔／錯誤是 damaged。正式 gate 關閉時呈現 blocked。                                                            |
| 手動準備   | main 自行推導 catalog、路徑與資產；固定大小／SHA，使用既有 ZIP 安全驗證與受控解壓，不執行 pip。先在獨立 staging 驗完整 fingerprint，再跑真實 Python 與 Node ONNX probe，最後才發布 activation。 |
| 驗證載入   | 重驗 runtime／model pins、整個 environment fingerprint，再啟動有界 probe；不靠檔案存在就報 ready。失敗清除當次 ready，既有歌詞獨立可用。                                                        |
| 修復       | 可重用已驗證的本機檔案；失效檔案重新依 catalog 準備。失敗或取消不發布新 activation；發布途中失敗回滾舊目錄。回滾失敗保留備份及診斷，不將它隱藏為正常取消。                                      |
| 取消／逾時 | 共用 app heavy-job scheduler；排隊也可取消或逾時，不等前一工作釋放。執行中 abort 並等 owned 子程序 close 後收尾；不覆寫歌詞或估計。                                                             |
| 移除       | 檢查所有 generation lease，先保存嚴格、有界移除 journal，再停用本能力並刪自己的環境／模型／staging。共享 runtime 保留；journal 最後刪除。中斷或刪除失敗呈現 remove-pending，可在重啟後重試。    |

capability 是 `lyrics-acoustic`，environment 是 `lyrics-alignment`，model kind 是 `alignment`。Audio Python runtime 可共享；Provider Python、其他分析／分離環境不混用。任何仍有 generation lease 的使用情況，或另一環境 setup 進行中，拒絕破壞性變更。所有 mutation 重查 `audio-processing-flow`；取消可在 gate 關閉後收尾。renderer 不提供路徑、URL、hash、model 或 executable。

Python probe 固定 CPython 3.14.7、NumPy 2.5.2、pypinyin 0.55.0，拒絕額外 distribution、錯版本及環境外 import。Node 使用既有 ONNX Runtime，以兩秒零音訊檢查輸出形狀與有限值。每個 probe 有 60 秒期限、32 KiB stdin 與各 8 KiB stdout／stderr budget；環境工作整體 15 分鐘。子程序不繼承 NODE_OPTIONS／PYTHONPATH，錯誤只在 main 私有診斷保留原始內容。

共享 activation 毀損或 removal journal 不合法時，保守停用自動修復／移除，避免清掉其他能力；需另由診斷復原，不宣稱任意磁碟／activation 毀損都能自動修好。程序崩潰於多目錄發布中也不同於可捕捉的取消：未完成 staging／備份保留供診斷，沒有任意斷電復原 SLA。

## 容量與漸進載入

| 層級              | 增量與準備方式                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Basic             | 本輪新增少量 JS／Vue／catalog／Python bootstrap 原始碼；沒有新增 npm dependency、runtime binary 或權重。                                                                             |
| 共用 Audio Python | 若既有精確 runtime artifact 完整可重用；否則固定 archive 12,673,227 bytes。不沿用 Provider 環境。                                                                                    |
| 候選中日選配      | 模型 archive 256,589,553 bytes；兩個 wheel 合計 13,437,830 bytes；全部未快取下載合計 282,700,610 bytes，約 0.283 GB。此為 catalog descriptor 合計，尚非本輪網路 fresh install 實測。 |
| 非 cache 落盤     | 前輪釘選檔案量測含 runtime 為 484,522,322 bytes，約 0.485 GB；不含 staging、manifest、cache、解壓及修復備份峰值，不能當最低可用磁碟空間。                                            |

手動準備只在完整驗證後發布，重啟不自動預熱。載入驗證也會有 ONNX 記憶體成本；歌曲推論前輪 Node high-water 約 1.469 GB，不是本輪 probe 測量或低記憶體保證。本輪使用原機與既有資產，沒有新增低 RAM／GPU 分級或效能 SLA。

## 實測與驗證

真實資產驗收使用隔離 composition，僅在該測試中將 catalog gate 改為 accepted。使用實際 default artifact materializer、ZIP 解壓、hash／fingerprint、managed host／scheduler 及真實 Python／ONNX probe；模型 archive 與 wheel 是既有釘選原始 bytes。初輪 runtime 以既有釘選檔案重封裝，之後另下載官方 CPython 原始 archive 12,673,227 bytes、確認 descriptor SHA，並以完全不替換 runtime pins 的 catalog clone 重跑整個生命週期通過。準備流程從測試 cache 讀取這些原始 archive；沒有模型／wheel 下載、pip 安裝或正式 catalog 改動，也不是全新網路安裝的端到端驗收。

驗收順序為 missing → prepare ready → 新 service unverified → verify ready → 注入 probe 失敗的 repair → 實際第二子程序期間取消 repair → 成功 repair → remove missing。失敗與取消前後 activation 相同；owned workers 均已結束，歌詞 bytes 不變，最後 capability 資產與 staging 已移除。相同路徑另以 Electron 內建 Node 執行通過，驗證 Electron-as-Node 的 probe 啟動設定。這不是 signed installer／真正 fresh network install 或 OS 斷網驗收。

原生可見 Electron 使用全新隔離 profile、正式 main／preload／loader，沒有注入研究 method。19 項檢查通過：正式 gate 無法繞過、idle cancel／無環境 remove 無害、設定頁亮暗文案、中日 missing／stale 回退、HTML audio clock、人工 T2 保存及沒有 runtime／environment／model 安裝。設定列驗收含 1200×850 亮色與 960×650 暗色。這不代替使用者人工聽看／OBS 接受，也沒有冒稱可見驗收了 gate 後的全部操作狀態。

新增核心 focused coverage 為 7 files／33 tests，89.90% lines／82.89% branches／88.52% statements／85.55% functions，範圍包含 lifecycle、catalog、integrity、artifacts、probe、IPC 與 renderer owner；不是整個 app coverage。Node ONNX CLI 的真實子程序另由上述本機整合驗證，不當作 Istanbul 已覆蓋。Python 2 unittest 通過。

最後完整 suite 為 886 files／8,464 passed／1 既有 skip；前次新增 extraResources 清單預期已同步。另一輪既有 NetEase 測試曾發生 Windows rename EPERM，保留失敗 log，重跑全庫通過，未修改該無關實作。ESLint／production build 通過；既有 large chunk 提示保留。

本輪另完成獨立目錄的 `dist:dir`，核對封裝 catalog／Python probe 與原始檔一致，並從封裝 ASAR 的 probe 真正載入 ONNX 模型成功。以隔離 `--user-data-dir` 啟動封裝應用，trace 確認 config／DOM／interactive shell／first paint，沒有 Audio Python 資產安裝；8 秒後由測試關閉。沒有啟用 Output，因此不宣稱完成依賴 Output 的 baseline-complete 效能量測；未建 signed installer 或發布。

程式與安全邊界、Python 獨立審查通過。impeccable 專用 reviewer／documenter 類型不可用，由 fresh default agents 依替代 contract 執行；畫面結論為 ship，僅涵蓋已拍攝 blocked 設定狀態，documenter 為普通延伸 No changes。既有 DESIGN palette drift 與 UiPopover／UiTooltip class warning 沒有跨範圍修補。

## 發現與後續 gate

Windows 開發 watcher 會持有 repo 內測試目錄，最小 500 ms 延遲後 rename 可重現 EPERM；相同操作在既有排除監看的 `.tmp` 成功。真實驗收改在該隔離位置，另外仍保留有界 Windows 鎖定重試與取消回滾測試。開發伺服器另用專用 cache 與固定 HTML entries，保留其他既有服務；驗收腳本的 await 包裝錯誤只修測試工具，沒有放寬產品邏輯。

正式準備前仍需權重 gate；歌曲產生前仍需 runtime lease 綁定、歌詞／音訊身分及內容匹配政策、使用者輸入假設與錯內容防護。若日後加入聲部或段落判斷，需獨立模型／輸出契約及中日韓評估，不從本次環境 ready 推論其效果。預設模型選擇、低規硬體與 Output 仍需另行接受。
