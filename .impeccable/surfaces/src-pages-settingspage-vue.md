---
version: 1
slug: 'src-pages-settingspage-vue'
primary_target: 'src/pages/SettingsPage.vue'
related_targets: ['src/views/SettingsView.vue']
---

## Direction contract

THESIS: Settings是一份可連續閱讀、可直接操作的Folder活頁文件；它拒絕把舊版三分頁控制清單包進新Folder外殼，也拒絕以等重card堆疊所有設定。

OWN-WORLD: 沿用Utawakui既有Studio Library世界。外層neutral Folder在Dark為炭灰近黑、Light為冷灰；內層只有一張暖中性紙。章節使用Folder正式heading與ledger rule，普通設定直接印在紙上，只有包含準備流程與巢狀狀態的選用功能取得次層surface。

STORY: 操作者由曲庫與裝置等日常基礎設定開始，接著確認應用程式行為，再進入需要明確同意與元件準備的選用功能，最後才到支援與診斷。重要錯誤與setup request留在其責任章節旁，不建立另一套全域通知。

FIRST VIEWPORT: Folder destination tabs與外框保持固定；紙張標題、描述及「曲庫與儲存」第一章一起位於document scroll起點。紙張維持Folder template的bounded inline size、左側裝訂線與三孔，右側露出neutral Folder reserve；頁面不顯示Settings分類tabs、第二sidebar或內部scrollbar。

FORM: Established Folder document的精確替換，依Owner指定直接採用`AppFolderPage` document composition；這是direct-owner方向，沒有concept-seed。互動只用既有控制狀態與必要的scroll-to-section，不加入裝飾性頁面動效。

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
