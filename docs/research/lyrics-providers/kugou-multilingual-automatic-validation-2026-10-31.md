# Kugou 多語別名與複合歌手隔離驗證

日期：2026-10-31。延續[兩首隔離驗證](better-contract-kugou-line-validation-2026-10-31.md)。本輪只改研究 scripts、公開測試條件及文件；沒有加入正式來源、IPC、renderer、自動保存或commit。結果是有界技術樣本，不是覆蓋率或穩定服務承諾。

## 固定條件與分母

公開[條件檔](../../../scripts/fixtures/lyrics-provider-evaluation/kugou-multilingual.json)在送出HTTP前固定並保存SHA。12首各有canonical／challenge兩組輸入，共24組；再加Hana No Uta、Yoru ni Kakeru沒有日文別名的兩個control，共26組。Challenge提供的別名字串是測試輸入，不代表Owner曲庫已有這些欄位。

| 類別 | 固定參考曲目                                       | 特別條件                                                                     |
| ---- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| 中文 | 晴天、七里香、富士山下                             | 繁簡、Jay Chou／Eason Chan括號別名；富士山下為粵語                           |
| 日文 | 花の唄、夜に駆ける、アイドル                       | 羅馬字／英文與原文同欄；另測沒有原文別名的兩個control                        |
| 韓文 | 봄날、뚜두뚜두、밤편지                             | Spring Day／DDU-DU DDU-DU／Through the Night與原文同欄，韓／英歌手別名       |
| 英文 | Closer to You、Shape of You、We Don't Talk Anymore | 合作歌手、feat、英／韓或英／中藝名；Closer雖為韓國藝人作品，按英語歌詞歸此類 |

12首不是24首獨立歌曲。條件中的秒數是事先指定的公開參考值，未依結果微調；不聲稱與Owner音檔完全相同。Review用的gold另存於條件檔，執行器只收到reference／明示aliases，不讀gold來產生查詢。

本輪沒有重測其他歌詞來源；「原查詢」是Kugou這次操作的第一階段，不是LRCLIB／Better的當日基線。因此其他新曲目不能直接計為對Utawakui現有來源的獨立新增覆蓋。

## 自動流程與身份邊界

新增純研究模組 `scripts/lyrics-provider-kugou-query.mjs`，以及 `createKugouLineVariantEvaluationProbe`。順序為原字串→輸入可證明的歌名／完整歌手別名→必要時主唱探索，最多三組查詢。每個操作共用五次實際HTTP及25秒總期限；已找到候選即停，429／5xx、parser拒絕或身份矛盾停止該操作，不能換字串繞過冷卻。

- 不使用翻譯模型或歌曲對照字典。單獨Hana No Uta不會憑空變成花の唄；明示metadata別名另有單元測試，但不混入本輪無別名control。
- 探索query與期待reference分開。只用主唱查詢不代表只驗主唱；catalog必須證明原有credit／明示feat，防止只撞到合作歌手、錯主唱或錯guest。字串包含不是歌手身份證據。
- Catalog歌名以輸入可證明的別名及繁簡形式比較，時長差最多4秒，版本雙向核對；每個歌詞候選仍須與catalog時長相符、同hash下載。
- LRC的歌名／歌手標記另驗。完整credit已由catalog證明時，才解析`Charlie Puth/Selena Gomez`這類無空格分隔；不把AC/DC當兩個歌手。
- 現場版／ライブ／라이브、翻唱、remix、不插電、伴奏等不當跨語歌名別名；不能因有東亞文字就剝除括號版本。這些新規則只在隔離研究生效，不改production identity domain。

預設結果仍不包含原始歌詞、query、catalog hash或accesskey；顯式研究evidence供記憶體靜態核對。本輪保存的資料移除歌詞預覽，只保留有界metadata、時長、line count與結果。所有完整內容／播放review仍是unreviewed。

## 首批固定26組結果

台灣時間03:54:07～03:55:19，實際起訖以[機器收據](data/kugou-multilingual-2026-10-31.json)為準。首批72個HTTP，均200；既有時間／metadata validator保留9組拒絕，未把HTTP成功等同歌詞可用。

| 類別 | 配對條件 | 原階段取得候選 | 有界自動流程最終取得 | 驗證拒絕 | 正常未命中 |
| ---- | -------: | -------------: | -------------------: | -------: | ---------: |
| 中文 |        6 |              6 |                    6 |        0 |          0 |
| 日文 |        6 |              2 |                    2 |        4 |          0 |
| 韓文 |        6 |              2 |                    2 |        4 |          0 |
| 英文 |        6 |              2 |                    3 |        1 |          2 |
| 合計 |       24 |             12 |                   13 |        9 |          2 |

無別名的兩個control均未命中，另報而不混入24組分母。首批只有1組是同一操作內「原查詢miss→自動別名query成功」：Closer to You的複合歌手challenge。它以原欄位內的Jung Kook英文別名及保留合作credit的標準查詢，四個HTTP完成，不需要人工改query或丟掉Major Lazer。

Shape of You是canonical條件未命中、帶艾德·希兰別名的另一組輸入直接命中；不能把兩組不同輸入的差異算成原操作內自動救回。

## 拒絕診斷與選擇性複核

首批後以五個代表案例、15個HTTP診斷，不保存歌詞原文；發現兩類格式問題與兩類應保留的身份拒絕：

1. 部分Kugou原生LRC含`hash／sign／qq／total`描述行。原隔離parser只認共同LRC metadata，誤把這些行當未知歌詞。新增限定四key、值長／控制字元有界的忽略規則；它們不提供身份權威，不放寬時戳、offset或詞內容檢查。未知key、錯括號與過長值仍拒絕。
2. We Don't Talk Anymore的catalog已證明Charlie Puth與Selena Gomez，LRC以無空格斜線連接；新增僅在各部分均符合已證明credit時的格式相容。
3. 原始`봄날／BTS`的LRC歌名為`Spring Day`，原輸入沒有此英文別名；保留拒絕。Challenge已含兩種歌名，格式修正後可接受，不代表能自行翻譯韓文。
4. BLACKPINK的catalog歌名未帶Live，但下載的LRC明示`DDU-DU DDU-DU(Live)`。兩種輸入都保留拒絕，不能把它當成一般括號註解。

修正以fixture先紅再綠後，只複核首批的9個拒絕條件，27個HTTP；沒有重跑已成功樣本、替換原條件或改首批分母。結果6組取得候選、3組仍拒絕：

| 曲目／條件                                     | 補充複核結果 | 解讀                                     |
| ---------------------------------------------- | ------------ | ---------------------------------------- |
| 夜に駆ける，兩種輸入                           | 64行T1候選   | 描述metadata相容後恢復，並非新增人工翻譯 |
| アイドル，兩種輸入                             | 79行T1候選   | 描述metadata相容後恢復                   |
| 봄날，含Spring Day別名的challenge              | 87行T1候選   | 已有別名證據才接受英文LRC標記            |
| We Don't Talk Anymore，feat／複合歌手challenge | 79行T1候選   | 在已證credit下接受斜線分隔               |
| 봄날，單獨韓文canonical                        | 仍拒絕       | 缺少英文歌名別名證據                     |
| 뚜두뚜두，兩種輸入                             | 仍拒絕       | LRC的Live版本衝突                        |

首批與這批選擇性複核的聯集，共19組條件、11首歌曲曾取得候選；這不是新版本完整26組重測的成功率。特別挑出的9個拒絕條件也不能當代表性曲庫分母。

全部114個HTTP＝首批72＋診斷15＋選擇性複核27，低於預先設定的140上限；共享1000ms排程，沒有本機成功結果快取、無無界重試。上游遠端快取狀態未知，不能稱完全cold的來源覆蓋量測。未遇429／5xx只描述這次有限樣本，不是SLA。

## 誤配檢查與尚缺證據

靜態逐列核對19個接受條件的catalog／LRC歌名、artist credit與參考時長，未見metadata層面的誤配；沒有完整原文、音檔或逐句同步驗收，不能宣稱誤配率為0。

本輪實際發現並擋住了BLACKPINK的studio catalog／Live LRC衝突。Fixture還先重現並修掉舊隔離規則可能接受「只命中合作歌手」的字串包含問題，以及把現場版等誤視為跨語別名的問題。回歸包括四語各四種錯artist／artist-prefix／Live／Part 2共16個負例，另外覆蓋錯guest、合作歌手單獨命中、版本反向缺失、跨語LRC版本標記、陌生斜線歌手、metadata邊界、共享冷卻與總預算／期限。

已接受的歌曲聯集：晴天、七里香、富士山下、花の唄、夜に駆ける、アイドル、밤편지、봄날（需別名）、Closer to You、Shape of You（含別名輸入）、We Don't Talk Anymore（challenge）。它們是此批條件下的候選可取證據，不等於來源對這些錄音長期穩定，也不等於已證明Utawakui現有來源全都找不到它們。

## 邊界與收據

正式manual registry仍只有LRCLIB／NetEase／Better，automatic只有LRCLIB／NetEase，`kugou`仍不在registry。前輪Better七個程式／測試檔的SHA未變；本輪沒有改Electron／renderer執行程式、沒有啟動Owner App／OBS，也沒有commit／stage／stash。

公開結果在上述JSON；完整有界HTTP狀態、診斷、測試與source manifest在ignored `tasks/kugou-multilingual-20261031/`。JSON保留首批及複核各自的source SHA，gold從未餵給探針。後續補的多語版本詞拒絕只做離線回歸，沒有為此再重送線上批次；已接受的metadata不含這些版本詞。完整產品接入及更大、跨時段、音訊人工驗收仍未執行。

最終8個測試檔／246 tests通過，含原KRC／LRC、query plan、corpus來源邊界、coverage policy與Main打包依賴closure；定向兩個研究檔的Istanbul statement93.65%、branch88.97%、function94.79%、line94.35%，原門檻通過。新的query helper已加入既有coverage include，後續CI不會漏算。最終metadata gate離線重播19個已接受條件均通過；這不含原始LRC body或音訊重播，不能代替人工時間驗收。

完整ESLint、Markdown、定向格式與diff檢查通過。本輪沒有產品執行程式變更，不重跑production build、installer或啟動App；不把前輪build結果當本輪新驗證。
