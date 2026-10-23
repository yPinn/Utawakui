# Focus 畫格提交關聯與容量量測

2026-10-23。承接[句尾與停留驗證](lyrics-tail-hold-2026-10-22.md)中
NetEase Focus cold raw rAF 最大間隔 41.6→58.3 ms 的未解回退。
實際保留診斷分批讀取與 renderer 安全回歸；容量讀寫重排受測後撤回，恢復本輪
凍結的原有容量路徑。分段起點提示、連續填色、模型時間與各模板外觀維持，
沒有加入顯示等待。下表的 final 是受測候選的內部名稱，不是目前交付的容量版本。

## 容量試驗與撤回

受測候選將 Focus 的首次容量計算改為先讀取已配置模板的字型與固定寬度，再以完整來源文字及
實際 fine glyph boxes 做 DOM 探針；探針處理完，仍同步執行原本完整的 measurement
render。目的是避免「先寫新歌詞、立即強制 layout，再做另一份 probe」的重複成本；
但同 cycle 量測顯示部分工作轉移到 commit，不能把 root read 的局部下降當作總收益。
候選沒有新增幾何 cache、字型就緒等待、動畫補償時間或額外 rAF。

候選依 Focus 行數預算取自 viewport，放寬有寬度、高度為零的初始模板量測。
其他模板保持先 render 再測量。首次字體、resize、外觀、來源文字、fine 版本與倍率
仍走原本失效與 cache key；實際細字盒容量驗證沒有被字數／canvas 預估取代。

曾量測一個清空 live ink 的原型；審查發現它會改變進場動畫 identity，且 scheduler
兩次跨界追趕時可能 yield，讓空框留到下一個 task。該原型已淘汰，原始資料仍保留，
不納入後續候選性能驗收。後續候選保留完整原 frame 的 measurement render，包含
測量失敗及追趕讓出 task 的路徑。真 renderer 整合回歸涵蓋同句失效不新增淡入、
fine 中間填色保留，以及兩次跨界 yield 前後的完整文字與即時 active cue。

後續候選雖縮短 fit／root read，部分成本移到 commit；同 cycle 的 prepare＋commit
LRCLIB 為 10.1→10.8 ms，NetEase 為 10.7→10.0 ms，各為一個 trace-on 冷例。
完整三組無 trace A/B 亦未呈一致改善，因此未通過總成本／不增加延遲的驗收。
不追加執行追求好值，也不保留隱藏實驗開關。容量實作與其順序專屬測試已按
本輪 SHA 基線精確還原，包含高度放寬與 target rect 讀取；不以 Git HEAD 覆寫前輪 dirty 工作。
renderer 安全回歸在原路徑也通過，仍保留。所有候選、原型、慢值與還原 receipt 均保存。

診斷 buffer 增加明確的 copied-batch drain；只在 `lyricsTrace=1` 啟用，普通讀取行為
不變，容量不增加，跨批次保留 clock anchor 與 delivery／cycle identities。
它不改正式播放排程，也不新增 IPC 或公開 WebSocket 權限。

## 同次提交與回覆的證據

前輪原始 41.6／58.3 ms 沒有全程序 trace，不能追認多出的 16.7 ms 是哪個工作。
本輪隔離 host 使用 Electron 的全程序錄製，並實際核對 Focus、本地、KTV、Browser
與 GPU PID，以及三個 renderer 的 UserTiming anchors。
[Electron contentTracing 契約](https://www.electronjs.org/docs/latest/api/content-tracing/)
說明錄製與停止會等待子程序確認；實際 trace coverage 仍需逐份驗證。

配對保留 64-bit ID 原始 literal，使用 Graphics.Pipeline 的 surface frame identity、
aggregation 中的 display identity，以及同 PID／category／時間區間的 PipelineReporter
async spans。`id2.local` 會重用，不能單獨當唯一鍵。token 不明的 compositor ACK
維持未指派，不能用鄰近時間猜配。submission／swap ACK／presentation feedback
分開記錄；Chromium feedback 不能代替實體螢幕或 OBS 擷取驗收。

NetEase before 的新重現 raw rAF gap 為 41.2 ms。同一 frame sequence 397 的
submit→receive 約 0.081 ms、receive→start draw 約 39.060 ms、
submit→presentation feedback 約 46.594 ms。
其 surface→display aggregation 以完整 ID 接到 `STEP_SWAP_BUFFERS_ACK`，
該 ACK 在此 frame 起點後約 46.780 ms；presentation feedback 在約 50.030 ms。
同 begin-frame sequence 的 AnimationFrame 內可見 `lyrics-commit-8-0`，
因此能把本次 app commit、提交、swap ACK 與 feedback 放在同一身份鏈。
這不等於已辨識每一個 compositor ACK，也不等於像素已被 OBS 接收。
期間 GPU 程序中帶 Focus renderer identity 的 raster flush span 約 45.467 ms，
其內另有 `D3DCompile` 與 `Program::MainLinkLoadEvent::wait`。
這些名稱分別對應 [HLSL 編譯](https://learn.microsoft.com/en-us/windows/win32/api/d3dcompiler/nf-d3dcompiler-d3dcompile)
與 [ANGLE link/load 等待](https://chromium.googlesource.com/angle/angle/+/refs/heads/chromium/7385/src/libANGLE/Program.cpp)；
本輪耗時與關聯依據仍是該次 raw trace。這是 GPU service 的牆鐘 span，含等待，
不是 GPU 硬體純執行時間。它比前輪「Focus 主執行緒大致空閒」更進一步指出
本次等待的管線位置，仍不能回填為原 58.3 ms 的確切成因。

LRCLIB before 也有 cold GPU raster flush 長 span，與同次提交到繪製等待重疊。
兩來源與冷／暖仍分列；獨立長 worker span 不因時間重疊就視為阻塞因果。
本輪未因此修改 shader、陰影、掃字皮膚、GPU flags 或固定 FPS。

## 驗證方法

使用《找》的 LRCLIB／NetEase 兩份既有來源與已套用結果，唯讀播放同一原 mix。
player／lyrics owner／clock／publisher／hub／正式 Focus 與 KTV adapter 實跑；
queue、provider 與其他非目標 owners 固定，並非重新跑來源分析或完整正式 profile。
本輪凍結目前程式，兩受測版本只隔離容量候選；本地編譯 bundle 相同。
本地是獨立 Panel／資料與時鐘探針，未註冊完整 v2 shell surface，不能用其無樣式
截圖或小字幾何宣稱正式控制台外觀驗收；此限制在兩版本相同。正式 Focus／KTV
CSS 則由各自 Browser Source 載入，另保留兩來源可見視窗擷取作支持證據。

全程序 trace 是短窗診斷，與完整播放 A/B 分開。完整 A/B 關閉 Chrome 及內部 trace，
每來源預先排定三組交錯前後對照，每次新 renderer cold 播 65–115.5 秒，再在同一
renderer warm 重播相同區間，1x、原音訊時鐘、Focus 前景與同一視窗尺寸。
幾何／fine ink 的 rAF 探針兩邊一致，因此仍不是零觀測干擾的正式延遲 benchmark。
監聽靜音，未宣稱完成人工歌聲終點聽辨或 OBS 接受。

raw rAF interval 只用未篩的相鄰觀測。65→66 秒作初始控制窗，66 秒後另列自然
播放；跨兩窗的 interval 保留並單列。anchor 配對小於 25 ms 僅用於媒體 cue／fill
觀測，不用於 raw gap。首次 seek 控制流程不冒稱從曲首無 seek 的自然啟播。
warm 的初始控制窗也保留，不以穩態快值掩蓋重播 seek 慢值。
分位數沿用 sorted `floor(n*p)` 的零起索引慣例；p50 是偶數筆資料的上中位，
不是兩個中間值的算術平均。每組僅三個獨立執行，不把大量逐幀樣本當成獨立試驗。

coarse cue 只評估唯一文字在起點之後的可見性，排除同句重複／包含文字；
它不是精確的 segment identity 配對，也不能證明沒有提前亮字。
KTV 的 phrase／page cue identity 在本輪 probe 未保留，該項不評分，
其可見性、裁切、連續填色與無底線仍分別觀測。未知／不評分與未觀察到明確分開。

## 驗證結果

12／12 次完整執行成功，24 個 cold／warm cycles；所有 publication 接受。
以下數值依預定 round 順序列出，不刪除慢值，不以三次平均取代最大值。

| 來源    | 階段／統計窗   | before 三次最大值（ms） | 受測候選三次最大值（ms） |
| ------- | -------------- | ----------------------- | ------------------------ |
| LRCLIB  | 冷啟首秒       | 21.7／25.1／22.3        | 23.9／20.5／21.7         |
| LRCLIB  | 冷啟後自然播放 | 8.5／8.9／7.9           | 9.0／8.6／8.8            |
| LRCLIB  | 暖重播首秒     | 4.9／5.0／4.6           | 4.3／4.9／4.8            |
| LRCLIB  | 暖重播自然播放 | 7.2／6.9／6.3           | 6.6／6.3／6.6            |
| NetEase | 冷啟首秒       | 38.6／53.3／41.2        | 37.2／37.5／43.3         |
| NetEase | 冷啟後自然播放 | 9.9／8.5／8.9           | 8.2／10.0／8.6           |
| NetEase | 暖重播首秒     | 6.4／6.7／6.1           | 8.1／6.9／4.6            |
| NetEase | 暖重播自然播放 | 6.2／6.6／6.2           | 6.5／6.6／6.4            |

Focus 自然播放 raw gap p95 範圍 4.3–4.3 ms。
同次 trace-on 短窗診斷如下，與上表的無 trace 執行分開；不同階段最大值不能相加。
下表的局部下降不是採用候選的理由；前述同 cycle 總成本與撤回決定優先。

| 來源    | trace-on cold fit max 前→後 | root read max 前→後 | commit max 前→後 |
| ------- | --------------------------- | ------------------- | ---------------- |
| LRCLIB  | 8.9→8.1 ms                  | 4.5→0.2 ms          | 0.9→2.4 ms       |
| NetEase | 9.5→6.9 ms                  | 4.4→0.1 ms          | 1.4→2.8 ms       |

全文差 0；大幅填色退回 0；橫向／縱向 overflow 0／0；
有字但有效列隱藏 0；KTV 底線 0。
共 871757 個 raw surface 觀測，452682 個介於 0–100% 的細字盒觀測、
348085 個同字盒向前且未填滿的觀測，支持測量期間仍有連續填色。
Focus 可評分的起點後提示未觀察到 0，不評分 24；
後者與 early unknown 不算成功或漏字。所有 source／cycle 的明細、跨窗 gap 與慢值見
[去識別數據](data/lyrics-focus-frame-2026-10-23.json)。

同步測量與 cold raw max、自然播放／暖重播分開判讀。本輪不將 GPU 冷成本或原 58.3 ms
宣告完全解決；自然播放的單次回退均保留，容量候選撤回，性能改善 gate 未通過。

## 證據與限制

容量實作與其測試還原後的 SHA 與本輪 baseline 完全相同；目前容量 runtime 及
trace module 亦與受測 before 路徑相同。保留的產品程式改動只有 opt-in trace drain，
以及 baseline-compatible renderer／trace 回歸。沒有改主程序、preload、套件或封裝檔案。

最終聚焦 16 files／259 tests 通過，兩核心合計 lines 89.47%、branches 81.11%。
全域 ESLint、build、Markdown 檢查與 owned 文件格式檢查通過；build 保留既有
chunk-size warning。未重跑與這個變更無關的全產品測試，亦未宣稱正式 OBS／控制台
人工視覺接受。兩來源獨立可見 Output 擷取只作支持證據，不混入性能樣本。

5946 個凍結檔的 SHA 不變；使用者五份歌詞資料及 mix／guide 共七檔不變。
20 個 owned Electron parent 均已退出，index 空。本輪 baseline 之外另有一份
研究索引由其他平行工作變動，未覆寫；不宣稱全工作區都沒有變化。
本輪未 commit／push。

本輪 ignored scratch 為 `tasks/lyrics-focus-frame-fix-20261023/`。
全程序 raw traces、包含私有歌詞／本機路徑的 replay reports、淘汰原型與每次失敗
留在該目錄，不提交。正式報告只保留可去識別的統計與方法。
原先的資料、對照窗與初版錯誤衍生統計仍保留於前輪 scratch，沒有用新 run 覆蓋。
