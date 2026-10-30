# 安裝包授權全文與署名補正

日期：2026-10-18。範圍為目前鎖版的 Windows x64 基礎安裝包，延續[逐版本查核](../governance/release-license-review-2026-10-18.md)。本輪不改服務、模型、依賴版本或功能 gate，也不表示所有公開發行條件都已完成。

## 交付與版本證據

新增的 `third-party/NOTICES.txt` 提供完整文本與作者聲明；`manifest.json` 記錄每一項版本、來源及 SHA-256。兩檔經明確 extraResources 規則交付至 `resources/third-party/`，使用者可以直接開啟，不需解析 ASAR。
集合涵蓋 Windows production closure 及保守的 browser-root closure，目前為 93 個 package entries，包含一些 build-time 依賴；不是宣稱每個列出的套件都進入 renderer bundle。

| 項目                                         | 補正與精確來源                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ONNX Runtime Node／common 1.30.0             | 保留[固定 tag 的 MIT](https://github.com/microsoft/onnxruntime/blob/v1.30.0/LICENSE)；Node 另保留完整 ThirdPartyNotices。上游 aggregate 可以包含其他平台的聲明，保持原文，不聲稱每一元件都在 Windows artifact 中                                                                                                                      |
| DirectML 1.15.4                              | 從[Microsoft 官方 NuGet 1.15.4](https://www.nuget.org/packages/Microsoft.AI.DirectML/1.15.4)取出 LICENSE.txt、LICENSE-CODE.txt、ThirdPartyNotices.txt，完整保留英文條款。未拿 GitHub repo 的 MIT 取代 binary EULA                                                                                                                     |
| koroman 1.0.16                               | 由 npm gitHead `e529729b923f8a9d9acc62b2c9c0887b00e9bd88` 的 LICENSE 保留完整 MIT／2025 Donghe Youn；原檔含 merge-conflict 標記，逐 byte 保存，不改寫成虛構的「上游已修正版」                                                                                                                                                         |
| Signalsmith Stretch 1.3.2                    | 本輪找到[確切提交](https://github.com/Signalsmith-Audio/signalsmith-stretch/commit/222093b4cc13ddb4d07c826bc3c1559326091731)及其 LICENSE.txt；提交的 web/release/SignalsmithStretch.mjs 與已安裝 npm 檔完全一致，SHA-256 `97530b11d5bc01015af4cde40d6aa55ff10c40aa1294ca4c8c5762027d517a46`。前次「精確版本無法對應」的缺口已取得證據 |
| KissFFT／kissfft-js 0.1.8                    | 保留完整 COPYING，包括 Julien Funk 的 MIT wrapper 及 Mark Borgerding 的 BSD-3-Clause；總表不再只寫 MIT                                                                                                                                                                                                                                |
| Vue 3.5.43／@lucide/vue 1.52.0／OpenCC 1.4.2 | 原套件 license、字典第三方條件與 browser-root closure 的完整原檔均納入集合，避免 devDependencies 中的 runtime 輸出漏列                                                                                                                                                                                                                |
| @tokenizer/token 0.3.0                       | 上游把完整 MIT／2020 Borewit 放在 README，保留該原檔，沒有以「找不到 LICENSE 檔名」判定缺少授權                                                                                                                                                                                                                                       |
| type-fest 3.13.1                             | 依允許的雙授權選用 MIT，保留該固定版本的 license-mit 全文                                                                                                                                                                                                                                                                             |
| lazy-val 1.0.5                               | 版本提交及已發行 metadata 宣告 MIT、作者 Vladimir Krivosheev，但沒有獨立 license／copyright 檔。保留原 metadata，另附其所指的標準 MIT 條款；明示沒有推定年份或新增授權，不偽造上游 copyright notice                                                                                                                                   |
| GSAP 3.15.0                                  | 保留官方 Standard No Charge License 的全文快照、連結及生效／修改日期；不是 MIT，也不因附文完成就免除其產品使用限制                                                                                                                                                                                                                    |
| Electron／Chromium、字型與字典               | 保留原始外層 LICENSE.electron.txt／LICENSES.chromium.html；字型原始 SOURCE／OFL／Apache／binary 均按 hash 對照實際 ASAR；字典及 Spout native 的完整 notices 也在集合中                                                                                                                                                                |

## DirectML binary 的差異

官方 NuGet 的 x64-win/DirectML.dll 與 npm 內 DLL 的 file/product version 相同，但完整檔案 hash 不同。差異位於 PE Authenticode certificate 區及 checksum／certificate table 欄位，不能假稱完整 bytes 相同。

| 樣本                |       大小 | SHA-256                                                            |
| ------------------- | ---------: | ------------------------------------------------------------------ |
| 官方 NuGet x64 DLL  | 18,527,776 | `9c9e6d822561c6c41b90e6994b3e8857cf1d66dbfb1e0c4c799c7c89b4e92da1` |
| npm／本次覆蓋的 DLL | 18,527,584 | `234e8898778cdec88d3cb0539508273494082812c968699f3de665a018971625` |

排除 checksum、certificate-table entry 與 certificate bytes 後，兩者 payload hash 皆為 `476745192b2b9c21d41acdb54dc34a8afb9b8bfebf71281986eb144a41026df5`。這是版本／程式內容對照證據，不是簽章有效性的認證。交付檢查仍以實際 npm DLL 完整 hash 驗證，並同時覆蓋 ONNX Runtime native 檔。

## 剩餘限制與附文的界線

Signalsmith 的公開 build script 使用未鎖定的 Emscripten，並引用外部 Signalsmith Linear，沒有提供該 JS/WASM artifact 的完整 compiler／native dependency 版本紀錄。本輪保留 Linear、Emscripten、AUTHORS、musl、libc++ 的官方補充聲明，來源固定至其取得的 commits；這些補充快照不冒充實際編譯器版本。確切 native build provenance 仍需上游證據或獨立重建驗證。

完整授權文字、署名與發行權限分開處理。FFmpeg／bgutil／Audio Python／模型的下載與再散布條件、外部服務的使用許可、Harmonix 權重來源衝突等原有未決事項繼續存在。不能因附文打包檢查通過就宣稱全產品已獲全球發行許可。

## 生成及驗證契約

- `npm run license:write`：純離線，依目前 lock、安裝原檔及 checksum-pinned reviewed sources 生成兩個交付檔，不下載或執行 upstream 程式。
- `npm run license:verify`：拒絕過期 output、未審核版本、來源 hash 改變、缺少全文及 covered binary 改變。
- `.gitattributes`：原始附文與 aggregate 停用換行轉換，保留 upstream CRLF／空白／原有 conflict 標記；提交時另核對 index bytes，不把授權原文當成需要修正的程式 merge conflict。
- `afterPack`：檢查實際 ASAR 套件版本均有對應記錄、外置全文與 manifest bytes、原始 Electron／字型檔、ONNX／DirectML unpacked binary。
- unsigned Windows package verifier：在最終 artifact 階段再次呼叫相同檢查，避免 afterPack 之後變更內容卻未驗證。

## 驗證結果

本輪產物為 `release/license-check/Utawakui-Setup-0.4.0.exe`，168,720,819 bytes；SHA-256 為 `02db87d0896a50a3b74a6f6b0fd3578fee93d70e54eaddf47a6adf8671003b93`。此處記錄附文補正當輪的驗證狀態：當時未發布、未簽章、未安裝、未 commit；不代表已完成安裝／升級／解除安裝驗收。

| 檢查                            | 實際結果                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Windows NSIS build／afterPack   | 通過；93 個 package entries、2 個 additional components，原始 Electron／字型文件及指定 ONNX／DirectML binary 完整 hash 符合                      |
| 最終 unsigned artifact verifier | 通過；installer、blockmap、latest.yml、版本及 SHA256SUMS 一致，外置授權再次驗證                                                                  |
| NSIS 實際內容                   | 直接解讀 installer 的 `resources/third-party/NOTICES.txt` 與 `manifest.json`，和 win-unpacked 原檔逐 byte 一致，分別為 596,262／58,292 bytes     |
| 全文 SHA-256                    | `2f13b901b80334afd1f9233d8a9c910af793a10dfdc3813804f219a3f760e299`                                                                               |
| Manifest SHA-256                | `5e5bc30fbe54c6ae8bbead47c82d9a5cdd47d6640f87056338e6edbb479463e5`                                                                               |
| 全套 Vitest                     | 811 files passed；7,832 tests passed、1 skipped；包含套件 hoist 後相同版本可接受、未知版本必須拒絕的回歸檢查                                     |
| Lint／格式                      | ESLint 通過；本輪檔案 Prettier 與 Markdown 檢查通過。全域 format check 曾被另一工作新增的 SeparationDockContent.preview.test.js 擋下，未更動該檔 |
| 獨立程式審查                    | APPROVE，沒有待修正項目                                                                                                                          |
| Packaged startup                | 使用隔離 profile／port 18700，冷啟動、warm-prime 與暖啟動重試均具完整 baseline-complete／Output 首幀紀錄                                         |

啟動檢查保留限制：最初預設 port 8700 已被現有應用占用，改用隔離 port；第一次隔離暖啟動在 30 秒期限逾時（已到首幀、尚未 baseline-complete），單獨重試通過。這些 smoke 結果不是啟動效能穩定性的統計保證。沒有停止使用者正在執行的應用。

打包時 electron-builder 會提升部分依賴的路徑；交付覆蓋檢查依實際 `name@version` 比對，來源 lock 路徑與 integrity 仍保留於 manifest，不以安裝目錄位置誤判缺少授權。
