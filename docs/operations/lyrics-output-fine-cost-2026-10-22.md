# Output 細填色首字成本修正與驗證（2026-10-22）

本輪承接[連續填色驗證](lyrics-continuous-fill-2026-10-22.md)所記錄的首字增加量，將目前可見連續填色版作為主要基準。分段起點底線、模型細時間、來源文字範圍與現有播放器時鐘保持一致。

## 量測邊界

案例沿用可見隔離 Electron、真 HTMLAudioElement／usePlayer／歌詞 owner、publisher→Hub→server→WebSocket→正式 Focus 路徑；24 秒 16 kHz 靜音 PCM、26 個每 500 ms 的粗起點、每個細時間 350 ms 與 150 ms gap。兩版都啟用同樣細填色，沒有將 starts-only 與 fine 的差異混成這輪最佳化效果。

Cold 是新程序、profile 與 Output document，不是清空 OS／磁碟／字型全域快取。Warm 在同一視窗先播放到 1.2 秒，再重設播放與觀測資料。首字短案例播放到 1.3 秒，各版各 10 cold／10 warm；完整案例各 3 cold／3 warm，沿用 pause／resume／seek／rate／offset 與 350 ms steady 排除窗。診斷 trace 和可見填色／截圖驗證另跑，不混入無 trace 性能分布。

## 成本拆分

`lyricsTrace=1` 才建立有界數值事件；預設沒有新增細分計時。`render-cost` 每次 render 只輸出一個彙總，`renderPhase` 0 為排版量測、1 為正式 commit；`renderId` 用來區分同一 scheduler pass 中的 render。

- `finePrepareMs`：結構識別、文字範圍與 grapheme parts 準備。
- `fineLookupMs`：paint cell 對模型單位的查找。
- `fineDomMs`／`coarseDomMs`：對應節點建構與寫入片段；coarse 計時從舊狀態清理之後開始。
- `fineStyleMs`／`fineCancelMs`／`fineAnimateMs`：進度寫入、取消與建立動畫的 API 呼叫時間。清理舊行時的細動畫取消也計入。
- 節點、cells、命中、建立／取消／重用數量用來區分 layout cache hit 與 live DOM hit。

Prepare／fit／render／commit 是父子範圍，不相加。細分項也沒有覆蓋全部 JavaScript 與瀏覽器工作；未量到的剩餘部分保持未分配。API 呼叫時間不等於 compositor 全部工作。Chrome style／layout／paint 事件按區間及主 renderer 關聯；rAF 觀測記錄是 DOM 可被觀察的時點，不代表實體螢幕或 OBS 呈現。

修正前 cold／warm 各三次短 trace 全由 timer 入口觸發。Cold 為 fit miss，21 個 probes，prepare 9.6–12.7 ms；量測 render 1.5–1.7 ms，先建立 26 個粗節點與 26 個細子節點，正式 commit 1.1–2.5 ms 再建立 26 個動畫。Warm 為 fit hit，prepare 約 0.1 ms，但正式 commit 1.7–1.9 ms 仍需重建 26 個粗節點與 26 個細子節點、建立 26 個動畫。這直接證實暖重播的排版命中不等於 DOM 命中。

這六次 commit 完成至下一 rAF 觀測約 1.6–2.8 ms；它與前述同步成本分開保留。原先三次首字分布和本輪新基準、帶 trace 診斷都是不同 cohort，不用其中任一組取代另一組。

最終 after 保留三個 timer cold／三個 timer warm 供同入口比較，另有一次 receive cold 原樣保留、獨立分層。下表為各三次 timer trace 的 p50（ms），不是無 trace 性能結果。

| 成本                       | Cold before → after | Warm before → after    |
| -------------------------- | ------------------- | ---------------------- |
| Fit，包含量測 render       | 10.7 → 8.5          | 兩版皆快取命中，無量測 |
| Prepare，包含 fit          | 11.1 → 8.9          | 約 0.1 → 0.1           |
| 正式 commit                | 1.9 → 1.7           | 1.8 → 1.2              |
| Commit 完成至下一 rAF 觀測 | 2.5 → 1.5           | 2.4 → 0.1              |

After 額外細子節點 26→0，但粗 span 仍有 26 個；首次 commit 兩版都建立所需的 26 個動畫。現場重用只在六個 final timer 案例中的一例觀察到 26 次，其餘為零；不同案例 render 次數也不同，不能把累計建立／取消數當成已普遍減少。快取與節點減少是已驗證的結構差異，動畫重用只在嚴格等價時成立，合法時鐘修正仍重建。

表中父子成本不能相加，零值可能低於量測解析度；帶 trace 的三次觀測、不同畫格相位與排程不能因果分攤無 trace 首字的全部增量。尤其 commit 至 rAF 的下降僅是本批觀察等待變短，沒有改瀏覽器畫格或保證每次都如此。

## 修正內容

Focus adapter 將靜態結構識別移至每個 fine frame 共用的 context，建立模型單位 ID 索引；文字、來源範圍、單位 ID 或起訖時間不同即使用不同結構。強引用快取至多八份結構、每份至多 256 個範圍 parts，另以 WeakMap 對應不可變 frame；不保存時鐘或進度。來源有序時以範圍查找取需要的單位，避免每個粗節點掃描整行或每個 cell 線性查找。

當一個完整 grapheme 恰好涵蓋整個粗分段，直接在原粗 span 填色，保留其文字、身份與底線，不再清空文字後建立相同細子 span。多字模型單位仍切成原有可換行 paint cells；跨粗分段或頁面而無完整單位對映時保留原降級規則。清理時移除細填色 class、資料與動畫，保留粗身份；可讀基底、空 alternative text 與 forced-colors 沿原行為。

Output 僅重用仍有效、單位／速率／顯示範圍與取樣時鐘對映等價的動畫，直接省下取消、重建與進度重寫。任何錨點修正、seek、pause、rate、offset、不連續或過期動畫仍即時重定位。等價只容許 IEEE 浮點表示誤差，沒有視覺容忍時間或平滑門檻。本地呼叫預設不啟用這個重用最佳化，沿用現有更新方式。

時鐘含 Output hold，必須比較完整分段函數：兩個 advance 時點都已到達時才可用前進直線等價；仍在 hold 時，position 與 advance 時點都相同才可重用。獨立審查指出「position 與未來 hold 同步前移」會使直線相同、保留期卻不同；已先新增失敗回歸，再修正為立即重定位。

首次需要的未來動畫仍依原方式預排，沒有改細時間邊界、另造時鐘或縮小動畫窗口，也沒有把細填色延後到 rAF／timeout／idle 補做。先寫底線並不能讓瀏覽器略過同一 JavaScript task 的剩餘工作，因此目標是直接降低同步成本。

## 程式驗證

細分 trace 先驗證兩個失敗測試，再通過 122 項相關測試；結構／節點／重用再經失敗回歸與修正，最後八個相關檔案 170 項通過，涵蓋 clock、hold、控制、page、layout、fit、native T2 與 starts-only 行為。Trace-only 與最後產品差分均經獨立審查核准。

完整測試 1,005 個檔案、9,544 passed／1 skipped，ESLint、production build 與修改程式的 Prettier 檢查通過。三個 runtime 的 focused coverage：statements 89.48%、branches 81.65%、functions 86.44%、lines 90.68%；細 adapter 為 96.19%／87.71%／100%／98.9%，共用 painter 為 97.77%／95.52%／100%／100%。這不是全庫 coverage ratchet。Build 原有大 chunk 提示仍在。

沙箱預設暫存目錄的原子替換先出現 EPERM，改至工作區暫存後仍有硬連結測試受限；最後完整測試於允許硬連結的執行環境通過，兩次失敗日誌亦保留，沒有修改產品或降低測試要求來繞過。

## 冷暖可見驗收

首字短案例每種冷暖各 10 次，兩版均啟用連續填色，rate 1 時 signed media 與 signed wall 數值相同。正值是晚於既定起點，負值是早於起點。以下中位數為排序後兩個中值的平均，另保留原 nearest-rank p50；nearest-rank p95 在 n=10 等於本批最大值。

| Output 首字（ms） | 中位數 before → after | nearest-rank p50 before → after | p95／最大值 before → after |
| ----------------- | --------------------- | ------------------------------- | -------------------------- |
| 冷啟動，各 n=10   | 15.536 → 12.131       | 15.071 → 11.312                 | 20.897 → 15.982            |
| 暖重播，各 n=10   | 5.423 → 4.944         | 5.103 → 4.703                   | 12.695 → 7.905             |

本批冷啟動中位減少約 3.41 ms，暖重播中位減少約 0.48 ms；暖重播變化較小，不能由十次樣本推論所有機器或每次都改善。Local 為回歸對照，nearest-rank p50／p95：cold 8.651／12.111 → 4.993／10.071 ms，warm 5.743／12.905 → 5.131／9.166 ms，沒有修改其動畫重用預設。

完整控制案例各版 3 cold／3 warm，以相同 phase／onset 配對的首次 activation 比較。以下都是 signed wall ms，與前述短案例分開；p50／p95 採 nearest rank。

| 共同起點    | 配對 n | p50 before → after | p95 before → after | 最大值 before → after |
| ----------- | ------ | ------------------ | ------------------ | --------------------- |
| Local cold  | 103    | 6.816 → 4.516      | 14.100 → 11.416    | 15.568 → 15.747       |
| Output cold | 103    | 4.295 → 3.804      | 12.004 → 10.061    | 14.435 → 18.628       |
| Local warm  | 101    | 7.234 → 5.254      | 15.544 → 12.000    | 18.952 → 15.737       |
| Output warm | 102    | 3.863 → 3.852      | 11.905 → 10.806    | 15.675 → 12.221       |

Cold 完整首次起點兩端各 104→104；warm Local 105→101、Output 105→102。缺項位於 pause／seek／rate／offset 的 phase 端點，保留其控制前後取樣、原因及未配對資料。分類由全部 raw transitions 先記首次 activation，再套 steady filter；legacy rows 全部逐值保留，不刪負值或最慢樣本。

這組 cold 最大值回退後續另以同次 deadline／callback／prepare／commit／observer 事件鏈診斷，並執行新的完整交錯比較；見[冷啟動首字與舊分組結果排查](lyrics-output-cold-max-2026-10-22.md)。本頁歷史 cohort 與慢值保留，不以後續批次覆寫。

共同起點 p95 下降，但 cold 最大值仍有回退：Output 14.435→18.628 ms，Local 15.568→15.747 ms。這不是所有時刻都改善或固定延遲上限的證據；也沒有用提早提示、時間偏移或平滑等待換取分布。

最終可見診斷六組涵蓋 plain、容量、ruby、dark／light list 與 starts-only。單字直接沿粗 span 的 Output pseudo clip 有連續中間值，AX 首字只朗讀一次；20 字／四個五字單位在 9 字寬容量下，本地與 Focus 都是三行且 contained。Pause 凍結、gap 保留完成、seek／rate 即時重定位；root 另親自查看最終 plain／容量 Output PNG。原生 T2 沿程式測試回歸，沒有將本輪合成 T1+ 案例冒充新增的 T2 可見測試。

粗起點 first-active 與細填色的首次正進度／computed pseudo clip、整個模型單位的完成時點分開記錄。功能案例在第一個單位唱完前暫停，暫停前完成時間列 unknown；恢復後完成另列，不當作未中斷性能樣本。這些功能觀測不混入首字性能分布。

私人 raw、snapshot 與程序資料保留於 ignored tasks，對應可攜彙總在量測完成後以相對 evidence 路徑及 SHA256 記錄。實體 OBS、硬體像素／音訊延遲、自然歌聲的人工時間真值與 installer 不在本輪驗收範圍。

可攜資料見[同案例結果與 evidence hashes](../research/lyrics-alignment/data/lyrics-output-fine-cost-2026-10-22.json)。52 次正式性能 run（40 short＋12 full）共 1,551／1,551 次發布接受，全部 visible／sources stable、唯一 Audio owner、無錯誤；26 對 fixture 的粗起點、細時間、文字與控制值逐值一致。Trace／功能與 initial 診斷獨立保留，不混入這個分母。最終四個修改 runtime 與凍結版本逐檔 hash 相符，snapshot manifest 核對通過，專用 Electron 程序已全部退出；未執行新模型、下載或寫使用者曲庫 sidecar，未建立 commit。
