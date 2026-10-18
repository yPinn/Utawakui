# 功能啟用說明：行為、權利與來源查核

查核日期：2026-10-18。範圍是五個既有功能的啟用及重新閱讀文件，涵蓋台灣、日本與國際發行的共通注意事項。
本文件是產品文案與工程證據紀錄，不是各國法律適用、個別素材使用或整個發行包的合規認證。
已讀取的官方資料、程式事實、推論與未完成事項分開記錄；沒有取得的授權不會因本次改寫被視為已取得。

服務、模型與元件散布的後續逐版本查核及公開發行影響，見[公開發行授權核對](release-license-review-2026-10-18.md)。其中包含新取得的模型使用依據、實際 FFmpeg 版本及安裝包缺少權利文字等結果；本文件的未決項保留作為當時紀錄。

## 文件分工與寫作規則

- `shared/featureGates.json` 是五份使用者說明的唯一內容來源。初次確認與設定頁重新閱讀繼續共用 `AppFeatureNoticeDocument`。
- 使用者文件只回答功能影響、會傳送或保存的資料、使用者應確認的權利，以及需要遵守的條件。
- 操作說明保留必要的產品名稱，例如 OBS 的 WebSocket 設定與對外接收者 MusicBrainz；API 路徑、演算法、執行檔、hash、元件授權代號留在內部文件及元件清單。
- 以「授權或適用法律允許範圍」保留法律例外，不把所有使用都寫成必須另外申請授權，也不替個案判定合理使用。
- 音樂作品、錄音、歌詞、封面、服務存取與軟體元件是不同的權利或條件；不以其中一項可用推論其他項目均可使用。
- 啟用表示已閱讀並選擇使用功能，不是取得素材授權、簽署保證書或放棄法律權利。確認版本也不代替完整的個資告知及法定合法基礎。
- 仍使用四個以內的短段落、具體小標及可直接閱讀的繁體中文。法律細目和地域差異不塞進 modal。

## 功能與資料流矩陣

本次拆分的是說明內容，沒有新增 gate、合併同意或變更 runtime 權限。

| 功能     | 操作與 gate 邊界                                                                             | 對外資料及本機保存                                                                                                                | 說明需要告知的事項                                                                 | 程式依據                                                                                                                                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 外部來源 | 候選搜尋、下載、metadata、封面及藝人圖片候選；藝人識別會在曲庫載入或更新後啟動               | 查詢內容及所需曲目資料送往來源；藝人名稱送往 MusicBrainz；素材與整理結果保存在本機                                                | 來源條件、取得與後續使用的差異、查詢資料、啟用不等於素材授權                       | `electron/main/importHandlers.js`、`electron/main/library/artistOrganizationHandlers.js`、`electron/main/library/artistPhotoHandlers.js`、`docs/contracts/artist-photo-provider.md`                                               |
| 歌詞來源 | 外部查詢、候選及保存；本機歌詞編輯與顯示不是此 gate 的前置條件                               | 歌名、藝人及依來源需要的專輯、長度等資訊送往 LRCLIB、NetEase、Better Lyrics；部分 probe 會連線 Musixmatch；保存結果在曲目 sidecar | 查詢會對外傳送曲目資訊；能取得資料不等於有權保存、改寫或公開顯示                   | `electron/main/lyricsAcquisitionService.js`、`electron/main/lyrics/acquisitionHandlers.js`、`electron/lib/lrclib/query.js`、`electron/lib/netease/client.js`、`electron/lib/betterlyrics/client.js`、`electron/lib/musixmatch.js` |
| 音訊處理 | 本機分析、人聲分離及本機匯入轉檔；播放器即時音高／速度預覽沒有相同 main gate 前置條件        | 分析與處理使用本機檔案，保存分析結果或音訊副本；元件準備會下載外部套件                                                            | 處理不會為此上傳歌曲；處理不消除素材權利；公開使用另須確認；元件有各自授權條件     | `electron/main/musicStructureHandlers.js`、`electron/main/separationHandlers.js`、`electron/main/libraryHandlers.js`、`src/composables/player/usePlayerAudioGraph.js`                                                             |
| 對外輸出 | 啟動本機 Browser Source 服務及 Spout2 發送；公開呈現仍由使用者的接收應用與直播／錄影操作決定 | loopback 服務或本機發送讓接收端取得畫面；不代表軟體已替使用者開播                                                                 | 本機接收與對外公開的差異；畫面內容可能被保存；直播、錄影與回放的權利條件需分別確認 | `shared/outputRuntimeValues.json`、`electron/main/outputRuntime.js`、`electron/main/spoutOutputRuntime.js`                                                                                                                        |
| OBS 連線 | 唯讀取得直播／錄影狀態，建立場次時間標記                                                     | 向設定的 OBS 主機連線；密碼加密保存在本機；場次記錄本機保存，可由使用者匯出                                                       | 只連至有權使用的 OBS；不會開始／停止直播或錄影、不改場景；分享記錄前檢查內容       | `electron/main/obsAdapter.js`、`electron/main/obsHandlers.js`、`electron/main/obsCredentialStore.js`                                                                                                                              |

OBS 的密碼聲明只指本機儲存加密，不表示連線傳輸加密。不得以此宣稱任意網路端點安全。
歌詞查詢的 metadata 範圍依來源不同；對外服務仍能看到請求來源等通常的網路連線資料，不使用「完全匿名」的保證。

## 現文問題與改寫決定

| 原內容或結構                               | 問題                                                   | 改寫決定                                                                              | 依據                                          |
| ------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------- |
| 外部來源將搜尋、下載、藝人整理放在一句摘要 | 使用者不易分辨單次查詢與啟用後的藝人查詢               | 分成查詢資料、取得保存、後續使用、啟用意義；保留自動查詢的觸發時機和 MusicBrainz 名稱 | 程式矩陣；MB-DATA／MB-API                     |
| 歌詞只提醒公開顯示的權利                   | 沒有明示查詢會傳送曲目資訊，也容易忽略保存與改寫       | 加入資料告知及保存／編輯／翻譯的使用範圍；保留法律例外                                | 程式矩陣；TW-65／JP-CA／US-MUSIC／LYRICS      |
| 音訊處理摘要包含音高／速度調整             | 容易使人以為所有即時預覽均需此 gate                    | 摘要改成本機分析、格式轉換與人聲分離；不變更播放器功能                                | 程式矩陣                                      |
| 元件段落直接列 BPM、FFmpeg（GPLv3）、模型  | 對一般使用者資訊過密，也未表達軟體授權和素材權利的區別 | modal 改成處理元件與其授權條件；具體版本／build／license 保留 registry 與散布查核     | FF-LICENSE；`shared/featureDependencies.json` |
| 輸出以 Browser Source 技術入口作為主要摘要 | 不容易理解啟動服務與公開直播的關係，且漏掉本機發送路徑 | 以演出畫面及接收／直播／錄影的使用情境說明                                            | 程式矩陣；TW-LIVE／JP-CA／TWITCH              |
| OBS 使用與其他四份相同的素材授權結語       | 與唯讀連線的當下決定關聯偏低                           | 改成連線權限、唯讀範圍、密碼保存及分享場次記錄的檢查                                  | 程式矩陣；OBS                                 |
| 每份都把「確認」寫得像素材授權驗證         | 可能誤解為平台或軟體已代為處理權利                     | 保留閱讀／啟用的語意，素材流程明示不會代取得或驗證；OBS 不複製不相關結語              | WIPO／US-MUSIC／程式矩陣                      |

## 官方來源登錄

下表全部於 2026-10-18 查核。「已讀」表示取得該頁的相關內容，不代表對所有版本、地域或情境作成法律結論。
未標示修訂日的頁面以 URL、標題及本次查核日識別，不猜測生效日期。搜尋摘要與全文取得失敗的結果不列為完整法條核對。

| ID            | 官方來源、版本或頁面識別                                                                                                                                              | 查核結果及支持範圍                                                       | 限制                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| TW-LIVE       | [智慧財產局電子郵件1141008，2025-10-08](https://www.tipo.gov.tw/tw/copyright/692-63396.html)                                                                          | 已讀；網路演唱、回看涉及的音樂／錄音利用及授權或合理使用界線             | 行政說明不是每一場直播的個案裁決                                                                                  |
| TW-65         | [智慧財產局著作權法第65條](https://www.tipo.gov.tw/tw/copyright/694-17672.html)                                                                                       | 已讀；合理使用須保留為可能的法律依據                                     | [法務部完整法規](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=J0070017) 本次逾時，未宣稱完成全部現行條文核對 |
| TW-IMAGE      | [智慧財產局電子郵件1130321b，2024-03-21](https://www.tipo.gov.tw/tw/copyright/692-17102.html)                                                                         | 已讀；圖片可能受保護，擷取與大量下載需分辨權利及例外                     | 不將所有 metadata 名稱都當成受保護的攝影作品                                                                      |
| JP-CA         | [文化庁「著作権、これってOK？NG？」第2、4、6問](https://www.bunka.go.jp/seisaku/chosakuken/taisetsu/point/index.html)                                                 | 已讀；翻唱、歌詞、原音源與圖片的不同條件                                 | 平台／管理範圍不同，不能推廣成所有 cover 都可使用                                                                 |
| JP-ACT        | [e-Gov 著作権法，昭和45年法律第48號](https://laws.e-gov.go.jp/law/345AC0000000048)                                                                                    | 部分；官方頁可定位，全文擷取為空                                         | 搜尋結果含不同施行日；未以未來版本或2023英譯作2026現行法驗證                                                      |
| JP-JASRAC     | [JASRAC 網路利用](https://www.jasrac.or.jp/users/internet/)／[UGC 利用說明](https://www.jasrac.or.jp/users/internet/ugc/)                                             | 已讀主頁與 UGC 搜尋內容；部分平台的管理曲目有一定範圍的契約安排          | UGC 頁重取曾失敗；不推論包含原盤、翻譯、所有地域或所有平台                                                        |
| WIPO          | [WIPO copyright FAQ](https://www.wipo.int/en/web/copyright/faq-copyright)                                                                                             | 已讀；作品保護、例外與地域差異的共通框架                                 | 國際條約不提供所有使用情境的單一全球許可                                                                          |
| US-MUSIC      | [美國著作權局：詞曲與錄音](https://www.copyright.gov/register/pa-sr.html)／[音樂創作者指南](https://www.copyright.gov/engage/musicians/)                              | 已讀相關官方內容；詞曲與錄音不是同一項權利                               | 註冊介紹不等同完成美國所有串流授權、DMCA或各州法審查                                                              |
| EU-COPYRIGHT  | [EUR-Lex Directive 2001/29/EC](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32001L0029)                                                                  | 已讀；重製、傳播、例外及保護措施的區分                                   | 是歐盟框架；未核各會員國實施法及所有後續修正                                                                      |
| YOUTUBE       | [YouTube Terms of Service](https://www.youtube.com/t/terms)，本次回應標示2022-01-05、English Courtesy Translation                                                     | 已讀 permissions／restrictions；服務允許、權利人允許或適用法律是不同依據 | TW／JP／US locale query 頁擷取失敗；發布地適用版本仍需核對                                                        |
| TWITCH        | [Twitch Music Guidelines](https://legal.twitch.com/legal/music)，頁面標示2023-07-31                                                                                   | 已讀；素材權利、錄音／伴奏、直播與回放的條件不應混為一談                 | 不以特定 cover 或 DJ 安排涵蓋全部使用者與素材                                                                     |
| MB-DATA       | [MusicBrainz Data License](https://musicbrainz.org/doc/About/Data_License)                                                                                            | 已讀；核心資料 CC0、補充資料另有條件                                     | 須依實際欄位與用途判斷；不等於所有圖片、內容或 API 都可自由商用                                                   |
| MB-API        | [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API)／[Rate Limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)                            | 已讀；非商用與商用服務條件、識別及請求限制分開核對                       | 免費發行與服務方認定的非商用不必然相同，商用分類待確認                                                            |
| LYRICS        | [LRCLIB API 文件](https://lrclib.net/docs)                                                                                                                            | 已取得先前查詢的官方文件內容；後續擷取曾為空                             | API可存取、開源程式碼、歌詞內容授權不能互相代替；內容重用授權未核清                                               |
| BETTER-LYRICS | [Better Lyrics API 原始碼與 README](https://github.com/better-lyrics/api)                                                                                             | 已讀；服務使用外部歌詞來源，程式碼標示 GPLv3                             | 目前公開文件的主機與本地固定端點不同；舊端點服務條件、上游歌詞使用權及留存待確認                                  |
| NETEASE       | [NetEase 服務條款入口](https://music.163.com/html/web2/service.html)                                                                                                  | 未取得正文                                                               | 不將可呼叫端點推論成官方授權 API 或已獲跨境歌詞利用許可                                                           |
| FF-LICENSE    | [FFmpeg License and Legal Considerations](https://ffmpeg.org/legal.html)                                                                                              | 已讀；LGPL／GPL取決於使用的組件與建置                                    | 官方 checklist 有適用情境，不把它全部套給僅啟動外部執行檔的桌面工具                                               |
| FF-BUILD      | [Gyan build 來源](https://www.gyan.dev/ffmpeg/builds/)                                                                                                                | 已定位下載來源；本地 registry 記為 GPL-3.0                               | 本次頁面擷取未提供可核對的 license 字樣；實際下載 artifact 的條款／對應原始碼仍需另核                             |
| YTDLP         | [yt-dlp 2026.08.19 LICENSE](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/LICENSE)                                                                                 | 已讀；與目前 wheel pin 對應的 Unlicense                                  | 不涵蓋來源平台或下載內容的權利；其他 runtime artifacts 各有授權                                                   |
| UVR           | [UVR license 段落](https://github.com/Anjok07/ultimatevocalremovergui#license)／[模型發布頁](https://github.com/TRvlvr/model_repo/releases/tag/all_public_uvr_models) | 已讀；上游提及 MIT 程式碼與模型署名要求，本地模型有固定 hash             | 未逐一完成 KARA_2、Inst_HQ_4 權重對應條款、作者與訓練素材來源的完整確認                                           |
| OBS           | [OBS Remote Control Guide](https://obsproject.com/kb/remote-control-guide)                                                                                            | 已讀；官方連線與密碼設定入口                                             | 本產品的唯讀／加密儲存承諾以本地實作驗證，不能從 OBS 的能力反推本產品有遠端控制功能                               |

## 元件與國際發行的保留事項

已執行 `npm run license:inventory`，核對目前 `package-lock.json` 的 production dependency closure。
這份清單含平台與可選依賴，不能直接當成最後 Windows 安裝包的實際散布清單；缺少 notice 檔的列也不能只憑 package.json 的 license 字串判定合規。
根專案的 `UNLICENSED` 狀態與第三方元件授權分開處理，不在使用者說明中宣稱本產品全面開源。

| 項目                | 已核對證據                                                                                                                                       | 待完成事項                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider runtime    | `shared/featureDependencies.json` 逐 artifact 的版本、來源、hash、size、license；wheel 的上游 license；`docs/contracts/artist-photo-provider.md` | 混合 Unlicense／MIT／PSF／Apache／BSD／MPL／GPL 的完整散布義務、GPL provider 的對應原始碼及必要 notice，不能只用 yt-dlp 的 Unlicense 概括                        |
| FFmpeg              | 固定供應來源、registry 的 GPL 標記與官方 LGPL／GPL說明                                                                                           | 核對實際 artifact 及其 source offer；`electron/lib/featureDependencies/manifests.js` 的 `LICENSE.txt` 是摘要連結，不能單獨證明已履行完整 license／source 要求    |
| 分離模型            | KARA_2 與 Inst_HQ_4 的檔案 hash、上游模型庫及 UVR 的模型署名說明                                                                                 | 每個權重的可重用／商用／再散布條件與 attribution 保存；未因此開啟 refined 或 benchmark model                                                                     |
| 音訊分析能力        | 依 architecture 分離的 Audio Python／能力及個別 model lock                                                                                       | npm inventory 不涵蓋全部 Python wheels、能力包與模型；每一個實際啟用能力仍需對照 lock 與散布條件                                                                 |
| 字型與字典          | `shared/assets/fonts/` 的來源／OFL／Apache文字、kuromoji 的既有字典 notice                                                                       | 對照實際封裝檔、保留授權與署名；本次 modal 使用系統正黑體，沒有散布 Microsoft 字型                                                                               |
| 動畫與其他 npm 元件 | npm inventory 的 GSAP Standard License 等實際 license 字串                                                                                       | 免費使用不等同 OSI 開源，仍需對照[官方 GSAP 授權](https://gsap.com/standard-license/)與發行方式；未將新權利保證放入 modal                                        |
| 服務與個資          | 明示外部 metadata 查詢、MusicBrainz 自動藝人查詢；[日本 PPC 官方法律入口](https://www.ppc.go.jp/en/legal/)                                       | 服務端 metadata／IP處理、留存、收件者與跨境安排及法定合法基礎仍待適用地核對；PPC英譯頁標示2023版本，不當成2026全文驗證；GDPR頁本次遇驗證頁，未聲稱已完成GDPR審查 |

以上是明確的發布／服務使用待查項目，不能用一份「責任由使用者承擔」的說明替代。
本次不改 provider、元件、模型或公開功能的可用性；若後續查核發現必須限制某個來源，應另以具體產品決策及來源證據處理。

## 確認版本與相容性

| 功能     | 版本處理                                              | 理由與使用者影響                                                             |
| -------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| 外部來源 | `provider-flow-notice-v4` → `provider-flow-notice-v5` | 擴充對外查詢與來源條件告知；舊版確認不再當作本版已閱讀，下一次使用須重新確認 |
| 歌詞來源 | `feature-notice-v3` → `lyrics-flow-notice-v4`         | 原文缺少 metadata 對外傳送告知；需重新閱讀，不能以先前同意推論已知悉新揭露   |
| 音訊處理 | 保留 `feature-notice-v3`                              | 校正摘要與減少元件術語；實際處理、檔案保存、依賴準備與權利邊界沒有擴張       |
| 對外輸出 | 保留 `feature-notice-v3`                              | 說清楚既有接收／公開行為，未增加輸出資料、接收範圍或自動開播                 |
| OBS 連線 | 保留 `feature-notice-v3`                              | 以已存在的唯讀連線、加密儲存與場次記錄取代不相關套話，未增加存取或操作權限   |

既有確認不會自動遷移為新版。Main 與 renderer 沿用既有精確版本檢查；本地曲庫、播放及本機歌詞核心不因重新確認而被 gate。
版本更新記錄是產品啟用提示紀錄，不宣稱具備各國法律對同意證據的全部要件。

## 驗證與剩餘責任

使用者頁面維持既有正黑體、字級、語意文字色、寬版文件 modal 及唯讀入口，沒有新增任意外連或法條工具列。
測試需驗證五份標題／段落配對、實際資料告知、閱讀入口一致、錯誤時仍可閱讀、saving 保護，以及 provider／lyrics 舊版確認不會誤啟用。
實際 Electron 檢查涵蓋五份確認／重新閱讀、深淺主題、最小視窗、長文與固定確認頁尾。
本輪完整測試通過：808 個測試檔、7,818 項測試通過，另有 1 項既有略過；lint、Markdown（122 檔）、格式檢查、production build 與差異空白檢查通過。Build 保留既有的大型 chunk 提醒。首次 sandbox 測試曾因暫存檔 rename 權限失敗，移至允許的執行環境後完整重跑通過。

可見隔離 Electron 使用 production renderer 完成 25 組檢查：五份初次確認，以及五份重新閱讀在深淺主題、1280×850／960×650 視窗的組合。文字沒有水平溢出；確認頁尾可見，儲存中三個按鈕皆停用；重新閱讀沒有確認頁尾，Escape 關閉及焦點返回資訊按鈕皆通過。五份確認均送出目前版本。七張代表截圖已逐一檢視，保留正黑體與既有 token 排版。

上述畫面使用隔離的 bridge fixture，沒有實際向外部平台查詢，也不是完整 main 持久化或使用者環境驗收。背景設定錯誤及 Performer 提示是 fixture 未接完整服務的結果，不作本次產品行為證據。Main／renderer 的確認版本邊界另由測試驗證；獨立程式審閱未發現需修正事項。來源未核清的事項不因 UI 或測試通過而變成已解決。

提交前再次校正文意：接收內容明確稱為演出畫面，音訊處理不代表取得使用權利，密碼告知限於已儲存的連線密碼，匯出或分享記錄則提醒接收對象與分享範圍。未增加資料傳送或功能權限，確認版本不變。最終完整測試 809 檔、7,823 項通過，1 項既有略過；lint、Markdown 123 檔、format、build 及獨立程式審閱通過。Sandbox 的暫存檔 rename EPERM 以正常權限完整重跑確認，未改產品程式以規避檔案操作。

## 五份使用者文字快照

以下是本次套用版本；後續修改仍以 shared registry 為唯一內容來源。

### 外部來源啟用說明

搜尋外部素材，下載至曲庫並整理資訊。

1. 查詢與資料使用：搜尋素材時，會將搜尋內容與所需曲目資料傳送至外部服務；啟用後，載入或更新曲庫時，也會將藝人名稱傳送至 MusicBrainz，協助整理藝人資訊。
2. 取得與保存：下載音訊、封面或其他素材前，請遵守來源平台的條款與存取限制，並確認本次取得與保存符合素材授權或適用法律允許的範圍。
3. 後續使用：素材可被搜尋或下載，不代表可以用於直播、錄影或再次發布；請另確認本次用途所需的權利。
4. 啟用確認：啟用設定只保存在本機，記錄你已閱讀說明並選擇啟用；Utawakui 不會代為取得或驗證素材授權。

### 歌詞來源啟用說明

查詢外部歌詞或字幕，選擇後保存至曲庫。

1. 查詢內容：查詢時，會將歌名、藝人名稱等曲目資訊傳送至外部歌詞服務；可取得的內容與使用條件依來源而異。
2. 保存與整理：歌詞與字幕可能受著作權保護；保存、編輯或翻譯時，請確認本次使用符合素材授權或適用法律允許的範圍。
3. 公開使用：用於直播、錄影或回放影片前，請另確認公開顯示的使用權利，並遵守平台規範；能取得歌詞不代表可公開顯示。
4. 啟用確認：啟用設定只保存在本機，記錄你已閱讀說明並選擇啟用；Utawakui 不會代為取得或驗證素材授權。

### 音訊處理啟用說明

在本機分析歌曲、轉換格式並分離人聲。

1. 本機處理：分析、轉檔與人聲分離在本機執行，不會為此上傳歌曲；結果保存在本機，部分操作會產生新的音訊檔。
2. 使用範圍：請依素材授權或適用法律允許的範圍進行處理；分離人聲或改變音訊，不代表已取得原始素材或處理結果的使用權利。
3. 公開使用：將處理結果用於直播、錄影或再次發布前，請另確認原始音源、詞曲與本次用途所需的權利，並遵守平台規範。
4. 所需元件：部分功能需要下載處理元件，使用時仍須遵守各自的授權條件；啟用設定只保存在本機，不代表已取得素材授權。

### 對外輸出啟用說明

將曲目資訊、歌詞與封面用於演出畫面。

1. 畫面分享：啟動後，可由 OBS 等應用程式接收演出畫面；當你將其加入直播或錄影時，所顯示的歌詞、封面與曲目資訊也可能一併公開或保存。
2. 使用前確認：公開顯示、傳輸或錄製前，請確認本次使用符合相關素材的授權或適用法律允許的範圍，並遵守使用平台的規範。
3. 直播與回放：直播、錄影與回放影片可能適用不同的授權條件；平台未限制或允許營利，也不代表已取得所有必要權利。
4. 啟用確認：啟用設定只保存在本機，記錄你已閱讀說明並選擇啟用；Utawakui 不會代為取得或驗證素材授權。

### OBS 連線啟用說明

讀取 OBS 直播與錄影狀態，協助記錄場次。

1. 連線前準備：請先在 OBS 開啟 WebSocket 並設定密碼，僅連線至你有權使用的 OBS；儲存的連線密碼會加密保存在本機。
2. 操作範圍：Utawakui 只會讀取直播與錄影狀態、記錄時間標記，不會替你開始或停止直播、錄影，也不會變更場景。
3. 記錄與分享：場次記錄與啟用設定保存在本機；匯出或分享記錄前，請留意其中的曲目名稱、時間標記與備註，並確認接收對象與分享範圍。
