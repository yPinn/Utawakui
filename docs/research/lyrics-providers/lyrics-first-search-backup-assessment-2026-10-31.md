# 首次歌詞查詢與備援來源評估

日期：2026-10-31。範圍：可用性、正確錄音覆蓋與查詢成本；這是實作提案，未接入新來源、未改產品流程、未 commit。既有使用邊界仍見[來源與使用邊界](lyrics-provider-commercial-evaluation-2026-08-31.md)，歷史樣本不回改。

## 建議與證據強度

建議先修 Better Lyrics 的分數契約及已知 metadata 查詢，再以直連 Kugou 的原生逐行 LRC 作下一個獨立來源的驗證候選。若目標包含可契約約定的穩定服務，優先比較 Musixmatch／LyricFind 的試用結果；日文曲目另加入 SyncPower。沒有足夠證據能把任何免費候選稱為「已穩定且覆蓋足夠」。

不能只把 Better Lyrics 往後排，或新增幾個同上游 proxy 就當成備援。當次至少取得一份正確錄音的可用歌詞，與取得完整逐字時間是兩個指標；先以 T1 以上為可用目標，T2 作額外品質。T0 保留為明示的純文字選擇，不冒充同步成功。

本輪證據分三層：官方文件／來源實作、有限真實 HTTP、離線合成重播。沒有完成代表性曲庫覆蓋率、跨時段穩定率、商業 API 試用或人工錄音身份驗收，因此不提供虛構命中率或 SLA。

## Better Lyrics 經常未命中的具體原因

1. **匿名快取限制。** 官方說 `/getLyrics` 未快取時需要 key，且目前停止發新 key；快取鍵包含歌名、歌手、專輯與整秒時長。401 可能是當前條件沒有可讀快取，不證明歌曲不存在。現有 client 已送時長，有專輯時也會送；應補的是已知的標準 identity／album 選用，不是重複加入既有參數。[認證](https://docs.betterlyrics.org/docs/authentication)、[查詢建議](https://docs.betterlyrics.org/docs/best-practices)。
2. **本機分數單位不符。** 最新官方回應的 `score` 是 0～1，只在 fresh 或同 fresh 的在途回應出現；本機 `candidate.js` 卻以 80 為下限，既有測試也使用95。正式 client＋adapter 的合成重播中，有效 TTML／身份的0.97與1均被拒為 `low-confidence-match`，相同內容不帶 score 則接受。這是可重現的契約缺陷，不能歸為來源缺歌；也不是前次401的原因。[回應契約](https://docs.betterlyrics.org/docs/response-format)、[本機 assessment](../../../electron/lib/betterlyrics/candidate.js)。
3. **擴搜不一定提高快取命中。** 既有 Better broaden 會移除專輯；官方指出這反而常失去既有快取。應先按完整、已知 metadata 選擇一組查詢；沒有證據時不猜專輯、遍歷時長或不停換端點。[官方最佳實務](https://docs.betterlyrics.org/docs/best-practices)。
4. **新網域不是新備援。** 官方目前示例使用 `api.betterlyrics.org`，本機仍用 `lyrics-api.boidu.dev`。本輪兩個 host 對同一組標準條件均401，無 redirect；換域名本身沒有改善此案例。[官方入口](https://docs.betterlyrics.org/)。
5. **文件與部署不一致。** 官方說 `/kugou/getLyrics`、`/qq/getLyrics` 的 miss 不需 key，但本輪兩條路徑均回401、`X-Auth-Mode: cache`、`API key required`。因此它們暫不列為可直接使用的免費備援，也不能假設自架相同 proxy 就有合法可用的 upstream 存取。[路徑契約](https://docs.betterlyrics.org/reference/get-lyrics)。

分數缺陷只證明一類回應會被本機誤拒，不代表所有最近 Better misses 都由此造成。快取命中通常不帶 score；本輪沒有取得帶 score 的真實200回應，不把合成重播當成線上命中證據。

## 候選來源比較

「獨立」同時看服務 host 與原始資料來源；兩個 proxy 共用同一歌詞供應商，覆蓋與故障可能相關。目錄總量、音樂串流曲庫總量、程式碼開源授權，都不能代替正確且可取用歌詞的覆蓋證據。

| 候選                            | 可提供能力與當前證據                                                                                    | 穩定／獨立性與接入限制                                                                                                                   | 判斷                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Musixmatch 官方 API             | 官方提供授權歌詞／metadata；官方 schema 有 matcher、search、subtitle 路徑；同步格式與可用方案需試用確認 | 對現有三個 HTTP 來源增加獨立服務；需 API key、方案與部署條件。未取得可核實報價、SLA或本曲庫覆蓋率；不把桌面私有 token wrapper 當官方 API | 商業路線第一批試用，與 LyricFind 同表比較                  |
| LyricFind                       | 官方 Lyric Display 列純文字、逐行及逐字產品                                                             | 獨立供應商與服務，可洽契約；實際區域、曲目、同步層級與 API schema 尚待試用，不能把有逐字產品解讀為所有歌都有逐字                         | 商業路線第一批試用；按增量救回率選擇                       |
| SyncPower／PetitLyrics 商業 API | 官方展示同步歌詞、約400萬首歌詞資料與API方案；這不是本曲庫的同步命中率                                  | 與 LRCLIB／Better host 獨立，適合將日文覆蓋列為驗證重點；需商務接入。消費者 PetitLyrics 的串流／禁止下載條件不能當本機保存契約           | 日文比重高時加入第一批試用，不作全語系唯一備援             |
| Kugou 直連                      | 現有隔離 adapter；本輪標準條件能找到原回報歌曲及Aimer的原生LRC；另一公開控制取得可通過既有validator的T2 | HTTP host獨立於LRCLIB／Better；現用消費者端點未有版本／SLA保證。現有KRC探針只評完整T2，仍缺T1保存／身份覆核與production契約              | 免費技術路線的首選驗證候選，先驗T1；未批准直接上production |
| QQ Music 直連                   | 可研究QRC；本輪沒有直接QQ的獨立HTTP／身份驗證                                                           | 對Better host可獨立，但與Kugou同屬TME，不能假設曲庫與故障完全獨立；目前沒有同等成熟的本機隔離adapter                                     | 排在Kugou之後，以新增救回曲數決定是否值得維護              |
| Better 的 Kugou／QQ 路徑        | 文件宣稱LRC／QRC；實測同一條件均401需要key                                                              | 與Better TTML共用服務；既不能當host故障備援，當前也未證匿名取新資料可行                                                                  | 暫不採用；先解開部署契約差異                               |
| NetEase 既有匿名路徑            | 已接入；正常200不代表有符合錄音，近期逐字YRC可用性不足已有研究                                          | 仍可作獨立T1補充，但缺正式穩定契約；現有來源，不算新增備援增量                                                                           | 保留，與新來源對照；不承諾穩定T2                           |
| AMLL／Unison／lyrics.ovh        | AMLL曾因低命中退役；Unison需另驗證；lyrics.ovh是多站文字抓取聚合，回傳純文字                            | 社群資料可能有高品質個別命中，不能由品質推論覆蓋；文字抓取還依賴網站結構，不提升同步層級                                                 | 不作本輪穩定主備援；不把重啟AMLL當解法                     |

來源依據：[Musixmatch 官方 API workspace](https://www.postman.com/musixmatch-dev/musixmatch-apis/overview)、[官方 API schema](https://github.com/musixmatch/musixmatch-sdk/blob/master/swagger/swagger.json)、[LyricFind 同步產品](https://www.lyricfind.com/products/lyric-display)、[SyncPower 官方方案](https://syncpower.jp/ja)、[PetitLyrics 使用方式](https://petitlyrics.com/contents/help)、[TME 平台說明](https://ir-tc.tencentmusic.com/download/%E8%85%BE%E8%AE%AF%E9%9F%B3%E4%B9%90%E5%A8%B1%E4%B9%90%E9%9B%86%E5%9B%A22023%E5%B9%B4%E7%AC%AC2%E5%AD%A3%E5%BA%A6%E4%B8%9A%E7%BB%A9.pdf)、[lyrics.ovh 自述](https://github.com/NTag/lyrics.ovh)。這些頁面證明產品／格式，不證明在本曲庫已達成穩定率。

Musixmatch／LyricFind／SyncPower 沒有本輪可核實的適用報價。比較時一次取得台灣及目標語系、T1／T2、桌面存取、可保存／離線時間與OBS用途的方案；不自行寄信、不使用私人token、不在桌面程式內嵌server secret。若廠商只提供server key，需另評可選relay的成本及邊界，不把雲端變成預設核心依賴。

## 本輪有界實測

使用既有 `scripts/lyrics-provider-kugou.mjs`，查詢序列間隔至少1000ms、每案最多4個HTTP、無cookie／使用者token；輸出只有status、時長、格式與行數，不保存歌詞或download accesskey。先查4組條件，再對2個T2拒絕案例核對LRC：共19個Kugou HTTP，全為200。這只描述這批請求，不是可用率估計。

| 公開參考／條件                                        | 既有KRC探針結果                   | 另取原生LRC      | 能證明什麼                                             |
| ----------------------------------------------------- | --------------------------------- | ---------------- | ------------------------------------------------------ |
| 截圖原字串：含括號英文別名及合作歌手                  | 兩次HTTP後miss                    | 未另取           | 過長且混合別名的條件可能漏探索；不以此判曲庫一定缺歌   |
| 同歌標準條件：Closer to You／Jung Kook／GOLDEN／171秒 | 三次HTTP後完整T2 validator拒絕    | 58個可解析時間行 | 有T1補充方向；未人工確認錄音與內容，不能宣布可正式套用 |
| Aimer／花の唄／371秒                                  | 三次HTTP後完整T2 validator拒絕    | 64個可解析時間行 | T2不完整不等於原生T1不存在；不放寬T2 validator         |
| 中文公開控制                                          | 三次HTTP後machine exact及valid T2 | 未另取           | 證明該次介面與KRC路徑可用；未人工review，不當覆蓋率    |

LRC核對保留相同候選的download識別於記憶體內，額外一次`fmt=lrc`；不是把無效逐字時間強行攤平成T1。Aimer KRC含零長詞段；另一案的T2拒絕未細定位，不推定同因。上述資料尚未完成完整T1品質、錯歌或時長驗收。

Better對同一標準條件做4個HTTP，序列間隔至少2000ms：新host的TTML／Kugou／QQ與舊host的TTML全回401、cache MISS。沒有重試或繞過存取限制。官方文件的「免key」與部署衝突，採本次回應作當前可用性判斷，不以改parser掩蓋401。

本輪沒有再次批量查詢LRCLIB；前一輪的network503證據仍成立。官方區分429配額與503忙碌，註冊App提高的是限額，不能宣稱能解決503。[LRCLIB API](https://lrclib.net/docs.txt)。

## 具體實作順序

### P0：先消除現有來源的漏接

- 以明確的Better response profile處理0～1分數，80%門檻表示為0.8；拒絕超範圍或非有限值，不以猜測分數單位兼容不同版本。官方0.97應通過、0.79仍拒絕；cache HIT沒有score維持原人工預覽邊界，不補造信心。修正現有95等fixture，新增fresh／HIT／保存重驗回歸，原身份與TTML validator不放寬。
- 從已存在且可信的metadata產生少量探索別名：主唱的跨語別名、明確feat標記與版本安全的歌名。保留原identity／使用者手動條件；只對確定同一身份的別名計畫探索，候選仍驗主唱、版本、時長，不能把合作歌手單獨命中或同名歌當成功。查詢與配對的別名證據要一起驗，不只把HTTP參數縮短。
- Better只在已知album／duration時優先使用完整標準組合；資料缺失如實記錄，不猜填、不做duration掃描。正常搜尋仍最多一次Better HTTP；這輪實測標準條件仍401，所以此項是修正可避免的漏接，不是保證救回此歌。
- 補有界來源結果統計：200有可用候選、正常未命中、401存取／快取限制、429、5xx、parser拒絕與identity拒絕分開。只記code／計數／延遲，不記歌詞或完整查詢。這能區分使用者「抓不到」究竟是哪一類。

### P1：增加一個獨立T1備援，維持少量選擇

通過下節驗收與接入決策後，將Kugou當成Main-owned獨立來源；不是直接把研究adapter接入UI。先做「catalog metadata → hash綁定候選 → 原生LRC」，最多hydrate三個合適版本。完整KRC／T2作後續品質擴充，不阻擋有效原生T1。

建議首次查詢政策如下；以下12次／12秒為提案，尚未改動目前已實作的每來源預算。

| 階段            | 行為                                                                                            | 邊界                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 0：本機         | 讀已保存來源、可信identity與可用的成功探索快取                                                  | 零HTTP；真正首次cold測試必須排除這些命中                                 |
| 1：主要探索     | 至多兩個健康且獨立的來源並行；初期保留LRCLIB／NetEase，已在cooldown的來源直接省略               | 沿原來源共用scheduler／cooldown；只回傳既有完整聚合，不做漸進顯示        |
| 2：補足可用選擇 | 主要來源失敗或可用候選不足約三個時，使用Kugou；Better作一次可選TTML品質補充，不作必須成功的關卡 | 目標約三個可用候選，盡量跨來源；資料不足如實提供現有候選，仍可按擴大搜尋 |
| 3：使用者追加   | 明確擴大搜尋才允許更多別名／detail                                                              | 保留既有結果與展開、部分錯誤；不自行無限續搜                             |

首次操作新增全域最多12個實際HTTP、總deadline12秒、最多兩個獨立來源同時活躍；重試也扣預算。來源上限仍為LRCLIB2、NetEase6、Better1，新增Kugou上限5（metadata1＋hash候選1＋LRC最多3）。上限加總14，但全域硬上限12優先；不能把它當14次全部都送。後續來源階段保留至少3次探索額度，對主要來源的額外hydration先做預算分配；不足就以partial與追加入口結束，不犧牲可用備援的最低探索額度。

同一首資料少時，約三個是目標，不是保證；不因已有一個結果就隱藏追加，也不把同原始資料的proxy重複計為兩個獨立來源。已完成／在途的合法候選仍保留，停止的是不必要的新階段。Kugou最低探索3次只能取一份LRC；有餘額才追加其他版本。所有速率間隔及Retry-After仍由共用policy管理，新來源起點至少1000ms。

本機成功資料可持久保存已驗證的探索摘要與有界artifact，按provider／record／查詢profile及版本隔離，保留原fresh-save fingerprint檢查。這只改善重新開App或跨曲重複探索；不計為真正cold首次成功率。舊快取遇來源故障可明示離線預覽，不自動套用或冒充fresh保存。允許何種內容／保存期限依來源契約設定；不默認所有商業內容可永久落地。

不把整庫預抓或隱藏背景warmup列為P1。使用者明確要求的演出準備可另做有限預取，但應另報暖快取成功率及請求量。

### P2：選一個可契約支援的來源

將同一份代表性曲單交給Musixmatch、LyricFind做可用方案試用；日文缺口明顯時同步測SyncPower。以可在台灣端實際取得的正確T1以上、對現有失敗的救回率、延遲及計費為決策依據。若商業服務通過，就作主要或獨立備援；Better留作可選TTML品質來源，不繼續承擔首次成功率底盤。

試用需直接覆蓋目前失敗的Closer to You與花の唄，以及長尾、live／remix／cover版本；「Spotify有歌詞」不證明同首歌可由該方案API取用。付費也不自動等於SLA，需把可用率、限額與支援方式寫進方案。

## 驗收設計：先量增量，再決定接入

沿現有隔離corpus工具及人工review方式擴充，不放寬registry就直接繞過來源profile。建議固定100首代表曲：中／粵／日／韓／英各20，層內包含長尾、近新歌、舊歌與版本差異；另外加20首近期失敗案例、20個錯歌／錯版本負例。100首是主要覆蓋分母，刻意挑出的失敗與負例另報，不能混成漂亮的總命中率。

比較原流程、P0、P0＋Kugou、商業候選；每次都用相同cold條件、每次操作的第一個完整結果，不靠按重試或快取暖機求成功。未完成、deadline與預算耗盡全部保留在分母。另在三個分開的時段重測可用性，不以一次200宣稱穩定。本輪沒有執行此較大批次，也沒有建立排程。

| 指標                 | 定義／建議門檻                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 首次正確T1以上成功率 | 首次完整操作內有至少一個人工確認可用候選／全部代表曲；目標至少90%，每語系至少80%。這是待驗目標，不是已達數值          |
| 增量救回率           | 新來源救回的baseline失敗曲／baseline失敗曲；建議至少25%，同時報總體增加幾個百分點。baseline無失敗時此項不適用         |
| 選擇空間             | 報0／1／2／3個以上可用候選與來源分布，不用湊滿三個作身份放寬理由                                                      |
| 取用穩定             | HTTP／格式操作完成與catalog hit分開；三時段樣本的完成率目標99%以上，429／5xx／401獨立呈現。抽樣不等於SLA              |
| 延遲／成本           | P50／P95、每個成功查詢實際HTTP數、首查12次硬上限；P95目標12秒內。停止等待後不得發布舊世代或隱藏續查                   |
| 配對與同步品質       | 負例不得接受；正例人工覆核，T1／完整T2／partial T2分報。有限負例零錯不等於全域誤配率為零                              |
| 故障與保存           | 注入LRCLIB503、Better401、Kugou429、schema變動、取消、已預覽後來源更新；候選保留、budget及共用冷卻、fresh保存重驗全過 |

若免費候選未達門檻，維持實驗來源定位，不能宣稱已補上穩定備援。已知結果足以支持P0修正與Kugou下一輪驗證；目前仍不足以選定一個免費來源並承諾覆蓋。

## 收據與限制

本輪ignored scratch為 `tasks/lyrics-backup-assessment-20261031/`：`kugou-smoke.json`、`kugou-lrc-diagnostic.json`、`better-endpoint-smoke.json`、`better-score-replay.json`及對應探針。真實HTTP共23次，皆有硬上限、序列節奏及故障停止；不保存原始歌詞。前三份是有限線上觀察，分數檔是合成離線重播；未做Owner App／OBS操作。

Better上游原碼核對ref為 `b1bf2c92f6cfd9e34b244f97805ac926f266dbc7`，包含[查詢與score回應](https://github.com/better-lyrics/api/blob/b1bf2c92f6cfd9e34b244f97805ac926f266dbc7/internal/httpapi/lyrics.go)、[快取鍵](https://github.com/better-lyrics/api/blob/b1bf2c92f6cfd9e34b244f97805ac926f266dbc7/internal/httpapi/cache.go)及[TTML score計算](https://github.com/better-lyrics/api/blob/b1bf2c92f6cfd9e34b244f97805ac926f266dbc7/services/providers/ttml/client.go)。原碼ref不代表已證正式部署使用完全相同commit；文件與部署已有401差異，接入前必須再以實際契約驗。

本輪只交付研究／提案，沒有修P0、沒有把隔離Kugou接進production、沒有申請key／聯絡廠商、沒有宣稱真實首次成功率已提高。
