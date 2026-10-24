# 歌詞顯示、時鐘與效能歷史

本文件合併 2026-10-22／23 的工程報告，供追溯各輪版本、方法、失敗與驗證限制。各節的「本輪」「待修」「未提交」均指原報告時點，不代表現行狀態；後續修正另節記錄，不回改原數字或跨輪加總。現況見[規格](../spec.md)，行為見[歌詞時間](../contracts/lyrics-timing-contract.md)、[聲學估計](../contracts/lyrics-acoustic-estimate-contract.md)及[Output](../contracts/output-runtime.md)契約。

原始 Markdown 可由基準 `73715795` 與節首來源路徑取得（`git show <commit>:<path>`）。原始 JSON 與其中的歷史路徑、來源 hash 維持不變；日期提交清單中的舊檔名表示當時成員，現行閱讀入口以本文件章節為準。

## 報告索引

- [時鐘採樣與發布配對（2026-10-22）](#時鐘採樣與發布配對2026-10-22)
- [細時間保留與連續填色（2026-10-22）](#細時間保留與連續填色2026-10-22)
- [階段總結（2026-10-22）](#階段總結2026-10-22)
- [冷啟首字與舊分組排查（2026-10-22）](#冷啟首字與舊分組排查2026-10-22)
- [細填色首字成本（2026-10-22）](#細填色首字成本2026-10-22)
- [Output deadline 與首字準備（2026-10-22）](#output-deadline-與首字準備2026-10-22)
- [Focus 陰影候選撤回（2026-10-23）](#focus-陰影候選撤回2026-10-23)
- [Focus 畫格關聯與容量（2026-10-23）](#focus-畫格關聯與容量2026-10-23)
- [GPU 拆解與本地呈現收斂（2026-10-23）](#gpu-拆解與本地呈現收斂2026-10-23)

## 時鐘採樣與發布配對（2026-10-22）

來源：`docs/operations/lyrics-clock-fix-2026-10-22.md`。

本輪修正本地起點提示的採樣等待，以及 Output 舊媒體位置配上新發布時間的問題。T1+ 保留分段起點整塊即亮；沒有啟用掃字、增加模型或改寫 timing／sidecar。

後續的 Output p95／首字長幀排查與修正見[長尾延遲報告](#output-deadline-與首字準備2026-10-22)。本報告保留當時基準與結果，後續重複案例不覆寫原單次觀測。

### 時鐘配對：修正範圍

`usePlayer.samplePlaybackClock()` 同步唯讀取得 HTMLAudioElement 的位置、實際倍率、phase、track／continuity 與配對時間。實作位於 `src/utils/playbackClockSample.js`，仍由原 player owner 綁定唯一 audio element，不推算或回寫 transport state。

`useLyrics` 透過內部 `useLyricsClock` 建立 T1／T2／已套用 T1+ 邊界索引，在到點或原有媒體／控制事件時重新讀取實際位置。晚到 callback 直接選當前位置，早到重排；暫停、緩衝、seek、結束、來源與 offset 改變會取消或重排。控制寫入先經 Vue 批次完成，避免倍率 intent 先變、audio 倍率尚未更新時讀到舊值。播放熱路徑不量測版面，也不逐幀更新全域 Vue state。

Output publisher 完成內容傳送後，先重查 continuity 與三種內容文件 identity，再採樣並重建動態資料、references 與 `generatedAt`。文件已變更時跳過舊 state 並排入最新投影；同一 continuity 的文件換版保持既有 epoch handshake，不能向已見 epoch 誤送 `full`。被拒的狀態則先換 epoch，再重新檢查／採樣，即使重試時文件又變更，後續最新投影仍能完成新的 full handshake。手動演出項目保留原本的虛擬位置與倍率。

### 時鐘配對：固定案例與判讀

沿用[修正前研究](../research/lyrics-alignment/lyrics-fine-timing-clock-2026-10-22.md)的自製 24 秒靜音 PCM、相同文字與已知 500ms 起點、pause／resume／seek／1.25×／+200ms offset 順序。隔離可見 Electron 使用真 HTMLAudioElement、usePlayer、實驗分段 owner、LyricsDocumentPanel、publisher、Projection Hub／Server 與正式 Focus scheduler／DOM；Library／queue／session／reading 等資料 owner 及起點是合成。

本地 harness 將正式 `useLyricsClock` 接入實驗分段 owner；完整 `useLyrics`、使用者曲庫與 feature gates 的 App 整合不在本次可見量測內，另由 focused owner 測試覆蓋。這不是自然歌聲或完整使用者環境的人工接受。

以 rAF 配對實際媒體時間與牆鐘，跨 renderer 參照使用相鄰真實採樣內插。穩態排除控制後首 350ms 與暫停；控制後首 200ms 另報。正值表示落後、負值表示提早，媒體毫秒與按倍率換算的牆鐘毫秒分開。幀數與觀測起點次數會隨 OS 排程及控制切換位置變動，沒有強制讓分母相等；完整分布、共同起點對照及未配對原因皆保留。

這是固定案例的 before／after 工程量測，並非獨立歌曲統計或自然歌聲準確率。一般 Output 外推原本已貼近媒體時間，不能以改善控制事件錨點宣稱每個 Output 畫面都更快。首次長幀仍列入最大值；沒有量聲卡、喇叭、實體螢幕或 OBS。

### 時鐘配對：同案例結果

以下為全部穩態起點觀測，單位為牆鐘毫秒。最終版本 85／85 envelopes 接受，79 份 state、0 拒絕；七份 runtime source hash 在執行前後一致，兩視窗可見，沒有 renderer errors 或測試 Electron 殘留。

| 主提示 DOM   | 次數前→後 | p50 前→後   | p95 前→後    | 最大前→後    |
| ------------ | --------- | ----------- | ------------ | ------------ |
| 本地歌詞     | 33→35     | 131.22→4.00 | 267.01→15.36 | 274.05→25.17 |
| Output Focus | 34→35     | 3.80→4.78   | 12.16→25.17  | 137.37→55.72 |

以 surface、phase、已知起點與同 phase 的重播次序配對，本地共同 31 次：牆鐘 p50 121.32→4.00ms、p95 267.01→15.36ms、最大 274.05→25.17ms。僅修前 2 次是 seek／offset 後的起點：修後及時出現而落在相同 350ms 排除窗；僅修後 4 次是修前慢採樣跨過 phase 結束，沒有同 phase 觀測。Output 共同 34 次，牆鐘 p50 3.80→4.00ms、p95 12.16→25.17ms、最大 137.37→55.72ms；僅修後 1 次在 resume 結尾。這個共同子集也不支持 Output 顯示 p95 全面改善。

Output 修前首字有 138.10ms rAF 長幀，最終版本仍有 56.10ms 首字長幀；都保留在最大值。不能把該次最大值下降歸因於採樣修正已解決首次容量／字型或其他繪製工作。本地 `player.state.currentTime` 的原有事件採樣間距沒有改快，改善來自顯示 owner 在邊界重讀 audio。

發布錨點以媒體毫秒比較，79→79 次：signed 範圍由 −0.437～229.021ms 變成 −0.479～0.488ms，p95 14.215→0.443ms。倍率切換第一份發布落後 131.565→0.187ms，offset 第一份 227.965→−0.375ms。這證明同次位置／時間配對改善控制事件發布，並不等於所有 DOM 或硬體延遲均小於 1ms。

控制後首 200ms 原始窗另存：rate 重建位置仍有 −17.539～1.211ms 範圍；中間 run 也觀察到 fresh 錨點僅 +0.256ms，但原生 currentTime 相對新倍率外推仍有約 −29.437ms 過渡，與 Output 提早值相符。這支持原生媒體過渡因素，並非瀏覽器內部因果追蹤。最終 seek 的一筆舊 Output frame timestamp 恰與 control 相同，跨 renderer 的不連續配對算出 −6825ms；新媒體第一個本地 sample 在 +0.7ms，下一 Output +4.2ms 已是正確位置。此筆原始值保留，不能解讀為 6825ms 顯示延遲或已證實停留一整幀。rAF、跨 renderer 內插與 Date 毫秒精度限制仍在。

可攜的[聚合數據與證據 hash](../research/lyrics-alignment/data/lyrics-clock-fix-2026-10-22.json)同時保留全體、共同子集、未配對原因、各 phase 分母及控制窗；沒有以新的分母替換原始結果。

### 時鐘配對：驗證紀錄

失敗測試先重現沒有 timeupdate 的起點、舊位置搭新發布時間、文件 await 中切歌／換版及倍率同步 watcher 競態。另以實際 Projection Hub 驗證同 epoch 文件換版不會誤送 full，並涵蓋拒絕重試、手動演出、pause／buffering／seek、early／late callback 與取消。

最終完整回歸 1001 files、9490 tests 通過、1 skipped；focused coverage 6 files／183 tests 通過，本輪五個 runtime 檔 statements 95.43%、branches 88.74%、functions 98%、lines 97.76%。本地 boundary clock 為 100% statements／95% branches；採樣 helper 100%。ESLint 與 production build 通過；build 仍提示大 chunk。新 shared runtime／HTTP routes／封裝資產皆未增加，未另做 installer 或硬體／OBS 驗收。獨立 code review 對最後產品修正 APPROVE。

全庫 Markdown 177 files、owned 檔案 Prettier、`git diff --check` 通過；可攜數據的 evidence hash 與最終 runtime source hash 再檢查相符。

可重跑 harness 與逐幀 raw 留在 ignored `tasks/lyrics-clock-fix-20261022/`；修正前 `tasks/lyrics-fine-clock-20261022/clock/` 的 13 份來源／證據 hash 保持不變。中間 run 保留：一次格式化造成 source bytes 漂移、一次同 epoch full 被拒，都未冒充最終驗收。未 commit。

## 細時間保留與連續填色（2026-10-22）

來源：`docs/operations/lyrics-continuous-fill-2026-10-22.md`。

本輪接續[時鐘配對修正](#時鐘採樣與發布配對2026-10-22)與[Output 長尾修正](#output-deadline-與首字準備2026-10-22)，補存既有模型細區間，先核對中日資料，再接本地 document reader 與 Output Focus。分段起點立即底線提示，細墨色依原模型單位起訖連續填入；不按下一起點猜唱完時間，不加平滑等待，不新增模型。

### 連續填色：資料與支援邊界

Decoder 保留上游 Word 的實際 `end`，原 `start` 算式與 coarse chunker 保持不變。`mapFineTiming` 以原 occurrence index 及詞的來源範圍對映；先驗 raw interval，再取整數毫秒。跨句框、缺 end、重疊或不合法範圍不補齊、不平移。只有 Chinese/Japanese 路由發布 fine，英文保留粗提示，混語維持原 unsupported。

Schema 2 的選用 `fineTiming` 與 starts-only chunks 分開，保存 `unitId/from/to/startMs/endMs`。Experimental wrapper 5／method 4 綁定逐句語言計畫及 `hfa-starts-fine-zh-ja-occurrence-v1` 配方。Fine 進入內容身份；前一 method 3/schema 1 可繼續讀粗提示，不會憑空補 end。非法或超出 count／bytes／wrapper 預算的 optional fine 撤除，有效 coarse 保留；損壞的已存檔身份仍嚴格拒絕。

使用[前輪自然片段研究](../research/lyrics-alignment/lyrics-fine-timing-clock-2026-10-22.md)原始結果離線重建，沒有新推論、下載或使用者 sidecar 寫入：

| 語言 | 原 Word spans | 保留有效 fine units | 跨句框拒用 | 保留區間時長                    | 最大保留間隙 |
| ---- | ------------: | ------------------: | ---------: | ------------------------------- | -----------: |
| 中文 |           117 |                 108 |          9 | 58–1472 ms；p50 319／p95 621 ms |       330 ms |
| 日文 |            74 |                  54 |         20 | 13–998 ms；p50 384／p95 900 ms  |       422 ms |

29 句 canonical 中，25 句有原 decode，均能保留部分合法 fine；另 4 句混語沿原路由拒絕。25/25 原 `mapStarts` 與 coarse chunks 逐值相同，也與原 raw preview chunks 相同。接受區間的文字範圍精確來自原 `words`，不是研究要求的 cuts；時間差僅整數毫秒取整，至多 0.5 ms。日文單位來源長度 1–4 個 UTF-16 code units，保留詞／mora 粒度，不拆出假漢字音素對映。

這證明資料保留及映射可用。原始模型首詞可能偏離 T1 錨點，且沒有新增人工唱完時間真值；區間合法不等於歌聲準確。模型有空隙時保留已填墨色並停住，不能把 gap 自動稱為已驗證靜音。字內填色只屬單位內視覺內插，不宣稱逐字聲學準確度。

### 連續填色：兩端顯示與安全降級

`useExperimentalLyrics` 沿用手動套用、來源／offset 身份與既有 publisher；public line 的 `estimatedFineTiming` 與 `estimatedStarts` v1 分開。Main 先保留全部 coarse ID／count，再驗 optional fine；Output projection、Hub 與 split Browser Source assembly 保留新 sibling。發布前若 fine 使文件超 bytes 預算，撤 fine 保留 coarse。舊 client 忽略新 sibling，原生 T2 優先。

繁轉以實際 converter 對 source partitions 轉換並重建整行，再驗目標 grapheme 邊界；不能只憑等字數猜範圍。無法精確重建就保留粗提示。Ruby、分頁邊界先要求完整 unit 可對映，跨界不生成新時間。其他模板與 Self-View 本輪維持既有行為。

`lyricsFineFrame.mjs` 持有純投影；`lyricsFinePaint.mjs` 只持有局部動畫。Fine 單位以 grapheme 小格分配原單位的顯示進度，資料仍保留原單位起訖。多字單位可換行，跨行按閱讀序續掃，不形成改變容量的 atomic word。小格 fractions 不儲存、不傳輸，也不升成 T2。

播放使用實際媒體／Output 投影時鐘，線性填入；變速換算實際剩餘 wall time，commit 成本從剩餘時間扣除。Output 保留現有 `displayDelay` hold；暫停／buffer 凍結，seek／rate／offset／取消套用直接重定位與取消舊動畫，不補播錯過的畫格。填色畫格沒有逐幀 IPC、模型、文字轉換、DOM 重建或幾何量測；內容／容量失效與本地捲動仍由既有 owner 準備及量測。

字形基底保持實色，副本透過 clip 顯色並使用空 alternative text；forced-colors 關副本，保留原文字與底線。Local fine 列恢復文字前景並取消原 accent 底色，時間戳、未建模文字及讀音不會深字深底。Ruby 保留既有字級／sheet 浮動定位及間距。

Browser Source 細時間上限為 version-one 固定值，測試核對 canonical 上限；沒有引入 JSON-module 語法或公共 JSON route。新 JavaScript 模組維持 exact routes、封裝 globs 與閉合模組圖測試。

### 連續填色：驗證方法與中間修正

沿用前輪可見隔離 Electron、真 HTMLAudioElement、24 秒靜音 PCM、26 個已知字與每 500 ms 粗起點、相同 pause／seek／rate／offset 控制及 350 ms steady filter。Before starts-only；after 唯一顯示資料差是每字增加 350 ms fine 區間及 150 ms gap，以量到啟用動畫的成本。Known timings 與合成 owners 不冒充自然模型準確度或完整使用者曲庫／OBS 驗收。

診斷與性能分批。逐幀 computed style、pseudo clip、動畫／節點 identity、PNG、AX 等觀察只在可見診斷開啟，不混入冷／暖性能分布。首次 activation 仍先看全部 transitions，再篩 steady/control window；重入及 unmatched 原始資料保留。

過程中的失敗與中間版本均保留在 ignored evidence：

- Windows snapshot alias 未正規化，曾建立兩個 `usePlayer`／Audio；真播放器正常，觀察器抓到空元素。修 harness 並 assert Audio count = 1，這些 timeout 不當產品延遲。
- 最初 Output split assembler 漏新 sibling，單獨 renderer 測試不能證明交付；先補 RED，再接完整重組。
- Word inline-block 曾改變容量，改 grapheme paint cells；9 字寬／3 行案例的 20 字保持三行完整顯示。
- 進度數值正常曾不代表畫面有填色：`@property inherits:false` 使 pseudo 永遠裁到 0%；local 82／Output 81 筆中間值的 pseudo clip 仍固定 100%。改成繼承並檢查真正 pseudo／像素；該中間版本的六次性能 run 不能當最終可見版驗收。
- 審查發現 Output display-delay plateau、透明字高對比退化、fine 擠掉 coarse 預算、ruby scoped styles／配色遺失，均補回歸並修正。

### 連續填色：同案例最終結果

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

### 連續填色：自動檢查與範圍

完整回歸 1005 files、9538 passed、1 skipped。最後 fine 前景色補正後另跑 5 files／49 tests，production build 與 ESLint 通過。Producer focused 15 files／151 tests，Python serializer 9 tests；四個顯示核心 runtime 的 focused coverage 為 statements 96.03%、branches 89.34%、functions 95%、lines 97.15%，未降低門檻。封裝邊界、closed HTTP graph、fine 固定上限 3 files／48 tests 通過。

這是 focused coverage，沒有重跑全庫 coverage ratchet 或 installer。真 OBS／音訊裝置／螢幕呈現延遲及自然歌聲人工 timing 真值未驗收。舊結果要取得 fine 需要由既有分析流程重新分析；在此之前仍可套用原粗提示，沒有自動重算曲庫。

首字後續拆分量測與修正見[Output 細填色成本驗證](#細填色首字成本2026-10-22)。它以本文件的可見連續填色版為新基準，原始 starts-only／fine 分布與限制維持原值。

## 階段總結（2026-10-22）

來源：`docs/operations/lyrics-milestone-2026-10-22.md`。

整理日期：2026-10-22。本文集中本輪交付與尚未解決的限制；產品狀態以[規格](../spec.md)為準，行為以[歌詞時間契約](../contracts/lyrics-timing-contract.md)、[聲學估計契約](../contracts/lyrics-acoustic-estimate-contract.md)與 [Output 契約](../contracts/output-runtime.md)為準。日期報告保留各自當輪的原始結果，不回改歷史數字。

### 階段總結：已交付範圍

| 分組               | 變更與界線                                                                                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 共用容量與連續填色 | 單語／混語長句沿共用候選、時間篩選及容量規劃換行／分頁。只有整句 T1 時可依整句時間估計分頁，保留 T1 身分並限制過快切換；T1+ 使用可接受的估計，來源 T2 優先。不新增語意模型。                                                  |
| 時鐘與資料         | 以媒體元素採樣配對本地／Output 發布時間，修正 deadline。既有模型的有效細起訖與來源文字範圍經 sidecar、projection 傳到顯示端；不以後一塊起點或句尾冒充詞塊終點。                                                               |
| 連續填色成本       | 本地與 Output Focus 保留分段起點即時提示，同時在有效細區間內逐步由左至右填色，時長可變速；不新增平滑等待。細結構快取、同字形節點及嚴格時鐘等價重用減少重算／commit。                                                          |
| 冷啟動與容量修正   | 串接同次 deadline、callback、prepare、commit 與首字觀測，對照 Chrome Paint 候選事件；首字對應的 paint 仍未證明。縮減整頁候選工作，容量使用實際細填色盒與來源範圍，修正 Latin kerning 的三行低估。DOM 觀測不等於實體螢幕呈現。 |

分組依序保留可用介面及其回歸測試、契約、封裝清單與證據；本輪提交不包含其他 UI／佇列引導或 offset 研究，亦不 push。

### 階段總結：驗證與同案例結果

[連續填色報告](#細時間保留與連續填色2026-10-22)保留中日細時間／文字映射與兩端功能證據；[細填色成本報告](#細填色首字成本2026-10-22)區分準備、commit 與畫格等待；[冷啟動長尾報告](#冷啟首字與舊分組排查2026-10-22)保存完整交錯 A/B、全部慢值、控制窗與量測限制。較早的[時鐘修正](#時鐘採樣與發布配對2026-10-22)及 [deadline 修正](#output-deadline-與首字準備2026-10-22)各有原案例分母，不與後續輪次混算。

最終正式 A/B 共 16 次：每版本 cold 5 次、warm 3 次，1,364／1,364 envelopes 接受。Output cold 每次首字觀測的中位為 15.960 → 13.258 ms，最大值 26.783 → 15.014 ms；warm 中位 9.110 → 7.431 ms，最大值 10.117 → 9.283 ms。這是本批顯示觀測，不能保證每次或所有設備改善，也不是歌聲人工時間誤差。

共同首次 activation 的 Output cold p95 為 15.854 → 14.526 ms，warm p95 為 14.320 → 10.939 ms；warm 最大值仍由 17.535 → 20.970 ms。Local cold 中位及最大值也未改善，Local warm 保留 200.473 ms 慢值。每次首字與共同起點是不同分母，完整表格與原值見冷啟動報告。

本次前三組精確提交版本的完整測試皆為 1,005 檔通過，依序為 9,536／9,542／9,568 passed，各 1 skipped；三組 lint、production build 與文件檢查均通過。第四組僅整理文件，產品碼不變。

最終產品階段完整測試為 1,005 檔、9,570 passed／1 skipped，lint、production build 與文件檢查通過；提交時另按各組精確暫存內容隔離檢查，不把混合工作區的 UI 測試數當作歷史各組數。有效 fine 容量另驗 CJK 三行／分頁、窄寬邊界、中英混語、Latin kerning 與 ligature，核對來源完整、細 cells、頁內行數及下一句隱藏。可見測試也驗逐步中間填色、pause／seek／rate 與同 DOM 節點；不是實體 OBS／硬體像素驗收。

### 階段總結：保留的問題與下一步條件

| 問題                  | 已知證據與下一步條件                                                                                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 舊分組結果仍整塊跳亮  | 舊 starts-only 格式缺少細起訖，保持分段起點提示。使用者已確認沿用先前結果，但未讀取其特定檔案；不能宣稱該檔已核對或自動升級。支援的中日來源需重新分析並手動套用合法細時間，程式升級本身不補造終點。                               |
| 支援範圍              | 細填色接入本地及 Output Focus；其他 Output 模板未接。純英文／句內混語不因顯示端支援就取得可靠模型細時間，維持既有 gate 與回退。                                                                                                   |
| Local warm 200.473 ms | 真首次 activation，附近本地 rAF 有 202.8 ms 空窗；原 run 無 trace，阻塞原因仍未知。額外兩次診斷未重現，且實際 trace 僅涵蓋 Output，不能據此排除本地 GC／長 task。若續查，須先驗全程序 trace 實際包含本地 renderer，再採同控制窗。 |
| 其他慢值              | Warm Output 最大值回退與 Local cold 回退照實保留。不能將 Output cold 改善寫成兩端所有起點或所有慢值改善；不刪慢值、不為平滑增加等待。                                                                                             |
| 品質與驗收            | 自然歌聲人工時間真值仍 pending；provider 代理、模型一致與合法區間不代替人工唱完時間。既有[人工清單](../operations/lyrics-timing-manual-acceptance-2026-10-21.md)不代填；正式模型 gate、預設下載及權重範圍證據不變。               |

本輪沒有重新推論模型、下載資產、改寫使用者 sidecar／canonical 時間或改 offset。installer、實體 OBS 與全庫 coverage ratchet 未另驗；後續工作需依尚缺的證據獨立決定，不把本表當作已排程執行。

## 冷啟首字與舊分組排查（2026-10-22）

來源：`docs/operations/lyrics-output-cold-max-2026-10-22.md`。

本輪承接[細填色首字成本驗證](#細填色首字成本2026-10-22)中完整控制案例的 cold 最大值回退。使用者另確認，目前「一個詞塊一個詞塊跳亮」沿用先前儲存的分析結果；資料能力和畫面排程分開驗證。

### 冷啟排查：舊結果與詞塊內填色

舊 schema 1／前一 method 的分組結果只有文字範圍與 `startMs`。相容讀取會保留原分段起點，模型提示的 `endMs` 仍為 null；沒有 `estimatedFineTiming` 時，本地 document reader 與 Output Focus 都沿原提示，不會自行產生詞塊內填色。

因此，缺少細單位的合法終點確實會造成這個降級。整句結束時間不能代替每詞終點，也不以相鄰詞起點偽造唱完時間。這次沒有讀取使用者指定的實際 sidecar，結論是已確認的舊格式路徑，加上使用者確認沿用舊資料；不能據此宣稱每份既有檔案都缺少終點。

可見隔離案例使用相同文字、粗分段範圍與起點，分別提供 starts-only 和明確標示為合成的合法細起訖。相同五字詞塊中途，本地／Focus 的細版皆為前兩字填滿、第三字部分填色、後兩字基色；Output 進度為 100／100／58.57／0／0%，實際 pseudo 裁切與 PNG 一致。舊版沒有細 cells。這證實現有塊內連續填色路徑可用，並非只有單字案例能動；合成 350 ms 終點不是自然歌聲的真實詞邊界。

既有重新分析流程可為支援的中日資料保留模型起訖與來源範圍；仍須通過映射／行框／範圍驗證。英文、未支援的混語、非法或跨範圍單位維持降級。這輪沒有執行模型、下載、遷移或回寫使用者 sidecar；其他 Output 模板也沒有新增細填色。

### 冷啟排查：同次執行事件鏈

原先 18.628 ms 的歷史極值沒有同次 trace，無法事後精確還原該次 task。新 trace 使用相同完整案例找可重現成本，不將新 run 的 stage 回填為歷史極值的直接原因，也不刪除舊 cohort。

診斷事件以 cycle、trigger、generation、delivery、revision、pass 與 timer ID 串接。Timer 保留 armed absolute deadline、callback、取消與過期事件；正式 commit 起訖另有有界數值 timeline marks，和 Chrome trace 對照。所有 trace 預設關閉，不加入播放等待或逐幀 IPC。

首次完整 cold 診斷由新 receive 觸發；前一個 timer 已取消、沒有 callback，不能把這次 commit 當作該 timer 遲到。追加兩次由 timer 觸發，callback 分別晚 1／3 ms。三次都保留完整 pause／resume／seek／rate／offset 流程，Chrome 只在啟動至原生媒體約 1.6 秒採樣，產品 trace 繼續完整流程。

三次修正前 fit 為 10.0／11.3／10.7 ms、皆 21 probes；prepare 為 10.5／11.8／11.0 ms，正式 commit 為 1.6／2.0／1.6 ms，commit 完成至下一 rAF 觀測為 0.2／1.8／0.1 ms。Chrome 中首次主要 Layout 為 3.854／3.814／4.038 ms。同步排版工作可重現，不能將整段首字晚到歸因為畫格等待；帶 trace 的數字也不代替正式無 trace 分布。

首次省 prefix 的三次候選 trace 原樣保留：probes 降至 1，但 fit 為 12.4／9.1／10.1 ms、prepare 為 12.8／9.6／10.7 ms，未形成一致總耗時改善。Layout 次數 22→2，移除的是次要小量測；主 Layout 仍約 3.5–6.1 ms，內部 shape 佔明顯部分。字型 DecodeFont 發生在首次 fit 之前，fit 內沒有 DecodeFont，不能歸因於當時正在等下載／解碼。

因此另增加預設關閉的 fit phase 摘要，拆樣式讀取、root／target 尺寸、probe 建立、wrapped 量測與 row／page planner；root／target／首次 wrapped 的單調時鐘起點一併保留。Page planner 包含 wrapped／rows，整體 fit 又包含其他階段，不相加。

補取的一次完整 phase trace 直接確認 root 尺寸讀取 3.6 ms；Chrome 主 Layout 3.539 ms 始於 root 讀取後 0.009 ms。Target 讀取為 0、probe 建立 0.4、wrapped 0.1、page planner 2.1 ms。這不支持把 canvas 初始化當主要阻塞，也不需要盲改字型載入；完整頁已可容納時，planner 仍建立拆分候選，則是另一段可避免工作。

最終三次 full cold trace 的入口也為 update／timer／timer，fit 8.2／10.2／7.2 ms、prepare 8.6／10.7／7.7 ms、commit 1.5／1.3／1.8 ms、probes 皆 1。Root 讀取 3.2／4.6／3.1 ms、page planner 1.0／0.9／1.1 ms，其中 wrapped 為 0.6／0.4／0.6 ms。主 flush 仍在，沒有用移動起點將它隱藏。

這三次帶 trace 首字晚到 15.126／16.192／17.104 ms，commit→observer 0.1／0.2／3.2 ms；修正前首字為 14.952／19.643／13.888 ms。因此不能單看診斷批宣稱首字普遍更快，正式結果使用下一節的獨立無 trace 交錯批次。初版較慢 trace、單次 phase trace 和最終 trace 均保留，不用快例替換。

Prepare 包含 fit，fit 包含量測 render 與瀏覽器 layout；這些時間不能加總。Commit 完成到下一 observer 是可觀察性等待，空白至 active 的兩個 rAF bracket 則包含更多未知工作，不能互換。Chrome 中同 renderer／frame、細文字 class 的 Paint 只能列為候選，尚無首字 unit-to-layer 對應，真正首字 paint 與硬體／OBS 呈現仍未知。

跨程序 main send 記錄在 native send 呼叫前，觀察用 WebSocket 時間則是 JS listener 執行時刻，兩者之差包含傳輸與派發排隊，沒有拆成單獨 wire time。正式 receive 按 delivery 關聯，再以 epoch／revision 配對來源發布與 main 接受，避免 revision 重用錯配。

### 冷啟排查：修正範圍

Focus 自行換行，並不使用逐行文字切片。完整頁面經實際 wrapped DOM 嚴格證明高度不超過可用行數、水平不溢出後，省略逐行 prefix probes，仍使用共用頁面／時間 planner。每個接受頁保留自己的多行 metadata；單頁兩／三行仍會啟用 fit 並隱藏下一句。第四行不能直接通過，仍沿原分頁與最短停留規則。

共用 planner 先驗整句容量，通過時建立原來相同的單頁物件，省掉不需要的候選／grapheme 搜尋，之後完整執行原時間判斷。未通過才沿原拆分。T0 未定時間、T1 版面估計、T1+ 模型起點與原生 T2 優先順序不變，短停留與 rate 邏輯也不直接略過。

真 fine DOM 邊界驗證另發現既有容量低估：Times New Roman 的 `AV` 重複案例，純文字 probe 判定三行，48 個實際細填色盒卻排四行；修正前 snapshot 也能重現。當時仍 contained 於整個畫布，不誇稱已經超出畫面，但已違反三行預算。

Focus probe 因此按目前行的 coarse／fine 範圍重現影響換行的盒結構：只有完整可對映的細單位拆成與正式畫面相同的 grapheme inline-block，其餘保留文字；不建立動畫或偽時間。Planner 為容量 callback 傳入可選來源範圍，候選與多行 metadata 都按該範圍對應，不能用文字搜尋猜重複片語的位置。跨 coarse／page 的部分單位沿原降級，第四行不允許被純文字結果重新接受。

換行、tab、頭尾空白、未通過嚴格 proof 的候選、其他模板與沒有新 metadata 的注入量測，維持原 row planner。快取及 resize／字型／設定失效沿原規則；沒有建立未來歌詞 DOM、整首預排、等待字型、提前起點或補播動畫。分段起點提示與有效時間內的連續填色仍在同一次正式 render。

### 冷啟排查：同案例驗證

正式完整交錯 16 次皆正常結束，1,364／1,364 次 envelopes 接受。以下為本輪新 cohort，沒有沿用上一輪數字代簽。

主要 baseline 為這輪凍結的既有可見 fine 版本，候選亦啟用相同 fine 資料；舊 starts-only 僅另作功能診斷。Visible Electron 內使用真 HTMLAudioElement／播放器／歌詞 owner／publisher→Hub→server→正式 Focus，PCM、26 個粗起點、每單位 350 ms 細時間與 150 ms gap 相同，完整跑 pause／resume／seek／rate／歌詞 offset 控制。Output displayDelay 固定為零，不能由這批推論非零值。

兩份 snapshot 各 2,497 檔；產品來源差異只有 `overlay/lyrics/lyrics.mjs`、`overlay/lyrics/lyricsFit.mjs` 與 `shared/presentation/lyricsDisplayLayout.mjs`，沒有混入其他 UI／佇列改動。最終 runtime 與功能／phase 診斷版的 runtime hash 相同。

Cold 為新程序、profile 和 Output document，並非清空 OS／磁碟／字型全域快取；warm 在同一視窗先播放再重設。每版 cold 5、warm 3，AB／BA 交錯，性能不開 trace，也不執行幾何／computed pseudo 觀測；功能與 trace 批次獨立。重負載測試／build 與可見性能互斥。

首字及共同起點使用 signed wall ms，正為晚、負為早。中位數採標準兩中值平均，另保留 nearest-rank p50／p95；cold n=5／warm n=3 的 p95 等於本批 max，不是人口尾部分位估計。每個 phase 的首次 activation 先去除 re-entry，再套原控制排除窗；未配對、控制窗與所有慢值另列，不跨 seek／rate／offset 插值舊連續時鐘。

| Output 首字（ms） | n／版 | 中位數 before → after | p95／最大值 before → after |
| ----------------- | ----- | --------------------- | -------------------------- |
| Cold              | 5     | 15.960 → 13.258       | 26.783 → 15.014            |
| Warm              | 3     | 9.110 → 7.431         | 10.117 → 9.283             |

Cold 首字 raw，按 run 順序保留：before 為 14.192／14.278／20.469／26.783／15.960 ms；after 為 13.258／9.210／14.526／11.341／15.014 ms。本批中位減少約 2.70 ms，最大值減少約 11.77 ms；樣本仍小，不能保證每次或所有設備都改善。

| 共同首次 activation（wall ms） | 配對 n | p50 before → after | p95 before → after | 最大值 before → after |
| ------------------------------ | ------ | ------------------ | ------------------ | --------------------- |
| Local cold                     | 166    | 6.814 → 8.224      | 15.580 → 15.643    | 19.590 → 21.970       |
| Output cold                    | 169    | 4.541 → 4.345      | 15.854 → 14.526    | 26.783 → 17.224       |
| Local warm                     | 101    | 8.477 → 4.827      | 16.375 → 16.000    | 25.814 → 200.473      |
| Output warm                    | 104    | 5.154 → 3.537      | 14.320 → 10.939    | 17.535 → 20.970       |

Output 整體共同起點 p95 下降，但 warm 最大值回退 3.44 ms，原值保留；local cold 中位與最大值也較慢，不能將這輪結論寫成兩端所有起點皆改善。

Local 200.473 ms 為 after／warm-2 的 `rate:6000` 真首次 activation，rate 1.25、歌詞 offset 0，並非 re-entry 或誤配 200 ms offset。本地 rAF 樣本有 202.8 ms 空窗；恢復時原生媒體已約 6235 ms，歌詞時鐘仍約 5984 ms，下一個觀測才見對應文字。Output 約早 201.7 ms 已顯示相同字，同窗最大採樣 gap 約 29.2 ms；原正式 run 沒有 trace，無法認定 GC、OS、JavaScript task 或 paint 為原因。

Warm Output 20.970 ms 位於 after／warm-3 的 `offset:10000`，offset 200、rate 1.25，同時 local 相同起點約 21.250 ms，兩端 observer 都有約 20.5 ms gap。這是保留的慢觀測，不由兩個 rAF 端點推論 commit 或硬體呈現。

另以 before／after 各一次完整 warm Chrome 有限診斷，不混入正式 16 次分布。實際 debugger trace 只涵蓋 Output，沒有 local PID／本地 UserTiming 事件；harness 原本 intended「all-renderer」標籤不成立，分析明確更正 actual scope。兩份 trace 約 65.4／53.9 MB，保留原檔，不能據此聲稱本地沒有 GC／長 task，也不能解釋原無 trace 的 200 ms。依有限診斷範圍停止追加 run；若後續追查本地，須先用隔離 Electron 全程序 contentTracing 驗實際 renderer 覆蓋，再對同控制窗採樣。

這兩次新增診斷的 local `rate:6000` 觀測為 6.882／0.653 ms，全窗最大 local gap 為 39.5／12.6 ms，沒有重現 200 ms；這只描述新增 run，不排除原問題。額外 168／168 envelopes 接受，獨立於正式 1,364 筆分母。

共同首次 activation 共 540 筆，完整穩態 first before 549／after 551，20 個未配對另保留；phase 端點與控制排除窗的差異不以刪掉慢值處理。原 all-transition legacy rows、負值與重進入資料同樣保存。

### 冷啟排查：程式與功能驗證

Trace、整頁快速接受與 fine 結構量測均先新增失敗回歸，再驗證修正；包含停用 trace 不採樣 phase clock、時間白名單、單頁多行與下一句、第四行拒絕、重複文字來源位置、跨 coarse／page 單位、T0／T1／T1+／原生 T2、rate、短停留與未定 end。產品差分經獨立審查通過。

最終完整測試 1,005 檔、9,570 passed／1 skipped，ESLint 與 production build 通過，既有大 chunk 提示保留。較早一批有四個 Windows rename EPERM；獨立重測與短工作區 TEMP 後通過，原失敗日誌保留。其間一個新增測試錯把 geometry 讀取次數當契約，已修正為核所有讀取皆無跨 coarse 細盒，再以完整測試通過，沒有放鬆產品容量斷言。

有效 fine 容量六個案例皆通過：CJK 恰三行、四行分頁、窄寬邊界、中英混語、Latin kerning 與 ligature。AV 修正後第一頁來源 0–45 為三行、44 個合法細 cells；第二頁 45–48 一行、沒有完整細單位。跨頁單位 44–48 兩側都保持原文字，不補時間。各頁來源無缺漏／重疊，文字完整、矩形 contained、下一句隱藏，cell 數量／ID／paint fractions 亦依完整單位核對。

早期容量 fixture 少了新增第二行的估計，owner 正確拒絕為 stale、實際 fine cells 為零；這批保留為 harness 失敗，不能當作 fine 通過。有效新 fixture 與正式性能案例分開，原性能單行資料不受影響。

控制診斷另驗真 pseudo clip 有連續中間值、同 DOM node 持續，pause 凍結且無 running 動畫，gap 完成保持，seek／rate 立即重定位；AX 首字只讀一次、基底文字完整。這些功能採樣不混入性能分布，原生 T2 沿程式回歸，沒有冒稱新增自然歌聲或實體 OBS 驗收。

Root 另直接檢查 starts-only／fine 同詞塊、CJK 三行容量、AV 修正前四行與最終三行首頁／一行末頁 PNG。最終 source snapshot、功能／phase snapshot 與 live 三個修改 runtime 的 hash 一致；268 項 evidence 的 bytes／SHA 經獨立核對，16 次性能 run 皆 visible、唯一 Audio owner、來源穩定且無錯誤，fixture 粗起點／細時間／文字／控制值逐值一致。專屬 Electron 程序已全部退出。

### 冷啟排查：結果與剩餘界線

本輪縮減已重現的重複量測與單頁候選工作，修正真細填色盒的容量低估；Output cold 首字在本批交錯比較改善。分段起點即時提示、有效模型時間內連續填色、既有 deadline／hold／播放器時鐘保持，沒有平滑等待、提前起點、補播或新 offset。

主 root layout／字形工作仍存在，local 部分分布及最大值沒有全面改善；原 local 200 ms 長空窗仍未定位。舊分組結果仍需取得合法細起訖才有細填色，這輪沒有執行新模型、下載、改寫使用者 sidecar／canonical 時間或建立 commit。自然歌聲人工時間真值、實體 OBS／硬體像素呈現、installer 與全庫 coverage ratchet 均未另驗。

完整 signed raw、matched／unmatched／legacy／控制窗、所有慢值、診斷與功能結果、來源 manifest 和相對 evidence hashes 見[可攜資料](../research/lyrics-alignment/data/lyrics-output-cold-max-2026-10-22.json)。原 frozen portable SHA256 為 `b436514e27a796151dd427bd28e5d4b9faefd74572de3b18eea6a673e3947914`；持久 JSON 經格式化後與原資料逐值相同，SHA256 為 `04ead95437587cf3fa70c706f9f4dd145b20135d8e0cff84087361ba519d9cdc`，未含私人絕對路徑。產品、harness、量測方法及資料均經獨立審查通過。

## 細填色首字成本（2026-10-22）

來源：`docs/operations/lyrics-output-fine-cost-2026-10-22.md`。

本輪承接[連續填色驗證](#細時間保留與連續填色2026-10-22)所記錄的首字增加量，將目前可見連續填色版作為主要基準。分段起點底線、模型細時間、來源文字範圍與現有播放器時鐘保持一致。

### 首字成本：量測邊界

案例沿用可見隔離 Electron、真 HTMLAudioElement／usePlayer／歌詞 owner、publisher→Hub→server→WebSocket→正式 Focus 路徑；24 秒 16 kHz 靜音 PCM、26 個每 500 ms 的粗起點、每個細時間 350 ms 與 150 ms gap。兩版都啟用同樣細填色，沒有將 starts-only 與 fine 的差異混成這輪最佳化效果。

Cold 是新程序、profile 與 Output document，不是清空 OS／磁碟／字型全域快取。Warm 在同一視窗先播放到 1.2 秒，再重設播放與觀測資料。首字短案例播放到 1.3 秒，各版各 10 cold／10 warm；完整案例各 3 cold／3 warm，沿用 pause／resume／seek／rate／offset 與 350 ms steady 排除窗。診斷 trace 和可見填色／截圖驗證另跑，不混入無 trace 性能分布。

### 首字成本：成本拆分

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

### 首字成本：修正內容

Focus adapter 將靜態結構識別移至每個 fine frame 共用的 context，建立模型單位 ID 索引；文字、來源範圍、單位 ID 或起訖時間不同即使用不同結構。強引用快取至多八份結構、每份至多 256 個範圍 parts，另以 WeakMap 對應不可變 frame；不保存時鐘或進度。來源有序時以範圍查找取需要的單位，避免每個粗節點掃描整行或每個 cell 線性查找。

當一個完整 grapheme 恰好涵蓋整個粗分段，直接在原粗 span 填色，保留其文字、身份與底線，不再清空文字後建立相同細子 span。多字模型單位仍切成原有可換行 paint cells；跨粗分段或頁面而無完整單位對映時保留原降級規則。清理時移除細填色 class、資料與動畫，保留粗身份；可讀基底、空 alternative text 與 forced-colors 沿原行為。

Output 僅重用仍有效、單位／速率／顯示範圍與取樣時鐘對映等價的動畫，直接省下取消、重建與進度重寫。任何錨點修正、seek、pause、rate、offset、不連續或過期動畫仍即時重定位。等價只容許 IEEE 浮點表示誤差，沒有視覺容忍時間或平滑門檻。本地呼叫預設不啟用這個重用最佳化，沿用現有更新方式。

時鐘含 Output hold，必須比較完整分段函數：兩個 advance 時點都已到達時才可用前進直線等價；仍在 hold 時，position 與 advance 時點都相同才可重用。獨立審查指出「position 與未來 hold 同步前移」會使直線相同、保留期卻不同；已先新增失敗回歸，再修正為立即重定位。

首次需要的未來動畫仍依原方式預排，沒有改細時間邊界、另造時鐘或縮小動畫窗口，也沒有把細填色延後到 rAF／timeout／idle 補做。先寫底線並不能讓瀏覽器略過同一 JavaScript task 的剩餘工作，因此目標是直接降低同步成本。

### 首字成本：程式驗證

細分 trace 先驗證兩個失敗測試，再通過 122 項相關測試；結構／節點／重用再經失敗回歸與修正，最後八個相關檔案 170 項通過，涵蓋 clock、hold、控制、page、layout、fit、native T2 與 starts-only 行為。Trace-only 與最後產品差分均經獨立審查核准。

完整測試 1,005 個檔案、9,544 passed／1 skipped，ESLint、production build 與修改程式的 Prettier 檢查通過。三個 runtime 的 focused coverage：statements 89.48%、branches 81.65%、functions 86.44%、lines 90.68%；細 adapter 為 96.19%／87.71%／100%／98.9%，共用 painter 為 97.77%／95.52%／100%／100%。這不是全庫 coverage ratchet。Build 原有大 chunk 提示仍在。

沙箱預設暫存目錄的原子替換先出現 EPERM，改至工作區暫存後仍有硬連結測試受限；最後完整測試於允許硬連結的執行環境通過，兩次失敗日誌亦保留，沒有修改產品或降低測試要求來繞過。

### 首字成本：冷暖可見驗收

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

這組 cold 最大值回退後續另以同次 deadline／callback／prepare／commit／observer 事件鏈診斷，並執行新的完整交錯比較；見[冷啟動首字與舊分組結果排查](#冷啟首字與舊分組排查2026-10-22)。本頁歷史 cohort 與慢值保留，不以後續批次覆寫。

共同起點 p95 下降，但 cold 最大值仍有回退：Output 14.435→18.628 ms，Local 15.568→15.747 ms。這不是所有時刻都改善或固定延遲上限的證據；也沒有用提早提示、時間偏移或平滑等待換取分布。

最終可見診斷六組涵蓋 plain、容量、ruby、dark／light list 與 starts-only。單字直接沿粗 span 的 Output pseudo clip 有連續中間值，AX 首字只朗讀一次；20 字／四個五字單位在 9 字寬容量下，本地與 Focus 都是三行且 contained。Pause 凍結、gap 保留完成、seek／rate 即時重定位；root 另親自查看最終 plain／容量 Output PNG。原生 T2 沿程式測試回歸，沒有將本輪合成 T1+ 案例冒充新增的 T2 可見測試。

粗起點 first-active 與細填色的首次正進度／computed pseudo clip、整個模型單位的完成時點分開記錄。功能案例在第一個單位唱完前暫停，暫停前完成時間列 unknown；恢復後完成另列，不當作未中斷性能樣本。這些功能觀測不混入首字性能分布。

私人 raw、snapshot 與程序資料保留於 ignored tasks，對應可攜彙總在量測完成後以相對 evidence 路徑及 SHA256 記錄。實體 OBS、硬體像素／音訊延遲、自然歌聲的人工時間真值與 installer 不在本輪驗收範圍。

可攜資料見[同案例結果與 evidence hashes](../research/lyrics-alignment/data/lyrics-output-fine-cost-2026-10-22.json)。52 次正式性能 run（40 short＋12 full）共 1,551／1,551 次發布接受，全部 visible／sources stable、唯一 Audio owner、無錯誤；26 對 fixture 的粗起點、細時間、文字與控制值逐值一致。Trace／功能與 initial 診斷獨立保留，不混入這個分母。最終四個修改 runtime 與凍結版本逐檔 hash 相符，snapshot manifest 核對通過，專用 Electron 程序已全部退出；未執行新模型、下載或寫使用者曲庫 sidecar，未建立 commit。

## Output deadline 與首字準備（2026-10-22）

來源：`docs/operations/lyrics-output-tail-fix-2026-10-22.md`。

承接[時鐘配對修正](#時鐘採樣與發布配對2026-10-22)，本輪處理 deadline 疊加同步工作耗時，以及 Focus 首次樣式／容量準備的冷成本。T1+ 保留起點整塊即亮，沒有啟用掃字、提早提示或新增固定顯示延遲。

### Deadline修正：已定位的問題與修正

原 scheduler 在 compile／fit／DOM commit 前取一次時間，工作結束後再按該時間算出的相對 delay 排 timer。對現行函式注入 50ms 假工作時，100ms 起點被排到 150ms；150ms 假工作則排到 250ms 並先提交過時不可見狀態。這是算術驗證，並非宣稱真實工作一定花 50 或 150ms。

修正採絕對 deadline 減去實際已過時間。準備跨界時重新投影後才 commit；commit 自身跨界也追到當前時間，不逐段重播已錯過的提示。每輪最多兩次同步追趕，仍跨界則交給單一立即 task。新 generation、snapshot、suspend／stop 會阻止過期 callback；舊 callback 不得清掉新 timer handle。

冷 trace 的首次 Focus fit 用時 40.8ms，其中正式 DOM 寫入約 0.6ms，隨後 Chromium UpdateLayoutTree 為 34.487ms／33 elements，位於 computed-style／首次幾何讀取區間。21 次 probe 的數量本身不能解釋全部成本；暖快取起點沒有這筆首次 fit。相同診斷也記到排入 timer 的 deadline 比原 target 晚 42ms，而 timer 自身最大晚到約 4ms，分開了工作耗時與 timer 喚醒誤差。

條件式實驗只在播放前讀空 current 的樣式和幾何，沒有放入未來歌詞；glyph 數為 0、hidden 容器 rect 為 0。該次預讀 11.1ms，後續首 fit 為 6.7ms。據此採取較小修正：Focus 在設定、字型及啟用後排一個可取消的樣式準備工作，不做整首預排或提前接受容量計畫。正式 render 不等待它，來不及或後續失效時仍走原安全 fit／unfit 路徑。

修正後冷 trace 首 fit 6.7ms／21 probes，DOM 寫入約 0.7ms，首次 fit 區間最大 Layout 為 2.597ms，原 34.487ms 樣式長段沒有重現；所有 schedule deadline 與 target 差為 0，timer 本身仍有最多約 4ms 的晚到。這是帶 Chromium trace 的單次診斷；無 trace 的重複案例另報，不能拿兩種模式混算性能保證。

該次產品樣式準備耗 16.8ms，發生在首次 fit 前約 1.17 秒，另一次失效後準備約 0.1ms。成本被移到起點之前處理，並非整段 CPU 工作消失。修後 warm 正式 offset 換版 fit 為 1.9ms，對齊的個別 Layout／UpdateLayoutTree 小於 1ms；warmup fit 7.3ms 位於 Chromium recording 開始前，只由 API trace 支持。修前 warm 缺少可用的 navigation 錨，不冒稱同樣精準的逐事件對齊。

### Deadline修正：量測方法與邊界

原始基準、trace-only 基準及修正後 runtime 各自凍結並保留逐檔 SHA-256。使用同一自製 24 秒靜音 PCM、已知 500ms 起點、文字、pause／resume／seek／1.25×／+200ms offset 順序與正式 Focus 路徑。修前／修後各三次 cold 與三次 warm；cold 每次新 Electron，warm 在同一 Electron／Output 視窗先播同內容至 1.2 秒，再 pause／seek 0 後執行原序列，保留字型和 fit cache。

有界記憶體 trace 記錄 JS 階段耗時、target／deadline、cache hit／miss、probe 數與失效事件，結束後才匯出；正式 URL 預設關閉。Chromium trace 只用於冷／暖診斷。無 trace 性能批次保留原 rAF DOM 採樣方式，便於沿用比較，並記錄 cadence。JS commit、rAF 的 DOM 觀察與真正畫面呈現是不同證據；此案例沒有實體螢幕、音響或 OBS 延遲驗收。

原 350ms 控制後穩態排除窗與首 200ms 控制窗不變。另發現原 onset 計數會把已亮過段落在新錨點微回退後的短暫回亮計成新起點：修前 warm 案例的一筆約 500ms 極值屬此類，該段首次已在 offset 控制後 218.7ms 亮起，位於排除窗，之後約 4.2ms 的回亮不是首次晚到 500ms。原始值與 legacy 分布完整保留；另從全部 transitions 先記錄首次 activation，再套相同穩態篩選，兩種統計分開報，不以改分母隱藏視覺回退。沒有加 hysteresis 或改 offset 來美化數字。

此處沿用真 HTMLAudioElement、正式 Player／本地 boundary helper／實驗分段／Panel、publisher、Hub／Server 與 Focus；library／queue／session 等資料 owner 和起點為合成。完整使用者 App、自然歌聲同步與模型精度並非本批驗收。

### Deadline修正：同案例結果

以下為三次 run 合併的 Output 首次 activation，單位為依實際倍率換算的牆鐘毫秒，正值落後、負值提早；p95 並非三個 run 各自 p95 的平均。

| 狀態 | 次數前→後 | p50 前→後 | p95 前→後   | 最大前→後   |
| ---- | --------- | --------- | ----------- | ----------- |
| Cold | 99→100    | 4.75→3.36 | 14.19→10.27 | 18.82→14.03 |
| Warm | 102→103   | 5.41→3.29 | 11.87→10.20 | 15.87→14.51 |

各 run 的首字另比：cold 三次由 15.79～18.82ms 變成 6.65～8.65ms，中位 16.07→8.11ms；warm 三次由 0.16～9.42ms 變成 −0.22～4.10ms。只有三次首字觀測，不能以此當作穩定的首字 p95 或任意硬體保證。

以 run 配對、phase、已知 chunk 起點配對的共同首次 activation：cold 98 次，牆鐘 p95 14.19→11.83ms、最大 18.82→14.03ms；warm 101 次，p95 11.87→10.20ms、最大 15.87→14.51ms。未配對點逐項保留控制窗／phase 端點 context；全體與共同子集都報，沒有用換分母取代原結果。

Legacy 所有 transition 的 cold p95 同為 14.19→10.27ms；warm p95 12.00→10.20ms，warm 最大仍完整記為 399.80→14.51ms，其中修前 399.80ms 是前述約 499.75 媒體毫秒的 re-entry。修前 Output 有 2 次 re-entry、修後本批 0 次；這是觀測結果，沒有對播放錨點加單調鎖定或承諾不再回退。控制首 200ms、所有最大值與 frame cadence 另保留，不能把回亮重新命名後省略視覺異常。

12 次無 trace 性能案例的 envelopes 全部接受、來源 hash 穩定、視窗可見且沒有 renderer errors。三份 runtime snapshot 及前輪 run4 的 13 份證據 hash 保持不變；所有專用 Electron 程序已退出。帶 trace 的冷／暖診斷不混入此表；上一輪單次 56ms 長幀與本輪三次重複基準也不混算為同一比較域。

完整聚合、媒體／牆鐘單位、共同子集、未配對 context 與證據 hash 見[可攜數據](../research/lyrics-alignment/data/lyrics-output-tail-fix-2026-10-22.json)。私人 scratch 位於 `tasks/lyrics-output-tail-fix-20261022/`，保留原始 Chrome trace、逐幀紀錄與全部中間版本。

### Deadline修正：驗證與保留限制

完整回歸 1002 files／9501 tests 通過、1 skipped。隨後增加一項 cold trace／warm cache 無 probe 回歸，focused 3 files／126 tests 全通過；本輪兩個 runtime 的 statements 88.24%、branches 78.57%、functions 83.47%、lines 90.03%，通過既有 coverage thresholds，未降低門檻。這是 focused coverage，未重跑全庫 coverage ratchet。

測試包括 prepare／commit 推進時鐘、跨界與 bounded yield、較早 display-page deadline、late callback、rate／offset、舊 generation handle、suspend／stop、trace 上限與私密欄位、六模板 fit cache／容量與 T1+ active 全亮。ESLint 與 production build 通過，build 仍有既有大 chunk 提示；既有 exact routes／packaging boundary 測試包含在完整回歸，沒有新增 runtime 檔或安裝包驗收。

Markdown 全庫 178 files、owned 檔案 Prettier 與 `git diff --check` 通過；兩個最終 runtime 檔與可見量測 snapshot 的 hash 再核對一致。獨立 code review 與報告／harness／分母／隱私審查皆 APPROVE。

這批結果支持去掉可避免的 deadline 等待並降低首字工作成本；OS 喚醒、rAF cadence、原生 media clock 變動、GPU／音訊／OBS 及自然歌聲準確度仍有未量邊界。沒有承諾零延遲，沒有 commit。

## Focus 陰影候選撤回（2026-10-23）

來源：`docs/operations/lyrics-focus-copy-shadow-2026-10-23.md`。

已依使用者核准試做「只取消 Focus 填色複本的重複陰影」。兩來源結果不穩定，依事前門檻撤回；產品 CSS 已按本輪原始 SHA 精確恢復。沒有保留產品開關、暖機等待或新增排程，不 commit／push，本輪在此收斂。

### 陰影候選：唯一候選與範圍

候選僅新增 Focus scoped `fine-ink::after { text-shadow: none; }`。底字陰影、底字與複本描邊、clip-path 連續填色、粗分段 onset 提示、文字與所有時間資料不變。KTV 與其他模板不符合此 selector；本地螢光筆修復也未變更。

十六個實際冷暖 cycle 的 computed style 都確認：底字仍保留原本兩層陰影，底字／複本描邊均為 1.12px，填色複本仍存在。只有候選的複本陰影為 none，基線仍繼承陰影。靜態 review APPROVE 不等於性能 gate 通過。

### 陰影候選：固定對照與事前門檻

使用《找》同一音訊、LRCLIB／NetEase 兩份既有來源與已儲存分析，沒有重新分析、改來源／offset 或接入 BPM。每來源兩對交錯 A/B，共八個新 Electron 程序、十六個冷暖 cycle，依序 LRCLIB A/B、NetEase B/A、LRCLIB B/A、NetEase A/B；A 為基線，B 為候選。沒有追加追跑快值。

實跑 player／lyrics owner／clock／publisher／hub／正式 Focus 和 KTV，本地使用前輪正確註冊 v2 的真 Page／Panel bundle，其他 owner 仍隔離。Focus 900×540，啟動時置前；原音訊自然 1x 播放 65–72 秒，同程序再暖重播。Chrome trace 與內部 stage trace 都關閉；保留 rAF、樣式／幾何探針開銷，並非完全無探針或完整正式 profile 的性能驗收。OS／GPU driver cache 未清除，不能當首次安裝情境。

事前門檻為四個配對的冷啟首秒最大 raw rAF 間隔各改善至少 10%；冷／暖 p95 回退不得超過 0.5ms，暖播最大值回退不得超過既有約 4.3ms 的一個觀測畫格。任何不符／缺測就撤回。這是保守的候選保留門檻，不是統計普適保證。

首秒是 65–66 秒，後續自然窗是 >66–72 秒，跨界間隔另列。raw rAF 使用未篩原始連續點；媒體／cue 對照才另外以小於 25ms anchor 配對。p95 定義為排序後 floor(n×0.95) 的零起算項。rAF 間隔不能當 physical presentation、首字顯示延遲或 OBS FPS。

### 陰影候選：保留全部結果

下列均為首個媒體秒內的 Focus 最大 raw rAF 間隔，單位 ms；每列各一次冷／暖，方向為基線→候選，並非執行先後順序。

| 配對      | 冷啟最大間隔 | 暖播最大間隔 | 判定                  |
| --------- | ------------ | ------------ | --------------------- |
| LRCLIB 1  | 26.4→29.0    | 4.4→4.5      | 冷啟回退，撤回        |
| NetEase 1 | 54.2→44.2    | 5.4→4.5      | 冷 p95 4.5→5.1 超門檻 |
| LRCLIB 2  | 31.0→26.0    | 4.3→4.6      | 此對符合門檻          |
| NetEase 2 | 38.2→51.8    | 4.4→4.7      | 冷啟回退，撤回        |

兩個冷啟最大值改善、兩個回退；兩個來源內的方向都不一致，整體未通過門檻。暖播首秒 p95 均約 4.3ms，但這不構成冷啟優化成功。完整三個 surface 的每次冷暖分母、首秒／自然／跨界及全窗 p50／p95／max、每窗最慢值與所有失敗保留在[資料 JSON](../operations/data/lyrics-focus-copy-shadow-2026-10-23.json)及 ignored raw。

沒有選取最好的一次留下，也不將本輪數字與前輪全陰影移除、trace-on 或未註冊 v2 本地的 cohort 混算。只取消重複陰影，沒有證實能穩定減少目前冷啟尾值；本輪沒有新增 GPU trace，因此不把 rAF 回退歸因到特定 shader、GPU 純執行時間或排程事件。

### 陰影候選：外觀與顯示保留

另用凍結 A/B 副本跑兩來源可見 Electron，於同一 65.7 秒暫停位置保留透明 Focus／KTV PNG，並以控制明／暗底確認部分填色、描邊與陰影。原合成板下半暗底被視窗高度裁切，保留初版；唯一確認輪只重用原透明 PNG，以原圖尺寸單張顯示，八張皆完整可見，沒有重播或增加效能樣本。已檢視兩來源原圖／合成圖，底字效果與分段提示保留；並非 OBS、物理螢幕或人工聽辨接受。

八個實際效能 run 的本地全文差異為 0，所有發布被接受。Focus 26,841 個 raw／26,832 個配對樣本；有效觀測沒有橫縱溢出、隱藏有效列或超過 20% 的大幅進度退回，20,456 個部分填色及 16,631 個向前未滿進度觀測。KTV 底線為 0，原模板樣式保持。

本地 observer 沒有垂直／hidden 欄位，故這兩項列 unscored，不能把缺欄位當已驗證 0。Focus／本地只評分唯一文字的 post-onset 可見性，已評分部分無 missing，各有十六個未評分事件；early timing 仍 unknown。KTV phrase／page cue 身分不足，八十個事件未評分，不把 missing=0 宣稱 KTV 起點完整通過。已知停頓、模型 end／句尾與讀音跨組等前輪限制不在本輪修復範圍。

### 陰影候選：收斂與驗證

最初八個啟動因隔離 runtime 漏帶 package.json，於 mediaProtocol 間接 require userAgent 時全部在播放前退出。失敗保留且不算媒體樣本；補上靜態 metadata 後，先確認第一組實際冷暖完成才接續七組，批次也改為失敗即停止。這是測試器修正，未進產品；沒有改 baseline、抹去慢值或重跑已完成的媒體樣本。

候選已撤回，後續維持原陰影、描邊、即時分段提示與連續填色。這不表示冷啟 raster／shader 尾值已修復；它仍是未解的首次使用成本，本輪不再擴大 GPU、快取或模板改造。

撤回後六份聚焦測試、179 tests 通過；ESLint、201 份 Markdown、build 通過，build 保留既有大 chunk 警告。格式與最終唯讀 review 通過。機械 detector 在已精確還原的 CSS 上列出五個既有字型未宣告於 DESIGN 的警告，本輪未新增字型或修理此文件差異。沒有重跑不相關完整 suite 或 installer 打包。

七份使用者歌詞／sidecar／音訊與 717 份凍結 runtime／本地 bundle SHA 不變；產品 CSS 等於本輪原始 SHA，失敗候選保留於隔離快照。二十一個本輪 Electron parent（八個啟動前失敗、八個效能、四個可見、一次純合成確認）及含本輪 profile 的子程序全部退出。2,557 份 baseline 無其他非 owned 變更；原先 dirty 工作保留，HEAD 未變、index 空。原始資料、失敗、撤回與程序收據在 ignored `tasks/lyrics-focus-copy-shadow-20261023/`。

## Focus 畫格關聯與容量（2026-10-23）

來源：`docs/operations/lyrics-focus-frame-2026-10-23.md`。

2026-10-23。承接[句尾與停留驗證](lyrics-source-and-cues-2026-10.md#掃完停留與句尾界線2026-10-22)中
NetEase Focus cold raw rAF 最大間隔 41.6→58.3 ms 的未解回退。
實際保留診斷分批讀取與 renderer 安全回歸；容量讀寫重排受測後撤回，恢復本輪
凍結的原有容量路徑。分段起點提示、連續填色、模型時間與各模板外觀維持，
沒有加入顯示等待。下表的 final 是受測候選的內部名稱，不是目前交付的容量版本。

### 畫格容量：容量試驗與撤回

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

### 畫格容量：同次提交與回覆的證據

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

### 畫格容量：驗證方法

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

### 畫格容量：驗證結果

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
[去識別數據](../operations/data/lyrics-focus-frame-2026-10-23.json)。

同步測量與 cold raw max、自然播放／暖重播分開判讀。本輪不將 GPU 冷成本或原 58.3 ms
宣告完全解決；自然播放的單次回退均保留，容量候選撤回，性能改善 gate 未通過。

### 畫格容量：證據與限制

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

## GPU 拆解與本地呈現收斂（2026-10-23）

來源：`docs/operations/lyrics-focus-gpu-2026-10-23.md`。

本輪修復本地歌詞的螢光筆一致性；Focus 只做有限診斷並提出方案，沒有套用 GPU 外觀優化。原分段起點、細時間、已知停頓與時鐘保持不變，沒有新增顯示等待、暖機或 BPM。未 commit／push。

### GPU拆解：本地修復

原本普通整句使用整句底線，分析細時間則使用文字填色，且先前統一時移除了螢光筆。這是目前 renderer 的分支與 CSS 行為，不是舊 sidecar 儲存了另一種樣式。

現在 list／sheet 都固定在當前行使用既有螢光筆，僅版面各自保留。沒有逐字資料時不偽造逐字底線；有分段時間時保留即時藍色細底線，有合法細時間或既有 display-estimate 時，使用較粗的藍色底線連續向右延伸，文字保持原字色。進度仍由原媒體時鐘驅動，沒有新增動畫等待。高對比模式移除背景圖時，改以系統色整句外框維持當前行提示。

Output 沒有產品程式變更；Focus 保留原外觀，KTV 保留填字且不加底線。

### GPU拆解：GPU 診斷範圍

使用《找》原有 LRCLIB／NetEase 兩來源及同一原音訊，固定八次隔離啟動、十六個冷暖 cycle，每來源／效果各一次。順序為 LRCLIB 原樣、NetEase 無陰影、LRCLIB 無描邊、NetEase 無填色複本、LRCLIB 無填色複本、NetEase 無描邊、LRCLIB 無陰影、NetEase 原樣；沒有追加追跑快值。

每次新 Electron 程序與隔離 profile，Focus 前景、900×540；實跑原 player／lyrics owner／clock／publisher／hub／正式 Focus 和 KTV。各次先自然 1x 播放 65 秒起的窗口，再於同程序暖重播。主比較為 65–66 秒的原始連續 rAF 間隔，沒有先刪除不合格 anchor 配對點。這是 trace 與樣式探針開啟的成本診斷，不與前輪 trace-disabled 完整流程 cohort 混算。

停止 trace 的指令於媒體時間至少 67 秒送出；非同步 trace 輸出期間音訊仍播放，故實際結束秒數更晚，逐次保留於資料 JSON。它們不代表 67 秒之後的固定自然播放比較。沒有在量測中 capturePage，另行可見截圖不納入效能數據。

局部計時 harness 沿用前輪未註冊 v2 的 Panel，以保持成本拆解條件一致；因此本輪 GPU 數據不是完整正式控制台負載的驗收。修復後本地的可見檢查另用正確註冊的 v2 root 與真 Page／toolbar／Panel。

### GPU拆解：全部冷暖慢值

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

三個 renderer 的 UserTiming anchor 在十六個 cycle 均存在，最大相對偏移 0.186 ms。每 cycle 的 buffer 使用率、完整 rAF 分母／p95、GPU task／flush／等待與編譯數量、frame identity 是否配對均保留於[資料 JSON](../operations/data/lyrics-focus-gpu-2026-10-23.json)。缺少精確 aggregation bridge 的候選列為 unassigned，不拿相鄰時間戳補成 presentation 證據。

### GPU拆解：結論與待確認方案

這組有限對照支持：冷啟首次使用的陰影相關 shader／raster 準備是主要可疑成本；只去除描邊或填色複本不足以消除冷尾。尚未分離底字與填色複本各自的陰影成本，不能精確宣稱是哪個 CSS 宣告占多少 ms。

建議本輪在這裡收斂，保留模板外觀與既有完整流程資料，不因冷啟單次值導入暖機等待、ready gate、GPU flags、時鐘補償或停用平滑填色。GPU driver／OS cache 沒有清除，n=1 的新程序冷啟也不等於首次安裝；本輪不建立穩定改善 gate。

若使用者仍希望做一個最小產品候選，待確認後只評估「底字保留原描邊／陰影，填色複本取消重複陰影」。目前 `::after` 確實繼承兩層陰影，但上述整層移除實驗還不能證明僅移除複本就足夠。候選不得新增等待；先做兩來源有限冷暖對照及可見透明背景檢查，外觀改變或總成本未改善就撤回，不擴充模板／快取架構。截至這輪診斷結束，候選尚未實作。

後續已獲核准試做最小候選，但兩來源交錯冷暖結果不穩定，已精確撤回並收斂，詳見[候選撤回對照](#focus-陰影候選撤回2026-10-23)。

### GPU拆解：驗證與未解限制

本地兩來源自然播放可見檢查均有部分進度；另核對未套用整句、日文 T2、ruby、混語多行與 forced-colors，共八張確認截圖。無橫向溢出、無整句假逐字底線，原完整文字保留。第一次可見測試在重載第二來源時 watchdog 逾時，只完成兩張；原始失敗保留，確認輪改為每來源獨立視窗後八張全部完成。測試器生命週期修正沒有進產品。

既有 fine unit 跨 ruby 讀音組時，部分區域仍可能退回粗提示而沒有細進度；本輪沒有擴大修改共用細時間切片／讀音映射，也沒有把該限制當已解決。實際歌聲句尾、原生 T2 缺 end、可疑但合法模型區間等前輪未解問題仍保留；本輪不做新的模型時間推算。

效能 cohort 的本地全文差異為 0、發布全部接受、KTV 底線觀測為 0。這不是人工聽辨、完整正式 profile 或 OBS／物理螢幕呈現驗收。trace、所有慢值、原始來源 fixture、失敗、截圖及執行 receipts 在 ignored `tasks/lyrics-highlight-gpu-scope-20261023/`；來源及音訊保護核對另記於 audit。

聚焦九份測試、228 tests 通過；ESLint、198 份 Markdown、七份 owned Prettier 與 build 通過，build 保留既有大 chunk 警告。Impeccable detector 在兩個修改元件無 finding。最終唯讀 review APPROVE，forced-colors 問題已關閉；沒有重跑不相關的完整產品 suite 或 installer 打包。

七份使用者來源／sidecar／音訊與 5,946 份前輪凍結檔 SHA 皆不變；十個本輪 Electron parent 與含本輪 profile 路徑的子程序均已退出。Git index 空、HEAD 未變。本輪 baseline 另有三份文字模型研究腳本由平行工作變動，保留且未覆寫。
