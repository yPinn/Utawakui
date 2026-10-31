# Better Lyrics 契約修正與 Kugou 逐行隔離驗證

日期：2026-10-31。延續[首次查詢評估](lyrics-first-search-backup-assessment-2026-10-31.md)，本輪完成已授權的 Better 修正與兩首已回報歌曲的有限對照；Kugou 仍未加入正式來源、IPC、renderer 或自動取得。沒有 commit。

## Better Lyrics 已修正範圍

- Client 只接受官方0～1可選score；candidate維持80%門檻，即0.8。0.97／1可通過、0.799999拒絕；負數、超過1、百分制95、NaN／Infinity／字串／null等不推測單位。無score的cache HIT仍走身份與TTML檢查，不補造信心。
- 初查與擴大搜尋均保留已知專輯與整秒時長；手動改到不同歌名／歌手時不帶原曲專輯，未知不猜填。不增加HTTP次數或401重試，也未換host或接入其他Better路徑。
- Better adapter只使用明確的跨語括號歌手別名，保留合作歌手、分隔符及band名稱；official／live等不是別名。feat／ft／featuring的歌手已列在artist credit才移除該段歌名，其他版本標記保留。候選仍依原始搜尋身份判斷，不修改共用LRCLIB／NetEase計畫、曲庫metadata或自動保存資格。
- 保存沿用被授權的實際查詢並fresh重取；fractional fresh→無score HIT可保持同fingerprint，內容改版、低信心、parser錯誤、stale search等既有防護保留。既有artifact不重寫或刪除。

依據：[官方score契約](https://docs.betterlyrics.org/docs/response-format)、[專輯與時長最佳實務](https://docs.betterlyrics.org/docs/best-practices)。本輪真實Better仍401；本機修正不能創造上游未開放的快取或存取權限，不宣稱已修好所有Better未命中。

## Kugou 隔離探針

`scripts/lyrics-provider-kugou.mjs` 新增 `createKugouLineEvaluationProbe`、`classifyKugouLrc` 與 `kugou-direct-lrc-evaluation-v1` 描述，均為研究工具；既有KRC／完整T2 validator不放寬。

固定流程是metadata搜尋→選擇符合歌名／歌手與雙向版本證據、時長差不超過4秒的catalog候選→同hash的歌詞候選→原生`fmt=lrc`。歌詞候選自身也須與catalog時長差不超過4秒。每案最多三次HTTP，不走無身份的keyword fallback，不遍歷整個catalog湊命中。

輸入／metadata／候選數、JSON body、base64及UTF-8解碼均有上限；LRC最多2MiB、20,000行，拒絕不可解析時戳、超出catalog時長＋2秒的時間、矛盾或過長的ti／ar、錯歌手／版本、異常offset與不足兩個不同的時間行。保留有效offset作待核對資料，不把結構通過等同實際對時正確。

研究工廠共用1000ms排程與按transport／origin共用的Retry-After冷卻；測試確認另一probe instance不繞過429冷卻。這不是官方公布配額。正常observation只輸出既有有界評估欄位；corpus的`timingValidation`專指細時間，所以T1為`not-applicable`，另以line evidence記錄逐行結構檢查。保留`reviewVerdict: unreviewed`，不假冒完整人工驗收。

顯式研究callback可在記憶體取得有界metadata／少量預覽供核對，不暴露catalog hash／accesskey；本輪收據移除預覽文字，只保存metadata、時間範圍與內容指紋，沒有保存歌詞原文。這個callback不跨IPC，也不在產品流程被呼叫。

## 兩首已回報歌曲的真實對照

2026-10-31台灣時間03:25:28～03:25:40，以Node正式client／provider adapters／Main service取得baseline，再呼叫隔離Kugou探針；這不是原生Electron操作。曲目為按截圖建立的公開參考條件，Closer另帶公開參考專輯GOLDEN；沒有讀取或修改Owner曲庫，不能說已證其完整metadata完全相同。

每首baseline都重新查LRCLIB／NetEase／Better；兩首均零候選：LRCLIB實際network503、NetEase200無符合候選、Better401 cache-miss。沒有把前輪失敗錄製當本輪baseline。

| 曲目                              | 原字串查Kugou | 研究指定的標準條件              | 隔離取得的逐行候選 | 身份與時長證據                                                                                                                                |
| --------------------------------- | ------------- | ------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Closer to You (feat. Major Lazer) | 未命中        | Closer to You／Jung Kook／171秒 | 58個非空時間行，T1 | catalog歌手Jung Kook、Major Lazer，170秒；差1秒。LRC標記歌名含feat. Major Lazer、歌手Jung Kook。相對原字串title／artist分數均0.82、無新增版本 |
| Hana No Uta／Aimer                | 未命中        | 花の唄／Aimer／371秒            | 64個非空時間行，T1 | catalog花の唄／Aimer，373秒；差2秒。LRC歌手Aimer (エメ)、歌名含花の唄及作品說明。原拉丁歌名對日文title分數為0，必須人工確認別名               |

這兩首在指定標準條件後均取得可供核對的原生T1；尚不能稱原字串的自動救回率為2／2。Closer的英文主唱來自原欄位括號，但本輪只在研究中指定主唱查詢；正式Better正規化仍保留所有合作歌手。Hana No Uta→花の唄是研究中明確指定的跨語別名，產品不會憑空翻譯或放寬title gate接受它。

人工靜態複核了catalog／LRC標記、時長與有限預覽，未見明顯錯歌手／版本；沒有做整首音訊對照、逐句同步或完整歌詞內容驗收，故observation仍為unreviewed。範圍內可確認有補救候選，不能承諾已可自動套用或所有曲目皆有覆蓋。

每曲8個HTTP：baseline4、原字串Kugou1、標準條件Kugou3，共16個HTTP；沿正式來源排程與有界研究排程，沒有重試求成功或隱藏背景續查。沒有再測第三方proxy、登入、key、Owner App或OBS。後續收尾補了非法metadata／offset／UTF-8、冷卻及版本拒絕回歸，未為收尾再重送這批真實請求；收據的offset均0、標記有界且沒有版本衝突。

## 驗證與保存界線

先紅再綠的測試包含score單位／邊界／fresh與HIT、保留專輯、手動查別曲、跨語括號、合作歌手及版本保留、同查詢保存重驗；Kugou覆蓋固定路徑、hash綁定、catalog／歌詞雙重duration、身份與雙向版本、LRC標記矛盾、UTF-8／base64／body上限、冷卻與輸出遮蔽。

初版新測試把T1的corpus細時間欄位期待為valid，與既有評估契約衝突，已改為not-applicable並另記line evidence，未修改corpus規則遷就新探針。腳本測試沿既有runtime project執行，不改unit include或timeout。

測試、coverage、lint、build與最終source manifest留於ignored `tasks/better-query-kugou-line-20261031/`；真實摘要為`live-comparison.json`，沒有歌詞原文。研究文件不把這兩個刻意選出的失敗案例當成代表性覆蓋率。後續若要接正式Kugou，仍須完成較大曲庫／跨時段、保存fingerprint與接入契約；本輪沒有做這些變更。

最終17個測試檔／348 tests通過，含Main聚合、既有LRCLIB／NetEase／request policy、renderer來源搜尋回歸及Main打包依賴closure。定向4個檔的Istanbul statement94.94%、branch88.19%、function92.85%、line96.64%，原門檻通過；另有完整ESLint、245份Markdown零issues、13檔格式與diff檢查通過。Production build通過，保留既有chunk-size warning。未執行完整installer或可見Electron驗收；Main變更仍須完整重啟後驗實際桌面行為，不以CLI代替該驗收。
