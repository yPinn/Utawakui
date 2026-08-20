# 法律與合規說明

> 本文件是 Utawakui 的產品與工程合規參考，不構成法律意見。正式發布、散布、
> 商業化、直播/錄製流程或特定國家營運，仍應由熟悉該司法管轄區的法律專業人士
> 確認。

## 1. 快速結論

Utawakui 可以定位成「本機桌面工具」，但不能把「工具開源」理解成「所有歌曲使用
都合法」。開源只處理程式碼授權，不處理歌曲、歌詞、封面、錄音、直播或 VOD 的
使用權。

專案建議採取以下合規姿態：

- **本機優先**：預設支援使用者自己的本機檔案與 metadata 管理。
- **高風險功能不預設啟用**：provider download、歌詞顯示、音訊處理、公開輸出都
  應放在明確 feature gate 後。
- **不做內容服務**：專案不託管、販售、再授權或重新散布第三方音樂內容。
- **不做規避工具**：不提供 DRM、geo restriction、登入限制、rate limit 或平台保護
  機制的規避流程。
- **權利由使用者確認**：直播、錄製、VOD、歌詞/封面顯示與音訊處理，都需要使用者
  確認自己有對應授權。

一句話版本：Utawakui 應被設計成 rights-neutral tooling，也就是「協助操作流程」，
不是「提供歌曲來源或替使用者取得授權」。

更易懂的判斷方式：

- **只在本機整理或練習**：通常先看檔案來源與工具授權。
- **把聲音送進串流**：開始涉及公開演出、公開傳輸與平台音樂政策。
- **把畫面送進 OBS**：若場景中有歌詞、封面、MV 或譜面，需另外看公開展示/傳輸。
- **錄影、保存 VOD 或剪精華**：會多一層重製、同步與後續散布風險。

因此，文件與產品提示不需要先區分使用者身份；真正重要的是本次操作有沒有「下載」、
「處理」、「顯示」、「串流」、「錄影」或「再次發布」。
同一場活動若同時串流與錄影，應依較高風險的輸出方式確認。

## 2. 先把名詞講清楚

音樂使用容易複雜，是因為「一首歌」通常不是單一權利。對 Utawakui 來說，以下名詞
不用背法條，只要理解它們分別對應到哪種操作。

| 名詞             | 白話說明                                               | 對 Utawakui 的意義                                                 |
| ---------------- | ------------------------------------------------------ | ------------------------------------------------------------------ |
| 音樂著作         | 詞、曲本身。                                           | 翻唱、歌詞顯示、公開演出/傳輸都可能牽涉。                          |
| 錄音著作/鄰接權  | 唱片公司、演出者、錄音製作者等對「錄好的音源」的權利。 | 使用原曲、卡拉 OK 音源、伴奏音源時特別重要。                       |
| 重製             | 做出一份副本。                                         | 下載、錄製、VOD、cache、stems 都可能是重製。                       |
| 改作/編曲        | 改變作品表現，例如重新編曲、改詞、翻譯。               | pitch/tempo、vocal separation 不必然是改作，但會增加權利檢查需求。 |
| 公開演出         | 向現場或公眾表演。                                     | 實體活動、部分直播演唱情境可能牽涉。                               |
| 公開傳輸         | 透過網路讓公眾可接收內容。                             | YouTube/Twitch 直播、上傳、VOD 通常最需要注意。                    |
| 公開展示         | 顯示圖片、文字、歌詞等。                               | OBS overlay 顯示歌詞或封面時會牽涉。                               |
| Content ID claim | 平台/權利人透過 Content ID 對內容提出聲明。            | 可能導致收益歸權利人、封鎖、追蹤等。                               |
| Copyright strike | 更嚴重的版權警告/處分。                                | 累積後可能影響頻道或帳號。不要把所有 claim 都叫 strike。           |
| 黃標             | YouTube limited/no ads 的營利狀態。                    | 它是廣告友善度/營利問題，不等同著作權合法或地區封鎖。              |
| VOD mute         | Twitch 對 VOD/clip 偵測到音訊後靜音。                  | 不代表收到 DMCA，也不代表合法；只是平台風險訊號。                  |

## 3. 功能風險地圖

建議以「操作行為」分段，不以創作者身份分段。同一個人可以只是本機練習，也可以同時
串流、錄影、顯示歌詞並保存 VOD；風險應依實際輸出決定。

| 操作行為               | 對應功能/情境                         | 主要風險                           | 建議控制                                                     |
| ---------------------- | ------------------------------------- | ---------------------------------- | ------------------------------------------------------------ |
| 匯入與整理素材         | 本機檔案匯入、playlist metadata       | 檔案來源、provider API 條款。      | 預設入口；只保存必要 metadata，不宣稱取得音樂權利。          |
| 查找候選來源           | Provider candidate search             | 使用者誤以為找到來源就等於有授權。 | 文案使用「候選來源」或「比對結果」，不使用「合法來源」字眼。 |
| 下載或快取媒體         | Provider download path、sidecar cache | 平台條款、重製、來源合法性。       | 非預設、feature gate、不得提供規避手段。                     |
| 本機播放與練習         | Library playback、pitch/tempo preview | 播放內容權利不明、處理後副本。     | 本機限定；公開輸出前另行確認授權。                           |
| 產生加工素材           | Vocal separation、stems、render cache | 產生新的媒體副本或加工版本。       | 本機工作流；不要包裝成可公開散布素材。                       |
| OBS 畫面輸出           | Browser Source、歌詞/封面 overlay     | 歌詞、封面、MV、譜面的公開展示。   | 純 UI overlay 低風險；第三方視覺素材分開 gate。              |
| 串流音訊               | YouTube/Twitch live output            | 公開演出/公開傳輸、平台政策。      | 開播前提示平台與權利人授權需求。                             |
| 錄影、VOD、clips、精華 | Recording / archived live / clips     | 重製、同步、存檔、後續散布。       | 與 live 分開確認；VOD/recording 作為獨立 gate。              |

## 4. 影片內容驗證與勘誤

使用者提供影片：

- URL: <https://www.youtube.com/watch?v=C4wMdeMfcUE>
- 標題：`【默談】唱中文就黃標？！台V只唱日文不唱中文歌的原因是......`
- 頻道：周默 Zhoumo
- 發布日期：2025-03-18
- 長度：9:19

驗證方式與限制：

- 已用本機 `yt-dlp` 讀取 metadata，未下載影音內容。
- 該影片沒有可取得的字幕或自動字幕，因此無法逐字驗證所有口述。
- 下表以使用者提供的影片摘要為待驗證主張，再用官方來源校正。

整體判斷：

- 影片核心方向大致成立：歌回/翻唱風險不是單一法條問題，而是權利鏈、平台政策、
  集管/代理實務與權利人態度的組合。
- 影片中的「紅標/黃標」屬常見實務用語，和 YouTube 官方機制有混用，文件中需要改成
  官方語彙。
- 「中文歌較容易遇到嚴格處理、日文/Vocaloid 曲較常見二創空間」可以當成台V社群
  經驗觀察，但不能寫成法律規則或平台固定政策。

| 摘要主張                                               | 驗證結論         | 勘誤後採用說法                                                                                                                                        |
| ------------------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 翻唱涉及改作權、重製權、公開播送權。                   | 部分正確。       | 翻唱、錄製、上傳、直播可能涉及重製、改作/編曲、公開演出、公開傳輸等權利。YouTube/Twitch 情境更應注意公開傳輸，不宜只稱公開播送。                      |
| 台灣權利由不同協會或權利人管理，分工細碎。             | 方向正確。       | MÜST 官網列出公開演出、公開播送、公開傳輸授權；重製、改作、商業錄音、錄音著作與鄰接權未必由 MÜST 一次處理。                                           |
| YouTube 透過 AI / Content ID 偵測音軌。                | 方向正確。       | YouTube 直播會掃描第三方內容；Content ID、copyright checks、ad suitability checks 是不同流程，不宜全部簡化成同一個 AI。                               |
| 版權方可採取紅標、黃標或收益索賠。                     | 需修正用語。     | Content ID 常見處理是 block、monetize、track；copyright takedown/strike 是另一流程。YouTube yellow icon 是 limited/no ads，不是地區封鎖。             |
| 紅標等於全球禁播，黃標等於部分地區禁播。               | 不採用。         | 使用官方語彙：blocked、copyright restrictions、limited ads/yellow icon、ineligible、Content ID claim、copyright strike。                              |
| 三次嚴重版權申訴會導致頻道被封風險。                   | 方向正確。       | YouTube 與 Twitch 都有 copyright strikes / repeat infringer policy。可寫「三次 strike 可能導致頻道/帳號嚴重後果」，但不要把所有 claim 都說成 strike。 |
| 中文歌容易被紅標，授權費可能很高。                     | 無法一般化驗證。 | 可寫成「部分實務經驗認為中文商業歌曲權利人/代理方處理較嚴格、授權成本較高」。原因是權利人、代理、曲庫、平台資料庫與授權市場差異，不是語言本身。       |
| 日文歌因 JASRAC 較彈性，重編音源通常較安全。           | 部分正確。       | JASRAC 有制度化授權與部分平台實務，但編曲、改詞、人格權、商業錄音與鄰接權不一定由 JASRAC 授權。重編音源只降低原錄音權利風險，不等於免授權。           |
| Vocaloid / Niconico 文化多鼓勵二創，只要註明出處即可。 | 需逐曲確認。     | 部分 Vocaloid/Piapro/Niconico 生態較常見二創授權文化；實際仍以作者、平台與作品條款為準。標註來源通常不是完整授權。                                    |
| 原創歌曲可避開傳統唱片公司高額授權問題。               | 方向正確。       | 原創曲可降低外部權利鏈不確定性，但仍需書面約定詞、曲、編曲、錄音、混音、封面、委託製作、收益分配與二創規則。                                          |

對 Utawakui 的文件結論：

- 不採用「中文歌 = 高風險、日文歌 = 安全」的二分法。
- 採用「權利鏈複雜度、集管/代理實務、平台資料庫、是否使用原錄音、是否保存 VOD、
  是否顯示歌詞」作為風險判斷軸。
- UI 或 feature notice 不提「規避偵測」或「較不易被抓」作為功能價值。
- 可以提「自製音源、原創曲、明確授權曲庫、關閉歌詞/封面 overlay、確認 VOD
  授權」等合規導向操作。

## 5. 平台規範與實務態度

### 5.1 YouTube / YT Music

YouTube 要分成兩件事看：一是平台條款與 API policy，二是 YouTube Studio 裡實際會
發生的 Content ID / 廣告適合度 / 直播中斷。

可確認的官方重點：

- YouTube API policies 限制 client 下載、匯入、備份、快取或儲存 YouTube
  audiovisual content，除非取得事前書面同意。
- YouTube 直播會掃描第三方內容；若偵測到第三方內容，直播可能被警告、中斷或終止。
- 即使使用者已授權，若權利人未將頻道加入 Content ID allowlist，直播仍可能被中斷。
- Archived live stream 的 Content ID claim 通常在直播結束並選擇封存後發生。
- Yellow icon 是 limited/no ads 的廣告友善度狀態；它不是「部分地區禁播」。
- Cover song revenue sharing 只代表特定 cover video 可能與 music publisher 分潤，不是
  通用授權。

專案姿態：

- 不將 YouTube / YT Music provider flow 表述為已授權音樂來源。
- Provider download 不作為預設路徑。
- 不加入 cookie scraping、DRM bypass、geo-bypass、登入限制或 rate limit 規避功能。
- Private/unlisted 上傳或 Checks 可以作為風險觀察，但不能當成授權替代品。
- 刪除 VOD、不封存直播或分離 OBS 音軌只會降低存檔曝險，不能讓未授權直播變合法。

### 5.2 Twitch

Twitch 的音樂政策對 karaoke 和錄音素材特別保守。

與 Utawakui 相關的官方重點：

- **Karaoke Performance**：唱或表演 karaoke recording，除非使用者擁有該音樂或取得
  權利人授權可在 Twitch stream。
- **Lip Sync Performance**：對著音樂錄音假唱、同步或表演，同樣需擁有或取得授權。
- **Visual Music Depiction**：歌詞、樂譜、tablature 或其他受保護音樂的視覺呈現，
  除非使用者擁有或取得授權。
- **Cover Song Performance**：Twitch 對 live cover 有較明確的空間，但要求現場演出、
  善意按 songwriter 所寫內容演出，並自行創造所有 audio elements，不得加入他人擁有
  的 instrumental tracks、music recordings 或其他錄音元素。

實務注意：

- VOD mute 不是 DMCA takedown，也不是 copyright strike。
- VOD 沒被 mute 不代表合法；權利人仍可提出 DMCA notification。
- Twitch repeat infringer policy 通常以三次 copyright strikes 作為重複侵權門檻。
- 對 Utawakui 來說，Twitch 上最敏感的是 karaoke recording、lyrics overlay、VOD
  保存，以及使用第三方 instrumental/錄音元素。

### 5.3 Spotify

Spotify developer terms 與 policy 區分 metadata/non-streaming use 與 Spotify content
use，並限制 stream ripping、未授權存取、公開/營業播放、商業 streaming SDA 與特定
content storage。

專案姿態：

- Spotify integration 應維持 metadata/playlist import。
- 不使用 Spotify 作為本機音訊擷取來源。
- 只在允許範圍內保存必要 metadata 與 artwork。

### 5.4 OBS

OBS Studio 是 GPLv2 開源軟體。將 Browser Source overlay 載入 OBS 屬於一般使用
情境。除非專案散布修改後的 OBS binary 或 OBS native plugin，否則通常不會因
Browser Source 本身導入 GPL linking 問題。若未來開發 native plugin，需另行檢視
GPL 義務。

## 6. 台日韓美法規摘要

本節只保留本專案最需要知道的方向。完整判斷仍需看歌曲來源、使用方式、平台與
授權文件。

### 6.1 台灣

常見相關權利包括重製權、公開播送權、公開演出權、公開傳輸權、合理使用與科技保護
措施規定。對音樂直播與 VOD 來說，通常不能只用「個人或家庭使用」處理。

補充：

- MÜST 管理音樂著作的公開演出、公開播送、公開傳輸等授權。
- 網路影音直播、VOD、網路卡拉 OK 等通常屬公開傳輸授權討論範圍。
- MÜST 授權不必然涵蓋錄音著作、商業錄音音源、重製、改作或所有鄰接權。

### 6.2 日本

常見相關權利包括複製權、演奏/上演權、公眾送信權、私的使用目的複製與科技保護
措施限制。日本也針對明知違法上傳內容的下載有更嚴格規範。

補充：

- JASRAC 有制度化授權與部分平台實務。
- JASRAC 也明確提醒：編曲、改詞、人格權、商業錄音與鄰接權不一定由 JASRAC 授權。
- 因此「重編音源」可降低使用原錄音的風險，但不等於免除詞曲或編曲授權。

### 6.3 韓國

常見相關權利包括複製權、公開演出權、公眾送信權、私的使用複製、公正利用與科技
保護措施規定。非營利不等於一律合法；例外條款仍需符合具體要件。

### 6.4 美國

17 U.S.C. 106 涵蓋重製、改作、散布、公開演出、公開展示，以及錄音著作的數位音訊
傳輸。Fair use 是因素分析，不是固定答案。DMCA anti-circumvention 也可能獨立於
一般侵權問題存在。

## 7. 灰色地帶與實務控管

以下做法常見於公開音樂使用實務，但只能視為風險控管，不是合法保證。

| 做法                         | 可降低的風險                                              | 仍存在的風險                                             |
| ---------------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| 使用自製伴奏或重新編曲音源   | 降低使用原始錄音/鄰接權風險。                             | 詞曲、編曲、改作、公開傳輸仍可能需要授權。               |
| 唱日文歌或 Vocaloid 曲       | 可能遇到較成熟的 UGC/二創文化與平台授權實務。             | 每首歌授權不同；註明出處不等於授權。                     |
| 不保存 VOD / 關閉 clips      | 降低後續存檔被偵測、檢舉或引用的機率。                    | Live 本身仍可能侵權，也可能被即時偵測。                  |
| 先 private/unlisted 測試上傳 | 可預先觀察 Content ID claim、block、monetization status。 | 平台結果可能變動；測試通過不等於取得授權。               |
| 不顯示歌詞與封面             | 降低公開展示文字/美術素材的風險。                         | 音訊使用本身仍需處理詞曲與錄音權利。                     |
| 使用平台提供或已授權曲庫     | 授權範圍較清楚。                                          | 仍需確認是否涵蓋直播、VOD、商業化、剪輯、跨平台重播。    |
| 做原創曲或社群內授權曲       | 權利鏈較可控，適合建立長期資產。                          | 仍需書面約定詞曲、編曲、錄音、封面、收益分配與二創規則。 |

Utawakui 的文件與 UI 應避免把上述做法描述成「安全」、「合法」或「可規避偵測」。
較合適的說法是：「降低特定平台或權利類型的操作風險」。

## 8. 開源授權與散布

本節處理的是程式碼與工具鏈授權，不處理歌曲、歌詞、封面、錄音、伴奏或 VOD 的
使用權。這兩者應在文件與 UI 中維持清楚分界。

### 8.1 專案本身的開源授權

目前專案 `package.json` 為 `private: true`，且 repository root 尚未包含 `LICENSE`
檔案。因此，Utawakui 目前尚未完成「對外開源散布」所需的專案授權設定。

若要正式公開原始碼，建議在 release 前完成：

- 選定 Utawakui 自身 license，並加入 root `LICENSE`。
- 在 `package.json` 補上對應 `license` 欄位；若仍不發布 npm package，可保留
  `private: true`。
- 加入第三方授權清單或產生 `NOTICE` / `THIRD_PARTY_NOTICES`。
- 在 README 明確寫：「本專案 license 只授權 Utawakui 程式碼，不授權任何第三方
  媒體內容。」

授權選擇建議：

| 方向                         | 適合情境                               | 注意事項                                               |
| ---------------------------- | -------------------------------------- | ------------------------------------------------------ |
| MIT / Apache-2.0             | 希望社群容易 fork、整合與商用。        | 需保留 notice；Apache-2.0 另含 patent grant 條款。     |
| GPL family                   | 希望衍生作品維持相同開源義務。         | 與 Electron app、第三方 binary、商業整合需更仔細設計。 |
| Source-available/custom EULA | 想公開程式碼但保留更多產品或商業限制。 | 不一定是 OSI open source；社群接受度與用詞需更保守。   |

若專案定位為社群開源工具，較自然的起點是 MIT 或 Apache-2.0；若 release artifact
仍包含 GPL binary，仍需另行處理該 binary 的散布義務。

### 8.2 第三方開源元件

直接依賴的授權重點如下。實際 release 仍應以 lockfile、安裝後 package metadata 與
打包內容為準。

| Package / tool                                | License   | 用途                                                      | 注意事項                                                                                      |
| --------------------------------------------- | --------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Vue、Electron、Vite、Vitest、ESLint、Prettier | MIT       | App shell、build、test、lint/format。                     | 寬鬆授權；散布時保留 notice。                                                                 |
| @lucide/vue                                   | ISC       | UI icon components。                                      | 寬鬆授權；保留 notice。                                                                       |
| kissfft-js                                    | MIT       | DSP / audio analysis dependency。                         | 寬鬆授權；保留 notice。                                                                       |
| onnxruntime-node                              | MIT       | Vocal separation runtime dependency。                     | Runtime 授權不等於模型授權；模型檔需另行列示來源與 license。                                  |
| @soundtouchjs/audio-worklet                   | MPL-2.0   | Pitch/tempo preview 的 AudioWorklet。                     | File-level copyleft；若修改 MPL 檔案後散布需提供對應源碼。                                    |
| youtube-dl-exec                               | MIT       | 呼叫外部 downloader 的 Node.js wrapper。                  | Wrapper 授權不授權任何下載內容，也不免除平台條款。                                            |
| yt-dlp                                        | Unlicense | Provider download/search 工具鏈。                         | 程式碼授權與媒體授權無關；不同 release artifact 可能有不同 bundled license。                  |
| FFmpeg Gyan essentials build                  | GPL-3.0   | `audio-processing-flow` 啟用後下載的 app-managed binary。 | 不放入 installer；下載前顯示 license/source，下載後保存 hash/source/notice。                  |
| UVR MDX-Net ONNX models                       | MIT       | `audio-processing-flow` 啟用後下載的 app-managed models。 | 不放入 installer；下載前顯示 source/license，下載後保存 hash/source/notice；保留 UVR credit。 |

補充：

- `youtube-dl-exec` 可能在 install/postinstall 階段準備 `yt-dlp` 工具鏈。發布版應記錄
  實際 bundled/downloaded 的工具版本、來源與 hash。
- `yt-dlp` 本體採 Unlicense，但其官方 README 也提醒部分 release 檔案包含其他專案
  程式碼；PyInstaller bundled executables 可能形成 GPLv3+ combined work。
- FFmpeg 官方說明指出，FFmpeg 依建置選項可能落在 LGPL 或 GPL；本專案目前不再把
  `ffmpeg-static` 放入 packaged runtime，改由 `audio-processing-flow` 啟用後下載
  Gyan essentials build。該 build 仍應以 GPL-3.0 處理，並在下載前顯示授權與來源。
- UVR MDX-Net 模型由 app-managed provisioning 下載，不放入 installer。模型 registry
  目前指向 TRvlvr/model_repo 的 `all_public_uvr_models` release，並依 UVR 授權說明與
  備援模型卡標示為 MIT + credit；正式發布前仍需重新確認上游授權與 attribution 文案。

### 8.3 功能接入與授權邊界

功能接入可以分成「技術授權」與「內容/平台授權」兩層。開源元件只處理前者；
使用者拿該功能處理什麼內容，仍回到歌曲、歌詞、錄音與平台條款。

| Feature / 接入點               | 開源或技術側狀態                                                          | 內容/平台側邊界                                           | 產品處理方式                                     |
| ------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| Local library / local playback | Electron/Vue 本機 app；依賴多為寬鬆授權。                                 | 本機檔案來源由使用者自行確認。                            | 預設入口；只提示匯入自有或已授權檔案。           |
| OBS Browser Source overlay     | OBS 為 GPLv2；Browser Source 屬一般使用情境。                             | 畫面若含歌詞、封面、MV、譜面，仍需素材顯示/傳輸授權。     | 純 UI overlay 低風險；lyrics/artwork 分開 gate。 |
| Provider metadata import       | 只保存必要 metadata；不直接提供音樂授權。                                 | Provider API policy 可能限制保存、展示與再利用方式。      | 文案使用「metadata / candidate」，不稱合法來源。 |
| Provider candidate search      | 透過工具鏈查找候選曲目。                                                  | 候選結果不代表取得音訊、歌詞、封面或平台授權。            | 結果標示為候選；下載前另行確認。                 |
| Provider download path         | `youtube-dl-exec` + `yt-dlp` 工具鏈。                                     | 可能涉及平台條款、重製、來源合法性與技術保護措施。        | 非預設；明確 feature gate；不得提供規避流程。    |
| Thumbnail / info sidecars      | 作為本機 track sidecar 保存。                                             | 圖像/metadata 仍可能受 provider policy 或權利人條款限制。 | 僅本機保存；公開顯示另設 gate。                  |
| Lyrics import / lyrics overlay | 技術上只是文字資料讀取與顯示。                                            | 歌詞是獨立文字內容；公開顯示通常需確認權利。              | 預設關閉；OBS 輸出前提示。                       |
| Pitch / tempo preview          | 依賴 MPL-2.0 SoundTouchJS worklet。                                       | 處理後版本公開使用仍需確認授權；cache 可能形成副本。      | 本機預覽為主；公開輸出前提示。                   |
| Vocal separation / stems       | `onnxruntime-node` runtime；UVR 模型由設定頁下載並記錄來源/license/hash。 | Stems 是由既有音源產生的媒體副本，不應暗示可公開散布。    | 本機工作流；不提供 stems 散布功能。              |
| Recording / VOD workflow       | OBS/本機錄製流程本身不是授權服務。                                        | 錄影、VOD、clips、精華可能需要不同授權。                  | Session 前提示；與 live 分開確認。               |

### 8.4 對外散布檢查

正式開源或打包發布前，建議至少確認：

- Utawakui 自身 license、README 授權說明、第三方 notices 已一致。
- Packaged app 實際包含哪些 binary：`yt-dlp`、ONNX Runtime native binaries，以及
  哪些項目改由 app-managed provisioning 下載。
- FFmpeg 與 UVR models 若由 app-managed provisioning 下載，確認 manifest 來源、hash、
  license notice 與使用者同意流程。
- 若未來加入 model weights、sample media、demo lyrics、themes with artwork，逐一確認
  license 與可散布範圍。
- CI 或 release script 產生 dependency license report，並保存 release artifact 對應版本。
- 高風險 provider module 可以在 build 或設定層停用，不讓它成為無法分離的預設功能。

## 9. 建議產品控制

### 9.1 預設行為

- 預設入口採本機檔案匯入與 metadata workflow。
- Provider-backed acquisition 預設關閉。
- 歌詞 overlay、封面 overlay、audio processing、VOD/recording 都有獨立 feature gate。
- App 不附帶受著作權保護的 sample songs、lyrics 或 artwork。

### 9.2 Feature Gate 文案要點

Gate 應要求使用者確認：

- 已取得預期使用所需的權利或授權。
- 知悉直播、錄製與 VOD 可能需要不同授權。
- 知悉 provider workflow 可能受來源平台條款限制。
- 不會使用該功能規避存取控制或複製限制。

最小本機紀錄範例：

```json
{
  "featureId": "provider-flow",
  "noticeVersion": "legal-notice-v1",
  "confirmedAt": "2026-08-13T00:00:00.000Z"
}
```

### 9.3 錄影與串流注意事項

以下文案可作為 feature gate modal 的雛形。建議出現在「啟用 OBS 瀏覽器來源
（Browser Source）」、「開始串流輸出」、「開始錄影輸出」或「啟用歌詞/封面來源」
前。語氣維持正式、親切、清楚；只揭露必要風險，不把產品說成法律審查工具。

共同提醒：

- Utawakui 只提供本機工作流、播放控制與 OBS 輔助輸出，不提供歌曲、歌詞、封面或
  錄音內容的授權。
- 使用者需自行確認本次 OBS 場景會用到的音樂、伴奏、歌詞、封面、字幕與其他素材，
  已取得必要權利或授權。
- 平台偵測、Content ID、廣告適合度、VOD 靜音、copyright claim 或 copyright strike
  是平台處理機制，不等同法律結論。
- 未被平台偵測或處分，不代表內容已取得授權。
- 本功能不應用於規避平台存取控制、下載限制或其他保護機制。

串流前提醒：

- 串流屬公開輸出，可能涉及公開演出、公開傳輸、平台條款與權利人規範。
- 若使用第三方授權內容，請確認是否需要權利人 allowlist、白名單或平台端授權識別。
- 若 OBS 場景中包含歌詞、封面、MV、譜面或其他視覺來源，請一併確認可公開顯示。
- 關閉 VOD、關閉 clips 或使用 OBS 音訊軌道分離，可以降低存檔曝險，但不是授權替代品。

錄影/VOD 前提醒：

- 錄影、存檔、剪輯、精華與 VOD 可能額外涉及重製、同步、公開傳輸與平台規範。
- 授權若只允許現場或即時演出，不代表自動允許 VOD、shorts、clips 或二次剪輯。
- Pitch/tempo、vocal separation、guide vocal、stems 或 render cache 可能產生新的本機
  副本；公開使用前仍需確認授權。
- 刪除或不公開錄影，只能降低後續曝險，不能回溯消除已發生的未授權利用。

建議 modal 呈現方式：

- 標題使用「開始串流/錄影前確認」或「啟用 OBS 輸出前確認」。
- 內文維持短句，避免堆疊法條或威嚇式語氣。
- 使用 3-5 個 checkbox，依目前啟用的來源或輸出模式顯示必要項目即可。
- 提供「查看完整合規說明」連到本文件，但不干擾主要操作流程。
- 確認紀錄只保存在本機，不上傳、不作為使用者內容審查。

### 9.4 Tips：灰色地帶的建議操作流程

Utawakui 的功能會碰到公開音樂使用實務中的灰色地帶。產品不應承諾「合法」或「不會被抓」，
但可以提供一條更穩的操作流程，讓使用者在知道風險的前提下自行決定。

建議順序：

1. **先選來源**：優先使用原創曲、自有錄音、明確授權曲庫，或授權條款允許直播/VOD
   的 karaoke/instrumental tracks。
2. **再確認用途**：分開確認串流、錄影、VOD、clips、shorts、精華、跨平台重播是否
   都被授權涵蓋。
3. **整理 OBS 場景**：確認目前場景會進入輸出的來源；不需要時，預設不顯示完整歌詞、
   封面、MV 畫面或譜面。
4. **整理音訊來源**：若要翻唱，優先使用自製伴奏或明確授權伴奏，避免直接使用原始
   商業錄音作為 OBS 音訊來源。
5. **處理 provider flow**：provider candidate / download 僅作進階流程；啟用前顯示
   notice，提醒使用者自行確認來源平台條款與下載/快取權限。
6. **先做平台檢查**：需要公開 VOD 時，可先以 private/unlisted 觀察 claim、block、
   monetization status 或平台 checks。
7. **決定輸出策略**：開播前決定是否保存 VOD、是否開 clips、是否分離 OBS 音訊軌道、
   哪些來源只進監看、不進錄影。
8. **保留本機紀錄**：保存 feature gate confirmation、素材來源、授權證明或購買紀錄，
   但不把這些資料上傳到 Utawakui 服務。

功能對應提示：

| 功能                | 建議提示                                                        |
| ------------------- | --------------------------------------------------------------- |
| Provider download   | 僅在確認來源平台允許下載/快取，且素材使用已授權時啟用。         |
| OBS Browser Source  | 啟用前提醒該來源會被 OBS 串流或錄影，需確認畫面素材可公開輸出。 |
| Lyrics Source       | 預設關閉；啟用前提醒歌詞是獨立文字內容，可能需要顯示/傳輸授權。 |
| Artwork / thumbnail | 若要顯示於場景、瀏覽器來源或 VOD，需確認圖片素材可公開展示。    |
| Pitch / tempo       | 本機練習風險較低；公開輸出前仍需確認處理後版本是否可使用。      |
| Vocal separation    | 分離結果僅供本機工作流；不要暗示可公開散布 stems 或加工音源。   |
| Recording / VOD     | 與串流分開確認；串流可用不代表 VOD、clips 或精華可用。          |

產品文案可採用的說法：

- 「此來源可能出現在 OBS 串流或錄影中，請確認你具備本次使用所需的權利。」
- 「平台檢查結果可能會變動，通過檢查不代表已取得授權。」
- 「Utawakui 不會判斷素材權利狀態；啟用後的使用方式由使用者自行管理。」

應避免的說法：

- 「這樣就安全。」
- 「這樣不會被 Content ID 抓到。」
- 「只要不留 VOD 就合法。」
- 「只要標註來源即可使用。」

### 9.5 工程與文件

- 媒體檔案維持本機、使用者控制。
- 預設不將使用者媒體上傳到專案伺服器。
- Media protocol 不暴露任意本機路徑。
- Provider module 保持可分離，讓高風險 workflow 可停用、移除或獨立散布。
- 高風險細節留在本文件，不放在 public quickstart 主流程。
- Release build 維護 license report。

## 10. 使用者檢查清單

以下清單以操作行為分段。使用者不需要先判斷自己的身份類型，只需要確認本次實際會
使用哪些輸入、處理與輸出。

素材與來源：

- 音源、伴奏、歌詞、封面、字幕與縮圖是否為自有、原創、public domain，或已取得
  對應授權。
- 來源平台條款是否允許下載、快取、離線播放或保存 sidecar metadata。
- 若使用第三方授權曲庫，授權是否涵蓋本次平台、地區、商業化與保存方式。

本機處理：

- Pitch/tempo、vocal separation、guide vocal、stems 或 cached renders 是否被授權允許。
- 處理後素材是否只留在本機工作流，不公開散布或提供下載。

OBS 畫面輸出：

- 本次 OBS 場景中會進入輸出的來源有哪些。
- 歌詞、字幕、封面、MV、譜面或縮圖是否可公開顯示。
- 不需要公開的來源是否已從輸出場景移除，或設定成只監看、不進錄影。

串流：

- 是否具有公開演出、公開傳輸或平台要求的音樂使用權限。
- 串流平台是否允許該使用方式；必要時是否已完成 allowlist 或權利人白名單。
- 關閉 VOD、關閉 clips 或分離 OBS 音訊軌道是否只是風險控管，不被當成授權替代品。

錄影、VOD 與剪輯：

- 錄影、存檔、VOD、clips、shorts、精華與跨平台重播是否都被授權涵蓋。
- 授權若只允許即時演出，是否另行確認錄影與二次發布。
- 平台檢查通過或未被靜音，不應被視為已取得授權。

相對較可控的例子：

- 原創歌曲或自有錄音。
- 已確認 public domain 的作品與錄音。
- 授權條款明確允許該用途的 Creative Commons 或開放授權曲目。
- 明確允許 streaming 或 VOD 的授權 karaoke/instrumental tracks。
- 使用合法取得的本機檔案進行私人練習。

高風險例子：

- 從影音平台下載商業歌曲作為直播播放來源。
- 未取得授權即直播完整商業歌曲。
- 未確認 VOD 授權即保存 karaoke session。
- 未取得歌詞權利即在 OBS overlay 顯示完整歌詞。
- 使用 cookies、帳號存取、DRM bypass 或 geo-bypass 取得媒體。

## 11. Release Checklist

公開發布前：

- [ ] 確認 provider-backed acquisition 預設關閉。
- [ ] 確認 provider、lyrics、audio processing、public-output workflows 具備 feature
      gates。
- [ ] 確認 app 不附帶受著作權保護的 sample media。
- [ ] 產生並隨附第三方 license notices。
- [ ] 檢視 app-managed FFmpeg / UVR model 下載來源、hash、授權顯示與 notice 保存。
- [ ] 另行處理 `onnxruntime-node` audit remediation。
- [ ] 若加入官方 provider API，確認 privacy/data handling。
- [ ] 確認 packaging 不暗示與 YouTube、Spotify、OBS 或其他 provider 有 affiliation。
- [ ] 接近 release date 時重新確認法律與平台條款。

## 12. 參考來源

- 台灣著作權法，經濟部/TIPO：
  <https://law.moea.gov.tw/EngLawContent.aspx?id=10294&lan=E>
- 台灣著作權法第 80-2 條，TIPO：
  <https://www.tipo.gov.tw/tw/copyright/694-17503.html>
- MÜST 中華音樂著作權協會授權說明：
  <https://www.must.org.tw/tw/license/all.aspx>
- 日本著作權制度概要，文化廳：
  <https://www.bunka.go.jp/english/policy/copyright/system/>
- 日本著作權法，e-Gov：
  <https://laws.e-gov.go.jp/law/345AC0000000048>
- 日本 2020 著作權法修正概要，文化廳：
  <https://www.bunka.go.jp/english/policy/copyright/amendments_2020/>
- JASRAC copyright and licensing overview：
  <https://web.jasrac.or.jp/en/about/copyright/>
- JASRAC 動画配信：
  <https://www.jasrac.or.jp/info/network/movie/>
- 韓國著作權法，韓國著作權委員會：
  <https://www.copyright.or.kr/eng/laws-and-treaties/copyright-law/chapter02/section04.do>
- 韓國科技保護措施規定，韓國著作權委員會：
  <https://www.copyright.or.kr/eng/laws-and-treaties/copyright-law/chapter06.do>
- 美國著作權法，美國著作權局：
  <https://www.copyright.gov/title17/index.html>
- 17 U.S.C. 106，美國法典：
  <https://uscode.house.gov/view.xhtml?edition=prelim&req=granuleid:USC-prelim-title17-section106>
- 17 U.S.C. 1201，美國法典：
  <https://uscode.house.gov/view.xhtml?edition=prelim&path=/prelim@title17/chapter12>
- YouTube API Services Developer Policies：
  <https://developers.google.com/youtube/terms/developer-policies>
- YouTube live stream copyright issues：
  <https://support.google.com/youtube/answer/3367684>
- YouTube monetization icon guide：
  <https://support.google.com/youtube/answer/9208564>
- YouTube advertiser-friendly content guidelines：
  <https://support.google.com/youtube/answer/6162278>
- YouTube monetizing eligible cover videos：
  <https://support.google.com/youtube/answer/3301938>
- Twitch Music Guidelines：
  <https://www.twitch.tv/p/legal/community-guidelines/music>
- Twitch DMCA and Copyright FAQs：
  <https://help.twitch.tv/s/article/dmca-and-copyright-faqs>
- Twitch DMCA Guidelines：
  <https://legal.twitch.com/legal/dmca-guidelines>
- Spotify Developer Policy：
  <https://developer.spotify.com/policy>
- Spotify Developer Terms：
  <https://developer.spotify.com/terms>
- OBS FAQ / GPLv2 reference：
  <https://obsproject.com/help/>
- yt-dlp license：
  <https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE>
- yt-dlp README licensing notes：
  <https://github.com/yt-dlp/yt-dlp/blob/master/README.md#licensing>
- FFmpeg license and legal considerations：
  <https://www.ffmpeg.org/legal.html>
- UVR model release archive：
  <https://github.com/TRvlvr/model_repo/releases/tag/all_public_uvr_models>
- UVR license statement：
  <https://github.com/Anjok07/ultimatevocalremovergui#license>
- UVR5 MDX-Net model card / license mirror：
  <https://huggingface.co/notabilia/uvr5-models/commit/d2940fdfa8d6347ca9b864b0ebae69aa3db906d7>
- Mozilla Public License 2.0 FAQ：
  <https://www.mozilla.org/en-US/MPL/2.0/FAQ/>
