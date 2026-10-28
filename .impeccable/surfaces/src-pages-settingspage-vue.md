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

快捷鍵為此文件內的局部延伸：展開App快捷鍵後依播放控制、音訊調整、歌詞對時、操作說明四個Tab排序；沿UiTabs Bar、UiKbd與ledger列，前三類3／5／2命令、說明唯讀。原位錄製、候選套用／取消，更多收單列停用／預設，整組預設留末端；切分類取消未提交錄製。保持單文件捲動與既有明暗tokens，不形成Settings第二層分類導覽，也不在本輪放實體鍵盤圖或更換推薦預設。

Owner 接受主工作區、右側面板與波形共用暫時放大／還原；它是一般並排幾何的明確例外，隱藏另一區但保留掛載及偏好。共通設定說明集中於「操作說明 → 設定方式」，不在前三類重複。固定面板操作仍用同一 UiKbd 參考列；既有 Folder、Popover、按鈕及 tokens 不改造。

Owner修正：共通說明集中揭露，列內只留必要短句；功能／鍵組與狀態／操作分組，錄製獨立整列，以快捷鍵區自身container寬度換行。設定、候選與操作參考共用UiKbd鍵組，modifier組合保持完整；參考以UiDisclosure分類並分開情境、鍵組、動作，窄區堆疊，不將按鍵塞回敘述文字。

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
