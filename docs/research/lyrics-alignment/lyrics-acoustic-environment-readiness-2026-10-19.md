# T1 聲學估計：基本情境與選配環境完整性稽核

本文保留當輪研究與分母；目前跨批次選型及未決項集中在[研究結論](lyrics-alignment-summary.md)。

日期：2026-10-19。接續[第二階段實測](lyrics-acoustic-phase2-2026-10-19.md)，本輪回到原文 T0／T1／T2、環境載入與產品接入邊界，不擴充聲部辨識，也不正式啟用模型。數據見[去識別驗證紀錄](data/lyrics-acoustic-environment-readiness-2026-10-19.json)。

後續狀態：本報告保留稽核當時的缺口與數據；其後的手動生命週期實作及仍關閉的正式下載 gate，見[生命週期驗證](lyrics-acoustic-lifecycle-2026-10-19.md)。

## Basic 與選配的判斷

本報告將 Basic 解讀為[產品規格的預設核心](../../spec.md#21-預設核心)。目前只有一份應用安裝 payload，沒有 Basic／Ext 可選安裝包；可選能力各自從 Settings 準備，見[安裝邊界](../../operations/release-inventory.md#installer-profile-boundary)。

建議維持以下分工，而非把候選環境放進預設安裝：

| 範圍                                                 | 配置建議                                | 目前實作狀態                               |
| ---------------------------------------------------- | --------------------------------------- | ------------------------------------------ |
| 本機歌詞讀取／校時、原有 T0／T1／T2、文字顯示 parser | 預設核心，不依賴額外模型或 Audio Python | 已有；本輪回歸通過                         |
| 獨立估計資料、來源失效與回退、校時工作區預覽框架     | 預設程式碼；沒有資料就不顯示預覽面板    | Phase 1 已有；本輪原生驗證通過             |
| 中日文模型詞塊計算                                   | 獨立選配，使用者明確準備及執行          | Phase 2 私有研究工具；一般使用者路徑未交付 |
| 歌者／合唱辨識、完整字尾、韓文模型                   | 另行研究與 gate                         | 本輪未加入                                 |

理由是原曲已能獲得改善，不必強制先分離；但錯歌與純伴奏仍可能產生合法結果，權重正式使用／分發證據、低 RAM 與播放並行驗收也未完成。因此不將此候選作 Basic 的必要依賴或自動分析預設。

## 本輪實測

本輪重新執行 16 個相關測試檔、137 項測試，涵蓋 storage／validator、T0／T1／T2 projection、來源 owner、main／preload 邊界、研究 workers、既有 registry／Audio Python host 與封裝排除。Production build 通過，保留既有 large chunk 提示。這不是重新執行前輪 8,427 項全庫測試。

另以全新隔離 profile／曲庫啟動可見 Electron，不覆寫 loader、不注入研究 method、不安裝 Audio Python，13 項檢查通過：

- 中文放入真實模型 sidecar，正式 main／preload 回傳 stale，音訊輔助不可啟用，仍有 canonical T1 與整句時間估算。
- 日文移除 sidecar，正式回傳 missing，不顯示預覽面板；原文與 HTML audio 播放時鐘可用。
- 人工 T2 可保存並成為 canonical timing；不需要模型環境。
- 隔離 profile 沒有安裝 runtime／environment／model 檔案。亮、暗畫面均已檢查，沒有新增 preview Vue warning；保留既有 UiPopover／UiTooltip class warnings。

這是 dev composition 的原生 main／preload／renderer 驗證，不是重新封裝安裝或 OBS／人工聽看接受。驗收腳本先修正 executeJavaScript 包裝、player 欄位與 missing 面板預期後再完成；未為腳本失敗改寫產品行為。

研究環境則在兩個全新 coordinator 程序中，各載入中文、日文一次，共四次獨立模型初始化。中文每次 7／7 行有估計，日文每次 9／9；全部與前輪同方法的逐行詞塊結果完全一致。兩程序並非清除 OS 檔案快取後的磁碟冷啟動。

| 載入回合   | 中文 job | 日文 job | 結果                               |
| ---------- | -------- | -------- | ---------------------------------- |
| 全新程序 1 | 4.05 s   | 4.44 s   | 結果一致，workers 已關閉、暫存清空 |
| 全新程序 2 | 3.77 s   | 6.13 s   | 結果一致，workers 已關閉、暫存清空 |

時間沿用 Phase 2 job 定義，包含 worker 初始化及保存，不含最初資產 binding 等 CLI 前處理，不作啟動延遲保證。環境非快取 fingerprint 前後相同；沒有 pip、下載或修改既有 M1／Provider Python。各次結果在預設 loader 下仍 stale，明確研究 method 才 ready。

## 環境載入路徑逐段核對

| 階段                 | 現在能驗證的行為                                                                              | 尚未完成的產品路徑                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 能力發現／Settings   | 正式 dependency registry 與 Audio Python allowlist 沒有此候選；不會因研究檔案存在而出現 ready | 獨立 capability、狀態投影與 Settings 入口                                               |
| 資產定位             | 私有 runtime JSON 指定 model／vendor／environment／Python／FFmpeg；要求絕對路徑               | main 從受管目錄及釘選 catalog 推導，不能要求使用者填開發路徑                            |
| 資產驗證             | model、vendor、runtime 與 FFmpeg bytes／SHA；非快取 environment fingerprint；Node 套件版本    | 可發行 lock／artifact manifest、完整性與授權 gate                                       |
| 實際初始化           | Node CPU ONNX session；Python 隔離匯入、精確版本與套件集合檢查；四次實跑成功                  | Settings 只有 probe 真正成功後才能 ready，不能只看檔案或 fingerprint                    |
| 開始／取消工作       | 私有 CLI bounded windows、獨立 scheduler、直接子程序、deadline 與取消保護已有測試             | app-owned start／cancel intent、feature gate 重查、共享 heavy queue 與 activation lease |
| 發布／讀取           | 原子保存前重查；明確研究 profile 可讀，正式 default 拒用                                      | main 以受信任方法識別載入產品估計，不能沿用驗收腳本注入                                 |
| 重啟／離線           | 新程序重載本機資產及既有 sidecar 通過                                                         | 尚無從空目錄準備、正式 activation 重啟及封裝版離線驗收；本輪未施加 OS 斷網              |
| 修復／版本切換／移除 | 缺檔或 mismatch 不產生可用 binding；工作失敗不能覆寫有效估計                                  | 受管 staging、原子切換、失敗回滾、lease 阻擋移除與共享 runtime 參照管理                 |
| 封裝                 | 私有 scripts／workers／manifest 排除測試通過                                                  | 正式 worker／manifest 搬入受管 resource、inventory 與 installer smoke 尚未進行          |

缺失 modelDir、vendorDir、environmentPath、Python 與 FFmpeg 的五種本機路徑都已實測拒絕。既有測試另覆蓋內容改動、`_pth`、未知 vendor source、sourceless bytecode、版本不符、worker 異常、逾時、取消及保存保護。這些是研究輸入的防護，不代表 Settings 已經有修復功能。

本輪新增一個前置檢查修正：先前只驗證 Python 所在目錄內的釘選檔案，若設定填同目錄的 `missing.exe` 或 `python314.zip`，資產 binding 仍可能成功，直到 worker spawn 才失敗。現在設定必須指向 manifest 已釘選的 `python.exe`。RED 已重現舊行為，新增錯名／錯類型與缺 executable pin 的回歸後通過；合法布局與模型方法身分不變，四次實跑是修正後結果。

Phase 2 原始數據的 source hashes 保留為當時快照；本輪只新增 preflight guard，不重寫舊快照或冒稱重新跑過全部歌曲。新驗證紀錄另存目前 guard 的 source hash 及相同方法的結果比對。

## 容量與載入方式

本機再次盤點的 bytes 如下，使用十進位 GB；與實際交付 archive／下載容量分開。

| 資產                               | 非快取 bytes | 約 GB    |
| ---------------------------------- | ------------ | -------- |
| 模型與字典／config                 | 415,233,473  | 0.4152   |
| NumPy＋pypinyin environment        | 45,252,986   | 0.0453   |
| 釘選 vendor source（本機換行格式） | 24,909       | 0.000025 |
| 可重用的 CPython runtime 釘選檔    | 24,010,954   | 0.0240   |

已有相容 Audio Python 時，上述模型＋environment＋vendor 非快取約 0.461 GB；另需 runtime 時約 0.485 GB。該 environment 現有快取約 2.20 MB，含快取的前三項約 0.463 GB。前輪約 0.466 GB 是不同時點研究布局的近似容量，不是正式下載保證；本輪另存精確分項，不用新數字覆寫歷史量測。

兩個 wheel 的釘選來源檔合計 13,437,830 bytes，僅是 wheel 容量；尚無正式完整 bundle，不能把它或解壓後加總當成最終下載量。以上排除既有 Node ONNX／讀音依賴、FFmpeg、應用程式、archive cache、下載／解壓暫存、工作 PCM／logits、sidecar 與修復時並存版本；必須另訂安裝空間預算。

推論期間才啟動 Node model worker／Python decoder，結束後關閉。不能把約 0.461 GB 磁碟容量當 RAM：前輪模型 Node 的 OS RSS high-water 為 1.469 GB，另有 decoder／coordinator，而且尚未驗證低 RAM 或與播放並行。

## 正式選配接入的完整目標路徑

以下是待實作規格，並非目前已有的設定流程：

1. Settings 顯示獨立「歌詞音訊輔助（中／日）」能力；預設未準備、未自動執行，與 reading／BPM／分離分開。
2. Main 重查處理 gate，從受信任 catalog 計算必要資產、重用與暫存空間；取得完整權重與套件證據後才允許準備。
3. 在受管 staging 驗證 bytes／SHA，建立 immutable environment，完成真正的 ONNX／decoder probe；成功才原子發布 activation，失敗保留原可用版本。
4. 準備完成不等於自動分析。使用者選擇本機 track／source 後，由 main 推導音訊、模型與路徑；共用排程及 generation lease 啟動 bounded job。
5. 保存獨立估計 sidecar，main 依受信任方法辨識讀取；預覽保持可停用，T2 優先，失效回 T1／plain。不將模型詞塊寫成人工 T2。
6. 重啟時重建能力狀態；損壞資料明確導向修復，取消／修復失敗保留舊版本，使用中資產不得移除，其他能力仍使用的 runtime 不可連帶刪除。
7. 建議將「產生估計」與「讀取已驗證結果」分開：移除計算環境後保留衍生資料及人工 T2，允許 main 依受信任 profile 讀取有效快取。這項卸載後快取政策仍待正式契約與回歸，現在 default loader 仍拒用研究模型資料。

因此目前結論是：基本情境回歸通過，研究環境載入與回退有實際證據；此候選宜作獨立選配，但正式使用者環境路徑尚不完整。下一個實作範圍應是 capability／準備／probe／activation／修復移除的完整垂直路徑，並先處理來源角色標記不得送入唱詞對齊、錯音訊防護與權重 gate，再談預設或公開顯示。

本輪另通過 Python 7 項測試、核心 40 項測試 coverage（95.24% lines／83.38% branches）、ESLint、137 份 Markdown、49 個變更檔格式、176 個相對連結、source hash 與去識別資料檢查。程式與文件獨立複核均無實質問題；未新增 commit／push、未準備正式環境或改預設下載。
