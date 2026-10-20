# 社群專案功能分層規劃

已歸檔：保留本輪功能／依賴分類與選項推導，不再作現行計畫入口。最新方向、set 標準及共用基礎分階段工作見[現行計畫](../governance/appearance-sets-plan.md)。

日期：2026-10-20。狀態：供討論的提案，尚未採用或實作。
本文件依目前程式、registry 與 [spec](../spec.md) 分類功能；不改現有 gate、功能可用性或付款權限。
完整版本、逐項直接／間接依賴與證據見[依賴授權查核](../governance/community-dependency-boundaries-2026-10-20.md)及其 JSON 索引。
單包、當期／全未來解鎖、持續支持及市場策略的比較，見[外觀贊助模式與市場策略提案](../research/appearance-support-models-market-plan-2026-10-20.md)。

本輪修訂：免費提供功能，預設只提供最小 default 外觀 set；未來額外自有 set 個別單次取得。
現有模板完成度均不足以商品交付；下表是功能與依賴分類，不是可售清單。作品標準與點數評估見[外觀 set 標準草案](../governance/appearance-sets-plan.md)。
分離、分析、讀音、批次處理與一般工作流維持免費或免費選用，不再將批次能力列為收費候選。
「適合贊助解鎖」代表可評估的候選，不代表已完成收費前的授權、產品或技術驗收。

## 規劃基準

依使用者說明，本案為個人、未登記、目前無收入的社群專案，不洽詢商用方案。
發布狀態另有資料差異：既有依賴報告沿用「未公開發布」敘述，但目前 spec 記載 v0.3.0／v0.4.0 已公開測試發布；本提案不以未發布作為外部服務使用的豁免依據。

1. Basic 不需網路、帳號、Provider Python、Audio Python、模型或 Output server 才能完成主要操作。
2. 免費選用指可獨立開啟的工作流；仍受各自依賴、安全、內容權利與品質條件限制，並非所有項目都已適合公開承諾。
3. 贊助候選只針對 Utawakui 自有的呈現或操作增益，不販售第三方音樂、歌詞、模型權重或 API 配額。
4. 暫不開放指暫不列為正式或贊助權益；現有研究入口與原型不因這份規劃自動被移除。
5. 純自願贊助且人人功能相同，與依金額解鎖功能，是不同的提供模式。後者須重新評估整個 App 的上游適用條件，不能只檢查被解鎖的模板。
6. 功能關閉不會移除已打包的依賴；附文與散布義務依實際交付物判斷。免費層同樣需要遵守授權。

## 最小 default pack 與免費功能

最小 default pack 是初次使用的預設體驗，不等於把其餘能力全部鎖為付費。建議只預設啟用本機匯入、曲庫／歌單、播放／待播、本機歌詞操作與必要設定／維護；不自動準備 Provider、模型或啟動 Output。
外觀只提供一套 default set，涵蓋現有 queue-board、karaoke-stack、art-card 三種輸出用途；使用輸出前仍需 public-output-flow。以下其餘本機功能可按需使用，不因未列入最小預設體驗就收費。

外觀 set 指我們編排的字體組合、材質、動態、版面與視覺風格，不販售字型本身；字級、基本配色／位置、同步校正、可讀性與 reduced motion 等必要調整維持免費。精修顯示不等於尚未實作的 refined 精修分離。

| 目前功能                                                                       | 主要依賴／取用                                                                                                 | 授權與範圍限制                                                                                        | 分層建議                                             |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 桌面主程式、設定、Tray、Windows taskbar／SMTC、自身 CPU／RAM 監看              | Electron、Vue、Lucide；Electron／Chromium native 元件                                                          | MIT／ISC 與 Chromium 等第三方附文；不是只有 Electron 一張 MIT                                         | 保留免費；不限制曲庫容量或基本控制                   |
| 原生支援格式的本機匯入、metadata／embedded artwork、曲庫與檔案管理             | music-metadata；Electron 檔案／media protocol                                                                  | MIT；使用者音訊與圖片權利另計。直接匯入不需 FFmpeg；相容轉檔另列選用                                  | 保留免費；不把「可匯入」說成取得直播權               |
| 播放清單、專輯／藝人本機參照、手動 metadata、藝人 merge／split／undo、本機圖片 | 自有曲庫模組、music-metadata；已存 scalar／sidecar                                                             | MIT 附文；本機整理不需要 MusicBrainz；來源型 album membership 仍唯讀                                  | 保留免費；外部補全另列                               |
| Collection 照片／便條、閱讀、移動／Pin 與既有紙材呈現                          | 自有 UI／持久化、Electron／Vue；本機圖片                                                                       | 自有程式與資產範圍；圖片由使用者取得必要權利                                                          | 已有基本整理能力維持免費，不以筆記或照片數量收費     |
| 播放、seek、音量、待播、歷史、shuffle／repeat、暫停恢復、手動 BPM／節拍器      | HTML Audio、Web Audio、自有播放器                                                                              | 隨 Electron 的 codec／native 附文；曲目權利另計。節拍器人工聽感與 drift 驗收仍待補                    | 保留免費，安全操作與恢復不鎖                         |
| 本地播放安排、manual／library occurrence、完成／略過／中止、連續播放與恢復     | 自有 session／queue 模組                                                                                       | 不依賴 OBS 或付費服務；OBS 章節不是此資料的同一權威                                                   | 保留免費，維持可獨立完成一場安排                     |
| BGM standby lane、本機選曲、loop／fade／Talk／Emergency Cut                    | 自有 Web Audio deck 與 lane 仲裁                                                                               | 素材權利另計；目前主要是本機 monitor，不能承諾 app-owned OBS BGM capture routing                      | 已有本機能力免費；Emergency Cut 不收費               |
| Collection 曲目片段試聽、加入待播／歌單                                        | 自有 preview lane；既有分析或歌詞資料可改善片段，無資料仍可估算                                                | 不強制下載分析模型；錄影／直播中停用，維持現有仲裁                                                    | 本機試聽免費；未完成的同步歌詞卡／音量條不列現有功能 |
| 純本機歌詞匯入、編輯、校時、顯示、刪除與既有來源管理                           | 自有 lyrics pipeline、sax；格式依現有 parser                                                                   | BlueOak-1.0.0 等附文；編輯功能不授予歌詞公開顯示權；不依賴 lyrics-flow                                | 保留免費，不鎖已保存資料的讀取／編輯／刪除           |
| 診斷開關、redacted export、明確預覽後回報、更新檢查與安裝入口                  | 自有 diagnostics／relay client、electron-updater、builder-util-runtime、js-yaml；GitHub feed／Cloudflare relay | MIT；遠端服務與隱私／留存另管。使用者回報需要可用 relay，更新檢查本身需要網路；兩者失敗不阻斷離線核心 | 維護與修復入口免費，不作贊助權益                     |

Basic 是產品工作流邊界，不表示每個附屬維護動作都能離線。原生格式與相容轉檔清單以 spec 的實檔驗證規則為準，不新增 codec 支援承諾。

## 免費選用：獨立啟用與準備

| 目前功能                                                                    | 主要依賴／取用                                                                               | 授權與範圍限制                                                                                                                                              | 啟用／公開承諾條件                                                                                                                               |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pitch／tempo 即時預聽                                                       | signalsmith-stretch 1.3.2 JS／WASM、Web Audio                                                | MIT 與內嵌 native 附文／來源對照；不改原曲素材權利                                                                                                          | 保持免費選用；不因與分離同屬音訊工作流而新增模型需求                                                                                             |
| 相容格式轉 FLAC                                                             | 獨立下載 FFmpeg CLI；原檔不修改                                                              | 現行 Gyan essentials 路徑涉及 GPL；須核對 exact build／對應來源／附文；單獨程序不是一律豁免                                                                 | 依現有音訊 gate 與元件 readiness；不把未釘選的 release 當完整散布證據                                                                            |
| 單曲伴奏／guide vocal：quick、general；既有伴奏播放與混音                   | FFmpeg、onnxruntime-node 1.30.0／DirectML；KARA_2／Inst_HQ_4 固定 ONNX 權重；kissfft-js      | ONNX MIT、DirectML binary EULA、KissFFT BSD、UVR 上游模型 MIT／credit；FFmpeg 義務另計                                                                      | 免費提供兩種 recipe，維持 CPU fallback；GPU 是硬體能力，不建議獨立收費。資料／結果不因贊助變動失去可用性                                         |
| BPM／節拍分析與匯入後自動分析                                               | Beat This 1.1.0、small0／final0；獨立 Audio Python 16 包                                     | 程式與指定 checkpoints MIT；torch BSD、NumPy 多重附文、soxr LGPL-2.1+ 等各自履行；完整清單見依賴報告                                                        | 免費選用；需獨立下載／準備，不承諾每首精度或結構分析                                                                                             |
| 本機日文讀音／羅馬字／文字轉換、演出者 Self-View                            | kuromoji／IPADIC、koroman、wanakana、opencc-js；本機 lyrics projection                       | Apache-2.0＋IPADIC notice、MIT、OpenCC generated dictionary MIT AND Apache-2.0；不能僅附程式 license                                                        | 免費選用；Self-View 不包含尚未開放的手機 pairing／transport                                                                                      |
| 基本 OBS Browser Sources：黑幕歌單、經典伴唱、星染黑膠播放中字卡            | 自有 loopback HTTP／ws／projection、GSAP；jf open-huninn OFL 字型；本機歌詞與封面            | ws MIT、GSAP Standard No Charge、OFL；須保留附文。公開歌詞／圖片／音樂權利與模板使用權分開                                                                  | public-output-flow；每種 slot 至少一個完整免費模板：queue-board、karaoke-stack、art-card，保留基本字級、顏色、位置、可讀性與 reduced motion 調整 |
| 唯讀 OBS 連線、直播／錄影時間戳、marker、本機 history、YouTube 章節文字匯出 | obs-websocket-js 5.0.8 MIT、使用者 OBS WebSocket 5、OS secure storage                        | 透過協定連線，不因此等同把 OBS GPL 程式嵌入 App；若未來交付 OBS／plugin 須另審。章節不代表素材權利已確認                                                    | obs-integration；只讀狀態，沒有開始／停止直播或 scene 寫入能力                                                                                   |
| MusicBrainz 藝人整理／metadata 與 CAA 封面人工候選                          | 現有固定 API、scheduler／cache／冷卻；provider-flow                                          | MusicBrainz core data CC0 與 API 適用條件分開；其他資料類別不能一概稱 CC0。CAA 圖片權利另計。未來贊助分級的 API 分類未獲確認                                | 有條件的免費選用，不列付費權益；目前社群標籤不能保證未來免費資格。尚不洽詢方案，若進入付費分級須先重新判斷整體使用條件                           |
| LRCLIB／實驗性 NetEase／Better Lyrics 公開快取搜尋、候選比較與保存          | 既有固定 clients；LRCLIB／NetEase 部分 exact-only 自動取得，Better Lyrics 手動               | API 可存取不等於歌詞利用許可；NetEase direct client 條款未核清；Better Lyrics 新舊 endpoint 條件不能混同，專用 fresh-fetch key 不能借用                     | 有條件的免費選用，保留流量防護；不販售歌詞庫、來源優先權或來源可用性保證。公開承諾前補服務適用依據；既有 AMLL 只有讀取／刪除，不恢復搜尋         |
| YouTube／YT Music 搜尋、URL 匯入、單曲／清單取得、artist 圖片候選           | 獨立 Provider Python 3.14.7、yt-dlp wheel、ytmusicapi／requests；FFmpeg；bgutil Rust／plugin | Python PSF、yt-dlp wheel Unlicense（不能套用到所有 exe）、ytmusicapi MIT、requests Apache；bgutil GPL-3.0+ 與 exact source 義務；平台存取及素材權利仍未核清 | 僅列現有 gated 流程的免費選用候選；不認定已適合公開承諾，不作贊助解鎖。未核清前不以下載能力招生、不承諾平台相容或無限制取得                      |

最後三項是「目前存在且擬保持免費的外部流程」，並非完成上游許可核准。
若發行審查無法建立服務／平台使用依據，應暫緩該入口的公開提供；這不影響本機 Basic 或使用者既有資料。
本提案沒有停用目前入口，也沒有把使用者的啟用確認當作服務商許可。

## 適合贊助解鎖：候選與優先順序

以下呈現或操作已有原型／現有功能，但不代表外觀達到商品品質；付款驗證、離線權利與復原等都尚未實作。
現有免費功能若未來調整分層，需先訂版本適用與既有使用者保留政策，不能由這份提案直接追溯收回。

| 優先順序／候選           | 現有功能與明確切分                                                                                          | 依賴／授權限制                                                                                                                                | 成為贊助權益前的必要條件                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 第一順位：額外歌詞模板   | 霓彩跳字 kinetic-pop、華綴直書 ornate-vertical、漫畫對白 manga-frame、舞台轉播 live-stage；經典伴唱持續免費 | 自有模板程式、GSAP Standard No Charge；M PLUS Rounded 1c／Hina Mincho／GenEi Antique 為 OFL，Keifont 為 Apache-2.0；讀音另含 kuromoji／IPADIC | 確認自有視覺素材的來源與權利，保留字型附文與 reserved font name 條件；不單獨販售字型。固定模板選擇／參數調整與通用動畫 builder 有別，擴充 builder 時重審 GSAP |
| 第一順位：額外播放中模板 | 封面播放卡 cover-player 的較豐富封面播放器呈現；art-card 保持免費                                           | 自有版型、GSAP、現有 ws／Output；使用者封面／本機字型權利另計                                                                                 | 收費對象是版型，不附第三方封面授權；不鎖每種 slot 的基本可用性，不移除免費安全與可讀性調整                                                                    |

建議採自有外觀 set 作為目前唯一的標準贊助解鎖類別；集合批次伴奏準備與單曲處理一樣列免費選用，繼承相同的依賴、gate 與散布義務。
quick／general 是技術 recipe，不建議直接改名為 Basic／Pro；general 本來可用，品質差異也不代表上游授權有不同收費級距。
目前沒有可直接列入的「進階雲端服務、無限下載、精修模型、手機遙控、模板市集」等既有付費能力；不把未完成想法當作現成功能。

## 可能的例外與適用界線

開源與免費價格是不同概念。[OSI 說明](https://opensource.org/faq#commercial)指出開源軟體可以商用，copyleft 等交付條件仍適用。本案選擇不把社群模型／工具包成收費賣點，是產品與社群回饋原則，不是聲稱這些 license 全都禁止收費；權重、API、字典與其他資產也不因程式開源就一併取得商用許可。

| 可能例外                 | 我們額外交付的價值                                                                   | 目前建議與狀態                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 自有視覺／聲音素材包     | 原創插畫、材質、動態、轉場；未來如有自己創作或取得完整適用權利的提示音，也可個別判斷 | 視覺包符合外觀 set 重心。提示音目前沒有已確認可售清單，不包含第三方歌曲／歌詞／封面；委託資產先確認可商用與再散布權             |
| 客製外觀或設定協助       | 按個人品牌製作模板、調整版面、協助 OBS 設定的實際工時                                | 可以另作一次性委託，與一般功能贊助分開；目前未提供服務，不承諾全年或優先排他支援                                                |
| 真正獨立的自有新增工作流 | 不只是呼叫開源 CLI 的額外編排、協作或專業交付功能                                    | 原則上可討論，但依目前社群定位暫不採用；現有批次處理、BGM、播放安排與章節匯出仍列免費，不藉自有 wrapper 名義回收社群能力        |
| 未來由我們持續代管的服務 | 實際儲存、運算或其他持續成本與維運                                                   | 目前沒有此類付費產品，且 local-first 不依賴它；若未來成立須另做產品與完整授權決策，不能把現有本機模型推理說成我們提供的雲端成本 |

以現有功能而言，額外外觀 set 最成熟且最符合本案原則；以上例外不是必須補出的付費功能，也不代表已決定提供。方向已收斂為未來按 set 單次取得，另保留完全自願支持入口；不以目前模板安排首發、不預先承諾所有未來外觀永久免費，持續支持暫不綁外觀權益。

## 使用者確認、收費與責任

功能切分可與現有 gate 對齊，以便解釋哪些流程會用到外部服務、處理素材或公開輸出；但 gate 的同意與贊助付款必須分別成立。外觀贊助不能自動啟用所有流程，免費使用者也需要適用的告知與依賴驗證。

可以收取開發、相容性維護、設計或明確服務的合理費用，並將收入保留作營運支出；不以「付費承接法律風險」「勾選後責任全歸使用者」描述權益。告知有助於建立使用範圍與自主選擇，但不會取得來源平台或第三方權利人的許可，也不能約束沒有參與約定的權利人。

以下以臺灣法作規劃參考，並非對個案成立責任的判定：

- [民法第 222 條](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=B0000001&flno=222)不容許預先免除故意或重大過失責任；不能把確認框視為全面免責。
- 若形成消費關係，[消保法第 12 條](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0170001&flno=12)限制顯失公平的定型化條款；[第 2 條](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0170001&flno=2)定義重點是實際營業與服務行為，不能只以未登記或社群名稱排除適用，亦不在此認定本案已適用。
- [著作權法第 87 條第 1 項第 7、8 款及第 2 項](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0070017&flno=87)涉及特定意圖／明知、工具或技術提供、受有利益及誘使等要件。付費功能不當然違法，但以未經許可的來源取得作為收費賣點，不能視為降低風險的方法；需依實際功能、宣傳與使用情境判斷。

外觀收入也不會自動使同一 App 使用的 API 繼續適用非商用路徑。未核清項目維持原有條件，不因功能免費就視為已解決；目前仍不洽詢商用方案。

## 暫不開放：正式權益與贊助均不承諾

| 項目／目前狀態                                                                                      | 依賴與限制                                                                                                                                                                   | 重新評估條件                                                                                    |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| refined 精修分離、backing-vocals 保留和聲 recipe 尚未實作                                           | BS-Roformer Viperx 1297、audio-separator probe／worker scaffold 不是完整正式 model lock；保留和聲也未完成 recipe                                                             | 完整依賴鎖定、指定權重 grant、離線／安全／品質驗收及產品決策                                    |
| Harmonix／all-in-one 結構分析：benchmark-only                                                       | 同一指定 fold0 checkpoint 有作者頁 MIT 與 wrapper CC-BY-NC-SA-4.0 衝突                                                                                                       | 釐清 exact checkpoint 權利鏈；不能挑較寬鬆標籤解鎖，也不能因放免費層就忽略衝突                  |
| HTDemucs：benchmark-only                                                                            | 程式 MIT 不足以單獨證明指定 checkpoint 的完整 grant                                                                                                                          | 補指定權重與交付來源的授權對照，另過產品驗收                                                    |
| HubertFA 正式詞塊／逐字生成與 Output 接入                                                           | decoder Apache-2.0；指定權重 ZIP／中日字典使用及散布範圍未核清；ONNX、Python、NumPy、pypinyin 各有附文                                                                       | 現有手動環境／實驗入口維持研究身份；核清權重／字典與時間品質後才討論正式能力，不以贊助繞過 gate |
| Whisper.cpp／Qwen3 ForcedAligner 私人研究                                                           | Whisper code／weights MIT，GGML 轉換資產仍需 exact provenance；Qwen 模型 Apache-2.0，但私人 Python closure 尚非產品 lock，含 soynlp GPLv3、soxr LGPL、PyAV／FFmpeg native 等 | 完整交付清單、組合／連結與來源義務、品質與產品接入驗收；不把模型 license 當整套 runtime license |
| Musixmatch 正式來源、Better Lyrics 受保護 fresh-fetch、既有 AMLL 線上搜尋                           | Musixmatch 僅有帶 key 的研究 probe，契約未審；Better Lyrics 有 key 適用限制；AMLL 搜尋已不提供                                                                               | 有合適的服務使用依據、內容／快取／展示條件與正式接入決策；目前不申請 key 或洽詢商用方案         |
| Spout2 正式支援                                                                                     | Windows x64 固定 Lyrics sender 原型；texture-bridge-core MIT、Spout native BSD 附文                                                                                          | OBS receiver／alpha／GPU／安裝版實機驗收；不能把尚未驗收的 native 路徑當付費可靠性升級          |
| 手機 pairing／遠端 transport、OBS scene／source 寫入或開始／停止控制、app-owned BGM capture routing | 未完成或未決的網路權限、capture／lane 與安全邊界                                                                                                                             | 先有明確產品決策與契約／實機驗收；不與已可用的 Self-View／OBS 唯讀連線混稱                      |
| VOD／clip 權利審核、Spotify／Apple Music 轉換與帳號歌單、內建商業曲庫                               | 尚未提供；平台條件、素材權利與帳號／服務契約未建立                                                                                                                           | 個別產品決策與權利依據；章節匯出及既有本機資料不等同這些能力                                    |

研究／dev-only F5–F8 工具也不列付費功能。Whisper／Qwen 等條款較寬鬆的候選，仍可能因依賴組合、品質或封裝未完成而暫不開放，不能把本欄一概理解成法律禁止。

## Gate 與贊助權限的規劃關係

現行五個 gate 維持既有意義：provider-flow、lyrics-flow、audio-processing-flow、public-output-flow、obs-integration。
它們記錄使用者選擇啟用及必要告知，由 main 重查；不能直接拿來當付款紀錄。

若日後採用分級，判斷順序應同時涵蓋：功能已正式開放、必要流程已啟用、依賴 ready、上游及交付條件成立，以及該功能是否需要且具有贊助權限。
付費不能覆蓋任何一項缺失；免費功能也不能略過前述條件。
例如額外 Lyrics 模板仍需 public-output-flow，但本機歌詞編輯不用贊助，也不因停用外部 lyrics-flow 而失效。

建議的退出／到期政策是：已保存資料、歌詞、metadata、伴奏結果始終可讀取與匯出；下一次選取受限模板時可回免費模板；演出中不突然停音或撤畫面。
這些是後續設計要求，並非目前已有 entitlement 的承諾。
暫不決定金額、訂閱或永久解鎖、帳號綁定與驗證實作。

## 授權交付與決策順序

所有層都繼承基礎安裝包的 19 個 runtime roots、93 個附文 entries 與 2 個額外項；附文數量不是所有使用方式都已核准的證明。
Provider Python、Audio Python、每個 active model、研究環境分別維持獨立清單。上表列功能主要依賴，完整逐版本傳遞依賴仍連結既有報告，不以 UI 分類代替 dependency inventory。

1. 先確認本提案的免費基線與模板包邊界；保留既有功能調整的使用者政策。
2. 若只接受完全自願贊助且功能相同，可先維持現有流程；服務／素材條件仍持續適用。
3. 若決定以贊助解鎖模板，先重查整個 App 的外部服務定位與依賴交付；目前不洽詢方案，未解決項目不可被視為已通過。需要服務商確認而暫不處理時，可暫緩該外部服務與付費版本一起提供的決策。
4. 散布 optional runtime 或架設 mirror／離線 bundle 前，補 exact binary 的來源、license／NOTICE、修改與必要替換安排；不只放一般 GitHub 連結。
5. 邊界採用後才另立實作計畫，包含 main enforcement、離線與到期行為、升級／降級驗證；此輪不實作。

主要條款依據：[GSAP 官方授權](https://gsap.com/community/standard-license/)、[FFmpeg 官方法律說明](https://ffmpeg.org/legal.html)、[UVR 模型授權說明](https://github.com/Anjok07/ultimatevocalremovergui#license)、[Beat This 權重澄清](https://github.com/CPJKU/beat_this/commit/b95c8ab0c58c2d9fcfd40508ae8dffbc05ac4f5c)。API／研究環境／字型等逐項來源與未決證據見[完整查核](../governance/community-dependency-boundaries-2026-10-20.md)。本輪重查 MusicBrainz 資料授權網頁回應 429，未將此次失敗當成新授權證據，沿用前輪已記錄的適用條件及未決項。
