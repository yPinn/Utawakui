# Output 歌詞長尾延遲與首字準備 — 2026-10-22

承接[時鐘配對修正](lyrics-clock-fix-2026-10-22.md)，本輪處理 deadline 疊加同步工作耗時，以及 Focus 首次樣式／容量準備的冷成本。T1+ 保留起點整塊即亮，沒有啟用掃字、提早提示或新增固定顯示延遲。

## 已定位的問題與修正

原 scheduler 在 compile／fit／DOM commit 前取一次時間，工作結束後再按該時間算出的相對 delay 排 timer。對現行函式注入 50ms 假工作時，100ms 起點被排到 150ms；150ms 假工作則排到 250ms 並先提交過時不可見狀態。這是算術驗證，並非宣稱真實工作一定花 50 或 150ms。

修正採絕對 deadline 減去實際已過時間。準備跨界時重新投影後才 commit；commit 自身跨界也追到當前時間，不逐段重播已錯過的提示。每輪最多兩次同步追趕，仍跨界則交給單一立即 task。新 generation、snapshot、suspend／stop 會阻止過期 callback；舊 callback 不得清掉新 timer handle。

冷 trace 的首次 Focus fit 用時 40.8ms，其中正式 DOM 寫入約 0.6ms，隨後 Chromium UpdateLayoutTree 為 34.487ms／33 elements，位於 computed-style／首次幾何讀取區間。21 次 probe 的數量本身不能解釋全部成本；暖快取起點沒有這筆首次 fit。相同診斷也記到排入 timer 的 deadline 比原 target 晚 42ms，而 timer 自身最大晚到約 4ms，分開了工作耗時與 timer 喚醒誤差。

條件式實驗只在播放前讀空 current 的樣式和幾何，沒有放入未來歌詞；glyph 數為 0、hidden 容器 rect 為 0。該次預讀 11.1ms，後續首 fit 為 6.7ms。據此採取較小修正：Focus 在設定、字型及啟用後排一個可取消的樣式準備工作，不做整首預排或提前接受容量計畫。正式 render 不等待它，來不及或後續失效時仍走原安全 fit／unfit 路徑。

修正後冷 trace 首 fit 6.7ms／21 probes，DOM 寫入約 0.7ms，首次 fit 區間最大 Layout 為 2.597ms，原 34.487ms 樣式長段沒有重現；所有 schedule deadline 與 target 差為 0，timer 本身仍有最多約 4ms 的晚到。這是帶 Chromium trace 的單次診斷；無 trace 的重複案例另報，不能拿兩種模式混算性能保證。

該次產品樣式準備耗 16.8ms，發生在首次 fit 前約 1.17 秒，另一次失效後準備約 0.1ms。成本被移到起點之前處理，並非整段 CPU 工作消失。修後 warm 正式 offset 換版 fit 為 1.9ms，對齊的個別 Layout／UpdateLayoutTree 小於 1ms；warmup fit 7.3ms 位於 Chromium recording 開始前，只由 API trace 支持。修前 warm 缺少可用的 navigation 錨，不冒稱同樣精準的逐事件對齊。

## 量測方法與邊界

原始基準、trace-only 基準及修正後 runtime 各自凍結並保留逐檔 SHA-256。使用同一自製 24 秒靜音 PCM、已知 500ms 起點、文字、pause／resume／seek／1.25×／+200ms offset 順序與正式 Focus 路徑。修前／修後各三次 cold 與三次 warm；cold 每次新 Electron，warm 在同一 Electron／Output 視窗先播同內容至 1.2 秒，再 pause／seek 0 後執行原序列，保留字型和 fit cache。

有界記憶體 trace 記錄 JS 階段耗時、target／deadline、cache hit／miss、probe 數與失效事件，結束後才匯出；正式 URL 預設關閉。Chromium trace 只用於冷／暖診斷。無 trace 性能批次保留原 rAF DOM 採樣方式，便於沿用比較，並記錄 cadence。JS commit、rAF 的 DOM 觀察與真正畫面呈現是不同證據；此案例沒有實體螢幕、音響或 OBS 延遲驗收。

原 350ms 控制後穩態排除窗與首 200ms 控制窗不變。另發現原 onset 計數會把已亮過段落在新錨點微回退後的短暫回亮計成新起點：修前 warm 案例的一筆約 500ms 極值屬此類，該段首次已在 offset 控制後 218.7ms 亮起，位於排除窗，之後約 4.2ms 的回亮不是首次晚到 500ms。原始值與 legacy 分布完整保留；另從全部 transitions 先記錄首次 activation，再套相同穩態篩選，兩種統計分開報，不以改分母隱藏視覺回退。沒有加 hysteresis 或改 offset 來美化數字。

此處沿用真 HTMLAudioElement、正式 Player／本地 boundary helper／實驗分段／Panel、publisher、Hub／Server 與 Focus；library／queue／session 等資料 owner 和起點為合成。完整使用者 App、自然歌聲同步與模型精度並非本批驗收。

## 同案例結果

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

## 驗證與保留限制

完整回歸 1002 files／9501 tests 通過、1 skipped。隨後增加一項 cold trace／warm cache 無 probe 回歸，focused 3 files／126 tests 全通過；本輪兩個 runtime 的 statements 88.24%、branches 78.57%、functions 83.47%、lines 90.03%，通過既有 coverage thresholds，未降低門檻。這是 focused coverage，未重跑全庫 coverage ratchet。

測試包括 prepare／commit 推進時鐘、跨界與 bounded yield、較早 display-page deadline、late callback、rate／offset、舊 generation handle、suspend／stop、trace 上限與私密欄位、六模板 fit cache／容量與 T1+ active 全亮。ESLint 與 production build 通過，build 仍有既有大 chunk 提示；既有 exact routes／packaging boundary 測試包含在完整回歸，沒有新增 runtime 檔或安裝包驗收。

Markdown 全庫 178 files、owned 檔案 Prettier 與 `git diff --check` 通過；兩個最終 runtime 檔與可見量測 snapshot 的 hash 再核對一致。獨立 code review 與報告／harness／分母／隱私審查皆 APPROVE。

這批結果支持去掉可避免的 deadline 等待並降低首字工作成本；OS 喚醒、rAF cadence、原生 media clock 變動、GPU／音訊／OBS 及自然歌聲準確度仍有未量邊界。沒有承諾零延遲，沒有 commit。
