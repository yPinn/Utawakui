# 場次月曆樣張

對照 IMG_1834 的深色月曆、左側月份數字與格內照片拼貼。七欄版從日期選場次，日期分組版直接列出同月紀錄。兩版共用合成場次，明細沿用 `UiModal` 的焦點、鍵盤及返回行為。 [風格提案](../../docs/research/design/performance-ephemera-proposal.md#1-場次月曆)

## 開啟

從專案根目錄執行，然後開啟終端機顯示的本機網址。

```powershell
npm exec -- vite --config prototypes/performance-calendar/vite.config.js --host 127.0.0.1
```

樣張載入正式 CSS tokens 與元件實驗室的 v2 邊界。`AppFolderPage` 提供紙面及捲動，`UiTabs` 切換版面，`UiButton` 和 `UiIconButton` 承接互動，`UiPhotoFrame` 承接照片印相。月曆格線、郵票齒孔、票根裁口和物件錯位由樣張自己的版面樣式處理。

11 月 6 日預先選中，展示同日兩場和跨午夜場次。11 月 12 日顯示缺首筆時間時的保存時間。選「日期分組」可查看整月順序。圖片與場次資料都是樣張素材。

## 照片來源

`art/` 內六張 WebP 來自內建影像工具生成的 35mm 風格接觸印相。生成描述為六格無文字照片，依序是手握麥克風、戴耳機的錄音室歌手、黃昏鋼琴、深夜舞台剪影、黑白唱片、卡式錄音機。各格裁成獨立方形照片，供相框與郵票縮圖使用。
