# 防禦編程與發行防護檢查

查核日期：2026-10-26。來源基準為 `d0069f31` 及本輪未提交修正。
機器摘要見[同名 JSON](defensive-security-review-2026-10-26.json)。
這是針對具體信任邊界的來源、測試與產物檢查，不代表整個產品已通過滲透測試。

## 威脅模型與現有邊界

假設 renderer 可被修改，或呼叫者跳過 UI／preload 的驗證直接送出 IPC；Main 仍須限制 sender、intent、檔案與程序操作。
本機使用者可以閱讀安裝內容；可修改程式與執行檔的本機管理員不在 renderer 隔離的保護範圍。
Feature gates 是選用流程與告知的控制，不是不可繞過的授權或付費機制。

本輪核對 `ipcSenderPolicy` 的 exact webContents／main frame capability、preload 固定 intent、視窗 navigation／popup、權限 allowlist、外部連結固定 target、media routes、封面 redirect allowlist、依賴下載／解壓與更新驗證。
沿用既有 sandbox、context isolation、CSP 與 bounded public errors，沒有新增反除錯或程式混淆。
這些檢查方向符合 [Electron 安全指引](https://www.electronjs.org/docs/latest/tutorial/security)；既有 source 與測試才是本專案行為的證據。

## 已修正的 Windows 名稱缺口

舊 `isServableFilename` 只檢查分隔符與副檔名，會接受 `private.txt:audio.mp3`。
在隔離 NTFS 暫存目錄中，先建立一般檔案與該 alternate stream，確認 stream 可讀、但不列在一般 directory listing；舊 `resolveTrackPath` 仍會回傳它。
這證明可繞過一般音檔名稱邊界，沒有證明可讀取曲庫外的任意檔案或執行程式。

`isSafeTrackId` 與 ZIP entry 驗證也接受冒號、控制字元、DOS device names 和尾端點／空白。
新增 `isSafeWindowsFilename` 共用規則，套用至曲目 ID、音檔／封面／字幕名稱及 ZIP 每一段名稱。
保留 Unicode、一般曲名、dotfile、`COM10`、ZIP 的 `./`、巢狀目錄與末尾目錄分隔符。
規則依據 [Microsoft Windows 檔案命名規範](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file)。

測試先失敗再修正：paths 有 24 項新增失敗、archive 有 8 項新增失敗；修正後兩檔 83 項通過，包含實際 NTFS stream fixture。
檢查仍是 lexical boundary，不聲稱可阻止同一使用者在檢查後替換 junction、檔案或程式碼。

## 依賴查核與獨立工具修補

主專案 `npm audit --json` 查核回報 0 項已知漏洞；不包含其他 lockfile 或 Python runtime。
獨立 NetEase 評估工具的 audit 原有 4 個 high package entries，其中父套件 entry 是相依漏洞的傳遞標記。
本輪只更新該 lockfile 的三個 package entries，保留 provider `4.40.1` 與現有 overrides：

| 套件位置                      | 更新            | 對應公告                                                                                                                                           |
| ----------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 巢狀 Express 4 的 body-parser | 1.20.6 → 1.20.9 | [壓縮內容尾端資料造成程序終止](https://github.com/advisories/GHSA-27r3-jxmh-p828)                                                                  |
| Express 5 的 body-parser      | 2.3.0 → 2.4.0   | 同上                                                                                                                                               |
| follow-redirects              | 1.16.0 → 1.16.2 | [array headers](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8)、[sensitive header escaping](https://github.com/advisories/GHSA-8r9p-f939-6h3c) |

先新增兩項 lockfile floor 測試並觀察失敗，再以 npm 在父套件範圍內更新；沒有增加 override。
`npm ci --ignore-scripts` 完成。獨立 Node suite 的 9 項離線測試通過，包含兩個 loopback origin 間的實際 redirect：object 與 array headers 的合成 Authorization、Cookie、Proxy-Authorization 與含 `^`／`|` 的敏感 header 都被移除，一般 header 保留。
未連線真實歌詞 provider，也未重建使用者的已啟用工具 generation。

更新後該工具仍回報 2 個 high package entries：`node-forge` 與其父套件；兩者同源於既有 RSA PKCS#1 v1.5 驗簽公告，audit 回報沒有修補版。
延續[前次查核](dependency-security-review-2026-10-16.md)的待處理結論，不移除套件、不隱藏告警，也不把離線相容測試當作線上 provider 驗收。

## 尚未完成的 runtime 與發行防護

OSV 查核 24 組已釘選 PyPI name/version，命中 `analysis-beat-this-py314-lock.json` 的三個套件：

| 套件              | 本輪查核結果與適用條件                                                                                                                                                                                                                                         | 後續驗證界線                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| filelock 3.32.4   | [Windows soft-lock oplock](https://github.com/advisories/GHSA-567q-5qvw-pf92)、[Windows SQLite side files](https://github.com/advisories/GHSA-9vhv-jxww-xfm5)、[ReadWriteLock path reuse](https://github.com/advisories/GHSA-v4x8-3wr5-3wq8)；公告修補版 4.2.1 | 尚未對第三方間接呼叫完成動態 reachability 證明；需重解 lock、核對 wheel 與 hash，再驗 Windows runtime 相容性         |
| setuptools 81.0.0 | [macOS sdist Unicode 排除規則](https://github.com/advisories/GHSA-h35f-9h28-mq5c)與 PYSEC-2026-3447 同源；另有 [Windows legacy wheel install](https://github.com/advisories/GHSA-xmj3-9gf7-h52w)，後者修補版 84.1.0                                            | 本機 runtime 下載既定 hash 的 wheel 後直接解壓；不使用 setuptools 建 sdist／legacy wheel install，但套件本身仍有告警 |
| torch 2.11.0      | [torch.jit.script memory corruption](https://github.com/advisories/GHSA-rrmf-rvhw-rf47)，公告修補版 2.13.0                                                                                                                                                     | 需同步核對 torchaudio／Beat This!／Python 3.14 Windows wheels 與實際模型結果；本輪未升級或聲稱不可達                 |

上述 lock 尚未更新。不能把主要 npm audit 的 0 當成音訊 Python 的 0。
OSV 工具也明列未覆蓋的 Python embeddable、bgutil Rust provider／plugin 與 FFmpeg；本輪未完成這些 binary 的逐版公告核對。

直接讀取現有 `release/win-unpacked/electron.exe` 的 fuse wire，確認 Node options／CLI inspect 關閉、embedded ASAR integrity／only-load-from-ASAR 開啟。
該產物的 mtime 為 `2026-10-25T04:26:27.348Z`，不包含本輪修正；Authenticode 回報 `NotSigned`。
沒有重封裝，也沒有對該產物做 ASAR 竄改注入測試。

`RunAsNode` 仍供 provider EJS／ONNX probe 使用，file protocol 特權仍配合目前 renderer 載入方式；移除前須完成替代方案。
部分 Main library 依封裝契約位於 `app.asar.unpacked`，不能用 ASAR fuse 推論所有檔案皆有防竄改保障。
Fuse 能力範圍見 [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)。

`shared/appUpdateValues.json` 的 `signedManifestEnabled` 仍為 false；key registry 只有 development key，沒有 active production key。
獨立驗證程式存在與測試通過，不等於正式更新正在強制驗證簽章。
優先補正式金鑰 custody／簽署與更新驗收，再處理 unpacked worker 完整性與 renderer protocol 遷移；本輪沒有產生私鑰或切換更新 gate。

## 驗證紀錄

Windows 名稱與獨立工具 lockfile 修正後的最終完整測試：1122 檔、11329 項通過、1 項原有 skipped，exit 0。
該次包含 IPC、CSP、navigation、permission、runtime、更新與 packaging contracts，以及真實 PowerShell 解壓測試。
獨立工具另有 9 項離線 Node integration tests 通過；不把已知 dependency audit findings 計為通過。
lint、204 份 Markdown 檢查、全專案 formatting 與 Vite build 通過，build 保留既有大 chunk 提醒。未操作正式設定、曲庫、OBS 或正在使用的播放流程，未提交 commit。
