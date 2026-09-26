# Utawakui

> 為 OBS 歌回與翻唱流程設計的 local-first Windows 桌面控制台。

Utawakui 將本機曲庫、歌單、播放、歌詞、音訊處理與 OBS Browser Source
輸出集中在同一個操作介面。預設工作流只使用使用者自備的本機媒體；外部來源、
歌詞服務、音訊處理與公開輸出均是可獨立啟用的進階流程。

目前專案處於 **Windows x64 公開測試階段**。它不是曲庫、授權服務或串流平台的
替代品，也不會替使用者判斷第三方素材的使用權利。

## 已有能力

| 範圍            | 現況                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 本機曲庫與播放  | 結構化 track storage、歌單、待播佇列、播放控制與 Windows shell integration **已可用**；按 X 可選背景執行或完整退出並記住選擇。            |
| 練習與音訊      | Pitch/tempo 即時預覽、可發聲節拍器、`quick`／`general` 分離與 guide vocal **已可用**；pre-render 與 Refined recipe **尚未成為產品能力**。 |
| 歌詞            | 本機匯入、provider lookup、時間軸／讀音、演出者視窗與 Lyrics Overlay 主路徑**已建立**，仍持續做視覺驗收與操作整理。                       |
| 輸出與 OBS 連線 | 三類 Browser Source、Gallery、Workbench 與 URL 複製**已完成 MVP**；另可選擇唯讀連線 OBS，記錄場次時間標記並輸出為 YouTube 章節文字。      |
| 進階來源        | 經 `provider-flow` 啟用後，可準備 app-managed `yt-dlp` runtime，進行候選搜尋、匯入與 metadata backfill。                                  |
| 發布與維護      | NSIS installer、啟動量測、local diagnostics 與 updater runtime **已建立**；公開測試版**採未簽章發行**。                                   |

完整的已實作／部分完成／規劃中對照，以
[產品規格](docs/spec.md) 為準；技術邊界請見
[架構圖](docs/architecture.md)。

## 開發

需要 Node.js 24+ 與 npm。

```bash
npm install
npm run dev
```

`npm install` 只準備 JavaScript dependencies。Provider runtime、FFmpeg 與音訊
模型由應用程式在對應功能啟用後，從 Settings 個別準備；它們不是預設開發依賴。

常用指令：

| 指令                    | 用途                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`           | 啟動 Vite 與 Electron；若選擇系統匣背景執行，需從系統匣完整結束才會停止 dev server。 |
| `npm run dev:tools`     | 啟動開發環境並開啟 Chromium DevTools。                                               |
| `npm run build`         | 建立 renderer production build。                                                     |
| `npm start`             | Build 後以 production-like `loadFile` 路徑啟動。                                     |
| `npm run dist:dir`      | 建立未壓縮的 packaged app，供快速驗證。                                              |
| `npm run dist`          | 建立未簽章 NSIS installer 與 updater metadata。                                      |
| `npm run lint`          | 執行 ESLint。                                                                        |
| `npm run lint:md`       | 執行 Markdownlint。                                                                  |
| `npm run format:check`  | 檢查 Prettier 格式。                                                                 |
| `npm test`              | 執行完整 Vitest suite。                                                              |
| `npm run test:coverage` | 執行測試並產生 coverage。                                                            |
| `npm run perf:startup`  | 量測 packaged startup milestones。                                                   |

## 專案結構

```text
electron/   Electron main、preload、IPC、local services 與純 Node modules
src/        Vue control panel renderer
overlay/    OBS Browser Source 文件、樣式與瀏覽器端 adapters
shared/     跨 runtime 的純資料契約與 presentation projections
resources/  隨 app 提供、但不屬於 renderer bundle 的 runtime resources
public/     Vite 固定 URL 靜態資產
build/      Installer resources 與 NSIS hooks
docs/       產品、架構、ADR、contracts、研究與發行文件
scripts/    驗證、benchmark、release 與 startup 工具
```

## 文件入口

- [文件導覽與決策現況](docs/README.md)：文件權責、ADR 現況與閱讀順序。
- [產品定位](PRODUCT.md)：穩定的產品承諾、原則與非目標。
- [產品規格](docs/spec.md)：目前範圍、完成度與下一階段方向。
- [架構圖](docs/architecture.md)：runtime ownership、feature gate、依賴單位與錯誤邊界。
- [Release inventory](docs/operations/release-inventory.md)：打包內容、依賴與 feature 對照。
- [Release runbook](docs/operations/release-runbook.md)：未簽章公開測試與發行流程。

## 社群

加入作者的 [Discord](https://discord.gg/yJKddEtpNt) 查看公告、分享使用心得，
或直接回饋想法給開發者。應用程式內的「設定」→「支援與維護」→「社群 Discord」
也提供同一個連結。

## 授權

Utawakui 是**可免費使用的專有軟體**，可用於個人、內容創作，以及營利直播與錄製。
軟體、原始碼與安裝檔的散布限制，以及第三方內容責任，請見
[LICENSE.md](LICENSE.md) 與 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
