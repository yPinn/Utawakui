# 原型與隔離檢查

本目錄保留隔離檢查與設計參考；產品現況以[規格](../docs/spec.md)為準。

| 目錄                                                           | 用途                                                                       | 入口                                        |
| -------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------- |
| [UI Component Lab](ui-component-lab/README.md)                 | 載入正式 Vue primitives 與共用 tokens 的隔離元件檢查；沒有播放器／曲庫狀態 | 獨立 Vite config，先 build 再 capture       |
| [Studio Library Workspace](studio-library-workspace/README.md) | 歷史工作區設計參考，保留 token／viewport／互動隔離檢查                     | 直接開 standalone Vite 路徑；已不在 F8 掛載 |
| [A–B 區段練習](ab-practice/README.md)                          | 共用正式 owner 的中段／EOF／來源與歌詞 Loop 入口隔離驗證                   | 固定 localhost Vite 與專用 Electron probe   |

## 共用 Capture 入口

在專案根目錄執行：

```powershell
node prototypes/capture.cjs ui-component-lab
node prototypes/capture.cjs studio-library-workspace
```

兩個 profile 共用子程序 deadline、完成訊號處理與 profile 清理，各自的 Electron
`capture-app/index.js` 保留不同情境、互動斷言與截圖尺寸。Launcher 只接受上列固定名稱，
不接受任意程式路徑；沒有新增 npm 別名。

Capture 預設會更新各自 `screenshots/`；純驗證可將環境變數 `UTAWAKUI_PROTOTYPE_CAPTURE_OUTPUT_DIR`
設為獨立輸出目錄，保留既有圖片。這些已提交圖片是設計參考，不是可因過期而批次刪除的快取；
新截圖與自動斷言也不代替正式 App／OBS 的人工接受。元件 lab 的 `.build/` 是可重建的 ignored 產物。

兩個 `capture-app/package.json` 都是 Electron app 的 identity／main descriptor，沒有額外依賴，
使用根專案的 npm 安裝；保留各自 descriptor 與檢查程式。一般開發／研究工具見 [scripts 導覽](../scripts/README.md)。
