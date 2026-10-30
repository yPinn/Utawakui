# 公開發行：服務、模型與元件授權核對

查核日期：2026-10-18。對象為目前 Utawakui 0.4.0 的鎖定依賴、按需下載設定，以及本機既存 Windows unpacked package。
本紀錄延續[功能說明查核](feature-notice-review-2026-10-18.md)，判斷發行準備缺口；沒有替專案取得平台許可，也沒有改變功能可用性。
實測版本、檔案雜湊與授權檔清單另存[證據快照](release-license-evidence-2026-10-18.json)。

後續安裝包附文補正、版本來源的新證據及實際打包驗證，見[安裝包授權全文補正紀錄](../archive/packaged-notices-repair-2026-10-18.md)。以下保留原查核時點的缺口，不能當作補正後的現況。

## 發行判斷與適用邊界

目前不能把完整產品標記為「授權核對已完成、可直接公開發行」。主要問題是安裝包缺少部分完整權利聲明、選用元件尚未完成對應原始碼與權利告知安排，以及外部服務使用條件未全部確認。
GPL 的適用範圍須依元件與組合方式判斷；未取得服務條款的項目保留待確認，不直接推論為允許或禁止使用。

| 分類           | 本紀錄的意思                                                    | 發行處理                                               |
| -------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| 安裝包缺口     | 會隨 Windows app 提供的元件，必要授權文字或版本對應證據仍不完整 | 公開發行前補齊，重建後檢查最終 artifact                |
| 選用功能待完成 | 不在基礎安裝包內，透過 app 協助下載的元件或模型仍有明確未決事項 | 不宣稱該功能已完成發行審查；決定補齊、改來源或限制功能 |
| 服務使用待決策 | 軟體授權不代表取得 API、下載或內容使用許可                      | 針對該來源取得適用依據或調整整合方式                   |
| 有條件可採用   | 已找到適用的使用／散布授權；仍需履行附文、署名等條件            | 保留證據與必要文字，最終封裝再驗證                     |
| 已維持阻擋     | 現有設定已禁止產品下載的研究／benchmark 項目                    | 保留限制；不因程式碼 license 較寬鬆就解鎖模型          |

服務條款以查核日可讀版本識別，沒有與 app 相同的 semver。台灣、日本及其他地域可能有不同適用條文；本次未取得的地域版本仍標為未確認。
使用者啟用確認、免責文字及「使用者自己負責」都不能補足開發者缺少的散布或服務權限。

## 證據範圍與重現方式

- 版本來源：`package-lock.json`、`shared/featureDependencies.json`、`resources/audio-processing/*.json`，不是 `package.json` 的範圍宣告或上游最新版。
- 封裝來源：`electron-builder.yml` 與既存 `release/win-unpacked/resources/app.asar`。ASAR SHA-256 為 `b4caaf831261cda7a750deb6234dde7ac968366ac8b6af0a0a04ddab8f14ec0a`；檔案日期為 2026-10-17，內含版本 0.4.0。這是既存樣本，不是本次變更後重建的 release candidate。證據快照中的輸入檔雜湊識別查核當時內容，後續修訂應另行驗證。
- 本機準備結果：只讀取 app 管理依賴下的 manifest、license、套件 metadata 與指定 binary／model；未讀取曲庫、帳密或個人設定，也未執行網路下載功能。
- 已計算兩個 UVR 模型及 bgutil binary 的雜湊；均與 registry 相符。FFmpeg archive digest 來自安裝 manifest，另記錄 executable digest，兩者代表不同檔案。
- Audio Python 16 個實際安裝套件的 36 個 license／notice 檔均符合安裝時留下的 `RECORD` hash。這證明本機檔案與該 RECORD 一致，不等同本次重新取得並驗證所有 wheel archive。
- 重跑 `npm run license:inventory`。該工具的 npm closure 清單與 license 字串是盤點入口，不能證明 binary 附帶的全部程式、瀏覽器 bundle 或模型權重均已完成查核。

## 基礎安裝包逐項結果

| 元件與實際版本                     | 核對結果                                                                                                                                                                                                                                                                                                                     | 公開發行影響及待完成事項                                                                                                                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ONNX Runtime Node／common 1.30.0   | 鎖檔與 ASAR 均為 1.30.0；[該 tag 的 MIT 全文](https://github.com/microsoft/onnxruntime/blob/v1.30.0/LICENSE)及[第三方聲明](https://github.com/microsoft/onnxruntime/blob/v1.30.0/ThirdPartyNotices.txt)可讀，但 npm 套件及本次 package 檔案清單未附這些檔案                                                                  | 安裝包缺口。不能用總表的 MIT 名稱與 upstream URL 取代必要 notice；需依實際 Windows build 選取並保留相關第三方文字，不將全平台清單誤稱全部都有散布                                                                                                 |
| DirectML.dll 1.15.4                | 本機與 unpacked package 的 DLL 雜湊一致，file／product version 為 `1.15.4+241025-1615.1.dml-1.15.fac7597`；[NuGet 1.15.4 專用條款](https://www.nuget.org/packages/Microsoft.AI.DirectML/1.15.4/License)可讀，並非 DirectML GitHub repo 的 MIT LICENSE                                                                        | 有條件可隨 Windows ML 應用提供；條款限制 Windows／Xbox、保留權利聲明並另處理附帶第三方條款。需將 EULA 與相關 notices 對應至實際打包 DLL，不能標成全數 MIT。條款中的資料收集可能性不證明本 app 已傳送 telemetry；若使用相關功能需另核實告知        |
| koroman 1.0.16                     | npm metadata 的 gitHead 為 `e529729b923f8a9d9acc62b2c9c0887b00e9bd88`；該 commit 及 `js-v1.0.16` 的 LICENSE 都含 merge conflict 標記，但仍可識別 MIT 文字與 2025 Donghe Youn。套件只附 src，沒有完整 LICENSE                                                                                                                 | 安裝包缺口。取得並保存版本對應的權利文字，保留原證據；不擅自把有衝突的檔案整理成「上游已修正版本」。[官方 LICENSE](https://github.com/gerosyab/koroman/blob/e529729b923f8a9d9acc62b2c9c0887b00e9bd88/LICENSE)；此項尚不能由缺檔推論無任何使用許可 |
| signalsmith-stretch 1.3.2          | npm 宣告 MIT，gitHead `222093b4cc13ddb4d07c826bc3c1559326091731`；套件與輸出目錄未找到完整 license 檔。[作者網站](https://signalsmith-audio.co.uk/code/stretch/)及[官方 mirror 的 MIT 全文](https://github.com/Signalsmith-Audio/signalsmith-stretch/blob/main/LICENSE.txt)可讀，版權為 Geraint Luff／Signalsmith Audio Ltd. | 安裝包缺口。補足適用於該 JS／WASM 發行的完整權利文字及嵌入程式範圍證據；不能拿 C++ main branch 的 license 無條件證明 npm artifact 的全部來源。1.3.2 tag 直連未取得有效文件，確切版本對應仍待完成                                                  |
| kissfft-js 0.1.8                   | package metadata 只寫 MIT；實際 `COPYING` 同時包含 Julien Funk 的 wrapper MIT 與 Mark Borgerding 的 KissFFT BSD 條件。樣本 ASAR 保留 `COPYING`                                                                                                                                                                               | 有條件可採用；總表只寫 MIT 過於簡化，需如實列出兩部分且保持完整 COPYING。這不表示需要把 app 改為 BSD 或開源                                                                                                                                       |
| gsap 3.15.0                        | package 與鎖檔一致，檔頭保留來源與 license URL；適用[Standard No Charge License](https://gsap.com/community/standard-license/)，本次頁面標示 2025-04-30 生效、2025-05-30 修改                                                                                                                                                | 商用本身不需要付費，但不得移除權利聲明，且有針對競爭性視覺動畫建構工具的限制。現有固定演出模板及其有限排版設定未顯示一般動畫 builder；這是依現有功能所作判斷，不是 Webflow 書面認可。若擴為動畫編輯器，需重審；不列為已確認的現有禁止項           |
| kuromoji 0.1.2／IPADIC             | 實際 package 保留 Apache-2.0 與 `NOTICE.md`，其中含 `mecab-ipadic-2.7.0-20070801` 資料來源及條件                                                                                                                                                                                                                             | 本輪未發現缺檔；持續保留完整字典 notice，不能只帶 kuromoji 的 Apache 檔                                                                                                                                                                           |
| opencc-js 1.4.2                    | 實際 package 保留 MIT、Apache-2.0 全文及 `THIRD_PARTY_LICENSES.md`，對應 generated dictionary                                                                                                                                                                                                                                | 本輪未發現這些 package 文件缺檔；renderer 也含轉換資料，發行 notices 應讓該份聲明同樣涵蓋 browser bundle                                                                                                                                          |
| texture-bridge core／native 0.15.0 | package 含 MIT 與原生 binding 的 `THIRD-PARTY-NOTICES`，涵蓋 Spout2／SpoutDX BSD-2-Clause                                                                                                                                                                                                                                    | 本輪未發現已盤點文字缺檔；維持 native binding 旁的完整 notices，不宣稱同時散布 OBS Spout plugin                                                                                                                                                   |
| Electron（設定鎖定 43.7.8）        | 基礎 package 樣本具有 `LICENSE.electron.txt` 及 `LICENSES.chromium.html`，不是 npm production closure 可完整呈現的授權集合                                                                                                                                                                                                   | 本輪確認檔案存在，未逐項重審 Chromium 每個內嵌元件；最終 release 必須保留兩檔並對應該 Electron 版本                                                                                                                                               |
| Vue 3.5.43／@lucide/vue 1.52.0     | renderer build roots 分別為 MIT／ISC，雖列 devDependencies 仍有執行期輸出；Vite dist 未見另附 license 檔，總表僅摘要                                                                                                                                                                                                         | 安裝包需做 browser bundle notice 補齊。不能因 npm production 掃描未納入就排除，也不能把所有 Vue compiler 依賴都視為有進 bundle                                                                                                                    |
| 其他 runtime npm 根依賴            | builder-util-runtime 9.7.0、electron-updater 6.8.9、js-yaml 5.4.3、music-metadata 12.2.0、obs-websocket-js 5.0.8、sax 1.6.1、wanakana 5.3.1、ws 8.22.0，已由鎖檔及 inventory 盤點                                                                                                                                            | 本輪未發現新增的非商用限制；完整 closure 的最終授權附文驗收仍需在實際 candidate 執行，不把 metadata 字串當作已履約                                                                                                                                |

`THIRD_PARTY_NOTICES.md` 的抬頭仍寫 0.3.0 release preparation，且未涵蓋現有 Beat This／Audio Python 完整集合；它是待更新清單，不是 0.4.0 的完成證明。
本輪只記錄缺口，不把尚未補入 package 的 license 寫成已補齊。

## 固定字型資產

| 資產              | 目前識別                                                               | 本輪結果             |
| ----------------- | ---------------------------------------------------------------------- | -------------------- |
| jf open-huninn    | 2.1，`SOURCE.txt` 記錄 release URL 與 SHA-256                          | 具有完整 OFL 1.1     |
| M PLUS Rounded 1c | ExtraBold，版本／來源與 checksum 依 `SOURCE-MPLUS-ROUNDED-1C.txt` 固定 | 具有完整 OFL 1.1     |
| Keifont           | 來源／checksum 依 `SOURCE-KEIFONT.txt`                                 | 具有 Apache-2.0 全文 |
| GenEi Antique     | 6.0a normal-width，`SOURCE-GENEI-ANTIQUE.txt`                          | 具有完整 OFL 1.1     |
| Hina Mincho       | Regular，來源／checksum 依 `SOURCE-HINA-MINCHO.txt`                    | 具有完整 OFL 1.1     |

來源及授權檔均出現在既存 ASAR；本次未修改、重命名字型 binary 或單獨販售字型。
控制台文件用系統正黑體，沒有把 Microsoft 字型複製進 app。字型可散布不代表圖片、商標或歌詞也取得授權。

## Provider runtime：固定版本與 GPL 邊界

這組元件由上游直接下載到 userData，不在基礎 installer 中。現有 app 不代理或鏡像這些 binary。
因此「協助使用者直接下載」和「我們重新散布 binary」分開判定；不能僅因存在下載功能就推論所有 GPL 散布義務均由 Utawakui 承擔，也不能日後改為鏡像／整包提供仍沿用此結論。

| 下載元件              | 固定版本   | 證據與義務核對                                                                                                                                                                                                                                        |
| --------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Python embed          | 3.14.7     | 實際 runtime 保留 Python `LICENSE.txt`；[官方 3.14 授權頁](https://docs.python.org/3.14/license.html)另列 bundled software。PSF 不是所有 DLL 的唯一授權；若鏡像整包，需保留完整原包文字並核對 OpenSSL、libffi、SQLite、VC runtime 等條件              |
| yt-dlp wheel          | 2026.08.19 | 實際 dist-info 保留 Unlicense，對應[固定 tag](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/LICENSE)。此處是 Python wheel，不能拿其他形式的 standalone executable 授權集合替代                                                                     |
| ytmusicapi            | 1.12.3     | MIT，實際 dist-info license 保留；使用 private Innertube 的能力不等同取得 YouTube 服務許可                                                                                                                                                            |
| requests              | 2.34.2     | Apache-2.0，實際 LICENSE 及 NOTICE 皆保留                                                                                                                                                                                                             |
| urllib3               | 2.8.0      | MIT，實際 license 保留                                                                                                                                                                                                                                |
| certifi               | 2026.7.22  | MPL-2.0，實際 license 保留；再散布時須保留 covered source 的取得方式，不能以 MPL 字串視為完成；不推論專有 app 全部受 MPL                                                                                                                              |
| charset-normalizer    | 3.5.2      | MIT，實際 license 保留                                                                                                                                                                                                                                |
| idna                  | 3.20       | BSD-3-Clause，實際 license 保留                                                                                                                                                                                                                       |
| bgutil binary／plugin | 0.8.1      | [官方 release](https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs/releases/tag/v0.8.1) 的 exe 與 plugin SHA-256 均吻合 registry；實際 exe 也吻合。GPL-3.0-or-later，正確 tag 為 `v0.8.1`，目前 registry／總表 license URL 的 `/0.8.1/` 少了 `v` |

bgutil 的 6,253-byte 官方 plugin zip 本次重新下載查核，只有三個 Python extractor 檔與目錄，沒有完整 GPL 檔；app 產生的 `LICENSE.txt` 也只是名稱與連結。
已取得 [v0.8.1 GPL 全文](https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs/blob/v0.8.1/LICENSE)；尚未補進產品準備流程，也沒有完整的 Rust／BotGuard／其他靜態依賴 source-and-notice 對照。

[GPL 官方 FAQ](https://www.gnu.org/licenses/gpl-faq.en.html#AnonFTPAndSendSources)說明網路散布 object code 時，須提供可同樣取得且與 binary 對應的 source；一般 repo 首頁不是自動完成證明。
若我們提供鏡像、離線 runtime bundle 或修改版，需依實際散布方式履行完整 GPL／MPL 及其他條件。
現有 bgutil 走 sidecar／CLI／HTTP，未見把其 GPL 實作連結進專有主程式；這支持分開審查，但程序分離本身不是任何組合均不構成衍生著作的保證。

## FFmpeg：已解析版本與未鎖版問題

本機 manifest 的版本是 9.0.1，下載 archive SHA-256 為 `fec81ae03971d9dd4be3ebe02e263bd2ec1d789483f931bdba5f5715e65da2e9`；目前 executable SHA-256 為 `72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3`。
只執行本機既有 `ffmpeg.exe -version`：顯示 `9.0.1-essentials_build-www.gyan.dev`，包含 `--enable-gpl --enable-version3 --enable-static`，沒有觀察到 `--enable-nonfree`。
因此這個 build 確實適用 GPLv3 條件，不只是 registry 自稱 GPL。

實際解壓目錄保留上游完整 `LICENSE`；app 另寫的 `LICENSE.txt` 是摘要，不能混為同一份。
尚未建立該 binary 的完整對應來源、外部靜態程式庫版本、建置設定／scripts 與可取得位置的可追溯集合；[FFmpeg 官方法律說明](https://ffmpeg.org/legal.html)要求依配置判定，不能拿 LGPL-only 的檢查清單證明此 GPL build 已完成。

registry 仍以 `release`／`latest release`、動態 `.ver`／`.sha256` 解析。[Gyan 查核日頁面](https://www.gyan.dev/ffmpeg/builds/)已是 9.0.2，不能以它取代本機 9.0.1 的證據。
對外發行前應決定：固定已審 build 與完整證據，或將每次新解析結果納入授權審查；現狀不能給「此後所有 latest build 均已核准」的結論。
這是選用下載功能的未決事項；若日後重新散布 binary，需先完成 GPL 對應來源及附帶元件條件，不需要因此直接把整個 app 改為 GPL。

## Audio Python：16 個鎖版套件

固定環境為 `analysis-structure`，Python 3.14.7，lockHash `8509750653b25dec8f599958c2d7ce6948fdf187376bd4063afcd59e64f9bb2c`；與本機 manifest 相符。
`extractArchive` 會保留 wheel 的 dist-info；已讀取下表各套件的實際 license／notice 檔並核對 RECORD。完整 filenames、artifact digests 與文字檔 hashes 見證據快照。

| 套件                   | 版本     | 實際授權文字／需留意範圍                                                                                              |
| ---------------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| beat-this              | 1.1.0    | MIT；模型另看下一節                                                                                                   |
| torch                  | 2.11.0   | LICENSE 與 NOTICE 均在；頂層 BSD-3-Clause 不涵蓋所有內嵌元件的條件，必須保留其完整 bundled notice                     |
| torchaudio             | 2.11.0   | BSD-2-Clause 全文                                                                                                     |
| setuptools             | 81.0.0   | MIT 全文；vendored 內容仍需保留對應文字                                                                               |
| fsspec                 | 2026.7.0 | BSD-3-Clause 全文                                                                                                     |
| networkx               | 3.6.1    | BSD-3-Clause 全文                                                                                                     |
| numpy                  | 2.5.2    | 實際包含多份 license，不能僅稱 BSD；仍須對照 wheel 內數值函式庫及 runtime 的條件，不把根層 SPDX 當完整 native closure |
| sympy                  | 1.14.0   | BSD-3-Clause 全文                                                                                                     |
| mpmath                 | 1.3.0    | BSD-3-Clause 全文                                                                                                     |
| typing-extensions      | 4.16.0   | PSF-2.0 等原檔文字保留                                                                                                |
| einops                 | 0.8.2    | MIT 全文                                                                                                              |
| filelock               | 3.32.4   | MIT 全文                                                                                                              |
| jinja2                 | 3.1.6    | BSD-3-Clause 全文                                                                                                     |
| markupsafe             | 3.0.3    | BSD-3-Clause 全文                                                                                                     |
| rotary-embedding-torch | 0.9.1    | MIT 全文                                                                                                              |
| soxr                   | 1.1.0    | LGPL-2.1-or-later；實際保留 COPYING.LGPL、wrapper／libsoxr／PFFFT 四份文字，native module 為 `soxr/soxr_ext.pyd`      |

soxr 的 [v1.1.0 官方 license](https://github.com/dofuuz/python-soxr/blob/v1.1.0/LICENSE.txt)及本機檔一致。
需要另完成 exact wheel 內原生程式的對應來源／建置及替換或重新連結安排，以及允許為修改 library 除錯的必要權利；不能以「Python 與 app 分開」略過 LGPL，也不能僅因 LGPL 就推論整個 Electron app 必須開源。
目前沒有 app-owned source mirror／offer 的完成證據。上游直接下載的現行邊界與日後鏡像重散布須分開；這組環境仍列選用功能待完成。
Torch／NumPy 中內嵌 binary 的完整 license mapping 也尚未逐檔完成，36 份文字存在不等於已完成整個 native closure 判定。

## 模型權重：已找到的授權及保留限制

| 模型                      | 固定識別及來源                                                                                                                                                                         | 判斷                                                                                                                                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UVR KARA_2                | `UVR_MDXNET_KARA_2.onnx`，SHA-256 `bf32e15105a09c0f7dddd2b67346146334d6f3ecb399ed7638eba2ab07cbf5f4`                                                                                   | 本機 bytes 符合 registry；官方 release 存在此 asset。UVR 官方 README 不只說 code MIT，也明示第三方使用其 models 應遵守 MIT 並 credit UVR／developers。可作有條件採用依據，缺口轉為完整附文、作者署名及權重來源證據保存                          |
| UVR Inst_HQ_4             | `UVR-MDX-NET-Inst_HQ_4.onnx`，SHA-256 `3c4b5b9b05090fdf238f38ba5046813982d50e2a652e9cb3324ea79720c3c9c8`                                                                               | 與上列相同；不再只因 README 的 code MIT 與 model 混在一起就稱完全沒有 model 使用聲明                                                                                                                                                            |
| UVR Inst_HQ_3             | deprecated，SHA-256 `317554b07fe1ea5279a77f2b1520a41ea4b93432560c4ffd08792c30fddf9adc`                                                                                                 | registry 仍有舊版，官方 asset 可定位；本機未找到已安裝 bytes，本輪未作 binary 核對。舊版保留／升級路徑也需附文                                                                                                                                  |
| Beat This final0／small0  | wrapper 1.1.0；model manifest 的 SHA-256 分別為 `8c328b45f59d8dd3dff219253ff6a8d6482be57d0133a29140e2febbf8eb8331`／`6074be2c4d490c5f6101fcc374a1ec72ae93456e23bb6019783b849f5dc7d47b` | v1.1.0 README 列出兩模型，但沒有明確 model license 段；官方在 2026-05-28 的 `b95c8ab0c58c2d9fcfd40508ae8dffbc05ac4f5c` 澄清已發布權重也為 MIT。這是補充權重依據，不能誤寫成原 tag 早已明文說明。需隨模型保留 license／credit，而非只寫 manifest |
| all-in-one Harmonix fold0 | `harmonix-fold0-0vra4ys2.pth`，本地與 openmirlab manifest 標示 CC-BY-NC-SA-4.0；原作者 Hugging Face 頁面卻標示 MIT                                                                     | 維持 benchmark-only，但不是認定已證實只限非商用。發現原作者與 wrapper 的授權 metadata 衝突，需由權重權利人確認確切檔案／版本適用條件，才能判定是否可產品使用；不擅自放行，也不把 wrapper 的 NC 標示當權利人的最終決定                           |
| HTDemucs checkpoint       | `955717e8-8726e21a.th`，目前未接受獨立權重 product-use grant                                                                                                                           | 維持 benchmark-only。code／YAML 的 MIT 不自動解鎖 checkpoint；本輪未完成新授權證據                                                                                                                                                              |

模型依據：[UVR 官方 license／model credit 說明](https://github.com/Anjok07/ultimatevocalremovergui#license)、[官方模型 release](https://github.com/TRvlvr/model_repo/releases/tag/all_public_uvr_models)、[Beat This v1.1.0 模型列表](https://github.com/CPJKU/beat_this/blob/v1.1.0/README.md)、[權重授權澄清提交](https://github.com/CPJKU/beat_this/commit/b95c8ab0c58c2d9fcfd40508ae8dffbc05ac4f5c)。
Harmonix 的[wrapper checkpoint manifest](https://github.com/openmirlab/all-in-one-infer/blob/main/src/allin1_infer/config/checkpoints.toml)明列同一檔名／SHA-256 與 NC-SA；但[原作者 Hugging Face 模型頁](https://huggingface.co/taejunkim/allinone)標示 MIT 且沒有實質 model-card 內容。兩者衝突尚未解決，不能只選較寬鬆或較嚴格的一方作確定結論。[Demucs 官方 README](https://github.com/facebookresearch/demucs#license)有專案 MIT 聲明；本次仍未建立其與指定 checkpoint 的獨立權重範圍證據，不宣稱已證實禁止商用。
UVR release API 本次沒有 asset digest，不能把 registry hash 稱為上游簽署的授權憑證；它只能固定我們採用的 bytes。
Beat This 上游同時保留 training files 權利可能影響特定用途的提醒；作者授權權重不等於訓練資料或使用者輸入音樂也可自由重散布。

## 服務條款與實際連線

| 服務及目前使用方式                                                         | 已核對來源                                                                                                                                                                                                                                                                   | 發行影響與下一個必要決定                                                                                                                                                                                                          |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| YouTube／YouTube Music：yt-dlp 2026.08.19、ytmusicapi 1.12.3、bgutil 0.8.1 | [YouTube 服務條款](https://www.youtube.com/t/terms)限制自動存取、繞過限制及下載等，並有服務允許／書面允許／適用法律的例外；本次回應為 English Courtesy Translation，不能當作所有地域同一版本                                                                                 | 高優先服務使用待決策。bgutil 官方說明的 anti-bot 用途與現有整合直接相關；開源工具 license 與使用者素材授權都不能代替平台存取依據。未確認 TW／JP 適用版本與產品整合依據前，不應把此流程列為已完成公開服務審查；未作違法個案定論    |
| MusicBrainz Web Service v2：藝人／recording 查詢                           | [API](https://musicbrainz.org/doc/MusicBrainz_API)、[資料 license](https://musicbrainz.org/doc/About/Data_License)、[MetaBrainz 使用者分類](https://metabrainz.org/supporters/account-type)分開處理。非商用 Web Service 免費，商用請用商業安排；core data CC0 不消滅服務條件 | 服務使用待決策。專有免費 app 不自動等於非商用；需確認發行者及使用方式符合何種類別，記錄適用服務安排。現有 1.1 秒 app-wide scheduler／User-Agent 只滿足部分技術條件，不能代替分類；不擅自註冊或付費                                |
| LRCLIB：`https://lrclib.net/api`                                           | 官方 docs 本次重取為空頁；[官方 repo 的商用授權提問 #111](https://github.com/tranxuanthang/lrclib/issues/111)未看到維護者給予完整內容權利的答覆                                                                                                                              | 未確認。API 可取得不證明提供可保存／顯示所有歌詞的授權；其他使用者的 issue 評論不是官方許可或法律判決。若要保留為公開產品來源，需服務／內容依據，不能將 backend code license 延伸到歌詞                                           |
| NetEase：`https://interface.music.163.com` 原生 client                     | [官方服務條款入口](https://music.163.com/html/web2/service.html)本輪擷取失敗；實際 endpoint／Referer 依 client 可確認                                                                                                                                                        | 未確認。不能以研究用 NetEase SDK 的 license 代替本產品 direct client 的平台權限；未讀到條款不表示允許或禁止，需取得有效條款及整合依據                                                                                             |
| Better Lyrics：`https://lyrics-api.boidu.dev/getLyrics`                    | 實際舊網域可回應，但沒有取得獨立條款；[官方 backend README](https://github.com/better-lyrics/api)目前指向 `api.betterlyrics.org`，說明 cache hit／fresh query 的不同條件與專用 key 限制                                                                                      | 未確認且有服務版本／端點差異。新 API 的公開 cache 可讀不等於舊網域或未命中查詢均允許本產品使用；不能使用 Better Lyrics 專用 key。GPL backend code 未被本產品打包，不因單純 HTTP client 就推論主程式必須 GPL；內容權利仍是另一問題 |
| Musixmatch API v1.1：probe                                                 | 實際 code 只在有 `MUSIXMATCH_API_KEY` 時查詢並回傳摘要；未取得適用 key 的契約／方案條件，官方文件入口本輪未能擷取                                                                                                                                                            | 條件式未確認。沒有 key 時不會當作已開通服務；若產品部署 key，需先核對 matcher.subtitle.get、地區、快取及顯示條件。沒有讀取或輸出本機 key，也沒有以測試請求驗證帳號權限                                                            |
| Twitch／OBS 接收輸出                                                       | [Twitch Music Guidelines](https://legal.twitch.com/legal/music)涉及使用者公開音樂用途；本 app 不是 Twitch 音樂授權服務，OBS 只是接收畫面／唯讀狀態                                                                                                                           | 不構成取得任何下載來源權利的依據；不因可直播就推論可下載、可永久保存歌詞或可重散布錄音                                                                                                                                            |

以上不能只靠再加一段 modal 免責就列為完成。來源選擇、API key 契約、商用分類及是否暫不提供某來源，都需要具體產品或權利依據。
本輪未替專案聯絡上游、申請許可、訂閱方案，也沒有把回應成功視為授權。

## 公開發行前的具體處理順序

1. 補齊基礎安裝包的 ONNX／DirectML、koroman、Signalsmith 及 renderer bundle 權利文字，修正總表的 0.3.0 抬頭、KissFFT 授權範圍與漏列的 Audio Python 集合；不能只改 package metadata。
2. 將 FFmpeg 審查綁定 resolved version／archive hash；確認未鏡像與鏡像的各自流程，準備一旦自行散布時適用的完整 source-and-notice 交付。bgutil 改正來源 tag 證據並補完整 GPL／作者／靜態依賴查核。
3. 完成 soxr LGPL source／替換或重新連結條件及 Torch／NumPy binary closure；模型安裝應保留完整 MIT 與 UVR／JKU 作者 credit。維持 Harmonix／未核准 checkpoint 的產品限制。
4. 對 YouTube／YT Music、MusicBrainz、歌詞來源逐一決定適用權限、方案或替代整合；未決來源不能被列入「已核准全部功能」。來源停用是可能的產品選項，不是本輪擅自採取的變更。
5. 重建最終 Windows candidate，逐份檢查 ASAR、unpacked、Electron 外層文件及全新 userData 的按需下載結果，核對版本／hash／完整權利文字／可取得的 source。每次鎖版改變都重驗受影響集合。

本輪只新增查核文件與證據快照，沒有修改 app、依賴版本、功能 gate、發行流程或產品授權；沒有執行打包或公開發布。
已完成 npm inventory、既存 ASAR 及 unpacked 權利檔盤點、DirectML binary 對照、UVR／bgutil hash 核對，以及 16 個 Audio Python 套件的 36 份 license／notice RECORD 比對。Markdown 123 檔、變更文件 Prettier 與 git diff 空白檢查通過；本輪沒有產品程式變更，未重跑 UI 測試或建置。

審閱特別核對了直接上游下載與自行重散布、程式碼與模型權重、MIT 權限與附文履行三組邊界，並保留 Harmonix 的來源衝突。尚未取得的來源或權利安排仍保留待確認，不會因本紀錄存在而被視為已完成。
