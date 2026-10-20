# T1 聲學估計第二階段：模型串接與中日實測

本文保留當輪研究與分母；目前跨批次選型及未決項集中在[研究結論](lyrics-alignment-summary.md)。

日期：2026-10-19。範圍：私有研究工具、既有本機候選資產、隔離輸出與本機詞塊預覽。正式能力、activation、預設下載及 Output 均未啟用。

HubertFA 候選已接通第一階段的獨立估計資料。中日文短窗口重現研究收益，整首 bounded-window 處理、文字保留、T1／T2 回退與實際取消也已驗證。錯音訊及純伴奏仍可產生合法結果，因此尚不適合自動套用或成為預設。

版本化入口為 [研究工具與操作方式](../../../scripts/research/lyricsAcoustic/README.md)、[固定 manifest](../../../scripts/research/lyricsAcoustic/manifest.json) 與[去識別量測資料](data/lyrics-acoustic-phase2-2026-10-19.json)。前輪任務與容量依據見[研究收斂](lyrics-acoustic-segmentation-implementation-assessment-2026-10-19.md)及 [A／B／C／D 報告](lyrics-t1-acoustic-segmentation-2026-10-19.md)。本報告不取代 [acoustic estimate contract](../../contracts/lyrics-acoustic-estimate-contract.md)。

後續的[Basic／選配環境稽核](lyrics-acoustic-environment-readiness-2026-10-19.md)另記基本情境、重新載入與產品生命週期缺口；本報告的模型結果及 source hashes 保留為當時快照。

## 實作邊界

研究 CLI 使用固定本機資產，不抓取模型或安裝套件。候選為 [HubertFA v0.0.7 官方 release](https://github.com/wolfgitpr/HubertFA/releases/tag/v0.0.7)，source 固定 `521281fe52dcedb8f970ca200dc4f00fc2869b08`，沿用既有 Node ONNX Runtime、kuromoji／wanakana、managed CPython 3.14.7 及 NumPy 2.5.2／pypinyin 0.55.0。沒有加入 Torch、CUDA 或另一個 Python ORT。

模型、字典、config、上游 decoder、Python 執行檔／DLL／stdlib／`_pth` 及 FFmpeg 有固定 SHA。實際二套件 environment 的非快取內容與程式版本納入方法身分；發布前重驗資產。Python 只編譯兩個已驗證的上游 source，忽略 vendor initializer／快取；environment 使用空的 job cache prefix，拒絕 cache 目錄外的 sourceless bytecode。模型權重的正式使用／分發證據仍未補齊。

一個私有 job 管理 FFmpeg、Node frontend 及 Python decoder，全部是直接子程序。CLI 內沿用現有 heavy-job scheduler 序列化；這不代表已加入應用內的 capability、共享 queue 或 managed activation lease。取消、期限、輸入／輸出 byte budget 與暫存清理涵蓋整個工作，發布前再查來源、generation、資產與 deadline。研究結果只能經明確的內部 method profile 保存／讀取，正式 IPC 預設仍把模型結果視為 stale。

詞塊預覽會區分「研究模型估計」與合成驗證資料，仍預設停用，只顯示原文與詞塊起點。canonical T2、reading、主要歌詞顯示、Self-View 及 Output 不被研究刷新改寫。本輪沒有新增啟動模型的產品按鈕。

## 固定方法與分母

Encoder 最多讀取 30 秒、44.1 kHz mono PCM；每個 T1 行最多 20 秒，保留至少兩秒上下文，媒體端點除外。可重疊窗口各自指派完整行，每個 occurrence 只處理一次；不建立整首無上限 tensor。Decoder 在 T1 外框加 350 ms padding，最多 512 phone states。缺乏可用邊界時合併，首詞仍沿用 T1 錨點，不估計唱詞字尾或休止。

文字切點先由固定 `Intl.Segmenter` 選定，模型不看逐詞參考。日文讀音與原文範圍分開；以 decoded phone path 對應上游回傳的 word occurrence，不按相同文字找時間。來源時間轉音訊時減 offset，輸出加回一次。

A 是正式產品現有的 `presentationLineSegments`，不是另一份簡化均分器。D 使用相同的文字、外框與要求切點。所有要求切點均保留；沒有外部邊界的切點列為不可評，模型缺界也不從可評分母刪掉。Median／P90 只描述保留且可評的切點；≤100 ms 與 coverage 使用全部可評切點為分母。

共 22 個主案例：18 個既有短窗口原曲／quick 配對，及 4 首完整歌曲。中文確認組是前輪已使用的 4 首獨立標註歌曲，外框為 oracle coarse T1，不是 provider 定位能力。日文確認組是 4 首外部逐詞參考；另有單一 PJS mora-reference 樣本。這些都不是新盲測，未排除訓練集重疊。

整首測試另加入依事先規則選出的新中文與日文歌曲：按 track id 排序取首個未參與前輪、具來源與可解碼音訊的合格樣本，在推論前固定。兩首沒有逐字參考，只能檢查合法性、文字保留、回退與資源，不給精度數字。本輪沒有下載或重跑分離；quick 比較重用既有研究人聲檔，作為隔離案例的主要音訊，不是新產品 guide recipe。

## 短窗口結果

| 確認組          | 要求／可評切點 | A ≤100 ms | D ≤100 ms | D 保留要求切點 | A／D median |
| --------------- | -------------- | --------- | --------- | -------------- | ----------- |
| 中文獨立／原曲  | 102／102       | 28.4%     | 77.5%     | 101／102       | 251／56 ms  |
| 中文獨立／quick | 102／102       | 28.4%     | 81.4%     | 101／102       | 251／47 ms  |
| 日文外部／原曲  | 148／108       | 40.7%     | 77.8%     | 132／148       | 130／40 ms  |
| 日文外部／quick | 148／108       | 40.7%     | 78.7%     | 134／148       | 130／31 ms  |

日文 40 個要求切點沒有外部參考，不能稱為已驗證的錯誤或正確時間。原曲／quick 的可評切點 coverage 分別是 98／108、100／108；「保留要求切點」另含沒有參考的切點。中文 quick 與前輪同分母結果一致，沒有改參數來配合此次結果。

逐歌比較如下。日文的「可評／要求」不同，是參考粒度不同，不是依模型成功與否篩選。

| 歌曲代號 | 可評／要求 | A ≤100 ms | D 原曲 | D quick | 參考類型 |
| -------- | ---------- | --------- | ------ | ------- | -------- |
| ZH-00    | 33／33     | 36.4%     | 100.0% | 97.0%   | 獨立標註 |
| ZH-01    | 23／23     | 17.4%     | 73.9%  | 78.3%   | 獨立標註 |
| ZH-02    | 20／20     | 10.0%     | 80.0%  | 85.0%   | 獨立標註 |
| ZH-03    | 26／26     | 42.3%     | 50.0%  | 61.5%   | 獨立標註 |
| JA-00    | 23／45     | 26.1%     | 69.6%  | 78.3%   | 外部時間 |
| JA-01    | 40／40     | 42.5%     | 80.0%  | 87.5%   | 外部時間 |
| JA-02    | 16／34     | 43.8%     | 81.3%  | 75.0%   | 外部時間 |
| JA-03    | 29／29     | 48.3%     | 79.3%  | 69.0%   | 外部時間 |

每首相對 A 都有改善，但 quick 不是逐歌都比較好；不應為本功能強制分離。ZH-03 原曲保留切點的 P90 仍約 1,268 ms，整體 median 不能遮蔽長尾。單一 PJS 樣本的 26 個要求切點只有 16 個可評，A 31.3%，D 原曲 87.5%、quick 93.8%；保留 24／26，不能由此推論日文整體精度。

## 整首、重複句與回退

| 整首案例 | 時長    | 窗口 | 有估計的行／總行 | 可評／要求切點 | A→D ≤100 ms | Job 時間 |
| -------- | ------- | ---- | ---------------- | -------------- | ----------- | -------- |
| 既有中文 | 290.3 s | 11   | 84／104          | 417／417       | 48.7%→77.9% | 20.04 s  |
| 既有日文 | 254.4 s | 9    | 53／58           | 170／390       | 32.4%→62.9% | 16.93 s  |
| 新中文   | 181.2 s | 4    | 30／37           | 0／235         | 無逐字參考  | 8.34 s   |
| 新日文   | 295.7 s | 9    | 37／40           | 0／259         | 無逐字參考  | 16.05 s  |

既有整首的逐詞時間仍是外部參考，不能把一致率當人工精度。中文 D 保留 349／417 要求切點；日文 D 保留 319／390，其中 156／170 可評切點有估計。其餘切點合併，沒有合適詞塊的行回到既有 T1。新歌雖可產生合法估計，尚無獨立精度結論。

22 案例共 79 個重複文字 occurrence，沒有以文字字串共用時間。全部案例通過原文完整重組、來源／行身分、正序及倒序 seek、T2 優先、停用回 T1、offset／文字失效與 worker 關閉檢查，共 686 個 clock samples。另 7 個負向案例通過相同結構檢查，共 98 個 samples；這些檢查不驗證唱詞真的存在。

| 行為案例               | 結果                                          | 能證明的範圍                                |
| ---------------------- | --------------------------------------------- | ------------------------------------------- |
| 全靜音                 | 0／7 行採用估計，回退                         | peak≤1e-8 的數值靜音拒絕；不是 singing VAD  |
| 韓文                   | 0／7，unsupported                             | checkpoint 研究路徑不處理韓文               |
| 中英混語               | 0／7，unsupported                             | 不猜未支援的讀音或插值補點                  |
| 原音訊縮小至 1e-5 音量 | 6／7 有詞塊                                   | 不把低音量一律當靜音；不代表尾音精度已過關  |
| 不相符的另一首音訊     | 7／7 仍有詞塊                                 | 不能偵測錯版本／錯歌                        |
| 既有人聲分離的伴奏檔   | 7／7 仍有詞塊                                 | 不能偵測純伴奏；不以 confidence 作內容 gate |
| offset +100 ms         | 所有輸出起點恰好 +100 ms                      | 窗口與顯示時間域沒有重複加偏移              |
| 推論中取消             | 兩個 worker 均回收、暫存清空、舊檔 bytes 不變 | 本機單次約 34 ms 完成取消，不作延遲保證     |

原生 Electron 用隔離 profile／曲庫，明確注入研究 method profile，載入真實中文與日文模型 sidecar。18 項檢查通過：實際 canonical 身分、研究標示、預設停用、native click、HTML audio seek、offset stale 與保存人工 T2 後的優先順序。亮暗主題均檢查可見預覽。這不是正式啟用、OBS 或使用者人工聽看接受；測試橋接沒有加入產品 IPC。

## 環境與資源

本機為 Windows x64、Ryzen 7 7700，系統回報 RAM 約 67.8 GB。Node frontend 固定四 threads，Python BLAS 限單 thread。本輪沒有量測 GPU，也沒有在 8／16 GB 裝置或播放同時分析的負載下驗收。

| 程序                 | 22 案例最高 OS RSS high-water |
| -------------------- | ----------------------------- |
| 模型 Node frontend   | 1.469 GB                      |
| Python decoder       | 0.096 GB                      |
| 研究 CLI coordinator | 0.875 GB                      |

各程序的峰值可能發生在不同時間，不相加宣稱實測同時峰值。OS high-water 包含推論／解碼期間的配置，較前輪只在窗口完成後取樣更完整；仍不等於整機或 Electron 的額外峰值保證。Job 時間包含子程序啟動、decode、推論、末次資產重驗與保存，不含最初資產驗證、隔離資料複製、normalization 與評分。

磁碟容量仍沿用前輪已驗證布局：已有 Audio Python 時，模型加二套件約增加 0.466 GB；不需要 M1 作前置。這是研究安裝布局，不是新的產品安裝包或預設下載數字。正式 hosting、archive 策略、下載暫存、修復／移除及分發授權仍是後續 gate。

## 驗證過程與決定

本輪修正並留下回歸：deadline 在最終資產重驗期間到期不得發布；上游 Python 的執行閉包與 `_pth`／sourceless bytecode 必須可驗證；生成 VTT 必須明確標為手動來源，避免套用 YouTube CC 去重；外部 line id 必須以 case 為命名空間，避免 `line:0` 跨歌碰撞。

首輪整首被文字一致性檢查擋下後，修正來源 provenance 並重跑全部 22 案例。評分鍵修正則先核對 inference input SHA 完全相同，才用原模型輸出重新評分；舊摘要保留，沒有重挑歌曲、刪除失敗切點或調整模型參數。去識別資料分開記錄原始及修正後的 reference SHA、evaluation SHA 與方法版本。

工程驗證完成：878 個測試檔、8,427 項測試通過，另 1 項既有跳過；Python 7 項測試、ESLint、136 份 Markdown 與 production build 通過。核心 storage／assets／protocol／process／job 的 40 項測試達 95.22% line、83.17% branch coverage，不包含全部模型 worker。一次全庫測試遇到既有圖片 manifest 的 Windows 暫存檔 rename EPERM，保留失敗紀錄後重跑完整通過，未修改無關程式。私有研究 workers／manifest 的封裝排除測試通過；本輪未建 installer。

決定保留 HubertFA 作中日 T1 詞塊研究候選，允許原曲起跑，不強制分離；產品預設與下載維持不變。後續應優先補獨立新歌參考、錯詞／錯版本防護、低音量與休止觀感、低 RAM／並行播放、正式資產生命週期及權重授權。韓文及多表面 Output 需要另外驗收，不能沿用本輪中日預覽結論。
