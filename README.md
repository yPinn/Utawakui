# Utawakui

> 為 OBS 歌回與翻唱流程設計的 local-first Windows 桌面控制台。

本 repo 是 Utawakui 的私有開發來源。給使用者看的產品介紹、下載與版本資訊在公開的
[Utawakui-Releases](https://github.com/yPinn/Utawakui-Releases) 與產品網站
（[ADR 0035](docs/adr/0035-product-site-and-download-entry.md)），原稿在 `public-repo/`
與 `docs/releases/`，發版時自動同步。

改程式前先讀 [AGENTS.md](AGENTS.md)：開發規則、驗證方式與提交規範，人與 AI 共用。

## 開發

需要 Node.js 24+ 與 npm。

```bash
npm install
npm run electron:install
npm run dev
```

`npm run electron:install` 準備桌面執行檔。Provider runtime、FFmpeg 與音訊模型由應用程式在
功能啟用後從 Settings 準備，不是開發依賴。選擇系統匣背景執行時，要從系統匣完整結束才會停止
dev server；需要 DevTools 用 `npm run dev:tools`。

`npm run check` 檢查程式碼、Markdown 與格式，`npm test` 執行自動測試。CI 在 Ubuntu 執行，
涉及 Windows 路徑的改動先用 `npm run test:linux` 驗證。其他指令見[指令導覽](scripts/README.md)。

## 發版

`npm run release:prepare <版號>` → 提交並推送 tag → `npm run release:publish <版號> --confirm`。
細節見[發行手冊](docs/operations/release-runbook.md)，維護工具見 [tools 導覽](tools/README.md)。

## 專案結構

```text
electron/     Electron main、preload、IPC、local services 與純 Node modules
src/          Vue control panel renderer
overlay/      OBS Browser Source 文件、樣式與瀏覽器端 adapters
shared/       跨 runtime 的純資料契約與 presentation projections
resources/    隨 app 提供、但不屬於 renderer bundle 的 runtime resources
public/       Vite 固定 URL 靜態資產
build/        Installer resources 與 NSIS hooks
native/       原生元件原始碼
services/     獨立部署的服務（回饋轉送 Worker），不進安裝包
public-repo/  公開 repo 的 README、SECURITY 原稿，發版時同步
docs/         產品、架構、ADR、contracts、研究與發行文件
scripts/      驗證、benchmark、release 與 startup 工具
tools/        發布維護工具
prototypes/   原型與隔離檢查
third-party/  第三方授權全文
```

## 文件入口

- [文件導覽與決策現況](docs/README.md)：文件權責、ADR 現況與閱讀順序。
- [產品定位](PRODUCT.md)：穩定的產品承諾、原則與非目標。
- [產品規格](docs/spec.md)：目前範圍、完成度與下一階段方向。
- [架構圖](docs/architecture.md)：runtime ownership、feature gate、依賴單位與錯誤邊界。
- [CI 手冊](docs/operations/ci-usage.md)：CI 範圍、跨平台測試與預算。
- [Release inventory](docs/operations/release-inventory.md)：打包內容、依賴與 feature 對照。
- [Release runbook](docs/operations/release-runbook.md)：發版流程與發布前驗收。

## 授權

專有軟體，條款見 [LICENSE.md](LICENSE.md)，第三方元件見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
