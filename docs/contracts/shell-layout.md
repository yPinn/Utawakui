# Shell 左右欄與空間分配

本契約定義控制台的幾何與互動投影。播放器、佇列、歌詞及處理任務仍由原有 owner 持有。

## 狀態與尺寸

- 左側播放清單導覽只有 64px 摺疊與 256px 展開兩態，保留原本邊界操作軸，以拖曳、雙擊及鍵盤切換，不保存連續中間寬度。
- 邊界軸拖曳朝目標方向跨過24px時立即切換，不等待放開；同一手勢可來回切換；反向須從該方向最遠點拖過24px，小幅晃動不切換。門檻前的短拖或取消不切換；已切換後的放開／取消只結束拖曳，不重複切換或回滾。按住期間保留原邊界線高亮及左右調整游標，不增加跟隨滑鼠的輔助線；放開／取消／卸載後結束拖曳提示。
- `config.sidebarWidth` 保存使用者選擇；Main 只接受上述兩個值。讀取舊設定時，64–255px 映射為摺疊、256–280px 映射為展開；舊 68／72px 與無效值仍回到 64px。
- Right Dock 預設 280px、可調 272–384px；偏好沿既有 renderer session 保存，不新增跨重啟設定。
- `useShellLayout` 以Dock實際展開狀態分配兩側佔位；`useAppRightDockWidth` 區分內容偏好與當下上限。自動摺疊及受限寬度不寫入使用者偏好。
- Right Dock在所有支援視窗尺寸下，不論展開或摺疊都保留相同的有效欄寬，維持Folder邊界與右側留白構圖，開關時不推動中央。摺疊時只繪製40px restore control，其餘為無背景、不可攔截pointer的Shell留白；縮窗可將共同欄寬逐步壓縮至272px，不能再因摺疊縮成40px或216px。`--ui-shell-dock-inline-size` 是Shell欄位寬度，與內容的 `--ui-right-dock-width` 分開。通知、演出工具及片段練習使用內容寬度，不跟著縮成40px。

## 逐漸縮小與恢復

左右面板在所有目的地及支援視窗尺寸都實際佔位，沒有窄窗懸浮或臨時覆蓋導覽。Dock摺疊的透明保留欄位屬於Shell構圖；它在寬窗保留、窄窗可壓縮，並非透明覆蓋中央的面板。中央Folder外框的 `--ui-shell-workspace-min-inline-size`（40rem）是自動分配的舒適目標；`--ui-shell-layout-recovery-inline-size`（4rem）提供恢復餘裕。頁面自身仍扣除padding、binding gutter及scrollbar reserve。

1. 中央高於舒適目標的餘裕先吸收縮窗變化。
2. 無法容納256px Sidebar、Dock完整偏好寬度、中央目標及Shell間距時，先將Sidebar投影為64px。此預算不因Dock開關改變，避免摺Dock時左欄突然展開或窄窗分配互相反饋。
3. 左側摺疊後仍不足，Dock共用欄寬才逐步縮窄至272px，展開與摺疊沿同一計算；到最低支援視窗時維持並排，由中央按剩餘寬度重排，不切成懸浮。
4. 在支援視窗尺寸內，共同欄寬為 `min(偏好寬度, max(272, 視窗寬度 − 左欄 − Shell間距 − 中央目標))`。摺疊時restore control仍為40px且靠右下；開關只改內容顯示，不改此欄寬或Sidebar狀態，不變更記住的偏好或surface。中央640px是舒適目標，不能為守住它而在開關時跳動或使表格欄位反覆出現／消失。
5. 空間恢復時先逐步補回Dock寬度／摺疊留白；滿足完整Sidebar展開預算再加恢復餘裕後，才恢復使用者偏好的展開Sidebar。使用者手動摺疊者仍保持摺疊。

基準字級16px、Shell水平內距與間距40px：Dock偏好280px時，Sidebar自動摺疊門檻1216px、恢復1280px；偏好384px時為1320px／1384px，Dock開關共用門檻。左欄自動摺疊後，280px欄寬到1024px才開始壓縮，384px欄寬則到1128px才開始壓縮，均以272px為下限。960px視窗下自動Sidebar64px、Dock共用欄寬272px、中央584px，開關完全一致；手動展開左欄則中央392px，開關仍不跳動。這些是token及實際顯示狀態計算的結果，沒有另一組viewport overlay門檻。Native compact／standard density仍由視窗狀態決定。

中央640px的基準來自Library、演唱、Display及Settings的可見Electron量測；576px已出現曲庫標頭／搜尋縱向重排及設定列單欄，因此不為守住640px而讓面板改成懸浮。頁面依自己的container或實測寬度適配。

## 互動與生命週期

- 自動摺疊後手動展開Sidebar，會實際佔256px並推開中央；Dock仍至少保留可用寬度，中央可低於舒適目標。不增加backdrop、inert或覆蓋面板。繼續縮窗時重新按預算自動摺左；手動展開意圖仍保留，之後空間足夠再恢復。
- 寬窗下的正常手動展開不鎖住Sidebar；之後增加Dock偏好寬度仍可依空間不足自動摺左。Dock開關本身不改完整欄位預算。
- Sidebar折疊前同步將欄內focus送回仍掛載的邊界軸，避免焦點落在隱藏搜尋欄。Dock的Escape繼續讓既有Modal／menu優先處理。
- Dock拖曳及鍵盤調整受當前上限限制，拖曳中延後Sidebar自動展回；取消拖曳恢復先前偏好。Window resize只改有效尺寸，不提交新偏好。
- Shell觀察自身寬度及語意tokens，不因自己摺欄後的中央寬度再反向展開；恢復餘裕防止臨界跳動。
- Resize不重建feature owner，不改選曲、播放位置、歌詞文件、欄位偏好、編輯草稿或頁面捲動。

## 暫時放大目前面板

`usePanelView` 只持有本次檢視狀態，目標為最近點選或聚焦的主工作區、已展開右側面板或原音訊波形。共用「放大面板／還原面板」按鈕與單次反引號鍵切換；Escape 先交給輸入及選單，再還原放大，之後才沿原 Dock 摺疊或波形關閉流程。修飾鍵、IME、已處理事件、長按及快捷鍵錄製期間不執行。

主工作區或 Dock 放大時填滿原 Shell 中央與右欄的合計空間，另一區隱藏且 inert，兩區內容仍保持掛載；Sidebar、Titlebar 及 PlayerBar 保留。Dock 內容與外框同步填滿，放大時停用寬度調整。波形沿原 UiPopover 擴大，見[波形契約](lyrics-waveform.md)。這不是 OS 全螢幕或另開視窗。

還原保留原 DOM、捲動及寬度偏好，不重建功能 owner、不改選曲、播放或草稿。切換目的地、Dock surface／展開狀態、波形來源失效或目標卸載，自動解除暫時放大；一般還原將焦點送回該面板仍存在的控制，失效清理不強移焦點。

## 驗證邊界

純幾何測試涵蓋門檻上下 1px、往返縮放、不同 Dock 偏好、間距與中央預算。每個支援寬度都要比較Dock開關共用欄寬與Sidebar狀態，涵蓋手動左展開。Composable 測試涵蓋偏好保留、寬窄窗Dock反覆開關不移動中央／左欄、共同欄寬縮小及先補回留白再恢復左欄、手動展開佔位與摺疊、ResizeObserver 清理與隱藏焦點還原。Main config 與 handler 測試涵蓋舊值遷移及兩態寫入限制。邊界軸需測試同一按住手勢的多次反向與24px門檻前後；方向鍵與 Home／End 僅選擇兩態。

可見 Electron 驗證需涵蓋 Library／演唱／演出安排／Display／Settings、Dock 各 surface、亮暗主題、視窗化與最大化、至少 960px 到寬窗的連續縮小及放大。量測實際 viewport、左右欄與中央 bounds、水平溢出、偏好與播放狀態；不能僅以端點截圖或純 resolver 測試代替。
