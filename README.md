# Utawakui

> 面向 OBS 歌回與翻唱工作流的本機控制台。

Utawakui 是一個以 Electron、Vite 與 Vue 3 建構的桌面工具，提供曲庫整理、播放控制、歌詞工作區、音訊處理與 OBS Browser Source Overlay 基礎。產品設計以**使用者自備媒體**為預設前提，進階來源與公開輸出流程則以明確啟用的方式管理。

## 專案概覽

Utawakui 主要服務直播主、VTuber 與歌回企劃者，讓演出前準備與直播中操作集中在同一個本機控制台中：

- 整理本機曲庫、歌單與待播佇列。
- 播放曲目並操作音量、進度、循環、隨機與上一首/下一首。
- 依曲目調整 pitch、tempo，或使用 guide vocal 輔助練習。
- 管理歌詞資料，作為自用顯示與未來 Overlay 的基礎。
- 在需要時啟用進階 provider flow，協助建立可播放曲目。

## 功能狀態

| 類別                       | 狀態            | 說明                                                                                         |
| -------------------------- | --------------- | -------------------------------------------------------------------------------------------- |
| 桌面控制台                 | 已實作          | Electron shell、Vue renderer、固定 views 與共用 composables。                                |
| 本機曲庫                   | 已實作          | 以 track folder 保存音訊、metadata、縮圖、歌詞與 generated files。                           |
| 播放與佇列                 | 已實作          | 播放、暫停、seek、音量、shuffle、repeat、previous/next。                                     |
| Playlist / Collection      | 已實作          | 使用 `playlists.json` 保存集合、排序與 track ids。                                           |
| Pitch / Tempo              | 已實作          | 即時 preview 已可用；背景 pre-render cache 尚未完成。                                        |
| Vocal Separation           | 已實作          | Worker-based separation，播放時可混合 guide vocal。                                          |
| Lyrics Workspace           | 部分實作        | 歌詞資料讀取、保存與同步歌詞基礎已存在，仍需整理完整使用流程。                               |
| 進階 Provider Flow         | 已實作核心路徑  | YouTube/YT Music candidate import 與 `yt-dlp` download path 已存在，產品上應走明確啟用流程。 |
| OBS Browser Source Overlay | 基本 MVP 已實作 | 本機 HTTP/WebSocket runtime、Browser Source routes、Workbench preview 與 URL copy 已存在。   |
| Feature Notice / Gate      | 已實作基礎      | Provider、lyrics、audio processing 與 public output workflows 已有 gate 基礎。               |

## 使用前提

Utawakui 是本機工作流工具，不是曲庫、授權服務或平台替代品。請以你適合使用的素材建立曲庫，並依照實際情境啟用需要的進階流程。

## 開發環境

需要 Node.js 18+。

```bash
npm install
npm run dev
```

`npm install` 會安裝 JavaScript dependencies。Provider flow 使用的 Python `yt-dlp`
runtime、FFmpeg 與分離模型屬於 app-managed workflow dependencies，會在對應功能啟用後
由 Settings 準備，不作為預設開發安裝步驟。

## Scripts

| 指令                    | 說明                                                               |
| ----------------------- | ------------------------------------------------------------------ |
| `npm run dev`           | 同時啟動 Vite dev server 與 Electron。                             |
| `npm run build`         | 建立 production build 到 `dist/`。                                 |
| `npm start`             | Build 後以 production-like 模式啟動 Electron。                     |
| `npm run dist:dir`      | 打包成未壓縮的 `release/win-unpacked/`（快速驗證用，不建立捷徑）。 |
| `npm run dist`          | 打包成 Windows NSIS 安裝檔（`release/*.exe`）。                    |
| `npm run lint`          | 執行 ESLint。                                                      |
| `npm run lint:fix`      | 執行 ESLint 並套用可自動修復項目。                                 |
| `npm run format`        | 使用 Prettier 格式化專案。                                         |
| `npm run format:check`  | 檢查 Prettier 格式。                                               |
| `npm run lint:md`       | 檢查 Markdown。                                                    |
| `npm test`              | 執行 Vitest。                                                      |
| `npm run test:coverage` | 執行 Vitest 並產生 coverage 報表。                                 |
| `npm run test:watch`    | 以 watch mode 執行 Vitest。                                        |

## 專案結構

```text
electron/   Electron main process、preload bridge、IPC、protocol 與 pure lib modules
src/        Vue renderer：views、components、composables、utils
public/     Vite static assets（app icons）
docs/       產品規格、範圍與 roadmap
tasks/      開發任務紀錄
```

完整產品邊界、功能分類與 roadmap 請見 [docs/spec.md](docs/spec.md)。
打包內容、feature gate 與 runtime dependency 對照請見
[docs/release-inventory.md](docs/release-inventory.md)。
