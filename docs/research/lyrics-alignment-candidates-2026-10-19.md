# Qwen3 ForcedAligner／Whisper.cpp 中日歌曲配對實測

本文保留當輪研究與分母；目前跨批次選型及未決項集中在[研究結論](lyrics-alignment-summary.md)。

日期：2026-10-19。範圍是隔離的研究環境、詞塊預覽及回退驗證；沒有正式啟用候選、調整 HubertFA gate 或增加預設下載。

## 結論與採用決策

若在這兩種候選中繼續投入，選 Qwen3-ForcedAligner-0.6B 進入下一輪品質與受管環境設計。它在固定中日確認組均優於目前文字均分，但完整新增環境約 2.90 GB，CPU 工作程序峰值實體記憶體約 6.10 GB，且錯歌測試仍有誤對齊。這不足以宣布可正式提供手動選配。

Whisper.cpp 多語 base／small 暫不採用於此詞塊對齊功能。它們容量小，但本次使用實際 token 起點、保留局部有效切點後，固定分母的 ≤100 ms 成功比例仍低於現有文字均分；small 沒有穩定勝過 base。這個結論限於本次原始 GGML 模型、CLI 配方與歌唱語料，不外推到所有 Whisper、其他解碼器或經訓練的對齊方法。

Basic 保持現有 T1／T2 與文字顯示，額外模型容量為零。HubertFA 的歷史品質仍較高，但[權重使用／分發 gate](lyrics-acoustic-weight-license-gate-2026-10-19.md)沒有因此解除。沒有用技術成績替代授權證據，也沒有新增任意模型或 URL 的繞過入口。

可追溯的固定版本、下載 SHA、完整依賴、分組數據、資源與回退檢查保存在[本輪資料](data/lyrics-alignment-candidates-2026-10-19.json)。原始歌曲、歌詞、機器路徑、模型與 raw JSON 留在 ignored 本機研究目錄。

## 同曲、同切點的比較方法

沿用[第二階段](lyrics-acoustic-phase2-2026-10-19.md)的 22 個主案例：18 個短窗口，即 9 份音訊的原曲／既有 quick 人聲配對，加上 4 首整曲。中文確認組為 4 首獨立標註歌曲，日文確認組為 4 首外部逐詞參考；單一 PJS mora 樣本另列。沒有重做 vocal separation。

所有候選使用相同音訊 bytes、canonical T1、offset、原文 UTF-16 範圍、`Intl.Segmenter` 要求切點與原評分器。中文每個 variant 有 102／102 個要求／可評切點；日文為 148／108。缺界仍算缺失，不從可評分母刪掉。Median／P90 只描述保留且可評的切點，不能單獨當整體精度。

輸入 SHA 為 `af1a937d67a00f5f410749b37a9e9d14e42789005bc094dd069eb28250f44c5c`；參考 SHA 為 `92b2e4ff1960d2f8efed21429596a7df7ca32ece5885df275d26c76054e401d6`。使用先前已修正 case／外部 line id 命名空間的參考；HubertFA 採修正後摘要，不用舊 reference hash 的摘要。原評分器 SHA 為 `3bb816aeecc76690452e08d85a3e29ed316c5980644bf1b42a1ceaf94086dc42`，本輪未改。

兩候選均以 FFmpeg 解成 16 kHz mono float PCM、4 CPU threads；窗口最多 30 秒、T1 行最多 20 秒，沿用固定上下文及窗口規劃。有限 PCM 振幅超過 1 時做整窗 peak normalization；不是逐字調整。精確數值靜音略過模型。沒有以 BPM、鼓點或參考答案修正時間。

每個模型配方均完成 22 案例、51 窗口。Qwen 每案初始化一次，再處理該案窗口；Whisper 每窗口重載原生 CLI。前輪 HubertFA 使用 44.1 kHz 與逐行 decoder 約束，本輪 Qwen 使用完整窗口文字，因此比較的是整套可用配方，不能歸因為只有模型架構的差異。兩首新整曲沒有逐字參考，只能驗證結構與回退。

## 固定模型與時間欄位

| 項目          | Qwen3 ForcedAligner                                  | Whisper.cpp                                                                      |
| ------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| 模型          | Qwen3-ForcedAligner-0.6B                             | 原始多語 GGML base／small，未量化                                                |
| 權重 revision | `c7cbfc2048c462b0d63a45797104fc9db3ad62b7`           | `5359861c739e955e79d9a303bcbc70fb988958b1`                                       |
| 程式          | Qwen3-ASR `7c6daf77a2421100f5fb066495372c00129d39ff` | 官方 Windows x64 CPU `v1.9.2`；target `306c88f4d1286aec1bf96e544632897886af5501` |
| 環境          | 獨立 CPython 3.12.12、CPU Torch 2.9.1、float32       | 原生 CLI／DLL；推論不需要 Python                                                 |
| 接收資料      | 音訊、已知歌詞、語言                                 | 音訊與語言；不傳參考歌詞                                                         |
| 文字映射      | 對齊完整已知文字                                     | ASR 文字與原文的唯一單調 LCS 配對                                                |

Qwen 的官方介面提供已知文字的 forced alignment，採本機資產、offline 與 `trust_remote_code=false`；依賴閉包含上游實際 import 的語言工具，共 55 個 distribution，沒有 Web UI。[官方用法](https://github.com/QwenLM/Qwen3-ASR/blob/7c6daf77a2421100f5fb066495372c00129d39ff/README.md)

Whisper 先測了 DTW point 控制組，再分開測真正的 token-start profile。官方 header 將 `t_dtw` 定義為約略的 token 輸出時刻，`t0` 才是 token 開始；不能把兩者混為 onset。[固定版 header](https://raw.githubusercontent.com/ggml-org/whisper.cpp/v1.9.2/include/whisper.h)

Full JSON 的 `offsets.from` 來自 `t0`，其產生仍包含 voice-length 分配與 energy heuristic；不稱純聲學字界，也不稱對已知歌詞的 forced alignment。[CLI 輸出](https://raw.githubusercontent.com/ggml-org/whisper.cpp/v1.9.2/examples/cli/cli.cpp)、[時間計算](https://raw.githubusercontent.com/ggml-org/whisper.cpp/v1.9.2/src/whisper.cpp)

Whisper 評估保留合併 UTF-8 token 的原始邊界，不在 token 內製造時間。缺字、無法唯一配對的重複文字、無效時鐘沒有切點；原始顯示文字不變。兩種 token-start 回退均完成：

- 整窗保守版：任何 lexical token 時鐘缺失或超窗，該窗全部回退。
- 有效切點版：由同一次真實推論 raw JSON 重播，只保留合法、單調、在窗內的 token 起點。無效 token 的文字仍參與配對，但不提供時間；不 clamp、不借 DTW、不擬合固定提前量。

重播重新核對音訊與原文，重算同一窗口的完整 index／start／end／lineIds，檢查模型 manifest、raw SHA 與 model／language，並將舊結果 bytes hash 納入新方法身分。這是解碼後處理的配對對照，沒有重跑模型或把參考時間交給推論。

## 短窗口精度與缺界

下表為全部可評切點中誤差 ≤100 ms 的比例；Whisper 採有效切點版。A 是現有產品文字均分，HubertFA 是凍結的歷史品質對照。

| 確認組     | 要求／可評 | A     | Qwen3 | Whisper base | Whisper small | HubertFA 歷史 |
| ---------- | ---------- | ----- | ----- | ------------ | ------------- | ------------- |
| 中文原曲   | 102／102   | 28.4% | 56.9% | 9.8%         | 4.9%          | 77.5%         |
| 中文 quick | 102／102   | 28.4% | 70.6% | 7.8%         | 2.9%          | 81.4%         |
| 日文原曲   | 148／108   | 40.7% | 46.3% | 12.0%        | 6.5%          | 77.8%         |
| 日文 quick | 148／108   | 40.7% | 57.4% | 16.7%        | 9.3%          | 78.7%         |

Qwen 相對 A 改善約 5.6–42.2 個百分點；quick 在這些彙總組較好，但不代表每首或所有 vocal separation 都會改善。尤其日文原曲改善有限，不能只看 Qwen 的低 median。

| 確認組     | Qwen coverage | Qwen median／P90 | base coverage／median／P90 | small coverage／median／P90 |
| ---------- | ------------- | ---------------- | -------------------------- | --------------------------- |
| 中文原曲   | 84.3%         | 46／1,094 ms     | 36.3%／280／989 ms         | 45.1%／297／896 ms          |
| 中文 quick | 93.1%         | 40／332 ms       | 34.3%／395／1,121 ms       | 40.2%／373／1,180 ms        |
| 日文原曲   | 79.6%         | 79／380 ms       | 58.3%／240／440 ms         | 57.4%／490／1,000 ms        |
| 日文 quick | 78.7%         | 50／369 ms       | 48.1%／150／440 ms         | 62.0%／320／940 ms          |

Coverage 的分母也是全部可評切點。Whisper small 有時保留較多切點，仍可能較不準確；不能以「有細分的行較多」當成改善證據。

整窗保守版的 Whisper ≤100 ms，中文原曲／quick、日文原曲／quick 分別是：base 3.9／6.9／12.0／5.6%，small 4.9／2.9／0.0／9.3%。局部有效起點確實救回部分窗口，但仍不足以採用。初測 DTW point 的 0–1% 僅作欄位語意控制，不拿錯誤時間定義否決 Whisper 的 onset 能力。

PJS 單一樣本有 26 要求／16 可評切點。Qwen 原曲／quick 為 100.0／93.8%，base 為 0.0／12.5%，small 為 6.3／0.0%。樣本數只有一份，不用此數字宣稱日文普遍達到此效果。

## 整曲與錯內容

| 整曲     | 總行數 | Qwen 有估計行 | base 有估計行 | small 有估計行 | A→Qwen ≤100 ms          |
| -------- | ------ | ------------- | ------------- | -------------- | ----------------------- |
| 既有中文 | 104    | 78            | 69            | 74             | 48.7%→58.5%（417 可評） |
| 既有日文 | 58     | 49            | 51            | 52             | 32.4%→40.0%（170 可評） |
| 新中文   | 37     | 30            | 26            | 28             | 無逐字參考              |
| 新日文   | 40     | 33            | 35            | 37             | 無逐字參考              |

有估計行只代表至少具有可用細分，不代表該行全部正確。既有中文整曲的 base／small ≤100 ms 為 19.9／22.5%，日文為 20.6／19.4%；同樣未勝 A。兩首新曲不製造精度數字。

另外各做相同 7 個壓力案例。精確靜音、低音量、伴奏、目前 adapter 不支援的韓文／混合文字均為 0／7 行 ready；這不代表已驗證韓文模型能力。Offset 案例是正向時鐘壓力測試，三模型都為 7／7，並非應拒絕的負例。

錯歌配相同歌詞時，Qwen 仍給出 3／7 行可用細分，base／small 為 0／7。已知文字 forced alignment 可以硬對錯內容；「有時間」與「真的唱了這句」是不同判斷。數值靜音檢查也不是 vocal activity detector。本輪沒有新增聲部、男女聲或歌曲段落模型，不把結構驗證冒稱聲學內容驗證。

若繼續 Qwen，優先補獨立 vocal activity／錯歌與錯歌詞政策，再用新的人工抽查或盲測集驗證，尤其長尾、缺詞、重複副歌與整曲外框偏移。BPM／鼓點仍只能作受限候選錨點，不能把唱詞強制吸到每拍；本次結果沒有提供可直接開啟吸附的證據。

## 完整容量與目前環境

主機為 Ryzen 7 7700、16 logical processors、RAM 67,817,906,176 bytes。RTX 5060 Ti 有 16,311 MiB，但本輪沒有使用 GPU。以下 GB 均為十進位 10⁹ bytes，為實際邏輯檔案大小；不是只有權重，也不是 installer 壓縮下載量。

| 方案          | 權重 bytes    | 新增完整環境，不重算共用 FFmpeg | 含本輪 FFmpeg             |
| ------------- | ------------- | ------------------------------- | ------------------------- |
| Basic 現況    | 0             | 0 GB                            | 沿用既有能力              |
| Whisper base  | 147,951,465   | 168,800,105（0.169 GB）         | 391,049,065（0.391 GB）   |
| Whisper small | 487,601,967   | 508,450,607（0.508 GB）         | 730,699,567（0.731 GB）   |
| Qwen3 FA      | 1,835,544,544 | 2,902,670,349（2.903 GB）       | 3,124,919,309（3.125 GB） |

Qwen 閉包包括 CPython 63,128,726 bytes、venv／全部依賴 996,532,969 bytes、上游 source 2,936,195 bytes、模型目錄 1,840,072,459 bytes。含實際既存 Python caches，不重複計 runtime alias junction。Whisper 包括官方解壓 binary／DLL 20,848,640 bytes；量測用 Python 不算它的推論依賴。若共存 base／small，binary 只需一份。

本輪 FFmpeg 為 222,248,960 bytes，是實際使用的研究工具，不表示未來產品必須下載相同 full build。另實際載入既有 Windows MSVC runtime；查核的三個 DLL 合計 872,240 bytes。尚未做乾淨 Windows VM／redistributable 安裝驗收，因此不能稱可攜的完整發行包。

UV cache 另有 1,012,246,893 bytes；兩份 source／binary archives 合計 10,589,509 bytes。這些與歌曲副本、研究結果及 job cache 不混入常駐 payload。首次安裝沒有連續記錄峰值，所以尚無可信的安裝／修復同時存活峰值、實際磁碟配置量及完整 wheel 壓縮傳輸總量；不能用上述落盤數字宣稱安裝只需要同樣空間。

## 載入、速度與記憶體

| 指標                    | Qwen3 FA                      | base token-start            | small token-start           |
| ----------------------- | ----------------------------- | --------------------------- | --------------------------- |
| 主案例／窗口            | 22／51                        | 22／51                      | 22／51                      |
| 合計 job 時間           | 445.3 s                       | 241.3 s                     | 607.8 s                     |
| 短案例含載入／解碼範圍  | 14.62–16.92 s                 | 1.83–7.66 s                 | 5.11–59.55 s                |
| 新程序模型載入          | 10.72–12.73 s；median 11.39 s | 每窗口 CLI 內含，不單獨計時 | 每窗口 CLI 內含，不單獨計時 |
| worker peak working set | 6.101 GB                      | 觀測 0.472 GB               | 觀測 1.014 GB               |
| peak private／commit    | 單一補測 worker 7.215 GB      | 觀測 0.951 GB               | 觀測 1.481 GB               |

Whisper 時間與 RAM 來自真正 token-start 推論，不用重播後的較短耗時冒充。small 有長尾，不能假定檔案只有約三倍就固定只慢三倍。Native memory 是 50 ms observer 採樣時的程序峰值欄位，private 值可能漏掉採樣間或不同時刻的最大值，非整個應用的絕對峰值。Qwen working set 由 worker 自報 OS peak；private 是另外相同 25 秒中文案例的程序樹補測，不與全部 22 案例的最壞 private 劃等號。

CPython venv 在 Windows 經啟動器啟動實際 interpreter。最初只量啟動器的約 5 MB 資料已排除；補測查實際 descendant，取得約 6.10／7.21 GB。首次新程序不代表清空 OS file cache 的磁碟冷啟動；沒有 GPU、float16、量化或不同 RAM 實機結果。前輪 HubertFA 的 Python RSS 沒包含 ONNX frontend，不列為同口徑資源優勢。

這台 64 GB 主機可執行三方案。依觀測，8 GB 機器不適合直接承諾本輪 Qwen float32 配方；16 GB 可作下一階段測試目標，但仍需與 Electron、OBS、分離工作的共同負載驗收，尚未證明可用。不能僅靠有 16 GB VRAM 就宣稱 GPU 配方 ready。Whisper 容量較省也未通過本功能品質門檻，故不因機器較小而推薦錯用。

## 載入失敗、取消與歌詞回退

三個原始配方各測缺模型、載入階段取消、推論階段取消與 deadline，共 12 次；兩個 token-start 配方另外各 4 次，共 20 次。均保留先前 sidecar bytes／來源、清理本工作 staging，預設產品 loader 仍拒絕研究模型。真實 deadline 使用 300 ms，可能在模型開始前到期；不是宣稱完成長時間推論內的超時驗收。

取消會打斷真實 child。Qwen 另外補做載入／推論兩次程序樹檢查，包含啟動器後的 interpreter，結果結束時均無殘留受測 PID；不是只檢查 group 的直接子程序。這仍是私有 harness 的現機證據，不是產品 managed environment 的 Windows Job Object 驗收。

Qwen 22 案、兩個 Whisper 原始／token-start 配方及有效切點重播均通過既有 `verifyResults`。有效切點版每模型另檢查 22 主案與 7 壓力案；每份 22 主案包含 79 個重複 occurrence 檢查與 686 個前進／倒退時間樣本。檢查原文與範圍、T1 停用回退、T2 優先、offset／文字 stale、重複 occurrence 及 owned workers 結束。這是資料／projection 驗證，本輪沒有新增可見 Electron 或 OBS 驗收。

模型缺界時合併詞塊，首塊保留 T1；不覆寫 canonical T2。不成功的 job 不發布半份結果。研究 loader 需要明確內部 method，普通應用讀取仍回退；不會因本機研究檔存在而自動啟用。

## 與正式漸進式環境的差距

本輪是 research CLI 的固定資產載入，沒有加入 Settings→prepare→probe→activation→run→repair／remove。既有 lifecycle 實作綁 HubertFA，不能只換 URL。候選權重的使用／分發依據沿用[授權查核](lyrics-acoustic-weight-license-gate-2026-10-19.md)；仍需完整依賴與附帶資產 notices、固定正式 artifacts 及使用者可見資訊。

若同意繼續 Qwen，下一階段需獨立 profile、probe、method identity、封裝及 activation lease；其 CPython 3.12／Torch 配方與目前 Audio Python 3.14 不相同。正式 artifact guard 目前單檔上限 512 MiB，Qwen 權重超出；本輪未放寬。應先設計可驗證的傳輸／容量／交易方案，不能靠改上限掩蓋完整性問題。

建議階段順序為：Basic 零新增模型 → Qwen 私有研究改善錯內容／長尾 → 新語料盲測與受管環境原型 → 再決定是否提供手動選配。這是後續方向，並非已批准正式上架、預設下載或發行。

## 本輪驗證與限制

候選 5 個 Vitest 檔 25 tests 通過，含 replay context、缺界、重複、取消、資產／來源變動等；加封裝邊界共 6 檔 32 tests 通過。Python 3 個 unittest 通過，含 fresh startup cache 隔離。三個核心 adapter 檔的 coverage 為 lines 91.32%、branches 81.08%；此範圍不含研究 evaluator／replay CLI，不宣稱整個功能達到相同覆蓋率。JavaScript 及 Python 獨立 review 通過，replay context 的中等問題已補回歸並關閉。

Scoped ESLint 通過。全庫驗證有並行工作與環境限制：沙箱內 17 files／60 tests 失敗，包含 localhost EACCES、hardlink EPERM；正常權限重跑為 887 files／8,509 tests 通過、8 files／10 tests 失敗、1 skipped。剩餘失敗位於未由本輪修改的 preload、Import surface、performance-session 與命名／tokens 契約。全庫 ESLint 及 Vite build 當次均被 `PlayerBar.vue` 的重複 `disabled` attribute 擋住；本輪不改寫其他聊天的工作，也不把這些檢查標成通過。

正式 acoustic catalog／probe／loader 等 11 個既有來源 hash 與前輪 lifecycle 證據一致，`productUse: blocked`／`weights-evidence-pending` 保留。研究檔案在既有打包 allowlist 外，封裝測試通過；沒有建立 installer 或做乾淨機驗收，沒有 commit。

資料不是新盲測，未新增人工校對、未排除訓練集重疊；中文 coarse T1 帶有 oracle 外框，日文外部逐詞時間不是獨立人工真值，兩首新整曲無精度標註。結論支持本批配方的相對取捨，不能宣稱任意中日歌曲的產品準確率。Markdown／格式／diff 的最終結果另收錄於資料檔的 verification。
