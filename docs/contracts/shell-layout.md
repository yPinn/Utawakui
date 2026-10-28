# Shell 左右欄與空間分配

本契約定義控制台的幾何與互動投影。播放器、佇列、歌詞及處理任務仍由原有 owner 持有。

## 狀態與尺寸

- 左側播放清單導覽只有 64px 摺疊與 256px 展開兩態，保留原本邊界操作軸，以拖曳、雙擊及鍵盤切換，不保存連續中間寬度。
- 邊界軸拖曳朝目標方向跨過24px時立即切換，不等待放開；同一手勢可來回切換；反向須從該方向最遠點拖過24px，小幅晃動不切換。門檻前的短拖或取消不切換；已切換後的放開／取消只結束拖曳，不重複切換或回滾。按住期間保留原邊界線高亮及左右調整游標，不增加跟隨滑鼠的輔助線；放開／取消／卸載後結束拖曳提示。
- `config.sidebarWidth` 保存使用者選擇；Main 只接受上述兩個值。讀取舊設定時，64–255px 映射為摺疊、256–280px 映射為展開；舊 68／72px 與無效值仍回到 64px。
- Right Dock 預設 280px、可調 272–384px；偏好沿既有 renderer session 保存，不新增跨重啟設定。
- `useShellLayout` 以Dock實際展開狀態分配兩側佔位；`useAppRightDockWidth` 區分內容偏好與當下上限。自動摺疊及受限寬度不寫入使用者偏好。
- Right Dock摺疊只佔40px，展開時佔實際內容寬度；`--ui-shell-dock-inline-size` 是Shell欄位寬度，與內容的 `--ui-right-dock-width` 分開。通知、演出工具及片段練習使用內容寬度，不跟著縮成40px。

## 逐漸縮小與恢復

左右面板在所有目的地及支援視窗尺寸都實際佔位，沒有窄窗懸浮、透明整欄保留或臨時覆蓋導覽。中央Folder外框的 `--ui-shell-workspace-min-inline-size`（40rem）是自動分配的舒適目標；`--ui-shell-layout-recovery-inline-size`（4rem）提供恢復餘裕。頁面自身仍扣除padding、binding gutter及scrollbar reserve。

1. 中央高於舒適目標的餘裕先吸收縮窗變化。
2. 無法容納256px Sidebar、當前Dock佔位、中央目標及Shell間距時，先將Sidebar投影為64px。
3. 左側摺疊後仍不足，已展開的Dock才逐步縮窄至272px；到最低支援視窗時維持並排，由中央按剩餘寬度重排，不切成懸浮。
4. Dock摺疊時只保留40px restore control及原有面板間距，其餘交回工作區；不變更記住的內容寬度或surface。
5. 空間恢復時先恢復Dock偏好寬度；滿足完整Sidebar展開預算再加恢復餘裕後，才恢復使用者偏好的展開Sidebar。使用者手動摺疊者仍保持摺疊。

基準字級16px、Shell水平內距與間距40px：Dock展開280px時，Sidebar自動摺疊門檻1216px、恢復1280px；Dock384px時為1320px／1384px。Dock摺疊40px時為976px／1040px。960px視窗下自動Sidebar64px、已展開Dock272px、中央584px；Dock摺疊則中央816px。這些是token及實際顯示狀態計算的結果，沒有另一組viewport overlay門檻。Native compact／standard density仍由視窗狀態決定。

中央640px的基準來自Library、演唱、Display及Settings的可見Electron量測；576px已出現曲庫標頭／搜尋縱向重排及設定列單欄，因此不為守住640px而讓面板改成懸浮。頁面依自己的container或實測寬度適配。

## 互動與生命週期

- 自動摺疊後手動展開Sidebar，會實際佔256px並推開中央；Dock仍至少保留可用寬度，中央可低於舒適目標。不增加backdrop、inert或覆蓋面板。繼續縮窗時重新按預算自動摺左；手動展開意圖仍保留，之後空間足夠再恢復。
- 寬窗下的正常手動展開不鎖住Sidebar；之後開啟較寬Dock仍可依空間不足自動摺左。
- Sidebar折疊前同步將欄內focus送回仍掛載的邊界軸，避免焦點落在隱藏搜尋欄。Dock的Escape繼續讓既有Modal／menu優先處理。
- Dock拖曳及鍵盤調整受當前上限限制，拖曳中延後Sidebar自動展回；取消拖曳恢復先前偏好。Window resize只改有效尺寸，不提交新偏好。
- Shell觀察自身寬度及語意tokens，不因自己摺欄後的中央寬度再反向展開；恢復餘裕防止臨界跳動。
- Resize不重建feature owner，不改選曲、播放位置、歌詞文件、欄位偏好、編輯草稿或頁面捲動。

## 驗證邊界

純幾何測試涵蓋門檻上下 1px、往返縮放、不同 Dock 偏好、間距與中央預算。Composable 測試涵蓋偏好保留、手動展開佔位、Dock摺疊回收、手動摺疊、ResizeObserver 清理與隱藏焦點還原。Main config 與 handler 測試涵蓋舊值遷移及兩態寫入限制。邊界軸需測試同一按住手勢的多次反向與24px門檻前後；方向鍵與 Home／End 僅選擇兩態。

可見 Electron 驗證需涵蓋 Library／演唱／演出安排／Display／Settings、Dock 各 surface、亮暗主題、視窗化與最大化、至少 960px 到寬窗的連續縮小及放大。量測實際 viewport、左右欄與中央 bounds、水平溢出、偏好與播放狀態；不能僅以端點截圖或純 resolver 測試代替。
