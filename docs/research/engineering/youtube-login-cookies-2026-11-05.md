# YouTube 登入資料相容性（2026-11-05）

本文件只記錄當次查核的結論與建議，不代表產品現況。查證來源為 yt-dlp 的 issue、wiki 與 FAQ，以及公開的社群討論；沒有用實際帳號測試。

## 結論

- **Chrome／Edge 讀不到：** Windows 上 Chrome 127 以後與新版 Edge 使用 App-Bound Encryption，外部工具解不開登入資料。
  - yt-dlp [#10927](https://github.com/yt-dlp/yt-dlp/issues/10927) 標為外部問題，沒有修正。
  - 維護者不建議停用 `ApplicationBoundEncryptionEnabled`：那會關掉防竊保護並清空登入資料。
  - 只有 Firefox 能用 `--cookies-from-browser`。
- **App 內嵌視窗登入：不採用。** Google 會封鎖內嵌瀏覽器框架登入（「這個瀏覽器或應用程式可能不安全」）。
  - 社群的繞過方式是偽裝 User-Agent，這很脆弱。
  - 而且 App 會因此保管完整的 Google 登入狀態。
- **[#17443](https://github.com/yt-dlp/yt-dlp/issues/17443) 的做法：不採用。**
  - 它需要自製擴充功能加上本機橋接程式，而且自己也讀不到 v20 加密的登入資料。
  - 該 issue 因違反 yt-dlp 的 AI 政策被關閉並鎖定，沒有技術討論。
- **可行做法：** 匯入 Netscape 格式的 cookies.txt，交給 yt-dlp 的 `--cookies`。#10927 中有多位使用者確認可行。

## 建議方案

1. **登入資料來源：** 保留 Firefox 自動讀取；Chrome 與 Edge 在 Windows 上必定失敗，不再嘗試。
2. **新增「匯入登入資料檔」：**
   - **匯入檢查：** 第一行必須是 `# HTTP Cookie File` 或 `# Netscape HTTP Cookie File`，只保留 youtube.com、google.com 網域。
   - **保存：** 以 `safeStorage` 加密保存，隨時可以移除。
   - **每次使用：** 解密成暫存檔交給 yt-dlp。依 yt-dlp FAQ 的 Windows 要求，換行用 CRLF。
   - **用完：** yt-dlp 結束時會把更新過的登入資料寫回暫存檔，所以要讀回、重新加密保存，再刪除暫存檔。這能延緩登入資料失效。
3. **引導：** 只提供下方的精簡步驟。App 不內建也不代裝擴充功能。
4. **`--impersonate`：** 不變，因為它與登入資料無關。

## 社群常見做法（引導草稿）

依 yt-dlp wiki 的〈Exporting YouTube cookies〉與 FAQ 整理：

1. 在 Chrome 或 Edge 安裝「Get cookies.txt LOCALLY」擴充功能，Firefox 則用「cookies.txt」。
   - 請不要使用名稱沒有「LOCALLY」的舊版：它已被回報為惡意程式並下架。
2. 在擴充功能的設定中允許它在無痕模式執行。
3. 開啟無痕視窗，登入要使用的 YouTube 帳號。
4. 在同一分頁開啟 `youtube.com/robots.txt`，用擴充功能匯出 youtube.com 的 cookies。
5. 立即關閉無痕視窗，再到 Utawakui 匯入剛才的檔案。

這樣做的原因：YouTube 會頻繁輪換開啟中分頁的登入資料。在無痕視窗匯出後立刻關閉，匯出的登入資料就不會被輪換掉。平常在 Firefox 已登入 YouTube 的使用者，可以改用 Firefox 自動讀取，不必匯出。

## 隱私與保管告知（草稿）

> 登入資料檔包含你的 YouTube 登入狀態，取得這個檔案的人可以用你的帳號行動。請只從自己的瀏覽器匯出，不要分享給他人。
>
> Utawakui 會將它加密保存在這台電腦，只在下載 YouTube 素材時使用，不會上傳或傳送給其他服務。你可以隨時移除。
>
> YouTube 可能暫時或永久限制以這種方式使用的帳號。建議使用另外的帳號，並避免短時間大量下載。
>
> 登入資料約數週後會失效，失效時請重新匯入。

- 帳號限制的警告來自 yt-dlp wiki。
- 「約數週後會失效」是社群觀察，不是 YouTube 公開的規則。

## 後續（同日實作）

- 使用者決定：告知獨立一份，只在第一次匯入前顯示；入口在外部來源工具之後的「YouTube 登入」列。
- 畫面文字依使用者要求再精簡，現行文字以 `capabilities.youtubeLogin` 與 `import.failures` 詞彙為準；上方草稿保留作為當次紀錄。
- 用登入檔案重試後仍被要求登入時，提示「登入可能已過期」；無法與帳號本身無權限區分，所以用「可能」。
- 實作與設定遷移見 [ADR 0005](../../adr/0005-python-ytdlp-provider-engine.md) 2026-11-05 修訂。
