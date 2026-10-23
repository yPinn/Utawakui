# Focus 冷啟 GPU 拆解與本地呈現收斂

本輪修復本地歌詞的螢光筆一致性；Focus 只做有限診斷並提出方案，沒有套用 GPU 外觀優化。原分段起點、細時間、已知停頓與時鐘保持不變，沒有新增顯示等待、暖機或 BPM。未 commit／push。

## 本地修復

原本普通整句使用整句底線，分析細時間則使用文字填色，且先前統一時移除了螢光筆。這是目前 renderer 的分支與 CSS 行為，不是舊 sidecar 儲存了另一種樣式。

現在 list／sheet 都固定在當前行使用既有螢光筆，僅版面各自保留。沒有逐字資料時不偽造逐字底線；有分段時間時保留即時藍色細底線，有合法細時間或既有 display-estimate 時，使用較粗的藍色底線連續向右延伸，文字保持原字色。進度仍由原媒體時鐘驅動，沒有新增動畫等待。高對比模式移除背景圖時，改以系統色整句外框維持當前行提示。

Output 沒有產品程式變更；Focus 保留原外觀，KTV 保留填字且不加底線。

## GPU 診斷範圍

使用《找》原有 LRCLIB／NetEase 兩來源及同一原音訊，固定八次隔離啟動、十六個冷暖 cycle，每來源／效果各一次。順序為 LRCLIB 原樣、NetEase 無陰影、LRCLIB 無描邊、NetEase 無填色複本、LRCLIB 無填色複本、NetEase 無描邊、LRCLIB 無陰影、NetEase 原樣；沒有追加追跑快值。

每次新 Electron 程序與隔離 profile，Focus 前景、900×540；實跑原 player／lyrics owner／clock／publisher／hub／正式 Focus 和 KTV。各次先自然 1x 播放 65 秒起的窗口，再於同程序暖重播。主比較為 65–66 秒的原始連續 rAF 間隔，沒有先刪除不合格 anchor 配對點。這是 trace 與樣式探針開啟的成本診斷，不與前輪 trace-disabled 完整流程 cohort 混算。

停止 trace 的指令於媒體時間至少 67 秒送出；非同步 trace 輸出期間音訊仍播放，故實際結束秒數更晚，逐次保留於資料 JSON。它們不代表 67 秒之後的固定自然播放比較。沒有在量測中 capturePage，另行可見截圖不納入效能數據。

局部計時 harness 沿用前輪未註冊 v2 的 Panel，以保持成本拆解條件一致；因此本輪 GPU 數據不是完整正式控制台負載的驗收。修復後本地的可見檢查另用正確註冊的 v2 root 與真 Page／toolbar／Panel。

## 全部冷暖慢值

下列為首個媒體秒內 raw rAF 最大間隔，單位 ms，各格 n=1；不能當呈現延遲或 OBS FPS，也不能將效果差值相加。

| 診斷效果     | LRCLIB 冷啟 | LRCLIB 暖播 | NetEase 冷啟 | NetEase 暖播 |
| ------------ | ----------- | ----------- | ------------ | ------------ |
| 原樣         | 48.4        | 4.5         | 60.8         | 6.4          |
| 移除全部陰影 | 10.8        | 5.7         | 17.2         | 8.2          |
| 移除描邊     | 46.0        | 4.6         | 69.6         | 16.9         |
| 移除填色複本 | 59.3        | 4.5         | 54.9         | 13.5         |

無陰影暖播仍比原樣慢，描邊／填色對照也保留所有回退，不以兩個冷啟快值宣稱全面性能改善。原先未帶因果 trace 的 58.3 ms 觀測仍無法回溯定因；以上是新的獨立診斷。

Focus renderer PID 標記的 GPU task 內，可對上同 thread 的 program link/load 等待與 raster flush，單位同為 ms：

| 效果         | LRCLIB 冷啟等待總和 | LRCLIB 冷啟最大 flush | NetEase 冷啟等待總和 | NetEase 冷啟最大 flush |
| ------------ | ------------------- | --------------------- | -------------------- | ---------------------- |
| 原樣         | 66.799              | 50.247                | 46.676               | 54.596                 |
| 移除全部陰影 | 8.518               | 13.350                | 8.222                | 11.724                 |
| 移除描邊     | 67.464              | 46.784                | 71.125               | 74.586                 |
| 移除填色複本 | 45.135              | 58.097                | 31.366               | 45.793                 |

等待總和跨多個 task，不是某個最大畫格的分解，也不能再加上 enclosing flush。flush 是 GPU service 的 wall span，包含等待，並非硬體純 GPU 執行時間。原樣 LRCLIB 暖播 Focus 等待為 0；NetEase 為 2.108 ms，不能宣稱所有暖播完全沒有編譯／準備。

兩個原樣冷窗 GPU process 都有二十次 D3DCompile，同窗暖播分別二／四次；無陰影冷窗皆六次。這些 worker 可能也服務 KTV 或其他工作，只有時間重疊，不能全部歸給 Focus，亦不能把平行 worker 時長相加當 critical path。Focus 主 GPU task 的 link/load wait 才是此處有 renderer attribution 的等待證據。

三個 renderer 的 UserTiming anchor 在十六個 cycle 均存在，最大相對偏移 0.186 ms。每 cycle 的 buffer 使用率、完整 rAF 分母／p95、GPU task／flush／等待與編譯數量、frame identity 是否配對均保留於[資料 JSON](data/lyrics-focus-gpu-2026-10-23.json)。缺少精確 aggregation bridge 的候選列為 unassigned，不拿相鄰時間戳補成 presentation 證據。

## 結論與待確認方案

這組有限對照支持：冷啟首次使用的陰影相關 shader／raster 準備是主要可疑成本；只去除描邊或填色複本不足以消除冷尾。尚未分離底字與填色複本各自的陰影成本，不能精確宣稱是哪個 CSS 宣告占多少 ms。

建議本輪在這裡收斂，保留模板外觀與既有完整流程資料，不因冷啟單次值導入暖機等待、ready gate、GPU flags、時鐘補償或停用平滑填色。GPU driver／OS cache 沒有清除，n=1 的新程序冷啟也不等於首次安裝；本輪不建立穩定改善 gate。

若使用者仍希望做一個最小產品候選，待確認後只評估「底字保留原描邊／陰影，填色複本取消重複陰影」。目前 `::after` 確實繼承兩層陰影，但上述整層移除實驗還不能證明僅移除複本就足夠。候選不得新增等待；先做兩來源有限冷暖對照及可見透明背景檢查，外觀改變或總成本未改善就撤回，不擴充模板／快取架構。截至這輪診斷結束，候選尚未實作。

後續已獲核准試做最小候選，但兩來源交錯冷暖結果不穩定，已精確撤回並收斂，詳見[候選撤回對照](lyrics-focus-copy-shadow-2026-10-23.md)。

## 驗證與未解限制

本地兩來源自然播放可見檢查均有部分進度；另核對未套用整句、日文 T2、ruby、混語多行與 forced-colors，共八張確認截圖。無橫向溢出、無整句假逐字底線，原完整文字保留。第一次可見測試在重載第二來源時 watchdog 逾時，只完成兩張；原始失敗保留，確認輪改為每來源獨立視窗後八張全部完成。測試器生命週期修正沒有進產品。

既有 fine unit 跨 ruby 讀音組時，部分區域仍可能退回粗提示而沒有細進度；本輪沒有擴大修改共用細時間切片／讀音映射，也沒有把該限制當已解決。實際歌聲句尾、原生 T2 缺 end、可疑但合法模型區間等前輪未解問題仍保留；本輪不做新的模型時間推算。

效能 cohort 的本地全文差異為 0、發布全部接受、KTV 底線觀測為 0。這不是人工聽辨、完整正式 profile 或 OBS／物理螢幕呈現驗收。trace、所有慢值、原始來源 fixture、失敗、截圖及執行 receipts 在 ignored `tasks/lyrics-highlight-gpu-scope-20261023/`；來源及音訊保護核對另記於 audit。

聚焦九份測試、228 tests 通過；ESLint、198 份 Markdown、七份 owned Prettier 與 build 通過，build 保留既有大 chunk 警告。Impeccable detector 在兩個修改元件無 finding。最終唯讀 review APPROVE，forced-colors 問題已關閉；沒有重跑不相關的完整產品 suite 或 installer 打包。

七份使用者來源／sidecar／音訊與 5,946 份前輪凍結檔 SHA 皆不變；十個本輪 Electron parent 與含本輪 profile 路徑的子程序均已退出。Git index 空、HEAD 未變。本輪 baseline 另有三份文字模型研究腳本由平行工作變動，保留且未覆寫。
