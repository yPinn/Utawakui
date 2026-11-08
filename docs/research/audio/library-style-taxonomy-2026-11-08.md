# 曲庫標註與歌曲電台研究

2026-11-08。整理實際曲庫的唯讀盤點、候選分類、試聽比較與下一輪驗證條件。詞表先涵蓋樣本中的曲風，證據不足的細類可留空。產品狀態以[規格](../../spec.md#621-曲庫風格標籤與歌曲電台)為準。

## 階段整理

| 主題       | 已驗證的證據                                                                                                                                                                   | 尚待判定                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 曲庫來源   | 235 首中，本機匯入 1 首、YouTube 下載 234 首。原有與音檔內嵌曲風均無覆蓋。下載分類均為 Music，233 首有來源關鍵字，其中 220 首至少一項等同歌名或主藝人。                        | 平台分類和關鍵字用於查找。這批資料不足以估計既有標籤誤標率。             |
| 模型與曲風 | 235 首各有 3 個候選。原首選有 62 首是缺一致語言線索的 J-pop 或 K-pop，調整後有 86 首首選低於 0.20。舊批次的 31 首中有 25 首首選 Cloud Rap，該版詞表缺 Emo Rap 與 Melodic Rap。 | 候選分數和人工結論分開。細類先以同錄音逐曲證據驗證。                     |
| 演唱語言   | 235 首中，153 首有歌詞文字線索，7 首只有歌名線索，75 首無本輪可用線索。隔離預覽抽 13 首、20 段試聽，預勾 3 首證據一致的單語。                                                  | 混語、譯詞衝突與缺歌詞需另外確認。語言以錄音內容為準，與曲風和市場分開。 |
| 歌曲電台   | 7 首種子涵蓋多語和不同錄音版本。音訊加風格、只用風格兩組前十各重疊 4–8 首。試聽與評分匯出已驗證。                                                                              | 等實曲試聽評分，再定排序、語言條件、同藝人上限及同作品版本去重的效果。   |

第一輪以文字雜湊或檔案大小及修改時間核對 1,732 個正式曲庫檔案，前後一致。

## 詞表

| 層級     | 詞表                                                                                                                                                                                                               | 判定規則                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 父類     | Hip-Hop／Rap、Pop、R&B／Soul／Funk、Rock、Electronic／Dance、Latin／Caribbean、Afro-pop、Folk、待判                                                                                                                | 至多一項。以曲目整體的音樂脈絡決定，節奏、語言、藝人國籍和市場標籤各自保存。               |
| 主要曲風 | Hip-Hop／Rap 下有 Emo Rap、Melodic Rap、Cloud Rap、Trap、Pop Rap。另有 Reggaeton、Afrobeats、Contemporary R&B、Synth-pop、Ballad、House、Alternative Rock、Indie Rock、Post-Hardcore、Melodic Hardcore、Funk、Folk | 至多一項，可留空。細類須有該曲目或該版本的聲音、人工覆核或來源證據。專輯層級資料用作脈絡。 |
| 次要風格 | 沿用主要曲風的詞彙，可跨父類，另允許 R&B 等跨風格線索                                                                                                                                                              | 只列可辨認且與主類互補的特徵，省略已在父類表達的同義項。                                   |
| 製作影響 | Trap 鼓組／節奏、Cloud Rap 氛圍、Afrobeats 節奏、Reggaeton 節奏、Tropical House 製作、Baltimore Club 節奏、木吉他編曲                                                                                              | 必須說得出具體線索。Rhythm、音色與編曲可共存。單一節奏特徵只作影響候選。                   |

- Cloud Rap 主要曲風需有可辨認的風格脈絡及製作特徵。偏空靈的音色可以只標「Cloud Rap 氛圍」。旋律化演唱屬 Melodic Rap 線索，情緒表達、唱腔及音樂脈絡共同支持 Emo Rap。Trap 鼓組可和兩者同時出現。
- Reggaeton 主要曲風要看持續的節奏結構和整體編曲脈絡，來源或試聽也應支持。熱帶音色、切分節奏或單一鼓點可先記線索。Afrobeats 與歷史上的 Afrobeat 分開，Afrobeats 影響也可出現在 Hip-Hop 曲目。
- 主類和次要風格依錄音版本保存。Acoustic、Remix、Demo、Clean、Explicit 用獨立版本欄。保留人工原文、來源層級、模型版本及原始分數，讓同一首的多種解釋可以對照。

## 這輪比較怎麼跑

沿用上輪的 Discogs-EffNet 原始 400 類分數與既有批次門檻，測試一組固定的規則投影。上輪 31 首的人工建議另外拆成四層供試聽，評估對照時不輸入新版規則。曲名、藝人、發行介紹與其他來源也只用於分組與驗證。

新版把同一父類的可用分數取最大值，至少 0.20 且領先其他父類 0.05 才列父類候選。J-pop、K-pop、Cloud Rap、Reggaeton、Soundtrack 和 Instrumental 不為父類加分。經小型白名單允許的細類須是原模型首選、分數至少 0.35 且與新版父類一致，才列為主要曲風候選。Cloud Rap 和 Reggaeton 需要獨立曲目證據，所以這版純音訊投影先保留判斷。Trap 和 Tropical House 的分數達 0.25 只列製作影響線索。次要風格由本次人工建議欄示範，等逐首覆核後才確認。

比較分成原 31 首、獨立藝人／發行 8 首、相近藝人／發行 6 首、版本對照 5 首。獨立組由原 31 首以外的藝人及發行挑選，參考標註不輸入規則。本輪依已知錯誤挑出部分對照曲，適合作壓力測試。相近組測試同藝人、不同曲目或發行的偏差，版本組分開比對 9Lana 的原版／Acoustic、Jung Kook 的 Clean／Explicit 和本機 Demo。判斷來源以曲目介紹、製作人說法或版本資料為準，證據只有發行層級時單獨註明。[多標籤曲風研究](https://doi.org/10.5334/tismir.10) · [藝人留出研究](https://ismir2007.ismir.net/proceedings/ISMIR2007_p341_flexer.pdf) · [原模型說明](https://essentia.upf.edu/models.html#discogs-effnet)

## 驗收方式

50 首中，原始首選有 29 首 Cloud Rap、5 首 Reggaeton，其中通過原批次門檻的分別為 25 首、2 首，皆位於原 31 首。新版兩類主要曲風候選都是 0 首，50 首中 42 首有父類候選、2 首有主要曲風候選。這次的下降來自先保留細類判斷。

8 首有曲目層級父類參考的額外曲目，原模型首選所屬父類相符 5 首。新版相符 2 首、另判 3 首、保留 3 首。8 首中的獨立藝人／發行小組有 4 首帶參考，原模型相符 3 首，新版相符 1 首、另判 1 首、保留 2 首。〈SWIM〉的原首選 Reggaeton 被撤下後，父類仍被判為 Hip-Hop／Rap，與來源的 Alternative Pop 有落差。〈Please Don’t Change〉則被投影成 Electronic／Dance，發行頁將它列在 Pop。兩首適合作為反例。[BIGHIT 的〈SWIM〉曲目說明](https://en.yna.co.kr/view/AEN20260304002400315) · [〈Please Don’t Change〉發行分類](https://www.beatport.com/track/please-dont-change/27482756)

- 比較原始首選、通過舊批次門檻的首選、新版細類保留率及父類相符數。將改判與留空分開計數。曲目來源描述當作參考證據，保留逐首試聽評分。
- Cloud Rap 與 Reggaeton 的正式驗收應增加有曲目層級佐證的正例與易混淆負例。依藝人、發行與同作品版本分組，另計逐類精確率、召回率與保留判斷的比例。本輪未取得足以確認的兩類正例，故只比較誤判風險與覆蓋變化。

## 評論與發行資料如何參與覆核

第一版在曲風覆核中保留來源連結、簡短摘要、查核日期、所指的專輯／曲目／錄音版本、支持的標籤層級與證據強度。模型原始分數另存。先比對演唱者、發行及錄音識別碼，有 ISRC 或 MusicBrainz Recording ID 時可輔助比對。來源只提到作品或其他版本時保留原有範圍。兩站轉載同一段廠牌資料只計一個來源。評論有分歧、只剩專輯類型或版本匹配不清時，保留候選並交由試聽覆核。

- AllMusic 把《Goodbye & Good Riddance》的專輯風格列為 Cloud Rap 等類，並指出〈All Girls Are the Same〉與〈Lucid Dreams〉有 Trap 特徵。Apple Music 的編輯介紹另強調 Emo 與 Trap。Pitchfork 的〈All Girls Are the Same〉評論直接描述旋律化唱法與合成器。這些線索支持保留 Cloud Rap 作為有逐曲音訊佐證時的次要候選，不能從專輯標籤繼承至每首歌。[AllMusic 專輯頁](https://www.allmusic.com/album/goodbye-good-riddance-mw0003181006) · [Apple Music 專輯介紹](https://music.apple.com/us/album/goodbye-good-riddance/1407165109) · [Pitchfork 單曲評論](https://pitchfork.com/reviews/tracks/juice-wrld-all-girls-are-the-same/)
- Weverse 與 NME 將 Reggaeton 節奏連到〈Closer to You〉。Apple Music 把〈Yes or No〉描述為流行歌曲。可用同專輯這兩首做對照，分開記錄主曲風與製作影響。[Weverse](https://magazine.weverse.io/article/view/937?artist=BTS&lang=zh-cn) · [NME](https://www.nme.com/reviews/album/jungkook-golden-review-3529873) · [Apple Music](https://music.apple.com/us/album/golden/1709554767)

先以人工附連結和摘要累積能逐首驗證的來源，避免把評論覆蓋較少的藝人當成缺少某類風格。MusicBrainz 的錄音與發行識別可作查找層。社群曲風只作線索，並和核心資料分開核對授權與服務條款。AllMusic 的資料來自 Xperi／TiVo。若需要結構化的逐曲商業資料，可先取得授權與樣本測覆蓋率。Pitchfork、NME 等評論網站先作人工查證連結，批次取得資料之前另核對可用介面及授權。[MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API) · [MusicBrainz 資料授權](https://musicbrainz.org/doc/About/Data_License) · [AllMusic FAQ](https://www.allmusic.com/faq) · [TiVo Music Metadata](https://business.tivo.com/products-solutions/metadata/music-metadata)

批次覆核以減少逐首標註為目標。可核對到同錄音且有逐曲證據支持的欄位才預選，證據缺少、衝突或只到發行層級時自動暫留。使用者可以整批略過暫留項目，或針對有需要的曲目修正。這 31 首是已知偏差樣本，適合驗證流程。後續要擴大預選範圍，應在不同藝人、發行及錄音版本的留出組，分開檢查各標籤精確率、採用覆蓋率、誤套版本及人工撤回率。

## 27 首留出及版本驗證

| 分組               | 樣本 | 音訊主候選 | 逐曲證據預選 | 暫留 |
| ------------------ | ---: | ---------: | -----------: | ---: |
| 獨立藝人與發行     |   14 |          1 |            5 |    9 |
| 易混淆曲風壓力對照 |    7 |          0 |            3 |    4 |
| 版本對照           |    6 |          0 |            0 |    6 |
| 合計               |   27 |          1 |            8 |   19 |

逐曲證據預選的已裁決誤標為 0/8，參考正例覆蓋 8/10。樣本以可核對案例和反例為主。Ballad 有兩個獨立命中，另漏一個參考正例。Alternative Rock、Rock 和 R&B 各有一個獨立命中。Cloud Rap、Trap、Reggaeton 缺主要曲風正例，繼續區分細類與製作影響。唯一音訊主候選〈Liar〉缺支持 Melodic Hardcore 的逐曲資料。[ONE OK ROCK 藝人訪談](https://www.squareonemagazine.co.uk/content/a-conversation-with-one-ok-rock)

〈2.0〉的 Trap 鼓組與〈Closer to You〉的 Reggaeton 律動留在製作影響。RASEN 的 Acoustic 編曲只適用該版本。〈Seven〉的 UK Garage 訪談屬作品層級，單曲 Explicit、專輯 Explicit 與專輯 Clean 仍分開核對。[〈2.0〉聽評](https://www.koreajoongangdaily.com/entertainment/btss-arirang-acts-as-an-homage-to-its-early-hip-hop-days-and-a-promise-to-its-future-review/12564677) · [RASEN 版本說明](https://prtimes.jp/main/html/rd/p/000004973.000013546.html) · [〈Seven〉訪談](https://www.rollingstone.co.uk/music/jung-kook-shares-unseen-photos-and-tells-us-about-seven-31322/)

Ballad 的逐曲查找、錄音版本與上下文驗證集中在[固定回歸與留出報告](library-ballad-holdout-2026-11-08.md)。
