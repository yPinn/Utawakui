# T1+ 細時間保留與連續填色驗證（2026-10-22）

本輪接續[時鐘配對修正](lyrics-clock-fix-2026-10-22.md)與[Output 長尾修正](lyrics-output-tail-fix-2026-10-22.md)，補存既有模型細區間，先核對中日資料，再接本地 document reader 與 Output Focus。分段起點立即底線提示，細墨色依原模型單位起訖連續填入；不按下一起點猜唱完時間，不加平滑等待，不新增模型。

## 資料與支援邊界

Decoder 保留上游 Word 的實際 `end`，原 `start` 算式與 coarse chunker 保持不變。`mapFineTiming` 以原 occurrence index 及詞的來源範圍對映；先驗 raw interval，再取整數毫秒。跨句框、缺 end、重疊或不合法範圍不補齊、不平移。只有 Chinese/Japanese 路由發布 fine，英文保留粗提示，混語維持原 unsupported。

Schema 2 的選用 `fineTiming` 與 starts-only chunks 分開，保存 `unitId/from/to/startMs/endMs`。Experimental wrapper 5／method 4 綁定逐句語言計畫及 `hfa-starts-fine-zh-ja-occurrence-v1` 配方。Fine 進入內容身份；前一 method 3/schema 1 可繼續讀粗提示，不會憑空補 end。非法或超出 count／bytes／wrapper 預算的 optional fine 撤除，有效 coarse 保留；損壞的已存檔身份仍嚴格拒絕。

使用[前輪自然片段研究](../research/lyrics-alignment/lyrics-fine-timing-clock-2026-10-22.md)原始結果離線重建，沒有新推論、下載或使用者 sidecar 寫入：

| 語言 | 原 Word spans | 保留有效 fine units | 跨句框拒用 | 保留區間時長                    | 最大保留間隙 |
| ---- | ------------: | ------------------: | ---------: | ------------------------------- | -----------: |
| 中文 |           117 |                 108 |          9 | 58–1472 ms；p50 319／p95 621 ms |       330 ms |
| 日文 |            74 |                  54 |         20 | 13–998 ms；p50 384／p95 900 ms  |       422 ms |

29 句 canonical 中，25 句有原 decode，均能保留部分合法 fine；另 4 句混語沿原路由拒絕。25/25 原 `mapStarts` 與 coarse chunks 逐值相同，也與原 raw preview chunks 相同。接受區間的文字範圍精確來自原 `words`，不是研究要求的 cuts；時間差僅整數毫秒取整，至多 0.5 ms。日文單位來源長度 1–4 個 UTF-16 code units，保留詞／mora 粒度，不拆出假漢字音素對映。

這證明資料保留及映射可用。原始模型首詞可能偏離 T1 錨點，且沒有新增人工唱完時間真值；區間合法不等於歌聲準確。模型有空隙時保留已填墨色並停住，不能把 gap 自動稱為已驗證靜音。字內填色只屬單位內視覺內插，不宣稱逐字聲學準確度。

## 兩端顯示與安全降級

`useExperimentalLyrics` 沿用手動套用、來源／offset 身份與既有 publisher；public line 的 `estimatedFineTiming` 與 `estimatedStarts` v1 分開。Main 先保留全部 coarse ID／count，再驗 optional fine；Output projection、Hub 與 split Browser Source assembly 保留新 sibling。發布前若 fine 使文件超 bytes 預算，撤 fine 保留 coarse。舊 client 忽略新 sibling，原生 T2 優先。

繁轉以實際 converter 對 source partitions 轉換並重建整行，再驗目標 grapheme 邊界；不能只憑等字數猜範圍。無法精確重建就保留粗提示。Ruby、分頁邊界先要求完整 unit 可對映，跨界不生成新時間。其他模板與 Self-View 本輪維持既有行為。

`lyricsFineFrame.mjs` 持有純投影；`lyricsFinePaint.mjs` 只持有局部動畫。Fine 單位以 grapheme 小格分配原單位的顯示進度，資料仍保留原單位起訖。多字單位可換行，跨行按閱讀序續掃，不形成改變容量的 atomic word。小格 fractions 不儲存、不傳輸，也不升成 T2。

播放使用實際媒體／Output 投影時鐘，線性填入；變速換算實際剩餘 wall time，commit 成本從剩餘時間扣除。Output 保留現有 `displayDelay` hold；暫停／buffer 凍結，seek／rate／offset／取消套用直接重定位與取消舊動畫，不補播錯過的畫格。填色畫格沒有逐幀 IPC、模型、文字轉換、DOM 重建或幾何量測；內容／容量失效與本地捲動仍由既有 owner 準備及量測。

字形基底保持實色，副本透過 clip 顯色並使用空 alternative text；forced-colors 關副本，保留原文字與底線。Local fine 列恢復文字前景並取消原 accent 底色，時間戳、未建模文字及讀音不會深字深底。Ruby 保留既有字級／sheet 浮動定位及間距。

Browser Source 細時間上限為 version-one 固定值，測試核對 canonical 上限；沒有引入 JSON-module 語法或公共 JSON route。新 JavaScript 模組維持 exact routes、封裝 globs 與閉合模組圖測試。

## 驗證方法與中間修正

沿用前輪可見隔離 Electron、真 HTMLAudioElement、24 秒靜音 PCM、26 個已知字與每 500 ms 粗起點、相同 pause／seek／rate／offset 控制及 350 ms steady filter。Before starts-only；after 唯一顯示資料差是每字增加 350 ms fine 區間及 150 ms gap，以量到啟用動畫的成本。Known timings 與合成 owners 不冒充自然模型準確度或完整使用者曲庫／OBS 驗收。

診斷與性能分批。逐幀 computed style、pseudo clip、動畫／節點 identity、PNG、AX 等觀察只在可見診斷開啟，不混入冷／暖性能分布。首次 activation 仍先看全部 transitions，再篩 steady/control window；重入及 unmatched 原始資料保留。

過程中的失敗與中間版本均保留在 ignored evidence：

- Windows snapshot alias 未正規化，曾建立兩個 `usePlayer`／Audio；真播放器正常，觀察器抓到空元素。修 harness 並 assert Audio count = 1，這些 timeout 不當產品延遲。
- 最初 Output split assembler 漏新 sibling，單獨 renderer 測試不能證明交付；先補 RED，再接完整重組。
- Word inline-block 曾改變容量，改 grapheme paint cells；9 字寬／3 行案例的 20 字保持三行完整顯示。
- 進度數值正常曾不代表畫面有填色：`@property inherits:false` 使 pseudo 永遠裁到 0%；local 82／Output 81 筆中間值的 pseudo clip 仍固定 100%。改成繼承並檢查真正 pseudo／像素；該中間版本的六次性能 run 不能當最終可見版驗收。
- 審查發現 Output display-delay plateau、透明字高對比退化、fine 擠掉 coarse 預算、ruby scoped styles／配色遺失，均補回歸並修正。

## 同案例最終結果

Before 與 final 各三次 cold、三次 warm。這裡的 cold 是新 Electron process／profile／Output 文件，沒有清除全系統字型／磁碟快取。Warm 在同視窗播放至 1.2 秒後 pause／seek 0，再清觀測陣列並沿相同控制流程播放。所有 12 run 的文字、26 粗起點與五項控制值逐值相同。

以下為共同首次 activation 的 signed wall milliseconds（依實際倍率換算）；正值落後、負值提前。來源是 rAF 的 DOM 狀態觀察，並非螢幕／喇叭硬體呈現時間。全量、media milliseconds、負值極小值及未配對原因另存 [portable JSON](../research/lyrics-alignment/data/lyrics-continuous-fill-2026-10-22.json)。

| 模式／畫面  | 共同 n | p50 before → final | p95 before → final | max before → final |
| ----------- | -----: | -----------------: | -----------------: | -----------------: |
| Cold 本地   |     99 |        8.82 → 6.11 |      25.71 → 13.54 |      34.05 → 18.04 |
| Cold Output |     98 |        8.00 → 5.80 |      27.73 → 13.94 |      34.97 → 21.96 |
| Warm 本地   |    100 |       17.60 → 9.05 |      28.90 → 14.83 |      32.00 → 17.69 |
| Warm Output |    100 |       12.80 → 6.72 |      27.86 → 14.70 |      32.00 → 17.78 |

全量 first-activation 分母為 before cold 各 100／warm 各 102；final cold 本地 103／Output 102，warm 各 103。未配對點在控制／phase 端點附近，保留原始括弧，不以移除慢點求改善。Legacy rows 逐值一致，所有 re-entry 均為 0。共同分布 p95 改善只能支持本批結果，不能宣稱一般自然曲目或所有時刻都更快。

首字另列，不能由 pooled 分布掩蓋：

| Output 首字（rate 1，ms） | 三次 before           | 三次 final             | 中位數 before → final |
| ------------------------- | --------------------- | ---------------------- | --------------------- |
| Cold                      | 7.717／20.047／11.509 | 21.964／18.186／14.644 | 11.509 → 18.186       |
| Warm                      | 0／21.762／2.669      | 12.789／9.746／13.557  | 2.669 → 12.789        |

Cold 首字中位增加約 6.68 ms，warm 增加約 10.12 ms；各只有三次樣本，尚不能由此歸因細動畫、排程或觀測畫格量化。沒有新增固定等待，卻也不能宣稱完全零增量；這項首字限制與整體 p95 改善分開保留。

因此另做 before/final cold 首字短 trace 各一次，不重跑或替換上述矩陣：first-fit 8.8→10.4 ms（同為 21 probes）、prepare 9.2→10.8 ms、commit 0.8→2.6 ms；首個 Chrome Layout event 2.911→2.999 ms，fit 內 22 筆 Layout 合計 3.489→3.615 ms。Commit 至 rAF 觀測 0.1→2.2 ms，前後 observer frame bracket 12.4→16.5 ms。這個案例同時觀察到工作成本與觀測等待增加，不能把首字差全歸因觀測。另一方面 n=1、兩端分別由 receipt／timer 進入、且帶 trace overhead，不能因果解釋原三次分布，warm 也未 trace。數字與正式無 trace 性能分開保存。

Before 504/504、final 510/510 envelopes 接受，12 run 全部 visible、sourcesStable、唯一 Audio owner、errors 為空，沒有拒絕或殘留專用 Electron。Final runtime manifest 與 live／最新功能診斷的 1980 個 runtime/research 檔案 hash 相符；中間不可見版本與其六次 run 保留且排除。

可見診斷中，plain/ruby 的兩端 pseudo clip 有數百個不同中間值；plain pause 本地 93.6349%／Output 93.7143% 固定 62 frames，ruby 97.2743%／97.1429% 固定 53 frames，均無 running 動畫。Gap 兩端保持 100%（19／21 frames），backseek 回到約 42–45% 後續掃，rate 1.25 仍有連續中間值。首字約 44／45 frames 只觀察到一個 DOM identity、兩個 animation identities，沒有逐幀重建。

20 字、四個各五字來源 unit、9 字寬的容量案例，coarse 與 fine 在本地／Focus 都是三行、文字完整 contained；第一視覺行完成後第二行依序填入，後行維持基色。Ruby 標籤未拆壞，深／淺色的時間戳、未建模文字與讀音可讀；AX 首字只出現一次 StaticText。Root 另親自查看兩端容量、dark/list、light/list 與 ruby PNG。私人原始歌詞與來源路徑只保留 ignored tasks。

## 自動檢查與範圍

完整回歸 1005 files、9538 passed、1 skipped。最後 fine 前景色補正後另跑 5 files／49 tests，production build 與 ESLint 通過。Producer focused 15 files／151 tests，Python serializer 9 tests；四個顯示核心 runtime 的 focused coverage 為 statements 96.03%、branches 89.34%、functions 95%、lines 97.15%，未降低門檻。封裝邊界、closed HTTP graph、fine 固定上限 3 files／48 tests 通過。

這是 focused coverage，沒有重跑全庫 coverage ratchet 或 installer。真 OBS／音訊裝置／螢幕呈現延遲及自然歌聲人工 timing 真值未驗收。舊結果要取得 fine 需要由既有分析流程重新分析；在此之前仍可套用原粗提示，沒有自動重算曲庫。
