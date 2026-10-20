# 社群專案依賴與功能邊界

查核日期：2026-10-20。Utawakui 目前為單人、未登記、未公開發布且無收入的社群專案。
本清單協助決定免費核心、選用能力與未來可能的贊助權限；沒有啟用付費分級，也沒有申請或購買商用服務。
產品功能現況仍以 [spec](../spec.md) 為準，完整授權附文見 [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES.md)。

## 分層原則

Basic 應按離線可用性與核心工作流區分，不以套件是否免費或功能是否複雜決定。
現行五個 feature gates 記錄流程啟用與告知，不是付款、素材授權或上游服務許可。
按贊助金額解鎖功能會形成有對價的功能提供模式；即使名稱沿用 donation，也不能沿用「完全自願、功能相同」的判斷。

| 層次         | 建議內容                                                                      | 本輪決定                                                                          |
| ------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Basic        | 原生格式本機匯入、曲庫、歌單、播放、待播、歷史、純本機歌詞操作、手動 metadata | 保持免費核心；不需外部服務、模型或帳號                                            |
| 選用本機能力 | 分離、BPM 分析、pitch／tempo、外部裝置與 OBS 整合、演出畫面模板               | 依既有能力與 gate 管理；複雜度不代表必須付費                                      |
| 外部服務     | MusicBrainz、CAA、LRCLIB、NetEase、Better Lyrics、YouTube 輔助                | 服務條件、流量與內容權利分別核對；不作贊助權益承諾                                |
| 研究能力     | Harmonix、HTDemucs、HubertFA、Qwen／Whisper 比較、refined／backing-vocals     | 保留現有研究／未實作／blocked 狀態，不因贊助解鎖                                  |
| 未來付款權限 | 贊助等級、付費模板或功能                                                      | 功能免費；僅自有外觀 set 規劃贊助取得，機制未實作；與原有 gate 分開，仍須核對權利 |

未來若建立付款權限，某操作可用仍須同時符合：本次流程已啟用、依賴就緒、模型可用、適用服務條件滿足，以及該操作確實另有付款要求時的權限。
付款不應代替前四項條件，也不應使本機資料在贊助到期後無法匯出或播放。
社群定位本身不等於非營利法人；[CC 非商用說明](https://creativecommons.org/faq/#does-my-use-violate-the-noncommercial-clause-of-the-licenses)也依具體用途判斷，而非僅看組織名稱或是否標價。

## 外部服務與本輪防護

| 服務／流程                           | 取用與既有邊界                                                                                                        | 本輪處理                                                                                | 服務／內容條件                                                                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MusicBrainz                          | 藝人、recording、release-group GET；1.1 秒共用 scheduler、短期 cache                                                  | 沿用前輪專屬冷卻與一次短 503 重試                                                       | 個人開發可合理按非商用路徑；未來公開贊助分級未獲個案確認，暫緩洽詢                                                                                                             |
| LRCLIB                               | 固定 API；250ms scheduler、bounded response、查詢去重／cache 由 acquisition owner 管理                                | 429 不自動重試；503 只有有效且不超過 5 秒的提示可重試一次，不截短較長期限；加入共用冷卻 | 官方 docs 本輪未取得正文；程式碼開源與 API 可存取不授予歌詞保存／公開顯示權                                                                                                    |
| NetEase                              | 固定匿名 POST 查詢，500ms scheduler；不帶 cookie／可變 endpoint                                                       | HTTP 與 JSON code 的限流／服務失敗均記冷卻，無新增自動重試                              | [官方條款入口](https://music.163.com/html/web2/service.html)本輪未取得正文，未宣稱此 direct client 已獲許可                                                                    |
| Better Lyrics                        | 既有 `lyrics-api.boidu.dev`；250ms scheduler、無 key、cache-first                                                     | HTTP 429／5xx 共用冷卻，無新增重試                                                      | [官方 repo](https://github.com/better-lyrics/api#readme)現指 `api.betterlyrics.org`；公開 cache 與需 key 的 fresh fetch 分開，不能使用 Better Lyrics 專用 key；未更換 endpoint |
| Cover Art Archive                    | release／release-group metadata；cache、redirect allowlist                                                            | metadata 與圖片按 origin 冷卻，已排隊者送出前再查                                       | [API 文件](https://musicbrainz.org/doc/Cover_Art_Archive/API)列有 503；不能套用 MusicBrainz 的 1 秒規則作 CAA 官方配額。圖片權利另核                                           |
| 圖片下載                             | CAA／Internet Archive、YouTube 藝人照片等既有 host allowlists；大小、像素、redirect 每跳驗證                          | 同 host 的限流／5xx 影響後續圖片請求，不改 allowlist 或圖片驗證                         | 能下載不表示可公開使用；不新增代理或鏡像                                                                                                                                       |
| Musixmatch probe                     | 明確提供 API key 才執行，固定 matcher route；非預設 lyrics provider                                                   | HTTP／API status code 限流記冷卻，保留原有摘要格式                                      | key 的方案、地區、快取與顯示權依個別契約；不讀取或公布真實 key，不代為申請                                                                                                     |
| 回報 relay                           | 使用者明確提交 POST、固定 relay、逾時／bounded response、失敗可本機匯出                                               | 429／5xx 冷卻，絕不自動重送 POST                                                        | 自家 relay 的投遞／留存政策另管；未實際送出測試回報                                                                                                                            |
| GitHub 更新 manifest                 | 固定 release repository、版本由 updater 推導；bounded timeout／response                                               | 獨立 manifest client 加入同 host 冷卻，不改 feed、驗證或安裝程序                        | electron-updater 自身檢查／下載仍由既有 service 的 single-flight、時間界線與明確安裝操作管理                                                                                   |
| 模型／runtime 下載與版本小檔         | 固定 registry URL／hash；metadata timeout、下載 idle timeout、大小驗證                                                | 429／5xx 主機冷卻，保留無自動 retry 的行為                                              | 冷卻與 hash 都不是重散布許可；直連上游與未來自架鏡像的義務分開                                                                                                                 |
| YouTube／YouTube Music provider 程序 | yt-dlp／ytmusicapi 子程序；既有有限 phase attempts、429 不升級 phase；藝人候選有 rate-limit cooldown／circuit breaker | 盤點既有保護與回歸，沒有新增繞限流、cookie 或 BotGuard fallback                         | [YouTube 條款](https://www.youtube.com/t/terms)與工具授權分開；現有平台存取依據未因社群定位核清                                                                                |

Better Lyrics 官方說明明列 429 與 `Retry-After`，但不能把新網域的文件無條件當作既有舊網域的完整服務契約。
本輪保護是應對實際失敗的工程措施，不授予服務使用或內容利用權。
詳細行為見[外部服務請求契約](../contracts/external-service-request-policy.md)。

來源 album 的 YouTube 縮圖，以及正式／研究歌詞環境的 pinned downloads，也套用相同 guard；保留各自大小、完整性、暫存與取消契約，不新增下載或重試。OBS WebSocket 為使用者指定的應用程式連線，原 adapter 已有 single-flight、有上限的 reconnect backoff／jitter 與 disconnect 清理；Spout 是本機 native 輸出，不冒充網際網路 API 配額。固定 loopback bgutil ping 保留原本一秒逾時，不套用外網冷卻以免阻斷本機 runtime readiness。

## 授權條件如何影響分級

| 授權／權利類別          | 主要義務                                                             | 對閉源及贊助分級的影響                                                                                                    |
| ----------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| MIT／BSD／ISC／BlueOak  | 保存適用的版權、許可、免責及其他文字                                 | 通常容許商用與閉源整合；付費不免除附文，亦不表示上游背書                                                                  |
| Apache-2.0              | 保存 license／適用 NOTICE、標示修改、遵守專利與商標條件              | 可用於閉源付費功能；字典／模型若另有條件仍須另查                                                                          |
| OFL-1.1                 | 保存全文，遵守 reserved font names 等條件，不單獨販售字型            | 隨 App 的演出模板使用通常可行，不能把字型本身當作自行專有的販售品                                                         |
| GPL／LGPL／MPL          | 依實際修改、連結、組合與散布履行來源、附文及必要的替換／重新連結安排 | 收費本身非禁止事項；不能一概宣稱整個 App 必須開源，也不能用分程序／按需下載一概排除義務                                   |
| GSAP Standard No Charge | 保存聲明，避免未獲准的競爭性視覺動畫 builder 用途                    | [官方條款](https://gsap.com/community/standard-license/)容許免費商用；現有模板不等於一般動畫編輯器，擴充 builder 時須重審 |
| DirectML binary EULA    | Windows／Xbox 用途與允許的 ML／遊戲應用散布、相關 notices            | 不是僅有 GitHub MIT；維持目前 Windows 範圍，不因收費而變成可任意跨平台散布                                                |
| CC-BY-NC-SA／不明權重   | 署名、非商用、相同方式分享或取得額外許可；不明者先核證據             | 不放進有對價的贊助功能；免費層也不會自動使未核清權重可用                                                                  |
| API／素材權利           | 服務條件、配額、key、歌詞／圖片／音樂權利分開處理                    | 以自己的 UI／流程收費，不等於能把未獲許可的第三方內容或 API 存取包成權益                                                  |

GPL／LGPL 項目目前多為上游直連、分開程序的按需元件；此事實支持按元件判斷，但不是任何散布方式都可免責。
若改提供離線 bundle 或鏡像，應重新建立與 exact binary 對應的原始碼／附文交付，不把一般 repo URL 當作來源義務已完成。
FFmpeg 構建的 GPL／LGPL 條件見[官方說明](https://ffmpeg.org/legal.html)，soxr 1.1.0 的 LGPL 文字見[固定 tag](https://github.com/dofuuz/python-soxr/blob/v1.1.0/LICENSE.txt)。

## 基礎安裝包直接依賴

版本取自目前 lock 的實際解析值，不採 `package.json` 的版本範圍。
部分能力在 gate 後執行，其套件仍隨安裝包交付；不能把「沒有啟用」解釋為「沒有散布」。
Electron／Chromium 與 DLL 的內嵌元件，另需保留完整附文，不只看 npm 頂層 license。

| 套件                           | 鎖定版本 | 取用                                                      | license                 | 主要限制                                            |
| ------------------------------ | -------- | --------------------------------------------------------- | ----------------------- | --------------------------------------------------- |
| `@napolab/texture-bridge-core` | 0.15.0   | Spout 輸出 helper；native binding 另含 BSD notices        | MIT                     | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `builder-util-runtime`         | 9.7.0    | 桌面更新 runtime                                          | MIT                     | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `electron-updater`             | 6.8.9    | GitHub 更新流程                                           | MIT                     | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `gsap`                         | 3.15.0   | Browser Source 動畫                                       | GSAP Standard No Charge | 保留聲明；競爭性動畫 builder 限制                   |
| `js-yaml`                      | 5.4.3    | 模型／設定資料解析                                        | MIT                     | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `kissfft-js`                   | 0.1.8    | 音訊頻譜；wrapper MIT＋KissFFT BSD                        | MIT AND BSD-3-Clause    | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `koroman`                      | 1.0.16   | 韓文讀音                                                  | MIT                     | 保留固定來源 MIT，含原始 conflict 標記證據          |
| `kuromoji`                     | 0.1.2    | 日文字典／讀音                                            | Apache-2.0              | Apache 全文＋IPADIC NOTICE                          |
| `music-metadata`               | 12.2.0   | 本機音訊標籤／container metadata                          | MIT                     | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `obs-websocket-js`             | 5.0.8    | 可選 OBS 唯讀連線                                         | MIT                     | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `onnxruntime-node`             | 1.30.0   | 分離／研究推論；DirectML binary 另有 EULA                 | MIT                     | MIT＋native third-party；DirectML EULA 另列         |
| `opencc-js`                    | 1.4.2    | 繁簡轉換及 generated dictionary                           | MIT AND Apache-2.0      | 保留全文／NOTICE，標示修改並遵守專利條件            |
| `sax`                          | 1.6.1    | XML／TTML parser                                          | BlueOak-1.0.0           | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `wanakana`                     | 5.3.1    | 日文假名／羅馬字                                          | MIT                     | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `ws`                           | 8.22.0   | 本機 Output WebSocket                                     | MIT                     | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `electron`                     | 43.7.8   | 桌面 shell／Chromium，位於 devDependencies 仍隨安裝包交付 | MIT                     | 保留 Electron／Chromium 完整附文                    |
| `vue`                          | 3.5.43   | renderer runtime，位於 devDependencies                    | MIT                     | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `@lucide/vue`                  | 1.52.0   | renderer 圖示，位於 devDependencies                       | ISC                     | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `signalsmith-stretch`          | 1.3.2    | renderer pitch／tempo JS／WASM，位於 devDependencies      | MIT                     | MIT＋embedded 補充附文，build provenance 保留限制   |

完整附文已由 `npm run license:verify` 核對至 93 個 package entries 與 2 個額外項目。
這不等於所有模型、API 或 native build provenance 已完成核准；Signalsmith 嵌入 runtime 的編譯器版本證據仍依[先前補正紀錄](packaged-notices-repair-2026-10-18.md)保留限制。

## 選用 Provider 依賴

依 `shared/featureDependencies.json`，Provider Python 與 Audio Python 為不同環境，不共用 activation 或處理政策。
以下為 app 協助從上游下載，不在基礎 installer 中預裝的 runtime 集合。

| 元件                            | 固定版本／來源 | license                                                                                         | 限制                                                |
| ------------------------------- | -------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Python embeddable package       | 3.14.7         | [Python-2.0](https://docs.python.org/3.14/license.html)                                         | 保留適用版權、授權與免責文字；native／vendored 另核 |
| yt-dlp Python wheel             | 2026.08.19     | [Unlicense](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/LICENSE)                           | 保留適用版權、授權與免責文字；native／vendored 另核 |
| ytmusicapi Python wheel         | 1.12.3         | [MIT](https://github.com/sigma67/ytmusicapi/blob/1.12.3/LICENSE)                                | 保留適用版權、授權與免責文字；native／vendored 另核 |
| Requests Python wheel           | 2.34.2         | [Apache-2.0](https://github.com/psf/requests/blob/v2.34.2/LICENSE)                              | 保留全文／NOTICE，標示修改並遵守專利條件            |
| urllib3 Python wheel            | 2.8.0          | [MIT](https://github.com/urllib3/urllib3/blob/2.8.0/LICENSE.txt)                                | 保留適用版權、授權與免責文字；native／vendored 另核 |
| certifi Python wheel            | 2026.7.22      | [MPL-2.0](https://github.com/certifi/python-certifi/blob/2026.07.22/LICENSE)                    | 保留附文及 covered files 對應來源條件               |
| charset-normalizer Python wheel | 3.5.2          | [MIT](https://github.com/jawah/charset_normalizer/blob/3.5.2/LICENSE)                           | 保留適用版權、授權與免責文字；native／vendored 另核 |
| idna Python wheel               | 3.20           | [BSD-3-Clause](https://github.com/kjd/idna/blob/v3.20/LICENSE.md)                               | 保留適用版權、授權與免責文字；native／vendored 另核 |
| bgutil Rust PO-token provider   | 0.8.1          | [GPL-3.0-or-later](https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs/blob/0.8.1/LICENSE) | 保留全文，按實際散布交付對應原始碼與必要資訊        |
| bgutil Rust yt-dlp plugin       | 0.8.1          | [GPL-3.0-or-later](https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs/blob/0.8.1/LICENSE) | 保留全文，按實際散布交付對應原始碼與必要資訊        |
| FFmpeg essentials build         | release        | [GPL-3.0](https://ffmpeg.org/legal.html)                                                        | 保留全文，按實際散布交付對應原始碼與必要資訊        |

FFmpeg 來源是 Gyan essentials ZIP，registry 標為 GPL-3.0；檔名不是永久版本 pin，實際 resolved version／archive hash 與對應原始碼需按準備結果核對。
yt-dlp Python wheel 的 Unlicense 不涵蓋其他 standalone executable 的所有內嵌依賴，也不涵蓋 YouTube 存取或歌曲下載權。
bgutil 的來源、GPL 全文與 Rust／BotGuard 原生 closure 仍有既有待完成項；不以外部程序便宣稱可忽略。

## 選用 Audio Python 依賴

以下依 `analysis-beat-this-py314-lock.json` 的完整 16 個 Python packages，透過獨立 CPython 3.14.7 runtime 按需準備。
`dependencies` 列的是該 lock 的直接連結；空白以「無」表示，不代表 wheel 沒有 native 或 vendored 元件。

| 套件                     | 版本     | dependencies                                                             | license                                            | 限制                                                |
| ------------------------ | -------- | ------------------------------------------------------------------------ | -------------------------------------------------- | --------------------------------------------------- |
| `beat-this`              | 1.1.0    | numpy、torch、torchaudio、einops、rotary-embedding-torch、soxr           | MIT                                                | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `torch`                  | 2.11.0   | filelock、typing-extensions、setuptools、sympy、networkx、jinja2、fsspec | BSD-3-Clause                                       | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `torchaudio`             | 2.11.0   | torch                                                                    | BSD-2-Clause                                       | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `setuptools`             | 81.0.0   | 無                                                                       | MIT                                                | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `fsspec`                 | 2026.7.0 | 無                                                                       | BSD-3-Clause                                       | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `networkx`               | 3.6.1    | 無                                                                       | BSD-3-Clause                                       | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `numpy`                  | 2.5.2    | 無                                                                       | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `sympy`                  | 1.14.0   | mpmath                                                                   | BSD-3-Clause                                       | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `mpmath`                 | 1.3.0    | 無                                                                       | BSD-3-Clause                                       | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `typing-extensions`      | 4.16.0   | 無                                                                       | PSF-2.0                                            | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `einops`                 | 0.8.2    | 無                                                                       | MIT                                                | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `filelock`               | 3.32.4   | 無                                                                       | MIT                                                | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `jinja2`                 | 3.1.6    | markupsafe                                                               | BSD-3-Clause                                       | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `markupsafe`             | 3.0.3    | 無                                                                       | BSD-3-Clause                                       | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `rotary-embedding-torch` | 0.9.1    | einops、torch                                                            | MIT                                                | 保留適用版權、授權與免責文字；native／vendored 另核 |
| `soxr`                   | 1.1.0    | numpy                                                                    | LGPL-2.1-or-later                                  | 保留全文，核對來源／修改／替換或重新連結安排        |

Torch、NumPy 與 soxr 的內嵌 native notices、exact wheel source／建置及適用的替換安排，仍依[逐版本查核](release-license-review-2026-10-18.md)處理。
wrapper 或 manifest 的 `accepted` 不代表整個 native closure 及未來再散布方案已核清。

## 模型與研究資產

| 項目                     | 取用／依賴                                                                                              | 可依據的授權證據                                                                | 現有狀態與分級限制                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| UVR KARA_2               | `UVR_MDXNET_KARA_2.onnx`；ONNX Runtime／DirectML，分離 quick 路徑                                       | 上游 UVR 明確要求第三方模型使用依 MIT 並 credit UVR／developers                 | 既有可選流程；保存指定權重 hash、license／credit，不把其他 UVR 模型一併視為相同授權            |
| UVR Inst_HQ_4            | `UVR-MDX-NET-Inst_HQ_4.onnx`；general 路徑                                                              | 同上                                                                            | 與 quick 一樣是技術 recipe，不是現有付款等級                                                   |
| UVR Inst_HQ_3            | 舊版 ONNX                                                                                               | 同一上游模型聲明，確切檔案見 registry                                           | deprecated／升級相容，非新分級賣點                                                             |
| Beat This small0／final0 | 1.1.0 wrapper、獨立 checkpoints、Audio Python 16 packages                                               | 上游補充明示 code 與已發布權重為 MIT                                            | 目前可下載；保留 license／credit，訓練資料與輸入音樂權利仍分開                                 |
| Harmonix fold0           | `harmonix-fold0-0vra4ys2.pth`；all-in-one                                                               | 原作者 HF 頁面 MIT，wrapper 對同 hash 標 CC-BY-NC-SA-4.0，證據衝突              | 維持 benchmark-only；不選較寬鬆 metadata 直接解鎖，也不斷言已證實禁止商用                      |
| HTDemucs                 | `955717e8-8726e21a.th`                                                                                  | 專案 MIT 與指定 checkpoint 使用範圍尚未完成對照                                 | 維持 benchmark-only；不把 code／YAML license 代替權重證據                                      |
| Refined BS-Roformer      | `bs-roformer-viperx-1297`；audio-separator 0.44.5 probe／worker scaffolding                             | 目前沒有已啟用的完整產品 model lock／採用證據                                   | recipe 未實作且 gate 未通過，不為贊助分級啟用或宣稱已有正式能力                                |
| HubertFA                 | v0.0.7 `1218_hfa_model_new_dict.zip`；ONNX、Python 3.14.7、pypinyin 0.55.0、NumPy 2.5.2、vendor decoder | 程式 Apache-2.0；指定權重與中日字典之使用／再散布範圍仍未核清                   | 正式 catalog blocked；明確手動研究入口不等於可公開／付費提供，保持隔離                         |
| Whisper.cpp              | v1.9.2 原生 CLI；GGML base／small 固定 revision                                                         | CLI MIT；Whisper 官方明示 code 與 weights MIT，轉換檔仍需保持 exact source 對照 | 私人研究候選／fresh trial 資產，非正式 App 功能；沒有因 MIT 自動通過品質、封裝與採用關卡       |
| Qwen3 ForcedAligner 0.6B | 模型 revision `c7cbfc2…`、Qwen3-ASR source `7c6daf7…`；私有 CPython 3.12.12／Torch 2.9.1 環境           | 官方固定 revision model card 標 Apache-2.0                                      | 僅研究候選；完整私有 Python closure 未變成產品 lock，不能把 Audio Python 16 包當作它的依賴全集 |

HubertFA 的 [pypinyin 0.55.0](https://pypi.org/project/pypinyin/0.55.0/) 標示 MIT，另需保留其授權與字典來源，不能只因 decoder Apache 就涵蓋整個權重 ZIP。
Qwen／Whisper 的 private research configs、環境、素材與結果不納入 installer；本清單沒有讀取或公布這些私人檔案。本輪沒有改寫 vendor decoder、權重 hash 或舊研究收據；host 原始碼變更仍由既有 binding 檢查判定，不能重寫舊證據來接受不同程式。
尚未有正式 lock 的候選不虛構逐版本環境清單；決定採用時須再從該候選凍結的完整環境產生清單。

模型依據：[UVR model credit](https://github.com/Anjok07/ultimatevocalremovergui#license)、[Beat This 權重澄清](https://github.com/CPJKU/beat_this/commit/b95c8ab0c58c2d9fcfd40508ae8dffbc05ac4f5c)、[Harmonix wrapper manifest](https://github.com/openmirlab/all-in-one-infer/blob/main/src/allin1_infer/config/checkpoints.toml)、[原作者模型頁](https://huggingface.co/taejunkim/allinone)、[HubertFA](https://github.com/wolfgitpr/HubertFA)、[Whisper code／weights](https://github.com/openai/whisper#license)、[Whisper.cpp 固定版本](https://github.com/ggml-org/whisper.cpp/blob/v1.9.2/LICENSE)、[Qwen 固定模型卡](https://huggingface.co/Qwen/Qwen3-ForcedAligner-0.6B/blob/c7cbfc2048c462b0d63a45797104fc9db3ad62b7/README.md)。

## 字型與字典

| 項目                          | 授權／使用位置                               | 分級時需保留的條件                                       |
| ----------------------------- | -------------------------------------------- | -------------------------------------------------------- |
| jf open-huninn 2.1            | OFL-1.1；Classic KTV                         | LICENSE／SOURCE、reserved font names；不單獨販售字型     |
| M PLUS Rounded 1c ExtraBold   | OFL-1.1；Kinetic Pop                         | 同上，版本與 hash 以 SOURCE 固定                         |
| Keifont                       | Apache-2.0；Kinetic Pop                      | license、來源、適用 NOTICE 與修改標示                    |
| GenEi Antique 6.0a            | OFL-1.1；Manga Frame                         | license／來源／reserved font name                        |
| Hina Mincho Regular           | OFL-1.1；Ornate Vertical                     | license／來源；收費模板不改字型自己的條件                |
| kuromoji／IPADIC              | Apache-2.0 程式＋IPADIC 自身 notice          | 保留 `NOTICE.md` 全文，不能只附 Apache 名稱              |
| OpenCC generated dictionaries | MIT AND Apache-2.0                           | 保留轉換資料第三方 notices，renderer bundle 也在交付範圍 |
| HubertFA 中日字典             | 與指定 research ZIP 一起採用，來源範圍未核清 | 暫不作正式／贊助分級能力；見模型列                       |

## Qwen 私人研究環境依賴索引

依 [2026-10-19 研究收據](../research/lyrics-alignment/data/lyrics-alignment-candidates-2026-10-19.json) 列出55包；本輪取得54包的 PyPI 固定版本 metadata，另保留[查詢快照](data/qwen-research-pypi-license-metadata-2026-10-20.json)。這是研究取用及宣告授權清單，不是已核對所有 wheel／native binaries 的產品 lock。`torch==2.9.1+cpu` 不在 PyPI 同名版，不能用不同 artifact 取代其驗證。

| 套件                 | 版本       | license 證據                                                                                  | 限制／狀態                                                                           |
| -------------------- | ---------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `accelerate`         | 1.12.0     | [Apache Software License](https://pypi.org/pypi/accelerate/1.12.0/json)                       | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `audioread`          | 3.1.0      | [MIT](https://pypi.org/pypi/audioread/3.1.0/json)                                             | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `av`                 | 19.0.1     | [BSD-3-Clause](https://pypi.org/pypi/av/19.0.1/json)                                          | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對；native／外部程式條件須另核 |
| `certifi`            | 2026.10.18 | [Mozilla Public License 2.0 (MPL 2.0)](https://pypi.org/pypi/certifi/2026.10.18/json)         | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `cffi`               | 2.1.1      | [MIT-0](https://pypi.org/pypi/cffi/2.1.1/json)                                                | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `charset-normalizer` | 3.5.2      | [MIT](https://pypi.org/pypi/charset-normalizer/3.5.2/json)                                    | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `cloudpickle`        | 3.1.2      | [BSD License](https://pypi.org/pypi/cloudpickle/3.1.2/json)                                   | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `colorama`           | 0.4.6      | [BSD License](https://pypi.org/pypi/colorama/0.4.6/json)                                      | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `cython`             | 3.3.0      | [Apache-2.0](https://pypi.org/pypi/cython/3.3.0/json)                                         | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `decorator`          | 5.3.1      | [BSD-2-Clause](https://pypi.org/pypi/decorator/5.3.1/json)                                    | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `dynet38`            | 2.2        | [Apache Software License](https://pypi.org/pypi/dynet38/2.2/json)                             | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `filelock`           | 3.32.3     | [MIT](https://pypi.org/pypi/filelock/3.32.3/json)                                             | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `fsspec`             | 2026.7.0   | BSD-3-Clause（同版 Audio Python lock）                                                        | PyPI 缺 license 欄位；依同版既有 lock，不代表 Qwen wheel 已比對                      |
| `huggingface-hub`    | 0.36.2     | [Apache Software License](https://pypi.org/pypi/huggingface-hub/0.36.2/json)                  | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `idna`               | 3.20       | [BSD-3-Clause](https://pypi.org/pypi/idna/3.20/json)                                          | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `jinja2`             | 3.1.6      | [BSD License](https://pypi.org/pypi/jinja2/3.1.6/json)                                        | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `joblib`             | 1.6.0      | [BSD-3-Clause](https://pypi.org/pypi/joblib/1.6.0/json)                                       | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `lazy-loader`        | 0.6        | [BSD-3-Clause](https://pypi.org/pypi/lazy-loader/0.6/json)                                    | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `librosa`            | 0.11.0     | [ISC License (ISCL)](https://pypi.org/pypi/librosa/0.11.0/json)                               | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `llvmlite`           | 0.50.0     | [BSD-2-Clause AND Apache-2.0 WITH LLVM-exception](https://pypi.org/pypi/llvmlite/0.50.0/json) | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對；native／外部程式條件須另核 |
| `markupsafe`         | 3.0.3      | [BSD-3-Clause](https://pypi.org/pypi/markupsafe/3.0.3/json)                                   | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `mpmath`             | 1.3.0      | [BSD License](https://pypi.org/pypi/mpmath/1.3.0/json)                                        | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `msgpack`            | 1.2.3      | [Apache-2.0](https://pypi.org/pypi/msgpack/1.2.3/json)                                        | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `nagisa`             | 0.2.11     | [MIT License](https://pypi.org/pypi/nagisa/0.2.11/json)                                       | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `narwhals`           | 2.27.1     | [MIT](https://pypi.org/pypi/narwhals/2.27.1/json)                                             | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `networkx`           | 3.6.1      | [BSD-3-Clause](https://pypi.org/pypi/networkx/3.6.1/json)                                     | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `numba`              | 0.68.0     | [BSD License](https://pypi.org/pypi/numba/0.68.0/json)                                        | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `numpy`              | 2.5.4      | [BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0](https://pypi.org/pypi/numpy/2.5.4/json)  | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對；native／外部程式條件須另核 |
| `packaging`          | 26.3       | [Apache-2.0 OR BSD-2-Clause](https://pypi.org/pypi/packaging/26.3/json)                       | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `pillow`             | 13.0.0     | [MIT-CMU](https://pypi.org/pypi/pillow/13.0.0/json)                                           | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `platformdirs`       | 4.13.4     | [MIT](https://pypi.org/pypi/platformdirs/4.13.4/json)                                         | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `pooch`              | 1.9.0      | [BSD-3-Clause](https://pypi.org/pypi/pooch/1.9.0/json)                                        | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `psutil`             | 7.2.2      | [BSD-3-Clause](https://pypi.org/pypi/psutil/7.2.2/json)                                       | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `pycparser`          | 3.11       | [BSD-3-Clause](https://pypi.org/pypi/pycparser/3.11/json)                                     | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `pyyaml`             | 6.0.3      | [MIT License](https://pypi.org/pypi/pyyaml/6.0.3/json)                                        | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `qwen-omni-utils`    | 0.0.8      | [Apache Software License](https://pypi.org/pypi/qwen-omni-utils/0.0.8/json)                   | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `regex`              | 2026.9.29  | [Apache-2.0 AND CNRI-Python](https://pypi.org/pypi/regex/2026.9.29/json)                      | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `requests`           | 2.34.2     | [Apache Software License](https://pypi.org/pypi/requests/2.34.2/json)                         | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `safetensors`        | 0.8.0      | [Apache Software License](https://pypi.org/pypi/safetensors/0.8.0/json)                       | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `scikit-learn`       | 1.9.1      | [BSD-3-Clause](https://pypi.org/pypi/scikit-learn/1.9.1/json)                                 | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `scipy`              | 1.18.1     | [BSD License](https://pypi.org/pypi/scipy/1.18.1/json)                                        | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對；native／外部程式條件須另核 |
| `setuptools`         | 78.1.0     | [MIT License](https://pypi.org/pypi/setuptools/78.1.0/json)                                   | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `six`                | 1.17.0     | [MIT License](https://pypi.org/pypi/six/1.17.0/json)                                          | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `soundfile`          | 0.13.1     | [BSD License](https://pypi.org/pypi/soundfile/0.13.1/json)                                    | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對；native／外部程式條件須另核 |
| `sox`                | 1.5.0      | [BSD-3-Clause](https://pypi.org/pypi/sox/1.5.0/json)                                          | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對；native／外部程式條件須另核 |
| `soxr`               | 1.1.0      | [LGPL-2.1-or-later](https://pypi.org/pypi/soxr/1.1.0/json)                                    | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對；native／外部程式條件須另核 |
| `soynlp`             | 0.0.493    | [GNU General Public License v3 (GPLv3)](https://pypi.org/pypi/soynlp/0.0.493/json)            | GPLv3：研究環境有此包；正式提供前需核對 Python worker 組合／散布義務或替代           |
| `sympy`              | 1.14.0     | [BSD License](https://pypi.org/pypi/sympy/1.14.0/json)                                        | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `threadpoolctl`      | 3.7.0      | [BSD-3-Clause](https://pypi.org/pypi/threadpoolctl/3.7.0/json)                                | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `tokenizers`         | 0.22.2     | [Apache Software License](https://pypi.org/pypi/tokenizers/0.22.2/json)                       | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `torch`              | 2.9.1+cpu  | [BSD-3-Clause（upstream code）](https://github.com/pytorch/pytorch/blob/v2.9.1/LICENSE)       | 2.9.1+cpu 不在 PyPI 同名版；CPU wheel 及內嵌程式仍待逐項核對                         |
| `tqdm`               | 4.70.1     | [MPL-2.0 AND MIT](https://pypi.org/pypi/tqdm/4.70.1/json)                                     | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `transformers`       | 4.57.6     | [Apache Software License](https://pypi.org/pypi/transformers/4.57.6/json)                     | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `typing-extensions`  | 4.16.0     | [PSF-2.0](https://pypi.org/pypi/typing-extensions/4.16.0/json)                                | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |
| `urllib3`            | 2.8.0      | [MIT](https://pypi.org/pypi/urllib3/2.8.0/json)                                               | PyPI 固定版 metadata；exact wheel／native 附文未逐檔核對                             |

其中 [soynlp 0.0.493](https://pypi.org/project/soynlp/0.0.493/) 宣告 GPLv3，是採用 Qwen runtime 前必須獨立處理的條件。模型 Apache-2.0 不會覆蓋它；同 Python 程序的實際組合、修改與散布方式須先核對，不能只憑 Electron／Python 分程序就排除義務，也不能反向斷言整個 Electron App 已必須改為 GPL。

[PyAV 19.0.1](https://pypi.org/project/av/19.0.1/) 的 BSD 宣告不概括其 FFmpeg／codec closure；[sox 1.5.0](https://pypi.org/project/sox/1.5.0/) 是 Python wrapper，不代表外部 SoX executable。Native closure、字典、修改與來源交付仍須依 exact artifact 核對。

## 開發工具直接依賴

下表排除已列入 runtime 的 Electron、Vue、Lucide 與 Signalsmith。工具本身的 license 不代表其產物、內嵌資產或所有 transitive dependencies 都只有同一授權。

| 套件                              | 版本    | 取用                  | license |
| --------------------------------- | ------- | --------------------- | ------- |
| `@commitlint/cli`                 | 21.2.3  | 開發／build／測試工具 | MIT     |
| `@commitlint/config-conventional` | 21.2.3  | 開發／build／測試工具 | MIT     |
| `@eslint/js`                      | 10.0.1  | 開發／build／測試工具 | MIT     |
| `@vitejs/plugin-vue`              | 6.0.9   | 開發／build／測試工具 | MIT     |
| `@vitest/coverage-istanbul`       | 4.1.11  | 開發／build／測試工具 | MIT     |
| `@vitest/coverage-v8`             | 4.1.11  | 開發／build／測試工具 | MIT     |
| `adm-zip`                         | 0.6.1   | 開發／build／測試工具 | MIT     |
| `concurrently`                    | 10.0.5  | 開發／build／測試工具 | MIT     |
| `electron-builder`                | 26.17.0 | 開發／build／測試工具 | MIT     |
| `eslint`                          | 10.12.0 | 開發／build／測試工具 | MIT     |
| `eslint-config-prettier`          | 10.1.8  | 開發／build／測試工具 | MIT     |
| `eslint-plugin-vue`               | 10.11.1 | 開發／build／測試工具 | MIT     |
| `globals`                         | 17.13.0 | 開發／build／測試工具 | MIT     |
| `husky`                           | 9.1.7   | 開發／build／測試工具 | MIT     |
| `lint-staged`                     | 17.6.0  | 開發／build／測試工具 | MIT     |
| `markdownlint-cli2`               | 0.23.3  | 開發／build／測試工具 | MIT     |
| `prettier`                        | 3.9.9   | 開發／build／測試工具 | MIT     |
| `semver`                          | 7.8.5   | 開發／build／測試工具 | ISC     |
| `vite`                            | 8.3.3   | 開發／build／測試工具 | MIT     |
| `vitest`                          | 4.1.11  | 開發／build／測試工具 | MIT     |
| `wait-on`                         | 9.5.1   | 開發／build／測試工具 | MIT     |

## 基礎附文集合逐項索引

以下按 `third-party/manifest.json` 的 93 個 package entries 列出，包含保守的 browser-root closure，並非聲稱每包都直接進入 renderer bundle。
license 欄以該 entry 的 lock／套件 metadata 為索引，已知複合條件另外補註；義務判定須對照相鄰完整 license files，不能把此表當作替代全文。
DirectML 1.15.4 與 Signalsmith embedded supplementary notices 是另 2 個項目，分別依上節 EULA 及原始 notices 管理。

| 序  | 套件                                     | 版本    | license 索引                 | 主要義務                                            |
| --- | ---------------------------------------- | ------- | ---------------------------- | --------------------------------------------------- |
| 1   | `@babel/helper-string-parser`            | 7.29.7  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 2   | `@babel/helper-validator-identifier`     | 7.29.7  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 3   | `@babel/parser`                          | 7.29.9  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 4   | `@babel/types`                           | 7.29.8  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 5   | `@borewit/text-codec`                    | 0.2.2   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 6   | `@jridgewell/sourcemap-codec`            | 1.6.0   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 7   | `@lucide/vue`                            | 1.52.0  | ISC                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 8   | `@msgpack/msgpack`                       | 2.8.0   | ISC                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 9   | `@napolab/texture-bridge`                | 0.15.0  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 10  | `@napolab/texture-bridge-core`           | 0.15.0  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 11  | `@napolab/texture-bridge-win32-x64-msvc` | 0.15.0  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 12  | `@tokenizer/inflate`                     | 0.4.1   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 13  | `@tokenizer/token`                       | 0.3.0   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 14  | `@vue/compiler-core`                     | 3.5.43  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 15  | `entities`                               | 7.0.1   | BSD-2-Clause                 | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 16  | `estree-walker`                          | 2.0.2   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 17  | `@vue/compiler-dom`                      | 3.5.43  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 18  | `@vue/compiler-sfc`                      | 3.5.43  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 19  | `estree-walker`                          | 2.0.2   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 20  | `@vue/compiler-ssr`                      | 3.5.43  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 21  | `@vue/reactivity`                        | 3.5.43  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 22  | `@vue/runtime-core`                      | 3.5.43  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 23  | `@vue/runtime-dom`                       | 3.5.43  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 24  | `@vue/server-renderer`                   | 3.5.43  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 25  | `@vue/shared`                            | 3.5.43  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 26  | `adm-zip`                                | 0.6.1   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 27  | `argparse`                               | 2.0.1   | Python-2.0                   | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 28  | `builder-util-runtime`                   | 9.7.0   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 29  | `content-type`                           | 3.1.1   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 30  | `crypto-js`                              | 4.2.0   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 31  | `csstype`                                | 3.2.3   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 32  | `debug`                                  | 4.4.3   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 33  | `define-data-property`                   | 1.1.4   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 34  | `define-properties`                      | 1.2.1   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 35  | `doublearray`                            | 0.0.2   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 36  | `electron-updater`                       | 6.8.9   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 37  | `js-yaml`                                | 4.3.2   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 38  | `semver`                                 | 7.7.4   | ISC                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 39  | `es-define-property`                     | 1.0.1   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 40  | `es-errors`                              | 1.3.0   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 41  | `escape-string-regexp`                   | 4.0.0   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 42  | `eventemitter3`                          | 5.0.4   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 43  | `file-type`                              | 22.1.1  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 44  | `fs-extra`                               | 10.1.0  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 45  | `global-agent`                           | 4.1.3   | BSD-3-Clause                 | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 46  | `globalthis`                             | 1.0.4   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 47  | `gopd`                                   | 1.2.0   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 48  | `graceful-fs`                            | 4.2.11  | ISC                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 49  | `gsap`                                   | 3.15.0  | GSAP Standard No Charge      | 保留聲明；競爭性動畫 builder 限制                   |
| 50  | `has-property-descriptors`               | 1.0.2   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 51  | `ieee754`                                | 1.2.1   | BSD-3-Clause                 | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 52  | `isomorphic-ws`                          | 5.0.0   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 53  | `js-yaml`                                | 5.4.3   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 54  | `jsonfile`                               | 6.2.1   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 55  | `kissfft-js`                             | 0.1.8   | MIT AND BSD-3-Clause         | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 56  | `koroman`                                | 1.0.16  | MIT                          | 保留固定來源 MIT，含原始 conflict 標記證據          |
| 57  | `kuromoji`                               | 0.1.2   | Apache-2.0                   | Apache 全文＋IPADIC NOTICE                          |
| 58  | `async`                                  | 2.6.4   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 59  | `lazy-val`                               | 1.0.5   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 60  | `lodash`                                 | 4.18.1  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 61  | `lodash.escaperegexp`                    | 4.1.2   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 62  | `lodash.isequal`                         | 4.5.0   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 63  | `magic-string`                           | 0.30.21 | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 64  | `matcher`                                | 4.0.0   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 65  | `media-typer`                            | 2.0.0   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 66  | `ms`                                     | 2.1.3   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 67  | `music-metadata`                         | 12.2.0  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 68  | `nanoid`                                 | 3.3.20  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 69  | `neverthrow`                             | 8.2.0   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 70  | `object-keys`                            | 1.1.1   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 71  | `obs-websocket-js`                       | 5.0.8   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 72  | `onnxruntime-common`                     | 1.30.0  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 73  | `onnxruntime-node`                       | 1.30.0  | MIT                          | MIT＋native third-party；DirectML EULA 另列         |
| 74  | `opencc-js`                              | 1.4.2   | MIT AND Apache-2.0           | 保留全文／NOTICE，標示修改並遵守專利條件            |
| 75  | `picocolors`                             | 1.1.1   | ISC                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 76  | `postcss`                                | 8.5.29  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 77  | `sax`                                    | 1.6.1   | BlueOak-1.0.0                | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 78  | `semver`                                 | 7.8.5   | ISC                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 79  | `serialize-error`                        | 8.1.0   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 80  | `type-fest`                              | 0.20.2  | (MIT OR CC0-1.0)；附文選 MIT | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 81  | `signalsmith-stretch`                    | 1.3.2   | MIT                          | MIT＋embedded 補充附文，build provenance 保留限制   |
| 82  | `source-map-js`                          | 1.2.2   | BSD-3-Clause                 | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 83  | `strtok3`                                | 10.4.1  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 84  | `tiny-typed-emitter`                     | 2.1.0   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 85  | `token-types`                            | 6.1.2   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 86  | `type-fest`                              | 3.13.1  | (MIT OR CC0-1.0)；附文選 MIT | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 87  | `uint8array-extras`                      | 1.6.0   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 88  | `universalify`                           | 2.0.1   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 89  | `vue`                                    | 3.5.43  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 90  | `wanakana`                               | 5.3.1   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 91  | `win-guid`                               | 0.2.1   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 92  | `ws`                                     | 8.22.0  | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |
| 93  | `zlibjs`                                 | 0.3.1   | MIT                          | 保留適用版權、授權與免責文字；native／vendored 另核 |

## 驗證與未決項

62 份、714 項相關 unit／runtime 測試通過，包含封裝依賴與 pinned artifact 邊界。新冷卻模組 statements／branches／functions／lines 均為 100%；加上 LRCLIB 的覆蓋集合分別為 94.44%／93.37%／84.61%／98.75%。變更 JavaScript 的 ESLint、Prettier、全161份Markdown、production build 與 license:verify（93＋2）通過；build 保留既有的大 chunk 提示。

沙箱與工作區 TEMP 曾在既有 Provider runtime 安裝 fixture 遇到 Windows rename EPERM；未改程式或測試邏輯，改一般 Windows user TEMP 後，單檔40項與同組714項完整通過。隔離 Electron 啟動 exit0，12個 startup milestones 含 baseline-complete 與 Output 首幀齊全；這不代表視覺或真實外部服務壓力驗收。

服務條款未取得、模型證據衝突、native closure／source arrangements 等未決項，不因工程測試通過而變成已解決。
本輪不代為洽詢方案、不申請 key、不開放付費等級；若未來以贊助解鎖功能，先對該功能實際用到的 code、weights、service 與內容完成相應條件。
