# Utawakui

> 為 OBS 歌回與翻唱流程設計的 local-first Windows 桌面控制台。

本 repo 是 Utawakui 的私有開發來源，讀者是開發與維護人員。使用者向的產品介紹、
下載與版本資訊在公開的 [Utawakui-Releases](https://github.com/yPinn/Utawakui-Releases)
與產品網站（[ADR 0035](docs/adr/0035-product-site-and-download-entry.md)），原稿位於
`docs/releases/`。

目前範圍與完成度以[產品規格](docs/spec.md)為準，技術邊界見[架構圖](docs/architecture.md)。

## 開發

需要 Node.js 24+ 與 npm。

```bash
npm install
npm run electron:install
npm run dev
```

`npm install` 準備 JavaScript 依賴，`npm run electron:install` 準備桌面執行檔。Provider runtime、FFmpeg 與音訊
模型由應用程式在對應功能啟用後，從 Settings 個別準備；它們不是預設開發依賴。

`npm run dev` 啟動 Vite 與 Electron；若選擇系統匣背景執行，需從系統匣完整結束
才會停止 dev server。需要 Chromium DevTools 時使用 `npm run dev:tools`。

`npm run check` 檢查程式碼、Markdown 與格式，`npm test` 執行自動測試。
更多開發與封裝命令見[指令導覽](scripts/README.md)，發行步驟見[發行手冊](docs/operations/release-runbook.md)。
發行維護工具另見 [tools 導覽](tools/README.md)。

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
tools/      發布維護工具
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
