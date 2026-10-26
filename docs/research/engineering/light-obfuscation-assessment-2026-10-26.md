# 輕量混淆候選與播放效能界線

日期：2026-10-26。基線為 `eeec8eda`，沿用 [ADR 0030](../../adr/0030-release-runtime-bundles.md) 與[正式打包驗證](runtime-packaging-verification-2026-10-26.md)。
本輪完成盤點與隔離探測，沒有改正式建置、安裝混淆器或新增執行時保護。數據見[機器摘要](light-obfuscation-assessment-2026-10-26.json)。
後續第一批接入正式 build 的結果與效能界線，見[第一批正式驗證](light-symbols-verification-2026-10-26.md)；本文保留盤點當時的範圍與探測證據。

## 結論與候選順序

建議先以來源模組 allowlist 做私有符號去語意化，保留公開匯出、函式名稱契約與資料欄位；先試兩個規則模組，通過正式包驗收才擴大。
這是現有 minify 的小幅補強，主要減少 helper 名稱透露的語意，不隱藏演算法、權重、來源端點或可觀察的產品行為。

| 優先序 | 實際來源模組                                      | 可保護內容                      | 本輪判定                                                                                       |
| ------ | ------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------- |
| 第一批 | `electron/lib/importRecordingPolicy.js`           | 匯入錄音比對與評分的私有 helper | 9 個具名函式中有 3 個非匯出 helper；只在 Main，無 timer／eval／name／toString 節點             |
| 第一批 | `electron/lib/artwork/releasePolicy.js`           | 封面提案評分、版本與排序規則    | 17 個具名函式中有 13 個非匯出 helper；只在 Main，無上述節點                                    |
| 第二批 | `electron/lib/lyricsProviders/recordingPolicy.js` | 歌詞錄音身分與 match band 規則  | 9 個具名函式中有 3 個非匯出 helper；背景取得歌詞也會呼叫，須額外驗自動儲存與失敗分支           |
| 第二批 | `electron/lib/lyricsProviders/candidates.js`      | 多來源候選合併、排序與自動挑選  | 14 個具名函式中有 11 個非匯出 helper；含多候選迴圈與時間軸比較，不適合額外字串解碼或控制流變形 |

四檔共 26,999 source bytes、49 個具名函式、30 個非匯出 helper。
這是來源模組量，不是可以從正式包移除的 bytes，也不是混淆後的效能數據。
函式呼叫頻率分類來自 caller 與程式流程的靜態核對，沒有將「非音訊」誤當成已量測低頻。

本輪重新用現有 build API 分別建六個入口：Main 346 modules、preload 2、Performer preload 2、reading 5、separation 50、probe 2；跨入口有重複，不能直接相加當作唯一模組數。
四個候選均只進入 Main，未進入其他五個入口。六份輸出與目前基線逐 byte 相同。

## 方法與增益

目前 Main 的區域變數與參數已壓縮；再把短名稱改成十六進位名稱，收益有限且可能增加長度。
`keepNames: true` 保留了具名函式的語意；本輪在現有 Main 找到四個候選的全部 49 個 `function <原名>(` 宣告。
保留函式／類別名稱也是 bundler 的明確相容能力，不能在整包直接關掉。[Rolldown keepNames](https://rolldown.rs/reference/OutputOptions.keepNames)

第一批可在 bundling 前只轉換兩個來源模組，沿用既有 Rolldown／Oxc 的 identifier mangler。
隔離探測使用目前安裝的 Rolldown 1.2.15，關閉 compress 與 source map，未啟用 property mangling；只在模組作用域縮短 binding。
此 API 目前由 Vite 的間接依賴提供；正式採用時須明訂建置依賴與 lock 契約，不能假設間接安裝或 experimental API 永久穩定。
保留該模組的所有公開匯出名，以及 `exports`、`module`、`require`、`__dirname`、`__filename`。
來源裡的 CommonJS module scope 不等於 Electron 的全域 scope；這不授權開啟整個 Main bundle 的 global renaming。

探測結果：兩檔的 16 個私有函式原名均不再出現，所有公開匯出 key、函式 `.name` 與 `.length` 保留；204 組匯入規則與 31 組封面規則輸出 deep equality 通過。
探測在記憶體編譯隔離副本，依賴仍使用目前來源；沒有把轉換結果接進完整 bundle，也沒有涵蓋所有錯誤或效能情境。
字元減少僅記錄於 JSON，不拿未壓縮 source 與隔離壓縮檔的差額宣稱比現有正式包更小。

後續若採用此方法，必須在最終 bundle 再確認私有名稱沒有被 keepNames／exports alias 還原。
映射與原始碼可留在私有建置證據，禁止交付 source map 或將映射寫進使用者 log；公開錯誤碼與診斷去重行為維持。

## 本階段排除範圍

| 範圍                                                                                            | 原因與保留方式                                                                          |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/composables/usePlayer.js`、`src/composables/player/`、`src/bgm/`、capture／queue／歌詞時鐘 | 播放、互斥、seek、時間與狀態傳遞保持現有輸出；第一階段 renderer dist 必須 byte identity |
| `electron/lib/vocalSeparationWorker.js` 及其音訊解碼／FFT／ONNX 依賴                            | CPU、記憶體與模型工作路徑；保持 separation bundle 與外部 native wrappers 原樣           |
| `electron/lib/lyricsReadingWorker.js`、日韓讀音、`electron/lib/lyricsAcoustic/probe.js`         | 字典啟動、process message、CLI guard 與 self-spawn 都有契約；保持 bundle 原樣           |
| 兩個 preload、Main bootstrap、IPC sender／schema、安全驗證、media protocol、Output／Spout       | 啟動與跨邊界風險高；需要明確可稽核的通訊與載入，不用全包 transform                      |
| `providerRequestScheduler`、`providerServiceCooldown`、重試／取消／工作 queue 與 gate lifecycle | 先前 rate limit 與 race 的敏感狀態機；不能把 timer／取消／提交點變形混進符號試驗        |
| `musicIdentity/`、曲庫 hydration／索引／持久化／交易                                            | 共用面大，可能批量或背景執行；候選模組的依賴不自動納入 allowlist                        |
| recipe／provider catalog、URL／hash／license／manifest、第三方與 Python 資源                    | 多為公開資料或需要穩定互通；混淆不能提供來源保密或防爬取，也不改必要 notices            |

Main 仍與其他操作共用事件迴圈，背景歌詞與封面工作也可能在播放時執行。
即使音訊 graph 沒變，增加 Main 初始化、CPU 或 GC 負擔仍可能影響操作回應，故不以「冷路徑」宣稱零影響。

## 混淆工具選項的界線

查核 JavaScript Obfuscator 5.9.0 的固定版本官方文件；`low-obfuscation` 仍開啟 string array、rotate／shuffle、selfDefending，並停用 console，不適合作為本案的直接預設。
官方也提醒 property renaming 即使 safe mode 仍可能破壞程式，selfDefending 對後續改寫敏感。[官方選項與 preset](https://github.com/javascript-obfuscator/javascript-obfuscator/blob/5.9.0/README.md#preset-options)

第一階段不需要新增混淆器，亦不引入 string-array lookup、Base64／RC4 decoder、字串切段、數值算式、control-flow flattening、dead code、自我防護、反除錯、定時檢查、domain lock、VM／bytecode 或 console 覆寫。
未來若另試字串查表，只能是獨立方案與逐字串 allowlist，排除輸出契約與迴圈，先實測增益與成本；不能因標示 low 就放入正式版。

## 正式實作前的驗收規格

1. 只轉換第一批兩檔；建立固定 allowlist 與 export reservations，未知模組／動態匯出應 fail build。保留開發來源與既有 lazy require／位置 transform；不得預先載入候選或改 require 成執行時解碼。
2. 先補紅燈測試：匯出 key、name、arity、CJS named import、輸入／輸出與排序、失敗分支、空資料、Unicode、編譯後 private name 缺席及相同來源的可重現輸出。不能只跑未混淆來源測試當成正式包驗證。
3. 對最終六入口核對：只有 Main 可以變，其他五個 bundle、renderer dist、worker vendor／資源與 unpack allowlist 不變；沒有 decoder、timer、eval、額外 native 或隱藏載入。
4. 以同一來源、同機交錯 baseline／候選，各至少 10 次 warm 與 10 次新 profile 啟動，保留 p50／p95、working set 與 outliers。若可重複的退步達 `max(基線 5%, 20 ms)`，或 working set 增幅超過 `max(基線 5%, 16 MiB)`，不晉級；這是建議回退門檻，不是已達成的效能承諾。
5. 候選規則使用同一離線 corpus；輸出必須全等，暖機後工作耗時若可重複增加超過 `max(基線 5%, 1 ms)` 就調查／回退。播放同時跑匯入與背景歌詞／封面，保留 Main event-loop delay 與 UI 回應量測，不能用獨立微基準代替。
6. 重跑正式包播放／pause／seek／next、一般與場次 queue、BGM／capture／cut、日韓 worker、probe self-spawn 與既有合成 ORT 管線；PCM 必須一致，新增音訊／解碼錯誤為零。可重現的卡頓或延遲即回退，即使啟動數字仍在門檻內。
7. 完整 tests、lint、Markdown、format、build、Windows dir／afterPack 通過；更新 focused contract／ADR 與打包清單的實際變更，才評估第二批。正式 OBS、真模型／GPU與長時間音訊驗收仍需單獨完成。

上述門檻只作為拒絕明顯回歸的最低條件，不能解讀為允許已可感知的播放退步。

## 本輪驗證與限制

既有六檔候選／caller 測試共 84 項通過；這是未接混淆的基線測試。
另外兩檔隔離符號轉換共 235 組輸出比較通過；六入口重建結果與當前 runtime 基線一致。
本輪未執行混淆正式包的啟動／播放驗收，不能宣稱已證明混淆零開銷。
尚未修改正式程式或 commit；建議實作順序為第一批私有符號、完整產物驗收、再評估第二批。
