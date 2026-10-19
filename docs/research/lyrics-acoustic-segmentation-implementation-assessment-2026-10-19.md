# T1 聲學切分：研究收斂與實作評估

本文保留當輪研究與分母；目前跨批次選型及未決項集中在[研究結論](lyrics-alignment-summary.md)。

日期：2026-10-19。狀態：研究結論與待實作提案；未啟用產品能力，未取代現行 timing contract。本文件作為本次研究入口，既有四份報告保留實驗條件與歷史結果。

建議先做中日文「T1 聲學輔助詞塊起點」預覽，採 HubertFA＋既有 Node 讀音工具為首選研究候選。顯示採詞塊切換／維持高亮，保留原歌詞、整句時間及正式 T2；未知切點合併，失效時回到現行 T1。正式模型選配仍須通過權重授權、整首處理、安裝生命週期與可見播放驗收。

## 研究決定與證據

使用者目標是已有整句文字與 T1，藉音訊找句內吸附點改善顯示。它與從零聽寫、整首找句子、完整字首／字尾 T2、verse／chorus 判斷是不同任務。

| 路線                          | 本次結論                                           | 採用範圍                                                |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------------------- |
| A 現行字長分配                | 無額外模型，仍是可靠回退                           | 保留產品基線                                            |
| B DSP onset＋單調／長度約束   | 中文有收益，日韓及長尾誤差未一致改善               | 留研究比較，不先設為通用預設                            |
| C 拍格線加入聯合解碼          | 探索組選出權重 0；非零設定確認組反而退步           | 預設關閉，不要求安裝 M1；不將結果外推為所有鼓點模型無效 |
| D HubertFA 歌唱音素           | 已知 T1 條件下，中日文起點有明顯收益               | 優先評估詞塊預覽；本 checkpoint 不支援韓文              |
| Qwen3 ForcedAligner／中文 CTC | 完整起訖另有用途，容量較大，字尾與負向案例未過關   | 保留對齊草稿候選，不為本功能預載                        |
| Silero／YAMNet／RMS           | 小容量不等於能辨識歌唱；漏唱、誤活動或休止召回不足 | 不作人聲／內容正確性的硬 gate；另做全靜音拒絕           |
| M2 段落模型                   | 有獨立中文小樣本結果，邊界精度與授權仍有限制       | 獨立能力；不把重複句或人聲空檔直接叫副歌／段落          |

中文確認組 4 首歌、152 個句內參考起點，quick 輸入下 A／B／C（固定權重 0.15）／D 的 ≤100 ms 比例為 28.3%／50.7%／44.7%／78.9%，D median 約 46 ms。中文外框由獨立標註合成，只給首尾，評分排除句首；這是已知粗定位條件，不是現有 provider T1 或整首自動定位的準確率。確認歌曲曾用於前輪研究，不宣稱全盲測，模型訓練重疊也未排除。

文字先決定詞塊、再取模型存在切點時，中文 102 個可評切點 A 28.4%→D 81.4%，保留 101／102。日文 148 個要求切點中只有 108 個外部參考可評，A 40.7%→D 78.7%；日文整體逐參考單位則為 164 個起點，D 70.7%、覆蓋 81.1%。日文外部時間未經人工確認，只能稱一致率；獨立日文只有單一樣本，不能外推語言整體。韓文保留現行 T1，不能承諾同等改善。

原曲已有可行收益：D 中文原曲 76.3%→quick 78.9%，日文外部原曲 68.3%→quick 70.7%。因此允許原曲起跑，有 guide 才重用；不自動重跑分離，也不固定假設 guide 更好。這輪 C 使用 Beat This! 的 beat lattice，沒有另外測四 stem drums 的 onset；不能寫成「鼓點切字已被證偽」。

強制對齊在靜音、倒序、錯音訊及純伴奏仍可產生合法時間，confidence 在靜音甚至更高。上述改善建立於文字與歌曲版本吻合；時間合法、非零輸出或較高分數都不能證明內容存在。中文獨立資料提供精度依據，既有逐字歌詞與模型段落紀錄只作參考／一致性檢查。

## 漸進環境決策

以下為十進位 GB，僅 Audio Python／候選對齊模型子集，不包含 app、FFmpeg、分離模型、音訊快取、下載暫存或 NTFS allocation。不得將磁碟容量當 RAM／VRAM。

| 層級                 | 使用者得到什麼                 | 容量與條件                                                                             |
| -------------------- | ------------------------------ | -------------------------------------------------------------------------------------- |
| 現行核心             | T1 字長估算、既有匯入／人工 T2 | 本功能不新增模型                                                                       |
| 中日文聲學候選       | 已知 T1 的詞塊起點             | 已有 Audio Python 時新增約 0.466 GB；完整候選獨立安裝約 0.491 GB                       |
| 與現有 M1 並存       | 歌詞輔助＋獨立 BPM／節拍能力   | 目前 M1 約 0.563 GB，並存約 1.029 GB；不是安裝本功能的必要前置                         |
| 多語完整對齊草稿候選 | Qwen 的另一種任務              | 前輪並集環境布局約 2.502 GB，舊環境保留並存約 3.032 GB；不同任務不能按兩輪分數直接排名 |
| 中文 CTC 草稿候選    | 中文起點研究                   | 前輪並集約 1.931 GB／舊環境並存約 2.461 GB；不因較省就增加第二個預設模型               |

HubertFA 最終研究環境使用現有 CPython 3.14.7、Node ONNX Runtime、kuromoji／wanakana，只新增 NumPy 2.5.2 與 pypinyin 0.55.0。二套件 probe 後 47,448,609 B，模型目錄 418,636,089 B，合計增量 466,084,698 B；無新增 Torch、CUDA、Python ORT 或 pykakasi。產品 Python 重算 358 案例與研究結果相同，這證明環境相容性，尚未證明完整安裝／啟用流程。

研究壓縮下載約 0.270 GB；依目前逐檔模型方式預算約 0.432 GB，仍需權重分發許可及 artifact hosting。正式選配 UI 必須等實際 manifest／archive 策略確定，分別呈現下載、安裝增量、更新暫存上限；不直接宣傳 0.270 GB。升級、失敗回復與移除仍需實量。

CPU 四 threads 的 65 窗口模型前端合計約 96.7 秒，窗口後取樣最大 Node RSS 約 1.445 GB。這不是連續峰值、整首端到端時間或低記憶體裝置保證。先做 CPU 版本；8／16 GB 裝置、長曲、播放同時分析與取消後記憶體回收列為實作驗收，GPU 配置暫無必要結論。

## 與現行程式的整合評估

| 現有邊界                                                                            | 已確認行為                                                                                 | 建議變更                                                                                              |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `electron/lib/library/lyricsTiming.js`、timing contract                             | 管理 canonical T0／T1／T2、來源 fingerprint 與正式 segments                                | 維持權威；聲學結果獨立 sidecar 與 validator，不藉 save-timing 冒充 T2                                 |
| `shared/presentation/lyricsTimingUnits.mjs`、`state.mjs`                            | 所有模板共用估算；非空有效 segments 優先視為 `t2`                                          | 增加獨立估計輸入與來源；完整保留現有回退，逐一盤點 phrase／page selector 的 authored-only 路徑        |
| `src/composables/useLyrics.js`、`lyrics/useLyricsSourceDocuments.js`                | canonical document 與非同步來源載入有單一 owner、request id                                | 隨相同來源身分載入估計；切歌／換來源後舊工作結果不能套到新文件                                        |
| `useOutputProjectionPublisher.js`、`shared/outputStreamContract.js`、Projection Hub | immutable lyric content 與 clock 分開傳送；內容經 validator 重建                           | 增加 bounded optional 估計內容與 revision；驗證舊客戶端回退，必要時協商新版本；不能只改 renderer 欄位 |
| `audioPythonRuntimeHost.js`、`audioPythonManifest.js`                               | environment／capability／worker 皆有限 allowlist；現有能力是 refined 與 structure-analysis | 新增歌詞能力、完整二套件 lock、模型 manifest 與明確 mapping；不塞進 M1 Torch 環境                     |
| `heavyJobScheduler.js`、`heavyJobSchedulerLifecycle.js`                             | 既有重工作排程與生命週期                                                                   | 共用排程與 lease；Node 模型＋Python decoder 需由一個受控 job 管理，不能直接套 Python-only worker 映射 |
| `audioPythonArtifactPreparation.js`                                                 | 固定來源、size／SHA、probe、immutable publication；目前下載為 buffer 路徑                  | 量測大檔下載峰值，評估串流寫入／hash與 bounded extraction，再處理修復、取消、清理與 rollback          |

架構風險主要是新增資料的身分與多表面傳輸、雙程序的生命週期及整首音訊處理。ONNX 可執行與 Python 可 import 已有研究證據，並不等於只剩 UI 開關。現有 timing contract 定義的是 ephemeral 字長估算；要持久保存聲學估計，實作前需提出 ADR／contract 擴充，而非悄悄改成新的現行行為。

## 第一階段規格草案

第一個可審查成果是「不下載模型也能驗證的詞塊預覽資料管線」，用合成 fixture 串通保存、載入與共用投影；下一個成果才是私有研究 worker 串接。實際 UI 先提供來源內的預覽、套用顯示、停用估計；不自動背景分析整庫。這些是提案名稱，尚非產品 API。

資料建議存放 `tracks/<trackId>/lyrics/acoustic-estimates/<sourceFilename>.json`，由 main 從已登記來源推導路徑。schema v1 至少分開記錄：

- 身分：canonical document id、來源 SHA、normalizer profile、每行穩定 id、原文範圍與 occurrence；同文副歌不共用時間。
- 輸入：音訊內容 hash／版本、原曲或 guide 的角色與分離配方、解碼 profile、用於推論的 T1 外框及 offset。
- 方法：模型 manifest hash、decoder／G2P／詞塊演算法版本、環境 lock hash、結果 schema；Node／ICU 分詞版本也屬可重現條件。
- 結果：原文範圍、單調的詞塊 startMs、可用／不支援／缺邊界原因。字尾未知保持未知；不得把下一詞起點當唱詞結束的真值。完整原文由範圍重組。
- 狀態：ready／stale／unsupported／failed 等有限狀態；整份文件大小、行數、詞塊數沿用或收緊既有上限，執行前定出 shared 常數，不接受任意 JSON。

時間先統一到來源時間域：若推論使用 offset 後的音訊時間，保存前轉回來源時間，顯示再由既有 clock 加一次 offset。offset 改變會影響推論窗口的前提，因此首版保守標 stale 並停用估計；單純播放 speed／seek 不重算。更換音訊、T1、文字、模型、讀音或分詞版本同樣失效。發布前重查來源與工作 generation，原子寫入；取消／來源已變不得發布。

讀音文字與顯示原文分離。範圍索引須明定為原文 UTF-16 邊界且不得切開 grapheme，保留漢字、假名原 script、空白、標點、重複次序與 surrogate pair。簡繁顯示轉換有可驗證範圍映射才套用；長度／映射不安全就回退現有顯示，不能按相同字數猜索引。人工 T2、T2 editor 及 reading sidecar 不被估計刷新改寫。

投影優先序建議為「該行有效正式 T2 → 身分吻合且使用者啟用的聲學估計 → 現行 T1 字長估算 → 未解決區間的整句顯示」。新增例如 `acoustic-estimate` 的 provenance 必須通過 validator 與 Output 協商，不能放入 canonical `line.segments` 觸發現有 `t2` 路徑。詞塊只取存在的邊界；缺界合併相鄰詞塊，若整行無可用內部切點則完整回退，不能補出看似模型精準的插值。

首版只承諾 start-triggered 高亮：到詞塊起點切換，維持到下一切點或整句結束；不以未知字尾推動連續掃色，不宣稱能偵測休止。現有模板若只有連續 progress 模式，需增加明確的起點模式或回退，不硬塞假 endMs。首詞仍沿用 T1 錨點，這不是句首改善能力。

模型處理使用 main 固定音訊角色／語言／配方，renderer 只傳 track id、已登記 source identity 與有限操作。Node 模型推論移出 main／renderer，Python decoder 綁 isolated 環境；main 用既有 FFmpeg 解碼並校驗模型，限制輸入長度、輸出 bytes、超時與程序數。整個雙程序 job 共用取消、排程與 generation lease，禁止依賴外部 Python 或自由下載權重。產品錯誤不夾帶路徑、歌詞全文或 stderr。

研究使用整窗口 encoder context，再於 T1±0.35 秒解碼；正式整首需實作有上下文的 bounded windows 與重疊去重，依 occurrence 合併，不能把每句硬裁後宣稱與研究同效。全靜音拒絕是最低防錯，門檻需測低音量尾音；unsupported 混合語句先逐行回退，不用模型 confidence 猜正確。錯詞／錯版本仍需使用者確認，未解決前不提供無人值守批次套用。

## 分階段交付與退出條件

以下是實作評估，不是完成清單或工期承諾。每階段先固定 fixture 與驗收，再改 production；本輪只完成本文件與研究索引。

| 階段               | 可審查成果                                                                                 | 必須通過才前進                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 0 契約與基線       | Proposed ADR、sidecar／IPC／Output 擴充草案、去識別合成 fixture、同分母 benchmark protocol | 估計／T2 不混淆；來源、offset、occurrence、字範圍及版本失效規則明確                              |
| 1 模型無關管線     | main validator／原子保存、來源載入、shared 詞塊起點投影、預覽啟停                          | 舊 T1／T2 行為不變；壞檔／過期／超限／缺界完整回退；切歌與並行載入不串資料                       |
| 2 私有研究模型串接 | 二套件隔離環境、Node frontend＋Python decoder 的受控 worker、完整歌曲窗口與取消            | 整首輸出合法且可重現；中日文逐歌配對改善，韓文／混合語言回退；資源峰值實測                       |
| 3 模型選配交付     | 已審 manifest／lock、hosting、安裝修復移除、feature gate、packaging inventory              | 權重使用／分發條件有證據；離線、hash 失敗、下載取消、更新 rollback、lease／清理與打包 smoke 通過 |
| 4 可見播放驗收     | Lyrics／Self-View／Workbench／OBS 相同起點模式與退回操作                                   | seek、pause、倍速、offset、換來源、重連、重複副歌與長曲皆無跳錯／遺字；人工觀感驗收後才決定預設  |

階段 0／1 可在不分發模型下開始；階段 2 仍是研究試用。階段 3 的權重 grant、分發來源與安裝政策是正式交付 gate，不能以原始碼 Apache-2.0 或公開 release 推定全部通過。這是本次研究發現的缺口，不是要求使用者重做已授權的測試。

## 驗收與後續研究門檻

工程不變量需全部通過：文字完整重組、原文 grapheme 邊界、整數毫秒、單調且不越父行、同文 occurrence 分離、T2 優先、無效／stale 回退、offset 僅一次、舊 client 回退、取消不發布、雙程序回收、壞 hash 不啟用。測試放在正式檔案旁；新增 subprocess runtime tests 加入既有 Vitest runtime project，不能任意放大 unit timeout。

品質建議先鎖現有研究結果作回歸參照，再加入未參與調整的新歌，逐歌報告與全切點分母並列。中文獨立詞塊確認基準為 102 切點／≤100 ms 81.4%／保留 101；日文外部基準與人工標註分開。禁止只算成功輸出、把缺界合併後的分母縮小，或跨不同句首／外框任務挑較高分數。端到端整首／provider T1 與 oracle T1 必須分表，不能直接要求或宣稱複製理想外框數字。

尚未建立足夠人工真值來訂日韓普遍精度或錯版本自動拒絕門檻；不把提案數字寫成已通過。人工驗收至少涵蓋快唱、拖音、弱起／切分音、句內長休止、混合英數、重複副歌、和聲／對唱、live 版本與無主唱區段；依適用語言分組，保存失敗案例。先判定詞塊切換是否更可讀，再另開連續掃色／字尾研究。

順帶有價值的檢查先做無新權重項：文字保留、時間越界、重複 occurrence、來源／版本不一致、T1 大空檔及候選失敗報告。節拍／段落可顯示既有 M1／M2 證據，但不做詞時真值或重新分段依據。先前 M2 中文 3 首獨立段落邊界 F1 為 ±0.5 秒 55.3%、±3 秒 71.1%；不足以承諾細粒度詞時。若另測 drums、歌唱 VAD、pitch joint alignment 或支援韓文的模型，需獨立增量容量、負向案例與同分母消融，不搭便車進預設包。

## 證據索引與文件分工

| 文件                                                                                                                                          | 保留用途                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [現行實作與方法研究](lyrics-audio-alignment-evaluation-2026-10-18.md)                                                                         | 上游方法、模型來源、初始環境預算；預算由實量更新，不再作容量承諾    |
| [第一輪實測](lyrics-alignment-pilot-2026-10-18.md)                                                                                            | 英文／多語 pilot、分離與 post-snap 邊界、負向控制                   |
| [中日韓完整起訖實測](lyrics-alignment-cjk-evaluation-2026-10-18.md)                                                                           | 完整起訖、活動、重複、段落、Qwen／CTC 完整環境成本                  |
| [T1 A／B／C／D 實測](lyrics-t1-acoustic-segmentation-2026-10-19.md)                                                                           | 本提案主要量測、任務分母、HubertFA 版本／hash、二套件環境及失敗行為 |
| [現行 timing contract](../contracts/lyrics-timing-contract.md)、[ADR 0010](../adr/0010-lyrics-timing-granularity-and-output-content-split.md) | 目前仍有效的 timing 與 presentation 邊界；本提案不自動修改          |
| [ADR 0014](../adr/0014-audio-python-runtime-family.md)、[架構圖](../architecture.md)                                                          | 現有 runtime／生命週期；新增能力須按正式變更更新                    |

模型授權與 upstream 來源沿用各證據報告的精確連結及版本，本文件未重新取得新模型或加入新的上游效果主張。ignored `tasks/` 的音訊、私有參考及原始輸出只供本機追查；正式實作前把 protocol、去識別合成 fixture、版本／hash 與執行方式移入可版本管理的評估工具，不能讓產品驗收依賴本機 scratch。

本次完成研究收斂、程式邊界閱讀與分階段規格評估；沒有修改產品程式、正式 contract、activation、模型 registry、使用者 sidecar，也沒有完成模型安裝或 Electron／OBS 可見驗收。正式模型與環境預設留到階段 2–4 的證據補齊後決定。
