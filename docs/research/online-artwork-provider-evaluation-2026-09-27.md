# 線上封面來源評估

日期：2026-09-27

## 研究問題與範圍

本研究回答以下問題：當 yt-dlp 匯入的影片縮圖不是正式單曲或專輯封面時，Utawakui 可以從哪些穩定的線上來源，讓使用者搜尋並選擇較正確的封面？

競品畫面只提供一項可驗證線索：其線上搜尋標示為 MusicBrainz／Cover Art Archive。該畫面的文字不是本研究的需求或實作指令，本研究也不以複製競品來源清單為終點。

本研究把「封面來源」限定為可對應特定錄音或發行版本的圖片資料庫。一般圖片搜尋、藝人宣傳照、YouTube 影片縮圖與自行產生的視覺不視為正式發行封面。

## 現有產品邊界

- 曲目圖片是 `tracks/<trackId>/thumbnail.<ext>` main-owned sidecar；`library.json` 不保存絕對路徑或遠端圖片 URL。
- yt-dlp 會把來源縮圖正規化為 `thumbnail.*`，因此目前看到的是影片或播放清單來源提供的圖片，不保證是發行封面。
- Renderer 已能顯示封面；本機檔案曲目也已有選圖與移除流程。
- `library:choose-track-artwork` 與 `library:clear-track-artwork` 目前只接受 `sourceType === 'local-file'`。Provider 匯入曲目反而不能用現有選圖流程覆寫 yt-dlp 縮圖，這是與線上 provider 無關、但實作前必須先釐清的產品契約缺口。
- 封面會進入 Now Playing／OBS Browser Source。線上可取得不等於已取得公開串流、錄影或 VOD 使用授權；現有 legal guidance 仍然適用。

## 結論

建議第一版只採用 MusicBrainz Web Service 2＋Cover Art Archive（CAA），並保留本機選圖與 yt-dlp 縮圖。不要在第一版同時接 Spotify、Apple、Discogs、Last.fm、TheAudioDB 或 fanart.tv。

MusicBrainz／CAA 不只是競品既有選擇，也是在本研究中唯一同時符合下列條件的組合：

- 可從 artist／recording／release／release group 建立可解釋的匹配鏈，而不是只回傳圖片搜尋結果。
- MBID 是穩定識別碼；Renderer 不必傳任意 URL，main 可由 provider id 與 MBID 導出固定 endpoint。
- 不需要把可被擷取的 client secret 包進桌面 App。MusicBrainz 查詢不需要 API key，但必須使用有意義的 User-Agent。
- CAA 提供 front image 與 250／500／1200px thumbnails；選定後可下載為既有本機 sidecar，而不是長期 hotlink。
- MusicBrainz 2026-09-24 官方統計為 3,909,184 個有 cover art 的 releases（67.4%）、7,537,391 張 cover art、3,135,433 個有代表封面的 release groups。規模顯著高於本次找到的其他開放候選。
- Metadata core data 是 CC0；CAA 是 MusicBrainz 與 Internet Archive 的長期合作。這仍不是圖片著作權授權，CAA 官方也明確要求使用者自行承擔圖片使用風險。

TheAudioDB 與 fanart.tv 可列入第二階段候選，但只有在真實曲庫 benchmark 證明 CAA 有具體缺口時才值得加入。兩者目前不是更好的預設來源：前者公開 App 需要付費方案且資料量較小，也會匯入 CAA；後者以 MusicBrainz MBID 查詢，因此不能改善最困難的「這首音訊到底是哪個版本」問題。

## 平台評估

| 平台                                 | 搜尋與圖片能力                                                                                       | 主要限制                                                                                                                 | 判定                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| MusicBrainz＋Cover Art Archive       | recording／release／release-group 搜尋；CAA front 與 250／500／1200px；release-group 與 release 兩層 | MusicBrainz 每個 client 最多 1 req/s；需 User-Agent；Hosted API 商用需另確認；CAA 圖片不是 rights-cleared                | 第一版唯一預設來源    |
| TheAudioDB                           | artist／album／track 搜尋；album 最高 700px；可用 MusicBrainz ID lookup                              | 公開 App 需付費；V2 與 track search 偏 premium；需標示來源；官方資料量約 326k albums，且部分內容來自 CAA                 | 有 benchmark 才補充   |
| fanart.tv                            | MBID 對應 artist／release group；常見 1000px 使用者圖片                                              | 需要 project key；不能解決 metadata matching；project key 新圖延遲；圖片權利由使用者與實際使用者自行負責                 | 僅候選替代圖來源      |
| Apple iTunes Search／Apple Music API | 商業 catalog 搜尋品質高；album artwork URL；Apple Music 可提供可變尺寸                               | iTunes artwork 是促銷內容，要求商店回鏈／badge，只能用於推廣對應內容；不適合作為永久本機 sidecar                         | 不採用                |
| Spotify Web API                      | catalog 廣、track search 與多尺寸 cover                                                              | OAuth；development mode 最多 5 位 allowlisted 使用者且 owner 需 Premium；公開擴額限組織；只允許暫時快取並要求 Logo／回鏈 | 不採用                |
| Discogs API                          | 實體版本與掃描豐富，適合收藏品 edition                                                               | 圖片是 Restricted Data；不得商用；內容不可比站上資料舊超過 6 小時；每筆資料需 attribution 與回鏈                         | 不採用                |
| Last.fm API                          | album／track 搜尋與 API image 欄位                                                                   | API key；預設只准非商用；正式條款明確把 images／artwork 排除於授權之外                                                   | 不採用                |
| Deezer                               | 歷史上可搜尋 catalog 與 cover                                                                        | 本輪未找到可穩定採用、可驗證圖片保存權利且適合新 public desktop app 的現行官方 developer contract                        | 不建立依賴            |
| Google／Bing 等一般圖片搜尋          | 找圖率高                                                                                             | 搜尋結果不是授權；來源 URL 易失效；無法可靠判斷版本；引入任意 URL／redirect／SSRF 與內容安全風險                         | 不採用                |
| Wikimedia Commons                    | API 穩定且能取得明確自由授權 metadata                                                                | 主流商業專輯封面多半不符合 Commons 自由授權要求，覆蓋率不足                                                              | 不作一般封面 provider |

## MusicBrainz／CAA 的實際邊界

### API 與營運條件

- MusicBrainz Web Service 2 的搜尋與 lookup 不需 API key；每個 client 不可超過每秒一個 request，且必須送出可辨識的 User-Agent。
- CAA API 文件目前寫明沒有一般 rate limit，但仍可能回 503。Utawakui 應尊重 Retry-After、使用 bounded exponential backoff，不能因「目前無限流」而併發掃描整個曲庫。
- CAA release-group `/front` 是社群選出的代表圖，可能不存在；個別 release 仍可能有 front。實測 `KICK BACK` 的 release-group front 不存在，但 5 個 official releases 中有 4 個 release front 可用。因此正確 fallback 是 release-group front → official release front，不是第一個 404 就宣告沒有封面。
- 建議下載 1200px front，無 1200 時退到 500px；原始檔只作最後 fallback。這足以服務控制台與 OBS 模板，又比無界原圖容易做下載大小與 decode 限制。
- MusicBrainz metadata core data 是 CC0，但 hosted web service 的免費條件以非商用為主。若 Utawakui 未來進入商業發行或產生收費，發版前需向 MetaBrainz 確認 supporter／commercial service 條件。
- CAA 圖片的著作權仍屬實際權利人。CAA 是公開 archive，不是同步、直播或 VOD 圖片授權服務。

### 跨語系小型實測

2026-09-27 直接對官方 MusicBrainz WS2 與 CAA API 做了 8 首 probe。查詢使用 exact artist／title，recording 搜尋取前 10 筆並展開 official releases；release-group 搜尋另查同名單曲，CAA 檢查 release-group front 與必要的 release front。本表只證明資料鏈行得通，不是完整命中率 benchmark。

| 曲目                           | 實測結果                                                                                                        | 產品含意                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 蔡依林 — 玫瑰少年              | recording 可追到 `Ugly Beauty` 並取得封面；同名 release-group 搜尋反而先回 `玫瑰少年 (from THE FIRST TAKE)`     | 不能把「同名單曲」自動當成原錄音                     |
| 周杰倫 — 晴天                  | 沒有同名 release group；recording 鏈得到 7 個 Album／Single／EP 候選，6 個有 release-group front，包含 `葉惠美` | Album track 必須走 recording → release               |
| YOASOBI — アイドル             | 同名 single score 100 且有封面；查詢期間 MusicBrainz 曾回一次 server busy                                       | 資料完整，但必須節流、重試與可恢復錯誤               |
| 星街すいせい — Stellar Stellar | 同名搜尋第一筆是 acoustic arrange，原名 single 另有候選且都有封面                                               | 版本字樣與 duration 必須參與排序                     |
| Ado — 唱                       | 同名 single score 100 且有封面；recording 鏈也會帶入精選、演唱會與 playlist                                     | 正確封面存在，但不應讓合輯淹沒候選                   |
| 米津玄師 — KICK BACK           | 正確 single release group 存在；release-group front 缺少，但 5 個 official releases 中 4 個有 front             | 必須有 release-level fallback                        |
| Queen — Bohemian Rhapsody      | recording 搜尋共 225 個匹配；直接 release-group 搜尋也有多個同名版本，1975 single 有封面                        | 熱門舊曲尤其不能只取搜尋第一筆                       |
| Olivia Rodrigo — vampire       | recording 搜尋有 14 個版本並帶入大量合輯；同名 release-group 搜尋則唯一 single score 100 且有封面               | 合併兩種查詢比只用 recording 或 release-group 更可靠 |

實測結論是「圖片覆蓋」不是主要難題，「錄音版本與發行的匹配」才是。MusicBrainz 的高分搜尋代表文字匹配，不代表它已判定使用者要 studio、live、acoustic、remix、compilation 或哪一版發行。

## 建議產品流程

### 搜尋入口

- 在既有封面區保留「選擇本機圖片」，另加明確的「線上搜尋」；兩者是同等入口，不把網路搜尋藏在匯入流程。
- 線上搜尋是使用者明確觸發的可選操作。匯入完成時不要自動查詢，也不要在背景批量覆寫 yt-dlp 縮圖。
- 預填目前可編輯的歌名與藝人，允許使用者調整查詢。`Acoustic Ver.`、`THE FIRST TAKE`、`live`、`remix`、`instrumental`、`karaoke` 等版本詞不能一律清掉；應另作 version signals。
- Provider 不可用或找不到結果時，本機選圖、既有封面與播放功能完全不受影響。

### 跨語言輸入與查詢展開

前述跨語系 corpus 只能證明需要涵蓋非拉丁文字，不能代替完整的跨語言搜尋設計。MusicBrainz 的 [aliases](https://musicbrainz.org/doc/Aliases) 本來就同時承載 locale name、常見異名、拼寫提示與 transliteration，alias 命中也會進入搜尋結果；因此第一選擇應是利用 catalog 已知 identity，而不是先把每個名稱機器翻譯成英文。

常見產品大致分成兩種模式：串流探索搜尋可用單一搜尋框、寬鬆召回與即時播放結果；會寫入檔案或 sidecar 的 metadata／tagging 工具則使用結構化欄位、候選對比、信心門檻與人工確認。Picard 也允許以現有 metadata 查詢後再修改條件，並在前兩名相似度差距不足時把結果標為 ambiguous、要求人工確認。Utawakui 會永久取代本機 `thumbnail.*`，應採後者。

輸入介面建議固定為「歌曲名稱」、「藝人／演唱者」，並可展開「專輯（選填）」與「版本提示（選填）」。不使用「作者」作欄名，因為在音樂 metadata 中可能被理解成作曲者或詞曲作者，而封面辨識需要的是 release／track artist credit。介面保留來源原始標題，另把辨識出的 `feat.`、`Acoustic`、`live` 等顯示為可修正的 signals；封面查詢中的文字修正只影響本次搜尋。若未來要修改曲庫 metadata，必須是另一個明確操作，不能因搜尋成功而靜默回寫。

原始輸入始終保留作顯示與最高權重證據；系統只在背後建立 bounded search variants：

| 階段             | 查詢與比對方式                                                                                                                                          | 進入條件                      | 信心與限制                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| A. 原文嚴格      | 以原始 title＋完整 artist credit 查同名 release group 與 recording；有可信 album 時一併帶入                                                             | 每次搜尋                      | 最高優先；仍需檢查版本與 release type                                      |
| B. Catalog alias | 使用 MusicBrainz 搜尋索引中的 artist／release-group／recording aliases、locale name、credited name 與 search hint                                       | 與 A 同輪，不另行展開所有語言 | alias 是同一 entity 的證據；結果標示「以別名命中」及命中的文字             |
| C. 確定性正規化  | 僅對 search key 做 Unicode compatibility normalization、空白／全半形／標點整理與 Latin case folding；華語可在 A 沒有足夠候選時增加一個繁↔簡變體         | A／B 無可用或信心不足         | 不改畫面上的原文；專案已 bundled `opencc-js`，不需為繁簡另加依賴           |
| D. 版本感知回退  | 從括號、副標與 `feat.`／`with`／`Acoustic`／`live` 等建立 title core、artist-credit、version signals；用 core 擴大召回，但把 signals 留在排序與衝突檢查 | 前輪結果太少                  | 不可把版本詞或合作藝人直接丟掉；版本衝突不得成為高信心                     |
| E. 低信心模糊    | 放寬 title token／拼寫，必要時才以本機 romanization 產生單一 fallback                                                                                   | 仍無可用候選                  | provider 已收錄的 alias 優先於自動轉寫；只進「其他可能結果」，不得自動選取 |

每一階段都應合併 MBID 去重，不把原文、繁簡、羅馬字、翻譯名做笛卡兒乘積式 fan-out。MusicBrainz hosted API 只有每秒一個 request 的公平使用額度，而其預設搜尋已包含 aliases 與 fuzzy matching；無條件逐語言連發不只慢，也會放大誤配。

以下差異要特別處理：

- 繁體／簡體是可逆性有限的文字變體，只能作召回提示；同名但不同藝人的結果仍是不同 identity。
- 日文假名、漢字與 romaji，韓文 Hangul 與 romanization，優先依 MusicBrainz locale alias；自動轉寫只有搜尋 fallback，不能成為 canonical title。
- 專案既有 `kuromoji`／`wanakana`／`koroman` 可在 corpus 證明有需要時重用於日韓單一轉寫 fallback，不必新增套件；其輸出仍不是 entity identity 證據。
- 翻譯名不能單獨證明是同一發行。MusicBrainz 的 translated／transliterated pseudo-release 應沿 relationship 回到原始 official release，再取正式發行封面；不把 pseudo-release 自身當成較可靠版本。
- `feat.`、`with`、`&` 與其他 join phrases 屬於 artist credit。MusicBrainz 也要求 featured artist 放在 artist credit 而非歌名；解析可以建立搜尋變體，但必須保留完整 credit 作比對證據。
- `THE FIRST TAKE`、acoustic、live、remix、instrumental、karaoke、cover 等是版本 identity。即使 core title 完全相同，版本訊號衝突也必須降級。

### 候選對比與信心

不要只顯示一個不透明的百分比。候選應顯示「高／中／低」信心與逐項命中理由，並把嚴格結果與低信心的「其他可能結果」分組：

| 對比軸        | 高信心證據                                                          | 降級或阻擋條件                                               |
| ------------- | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| 藝人 identity | 原文、credited name 或 locale alias 對到相同 artist MBID            | 藝人缺少、只靠字面相似或 artist MBID 衝突                    |
| 歌名 identity | 原文 exact 或 catalog alias／linked translation 命中                | 只靠自動 romanization、機器翻譯或寬鬆 token                  |
| 版本          | query 與候選都沒有版本詞，或 signals 一致                           | studio／live／acoustic／remix／cover 等互相衝突              |
| 發行          | album、release group、official status、primary／secondary type 一致 | compilation、bootleg、promotion 或 pseudo-release 無原始關聯 |
| 音訊          | duration 在驗收 corpus 校準的容許差內                               | duration 差距大；未知只能是不加分，不能假裝吻合              |
| 歧義          | 第一名同時通過必要條件且明顯領先第二名                              | 前兩名差距不足時標示「需要確認」                             |

第一版不論信心層級都只可預選，不能自動套用。使用者要能看到命中方式（原文／別名／繁簡／轉寫／模糊）、被保留的版本詞與可能衝突，再按「套用封面」。這比串流服務的單框搜尋保守，但符合永久寫入 sidecar 的風險。

### 候選建立

1. 依前述 A－E 階段建立 bounded query plan；先使用原文與 catalog aliases，只有結果不足才進入正規化與模糊回退。
2. 若 yt-dlp metadata 已有可信 album，先以 album＋artist 查 release group。
3. 同時查同名 release group，捕捉正式 single。
4. 查 recording title＋artist，展開 official releases／release groups，捕捉沒有同名 single 的 album tracks。
5. translated／transliterated pseudo-release 沿關聯回到 official release；不把翻譯文字等同於另一張正式封面。
6. 合併相同 MBID，移除沒有 front 的候選；release-group front 缺少時查看 official release front。
7. 以 artist identity、title／album identity、duration、年份、release status、primary／secondary type 與版本詞排序。
8. Compilation、live、remix、bootleg、promotion 不應在 query 沒有相應訊號時排在 studio official release 前面。

### 使用者確認

候選卡至少顯示：圖片、release title、artist credit、首次發行年、Album／Single／EP、版本／secondary type、country／edition（如有）、MusicBrainz 來源連結，以及為何被排在前面。若命中 locale alias，原始 catalog 名稱與該 alias 都要顯示，不能讓本地化名稱掩蓋實際發行。

第一版可以預選高分候選，但不要只靠文字分數自動寫入 sidecar。使用者按下「套用」後才下載並取代 `thumbnail.*`。這可避免 `玫瑰少年` 被換成 THE FIRST TAKE、`Stellar Stellar` 被換成 acoustic 或 `vampire` 被換成合輯。

### Main／Renderer 邊界

- Renderer 只送 `trackId`、bounded title／artist query、provider candidate id 與 apply intent；不得送任意 image URL、redirect target、檔案路徑或 IPC channel。
- Main 擁有 MusicBrainz rate queue、User-Agent、timeout、retry、provider allowlist、image download、MIME／magic-byte／size／dimension validation、atomic replace 與 diagnostics。
- Redirect 只允許 CAA／Internet Archive 的已知 HTTPS host。不可因 CAA 回傳 URL 就建立通用遠端圖片下載器。
- 建議以 `tracks/<trackId>/artwork.json` 保存最小 provenance：schema version、source、MBID（recording／release-group／release）、選取時間與 source page；不保存原始 API body、secret、使用者本機來源路徑或不必要的遠端 URL。
- 成功套用後仍只由 `utawakui-media:` 讀取本機 sidecar；Renderer、Overlay 與 OBS 不 hotlink 第三方 CDN。

## 跨功能共用的音樂 identity 層

封面搜尋不應建立第四套 title／artist 比對器。專案已經有可延伸的基礎：`electron/lib/musicTitle.js` 擁有 NFKC comparison key、裝飾文字處理、title-derived artist／track 拆解；`electron/lib/trackIdentity.js` 依來源可信度建立 title、credited artists、album、duration、ISRC 與 provenance；`electron/lib/metadataEnrichment.js` 再把不同來源的 metadata 投影成 lyrics profiles。Lyrics 的 bounded query、繁簡比對、版本衝突與 duration evidence，以及 import 的 recording-kind ranking，則仍分散在各 provider／resolver。

目前 provider import 已建立較豐富的 observed identity，但下載完成後 library index 主要只保留扁平 title／artist／album／duration／year 與粗粒度 origin；本機檔案匯入也仍以檔名為主，尚未把音訊 tag 投影成同一 identity。Library 目前沒有 artist entity，album 摘要只是取 member tracks 最常見的原始 artist 字串。共用層的價值因此不只在省掉重複函式，也是在 lyrics、provider import、本機 tag import、artwork 與日後 library organization 之間保留相同的 field-level provenance。

因此建議延伸既有模組，建立「共用 evidence、各 feature 自訂 policy」的分層，不新增一個無法解釋的全域 similarity score：

| 共用層              | 最小責任                                                                                                                  | 不負責                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Identity extraction | 保留 raw title／artist credit，解析 title core、credited artists、album、duration、ISRC、來源與可信度                     | 不決定哪個 provider 結果最好                                   |
| Variant planning    | 產生 bounded original、catalog alias、繁簡、cross-script、romanization 與 fuzzy variants，每筆帶 kind／source／confidence | 不直接發網路 request，不產生笛卡兒乘積                         |
| Version signals     | 在移除裝飾字之前擷取 live／acoustic／remix／cover／karaoke／instrumental／speed／edit 等訊號                              | 不把版本詞當一般噪音永久刪除                                   |
| Artist credit model | 同時保留完整 credited string、拆出的 artist parts、join phrase／feat. evidence 與可選 external artist ids                 | 不用拆字串結果覆蓋正式 credit                                  |
| Identity comparison | 回傳逐軸 title／artist／album／duration／external-id match、version conflicts、命中 variant 與 ambiguity evidence         | 不給所有功能共用同一個總分、門檻或 auto action                 |
| Provenance          | 記錄每個值來自使用者、track metadata、title parsing 或 provider entity，以及是否經使用者接受                              | 不保存完整 provider response 或把暫時推測宣告為 canonical fact |

共用 comparison 的輸出應是 evidence vector，而不是單一數字。例如同一候選可以是「artist MBID exact、title locale alias、duration +2 秒、無版本衝突、album unknown」。Lyrics、import 與 artwork 再各自決定這組證據能否成為 exact、推薦或只供人工選擇。

`trackIdentityKey` 之類由 title／artist／duration 組成的值只能用於短期 cache／dedupe，不能當永久 recording 或 artist id。`splitArtistNames` 的結果也只適合做搜尋 hint；`&`、`with`、`和` 等切分可能拆壞正式團名，未經 catalog id 或人工確認不得建立持久 artist merge。

### Consumer policy 對照

| Consumer            | 共用的 identity 能力                                                                       | 必須保留的 feature policy                                                                                       | 寫入規則                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Lyrics 查詢         | 原文／alias／繁簡 variants、artist credit、recording version、duration、ISRC／MBID（如有） | 同錄音與 timing fit 優先，再排 provider 的 T0／T1／T2 capability；錯誤版本不得因歌詞品質高而越級                | 維持現行 exact-only automatic gate、save-time refetch 與 fingerprint；不可因共用分數放寬 |
| Import 查詢         | 從 yt-dlp／YT Music metadata 建立 identity、比較 title／artist／duration 與版本            | playback kind、可下載性、Topic／official audio、MV／live／variant、view count 與 source review                  | 仍由使用者確認實際 media id；下載後 sidecar metadata 才是本機 timing authority           |
| Artwork 查詢        | 同一 recording identity、aliases、artist ids、album／release hints 與版本 signals          | release group／release、Official／Pseudo／Compilation、Album／Single／EP、年份／edition、CAA front availability | 第一版永遠人工套用；選封面不靜默修改 track metadata                                      |
| Artist 整理         | credited artist parts、locale aliases、artist MBID、名稱變更／有效期 evidence              | merge／split、同名消歧、偏好顯示語言、藝名與 side project 判斷                                                  | 保留每首歌的原始 artist credit，以 stable artist entity 關聯做分組；不得全域字串取代     |
| Album／library 整理 | release／release-group ids、album aliases、artist credit 與年份                            | source-backed album membership、edition 合併或分離、Various Artists 規則                                        | 需要獨立 schema／ADR；不能只因正規化後 album 字串相同就合併                              |

未來 artist 整理的核心不是把名稱「正規化成唯一字串」，而是把多個 credit／alias 連到同一 stable entity。`周杰倫`、`Jay Chou`、`Chou Jie Lun` 可以是同一 artist 的名稱證據，但曲目仍保存實際 credited form；`Snoop Dogg` 與 side project、同名藝人、團體與成員也不能只靠文字相似自動合併。沒有可信 external id 時，合併應保持本機、可撤銷並需人工確認。

### 現有程式的收斂順序

1. 先用現有 tests 鎖定 `musicTitle.js`、`trackIdentity.js`、LRCLIB／NetEase matching 與 `importResolver.js` 行為，不在抽取過程改 threshold。
2. 讓 title normalization 同時回傳 comparison key 與 version／credit evidence。現行 `normalizeForCompare()` 會移除 `live`／`session` 等字，因此 consumer 不可只拿正規化字串判斷錄音身份。
3. 將 NetEase 內部的繁簡 comparison、LRCLIB 的 cross-script variants 與 import 的 title／artist comparison 收斂成純函式；provider adapter 只負責參數名稱、request budget 與 response mapping。
4. 讓各 feature 以自己的 policy 消費同一份 evidence，做 differential tests 證明 lyrics automatic gate 與 import 推薦結果沒有非預期改變。
5. Artwork 作為下一個 consumer 驗證 release-level evidence；等 recording／artist id provenance 穩定後，再為 artist／album entity persistence 寫獨立 ADR。不要為了封面功能先偷渡新的 library schema。

這個分層也限制 Renderer 的責任：UI 只送 bounded search edits、選定 candidate id 與 apply intent。原始輸入、variants、provider ids、identity comparison、merge proposal 與寫入都由 Main 擁有；任何未來 artist merge／split 都應是可預覽、可撤銷的明確操作。

若後續 ADR 接受持久化 identity，優先考慮 versioned、main-owned 的 `tracks/<trackId>/identity.json` sidecar 保存 observations、field provenance、external ids 與使用者確認；不要把完整 alias graph 塞入目前的 scalar `library.json`。這只是建議的演進方向，不是本次 artwork 研究已決定的 schema。

## 第二階段與不建議過早實作的項目

### AcoustID／Chromaprint

若真實曲庫 benchmark 顯示 title／artist／duration 仍常把錄音版本配錯，可在第二階段評估本機 Chromaprint＋AcoustID。AcoustID 能把完整音檔 fingerprint 對到 MusicBrainz recording MBID，官方統計有超過 2,200 萬個具 AcoustID 的 recordings；免費 web service 限非商用、每秒 3 requests，商用另有方案。

它能改善 identification，但不提供封面，也會新增 native runtime／packaging／privacy／商用條件，因此不應成為第一版封面搜尋的前置依賴。

### TheAudioDB／fanart.tv

只有下列證據同時成立時才加入：

- 以 Utawakui 真實目標曲庫至少 100 首（華語、日語、VTuber、動漫／遊戲、西洋、live／cover）跑固定 corpus。
- CAA 在已正確辨識 release group 後仍有顯著 cover miss，而第二來源能補足，不只是回傳相同 CAA 圖片。
- 已接受 API key、付費、attribution、圖片權利與公開 App 條件。
- Provider 故障時不影響本機核心，且不需要把 project secret 暴露給 Renderer。

目前沒有這些證據，所以新增多 provider 只會增加錯誤分類、金鑰管理、UI attribution 與測試矩陣。

## 建議驗收 corpus

正式實作前建立至少 100 首只含合法 metadata／expected MBID 的本機 fixture manifest，不保存第三方圖片本體。每筆記錄 title、artist、duration、album（可空）、version expectation、expected release group／acceptable alternatives。

分層至少包含：

- 25 首華語：繁簡體、藝名、feat.、專輯曲、演唱會版。
- 25 首日語／VTuber：日文 script、羅馬字、THE FIRST TAKE、acoustic、動畫版。
- 20 首西洋熱門曲：同名 single／album、remaster、deluxe、合輯氾濫。
- 15 首動漫／遊戲：character／unit artist credit、soundtrack 與單曲並存。
- 15 首 cover／live／karaoke：預期應保留版本差異，不能錯套原唱 studio cover。

量測至少包含：正確候選出現在前 5 的比例、第一名正確率、CAA cover availability、錯誤自動套用數、平均／P95 查詢時間、429／503 復原，以及非拉丁文字 query 的失敗率。第一版在沒有 corpus 結果前，套用必須維持人工確認。

## 官方來源

- [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API)
- [MusicBrainz Search API](https://musicbrainz.org/doc/MusicBrainz_API/Search)
- [MusicBrainz aliases](https://musicbrainz.org/doc/Aliases)
- [MusicBrainz alias style／locales](https://musicbrainz.org/doc/Style/Aliases)
- [MusicBrainz artist credits](https://musicbrainz.org/doc/Style/Artist_Credits)
- [MusicBrainz pseudo-releases](https://musicbrainz.org/doc/Style/Specific_types_of_releases/Pseudo-Releases)
- [MusicBrainz data license](https://musicbrainz.org/doc/About/Data_License)
- [MusicBrainz image statistics](https://musicbrainz.org/statistics/images)
- [Cover Art Archive API](https://musicbrainz.org/doc/Cover_Art_Archive/API)
- [Cover Art Archive policy](https://musicbrainz.org/doc/Cover_Art_Archive)
- [MetaBrainz datasets／canonical data](https://metabrainz.org/datasets/derived-dumps)
- [MusicBrainz Picard lookup workflow](https://picard-docs.musicbrainz.org/en/latest/usage/retrieve_browser.html)
- [MusicBrainz Picard matching](https://picard-docs.musicbrainz.org/en/latest/config/options_matching.html)
- [MusicBrainz Picard locale aliases](https://picard-docs.musicbrainz.org/en/latest/config/options_metadata.html)
- [Unicode normalization forms](https://www.unicode.org/reports/tr15/)
- [TheAudioDB API](https://www.theaudiodb.com/free_music_api)
- [TheAudioDB terms](https://www.theaudiodb.com/docs_terms_of_use.php)
- [TheAudioDB pricing](https://www.theaudiodb.com/pricing)
- [fanart.tv API 3.2](https://api.fanart.tv/)
- [fanart.tv terms](https://fanart.tv/terms-and-conditions/)
- [Apple iTunes Search API terms](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/index.html)
- [Spotify Web API search](https://developer.spotify.com/documentation/web-api/reference/search)
- [Spotify Developer Terms](https://developer.spotify.com/terms)
- [Spotify quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
- [Discogs API Terms of Use](https://support.discogs.com/hc/de/articles/360009334593-API-Nutzungsbedingungen)
- [Last.fm API Terms of Service](https://www.last.fm/api/tos)
- [AcoustID web service](https://acoustid.org/webservice)
- [AcoustID statistics](https://acoustid.org/stats)
