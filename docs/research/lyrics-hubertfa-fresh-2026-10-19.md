# 原 HubertFA 新曲配對實測與非商用選配查核

本文保留當輪研究與分母；目前跨批次選型及未決項集中在[研究結論](lyrics-alignment-summary.md)。

日期：2026-10-19。先看技術成效，再看權重使用條件。正式 gate、預設下載與 Basic 不變，沒有新增模型下載或 commit。

目前結論：原 HubertFA 在這批新日文的詞界與長尾較 Qwen 好，但更容易對錯內容／未唱文字強行給時間。值得優先研究「HubertFA＋獨立內容檢查」，不能單憑對齊結果自動套用。權重及附帶字典的非商用使用／分發範圍仍缺明確證據，尚不能批准為開源專案的正式非商用手動選配；不是認定它明文禁止使用。

## 相同資料的結果

沿用前輪新中文、日文各兩首，共16案：正常、同歌不同片語替換、輸入漏詞、整句精確靜音。音訊 bytes、canonical T1、原文範圍、offset、文字切點、cases／references SHA與凍結評分器均一致。16案的canonical逐項deep-equal，不另挑歌、改外框或移除缺界。收據與匿名資料見[data](data/lyrics-hubertfa-fresh-2026-10-19.json)，原語料限制見[新曲報告](lyrics-fresh-decision-2026-10-19.md)。

時間參考只有兩首日文、35個可評內部詞界；四首共要求140個內部切點，其他105點無同位置細參考。中文目前只能看輸出結構與構造錯配，不能報時間準確度。外部provider時間未經人工校對。

| 正常片段的時間結果 | T1均分         | Qwen       | 原HubertFA |
| ------------------ | -------------- | ---------- | ---------- |
| ≤100ms／固定35點   | 15／35         | 12／35     | 22／35     |
| 可量／缺界         | 35／0          | 29／6      | 30／5      |
| >500ms             | 2              | 5          | 1          |
| >1000ms            | 1              | 0          | 0          |
| 保留點median／P90  | 124.6／408.3ms | 129／677ms | 56／419ms  |

HubertFA兩首日文分別為7／19、15／16個≤100ms；Qwen為2／19、10／16，均分為8／19、7／16。HubertFA仍未勝過第一首的均分，不宣稱所有歌曲最佳。兩方法正常29句均有25句可顯示模型詞塊；另外4句是相同英文policy回退，且在這35點中沒有可評點。

## 錯內容接受與內容檢查

每種構造有4個目標，其中1個純英文不支援，固定保留為回退負例；下表使用另外3個可分析目標。這是構造代理，不是自然live／cover版本分布或人工誤接受率。

| 目標仍輸出詞塊 | Qwen | 原HubertFA | HubertFA＋同份small內容檢查 |
| -------------- | ---- | ---------- | --------------------------- |
| 片語錯配       | 3／3 | 3／3       | 0／3                        |
| 整句精確靜音   | 0／3 | 3／3       | 0／3                        |
| 輸入漏一詞     | 3／3 | 3／3       | 3／3                        |

HubertFA的逐行受限decoder會盡力對指定文字找路徑，合法單調時間不能證明實際唱了文字。整句靜音案例尤其說明「對齊能力」與「內容驗證」分開。

small欄是沿用實際Whisper small轉錄、前輪凍結的繁簡比較規則，將同一份內容遮罩套到兩模型的純後處理對照。核對相同音訊、canonical、轉錄／結果SHA，不重算或改寫模型時間，沒有另存為可冒充正式成果的產品sidecar。HubertFA正常25句、≤100ms 22／35、>500ms 1均保留；Qwen＋同份遮罩仍為12／35。這支持後續研究混合路線，不代表已通過正式模型整合或真人誤拒驗收。

漏詞尚未解決；剩餘詞塊可能仍正確，不能把「未拒絕漏詞句」直接算全句時間錯。前輪更廣的small壓力組仍有錯歌被接受，不能憑這三個錯配說已能可靠擋住錯歌。

## 配方與人工抽查

這是原可用配方的端到端比較，不是只替換神經網路。HubertFA為44.1kHz、ONNX frontend、音素／讀音與逐行T1±350ms decoder約束；Qwen為16kHz、整窗文字。兩者都保留相同T1第一錨點、文字切點與缺界分母；因此不把差異全部歸因於模型架構。

原HubertFA使用固定v0.0.7、source revision `521281fe52dcedb8f970ca200dc4f00fc2869b08` 與既有私有環境，未改decoder、字典或參數。16案合計68.92秒，包含逐案新程序與資產檢查；不是清除OS cache後的冷啟動或完整App效能保證。Qwen先前批次合計268.41秒，執行時負載／日期內時段不同，不將兩數直接當精確速度倍率。

本機 `.tmp/lyrics-new-eval/hubertfa-comparison/PRIORITY.md` 有15列：優先新增3個「靜音仍出詞塊」目標，並保留前輪12個錯配／日文長尾／改善控制。各列可播放原音訊，附Qwen、HubertFA與加內容遮罩的TSV；方法有標示，不稱盲測。沿用原53列獨立起音／內容標記，原A／B與labels不改，目前仍0已審／0人工起音。

## 開源專案的非商用手動選配

不能因免費、開源或使用者官方直下載，就自動補足未釐清的權重許可。也不能反向認定「權重沒有單獨LICENSE」即必然不受根目錄授權涵蓋。本次採用結論是證據不足，不是確定禁止或侵權；原HubertFA沒有在已查文件中被明訂為CC NC，不能拿另一份GTSinger checkpoint的NC條款套用。

| 證據                                 | 本次結果                                                                                                                                                                                                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 指定revision與公開main的repo LICENSE | [Apache-2.0](https://github.com/wolfgitpr/HubertFA/blob/521281fe52dcedb8f970ca200dc4f00fc2869b08/LICENSE)；授權授予適用Work的使用／修改／分發，不等於因本專案開源就自動涵蓋範圍不明的每個檔案。 [Apache條文](https://www.apache.org/licenses/LICENSE-2.0)                                       |
| 原release                            | [v0.0.7](https://github.com/wolfgitpr/HubertFA/releases/tag/v0.0.7)說明語言、字典、歌唱用途與貢獻者，未找到將該archive全體權重／字典明確歸屬某授權的新增聲明                                                                                                                                    |
| 指定archive                          | 本機SHA與[官方公開digest](https://github.com/wolfgitpr/HubertFA/releases/expanded_assets/v0.0.7)一致；7個檔案＋1個目錄，沒有LICENSE／NOTICE／README／模型卡，zip comment為空                                                                                                                    |
| 實際ONNX權重                         | SHA與manifest一致；top-level producer為`onnx.compose.merge_models`，沒有doc_string或metadata_props授權欄。這只能補足實際檔案檢查，不代表授權一定不存在                                                                                                                                          |
| 官方README與分享說明                 | [README](https://github.com/wolfgitpr/HubertFA/blob/521281fe52dcedb8f970ca200dc4f00fc2869b08/README.MD)指示下載並推論；[Discussion #2](https://github.com/wolfgitpr/HubertFA/discussions/2)要求分享者確保權利。這些是公開使用／分享意圖的線索，但沒有解決本產品所需的確切artifact使用／分發範圍 |
| 基底與字典                           | config指向Chinese HuBERT，相關Tencent基底標示MIT；不足以單獨授權本次微調／合併權重與附帶字典，仍需一起確認                                                                                                                                                                                      |

確切artifact為 `1218_hfa_model_new_dict.zip` SHA `48bd6dbcc293e47cc6cbcc556baf575e3d91d61d0ac88ddeccd6098f8f346fa2`；權重 `model.onnx` SHA `4722c13e1d5c1d740ec69c9121f5ec37a88d534aba7637bafb480208be170183`。沒有因研究改換權重。

針對「開源非商用手動選配」仍須確認：非商用本機推論、使用者從官方直下、我們原樣鏡像／離線交付、中日字典、必要notices，以及修改／量化／轉換是否允許。若作者明確確認archive全體適用Apache-2.0，這條路線不需要另創NC限制；若另授非商用條款，則按實際範圍設計。這與一般[CC BY-NC允許有條件非商用使用／分享](https://creativecommons.org/licenses/by-nc/4.0/)是不同問題，不能把未知權重自行改標NC。

可直接使用的短詢問草稿（未發送）：

> 想將HubertFA v0.0.7的 `1218_hfa_model_new_dict.zip`（SHA如上）作為開源歌詞工具的非商用手動選配。請問model.onnx、config/vocab及中日字典是否全體適用repo Apache-2.0？若另有條款，是否允許非商用本機推論、使用者官方直下載、原樣鏡像／離線交付、格式轉換／量化？需要保留哪些作者與授權資訊？希望能在該release公開註明適用artifact。

本次透過瀏覽工具重查官方固定revision、公開main文件、release與討論。另行保存最新GitHub API快照的shell網路請求先被sandbox阻擋；升權命令因自動審核服務容量不足未執行，因此沒有把live API head／完整issues快照記為已驗證，也沒有宣稱全網找不到許可。公開可讀來源及本機artifact檢查仍可用；無對外issue／郵件／訊息。

## 驗證與決策

HubertFA 16案實推論完成；input/reference SHA、canonical、sidecar及實際音訊核對一致。`verifyResults`通過16案，232個前進／倒退樣本、8個重複occurrence、原文完整、T1停用回退、T2優先、stale與owned workers清理。正式11個邊界來源SHA不變。

本輪19檔143 tests通過，包含配對比較、既有HubertFA／候選模型、sidecar／預覽與packaging邊界測試；全庫ESLint、Vite build、scoped Markdown／Prettier與docs map diff check通過。build只有既有chunk大小警告。程式review通過；公開JSON與私有receipt逐欄相等，17個本機文件／音訊連結存在，15個優先sample無重複且未修改原53列人工標記。未重跑全庫Vitest、完整installer、低RAM／GPU或可見OBS驗收。

重現沿用原`lyricsAcoustic/evaluate.cjs`與`verify.cjs`；配對報表命令如下，輸入皆是本機研究資料，不是產品入口：

```text
node scripts/research/lyricsFreshEvaluation/hubertComparison.cjs .tmp/lyrics-new-eval .tmp/lyrics-diagnosis/lowcost/results.json .tmp/lyrics-new-eval/hubertfa-comparison
```

技術上優先保留「HubertFA詞塊＋small內容檢查」作研究方向；先聽查缺唱／錯配與兩首日文的實際起音，再判定產品品質。使用條件上仍待權重與字典授權範圍的可追溯確認。正式gate、預設下載維持不變，不把研究成功當作選配ready。
