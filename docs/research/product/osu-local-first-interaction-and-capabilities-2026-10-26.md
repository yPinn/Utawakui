# osu! 本機工作流、使用引導與功能拆分深入研究

查核日期：2026-10-26（Asia/Taipei）。接續[音源／影片與收藏架構研究](source-video-osu-collection-2026-10-26.md)，本輪從內容結構深入到首次設定、取得與匯入、選曲、更新及復原的實際機制，再對照 Utawakui。這是細規格前的研究；沒有啟動新的引導設計、遊戲安裝、帳號操作、資料遷移、雲端服務或產品實作。

核心判斷：osu! 最有參考價值的是讓已持有內容先形成可用的本機循環，再按使用意圖接上取得、整理、修改、呈現與線上資格。Utawakui 已有本機核心與分離 gates；本輪應補足的是各項動作的前置、完成條件及失敗後的回路，不再把這個既有分層當成新功能。

## 1. 方法與版本邊界

後續[單人／多人行為與產品映射](osu-play-modes-and-product-mapping-2026-10-26.md)補查結果回饋、房間準備／選曲權、非同步 Playlists 與配對／觀看。本頁原本聚焦本機生命週期與單人提交資格，不能當作完整多人研究。

- 使用官方 wiki 與 `ppy/osu` 原始碼。程式判斷固定在 osu!(lazer) commit [`4e11ab19feb423c905cf98d9b8fa34700a8aeffa`](https://github.com/ppy/osu/commit/4e11ab19feb423c905cf98d9b8fa34700a8aeffa)，commit 時間為 2026-10-26 09:39:46 UTC；不表示每個已發行客戶端都包含此 commit。
- 官方 [stable／lazer 對照](https://osu.ppy.sh/wiki/en/Help_centre/Upgrading_to_lazer)與 [lazer 儲存說明](https://osu.ppy.sh/wiki/en/Client/Release_stream/Lazer/File_storage)用來確認版本差異；不把 stable 的 Songs 資料夾、安裝流程與 supporter 規則套到 lazer。
- 下文「查核」表示文件或程式路徑可見；「本案含義」為設計推論。沒有啟動 osu!，不能據此宣稱首次啟動、斷網、重啟續做、實際播放或故障復原已做實機驗收。
- Utawakui 對照沿目前[規格](../../spec.md)、[架構](../../architecture.md)、固定 registry 及相關 owners；不修改正式定位、免費核心或已接受的外觀作品方向。

一個容易誤判的差異已確認：lazer 的 osu!direct 已開放一般玩家，部分進階選曲篩選仍為 supporter 權益。這不能推論成「免登入取得所有內容」，也不能沿用「內建下載一律需要贊助」的 stable 印象。[官方 FAQ](https://osu.ppy.sh/wiki/en/Help_centre/Upgrading_to_lazer#now-that-osudirect-is-available-to-all-players-will-supporters-have-any-new-benefits)

## 2. 內容與能力要分開看

下列是研究整理用的分類，不是 osu! 官方模組命名，也不是本案要新增的六個頂層頁面。

| 分類       | osu! 的實際角色與來源                                                                                                                                                                                                                                                                                                                                                   | 對本案的含義                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 本機內容   | BeatmapSet 持有 difficulties 及資源；本機身份、線上 ID、hash 各有用途。[BeatmapSetInfo](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Beatmaps/BeatmapSetInfo.cs)、[BeatmapInfo](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Beatmaps/BeatmapInfo.cs)                                         | 保留歌曲／錄音、正式發行、本機 track 與衍生結果的差異；不把 set ID 或 hash 當歌曲權威。 |
| 使用方式   | 同一內容可供選曲、編輯、不同 gameplay 設定；線上詳細資料與複製連結以外部 ID 為條件。[SoloSongSelect](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Screens/Select/SoloSongSelect.cs)                                                                                                                                                | 播放／排練／演出可消費同一音源與歌詞；不為居家與 OBS 各建一套曲庫。                     |
| 個人整理   | 本機 Collection 保存名稱與譜面 hash 參照；選單把它用作既有曲庫的篩選。[BeatmapCollection](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Collections/BeatmapCollection.cs)、[CollectionDropdown](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Screens/Select/CollectionDropdown.cs)             | 收藏意圖、實際持有、播放順序及一次演出安排分開；缺件不必抹除原意圖。                    |
| 取得與維護 | 線上搜尋、下載、匯入、更新與可選影片各有路徑。[BeatmapModelDownloader](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Beatmaps/BeatmapModelDownloader.cs)                                                                                                                                                                            | 網路取得與本機就緒不是同一狀態；模型、Provider 與歌曲素材也不是同一種下載。             |
| 呈現與偏好 | 首次設定的縮放、metadata 顯示與行為偏好直接沿既有設定；外觀資料另有匯入單位。[ScreenWelcome](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Overlays/FirstRunSetup/ScreenWelcome.cs)、[ScreenBehaviour](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Overlays/FirstRunSetup/ScreenBehaviour.cs) | 機器可讀性、個人習慣、逐曲設定與 Output 外觀各有保存範圍；不把全部偏好塞進歌曲包。      |
| 線上資格   | 登入、搜尋權益、提交 token、內容狀態與成績上傳不是單一開關。[SubmittingPlayer](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Screens/Play/SubmittingPlayer.cs)                                                                                                                                                                      | 本機可用不代表允許上傳，也不代表適合進榜；未來讀榜與貢獻資料仍分別決策。                |

前輪已確認的收藏缺件參照尤其重要：`BeatmapCollection` 明確為「先匯入收藏、後取得譜面」及分享收藏保留 hash，即使譜面已移除仍留參照。這證明資料模型保留意圖的價值；沒有證明 lazer 已提供完整的缺件解析、逐項補齊或本案需要相同 hash 收藏格式。

## 3. 首次設定是一條可再次進入的路徑

### 3.1 實際步驟與完成條件

[FirstRunSetupOverlay](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Overlays/FirstRunSetupOverlay.cs)依序加入 Welcome、UI Scale、Beatmaps、平台支援時的 Import From Stable、Behaviour；這個 wizard 沒有登入步驟。各步的作用不同：

| 步驟           | 查核到的行為                                                                                                                                                                                                                                 | 本案可吸收的概念                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 可讀性與顯示   | Welcome 設定語言／原文 metadata；[ScreenUIScale](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Overlays/FirstRunSetup/ScreenUIScale.cs)用縮放設定與實際元件預覽效果。                                    | 先能看清控制台、讀懂資料，再談進階服務；預覽不一定需要先取得私人歌曲。       |
| 第一份可用內容 | [ScreenBeatmaps](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Overlays/FirstRunSetup/ScreenBeatmaps.cs)提供教學／起始內容下載、目前本機數量及背景下載說明；完成顯示依本機匯入狀態。                     | 第一首自備音訊能播放是有用的成果；下載進度與完成引導不要互相冒充。           |
| 舊資料接續     | [ScreenImportFromStable](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Overlays/FirstRunSetup/ScreenImportFromStable.cs)分勾 Beatmaps、Scores、Skins、Collections；顯示 hard link／copy 差異，提供中止。 | 有曲庫的人應能沿用資料；歌曲、個人整理、紀錄與外觀不是一個不可分割的匯入包。 |
| 使用習慣       | Behaviour 提供新／經典預設，重用已有 settings 元件並直接寫設定。                                                                                                                                                                             | 可以介紹適合的工作流；不要把每種受眾變成獨立產品模式或重建一套設定 owner。   |

[WizardOverlay](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Overlays/WizardOverlay.cs)的下一步沒有「必須下載成功、必須有譜面或必須完成登入」的內容門檻。可以完成 wizard 而仍無可玩內容；這是引導完成與內容就緒分開的證據，不是所有使用者都已成功的證明。

起始下載使用獨立的 [BundledBeatmapDownloader](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Beatmaps/Drawables/BundledBeatmapDownloader.cs)，請求指向固定 `assets.ppy.sh/client-resources/bundled`；不能將它的取得路徑當作一般搜尋免登入的證據。本案若需要示範，只能先考慮自有／可分發的短素材或純呈現預覽，不能據此綁商用歌曲或假設現有素材可再分發。

### 3.2 關閉、重開與持續任務

- 關閉未完成 wizard 時，FirstRunSetupOverlay 發通知，可按通知再開；設定的 [QuickActionSettings](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Overlays/Settings/Sections/General/QuickActionSettings.cs)也保留 Run Setup Wizard。
- 同一個 WizardOverlay instance 的 `CurrentStepIndex` 仍在，重開不必回第一步；完成後清空步驟並關閉 `ShowFirstRunSetup`。沒有查到把目前步驟持久保存的證據，不能宣稱跨重啟逐步續做。
- 行為與縮放直接修改既有設定，不是最後一次提交的全有或全無表單；取消 wizard 不代表撤銷全部改動。
- 內容下載與匯入有自己的 tracker／manager；界面離開、工作中止、工作完成是不同事件。不推論每種任務都能跨視窗銷毀或程序重啟續傳。

本案含義：未來引導應可由具體問題重新進入，例如「匯入第一首」「加入歌詞」「準備伴奏」「接 OBS」；使用者可先得到一個可用成果，再自行擴充。這是互動原則研究，首次引導與曲目準備仍維持[等待視覺定案](../../spec.md#63-等待條件與暫緩範圍)，本輪不新增 wizard 頁面、任務中心或驗收承諾。

## 4. 取得、匯入與本機就緒是連續但不同的工作

### 4.1 狀態來自實際完成的階段

[DownloadState](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Online/DownloadState.cs)區分 NotDownloaded、Downloading、Importing、LocallyAvailable。[BeatmapDownloadTracker](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Online/BeatmapDownloadTracker.cs)觀察下載、匯入及相同線上 ID 的本機非待刪除資料，並非只看網路進度 100%。它是該版的已匯入狀態，不等於每次播放前都重新逐 byte 驗證媒體。

[ModelDownloader](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Database/ModelDownloader.cs)在下載完成後交給 importer，追蹤當前下載、拒絕相同模型重複在途工作，通知提供取消。但該版也明註把匯入失敗暫以下載失敗回報；這個簡化不值得照搬。本案已有「下載完成但未納入」等分段結果，應保留可辨認的失敗階段，避免重新下載本來已完成的音訊。

### 4.2 選用大素材與執行排程

- [DownloadBeatmapSetRequest](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Online/API/Requests/DownloadBeatmapSetRequest.cs)可用 `noVideo=1` 省略影片；[BeatmapManager](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Beatmaps/BeatmapManager.cs)另有刪除影片操作。可用核心內容與選用視覺素材不是一個安裝條件。
- [RealmArchiveModelImporter](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Database/RealmArchiveModelImporter.cs)有工作佇列及 `PauseImports`，目的是避免匯入負荷影響 gameplay；`ImportImmediately` 可明確繞過等待。這說明背景任務應接受現場優先政策，不是本案已具備同樣排程保證。
- 舊版搬移由 [LegacyImportManager](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Database/LegacyImportManager.cs)按內容家族處理；hard link 有檔案系統與同磁碟條件，不能承諾所有搬移零額外容量。[官方儲存說明](https://osu.ppy.sh/wiki/en/Client/Release_stream/Lazer/File_storage)

本案應沿既有最小 managed unit：Provider Python、FFmpeg、每個 model、Audio Python capability 各自準備／修復／移除；歌曲的歌詞、伴奏、分析與未來影片則是逐曲素材。兩組狀態不能用一個「已安裝」覆蓋。對已持有音訊而言，外部來源 gate 關閉也不應被誤寫成無法播放。

## 5. 選曲、收藏與空結果如何形成日常循環

[FilterCriteria](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Screens/Select/FilterCriteria.cs)與 [BeatmapCarouselFilterGrouping](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Screens/Select/BeatmapCarouselFilterGrouping.cs)把搜尋、篩選、排序與分組作用於同一份內容；CollectionDropdown 保存選中的本機 collection 作篩選。這比為每種入口建立新的曲庫更適合本案，但不表示要複製 osu! 的高密度 carousel、難度顏色或搜尋語法。

[NoResultsPlaceholder](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Screens/Select/NoResultsPlaceholder.cs)會依「實際沒有一般譜面」「搜尋文字」「難度範圍」「規則集轉換」給不同建議，也可連到線上搜尋。程式同時留有新匯入後更新提示與建議前確認實際可用內容的 TODO，不能把所有提示描述成即時且完全正確。

本案較值得先整理的是以下語意；動作均為研究中的候選回路，不是目前新增的按鈕：

| 使用者看到的狀況       | 應確認的原因                                     | 合適的下一步方向                                                 |
| ---------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| 曲庫空白               | 確實沒有可用本機 track，或仍在匯入？             | 匯入自備音訊；已有工作則看進度。不要一律要求登入或安裝模型。     |
| 列表空白               | 是搜尋／篩選排除了已有內容？                     | 清除相關條件，回到已持有內容；不宣稱歌曲不存在。                 |
| 收藏／來源列不能播放   | 只有參照，尚未持有音訊？                         | 檢查本地對應，必要時明確進入外部取得；保留參照。                 |
| 歌曲能播但不能做某件事 | 歌詞／伴奏缺少，或功能尚未啟用／依賴未就緒？     | 只準備該次動作需要的項目；原音訊仍可使用。                       |
| 本機曾有但現在缺檔     | 媒體被移除、路徑狀態或衍生 manifest 不一致？     | 沿維護／重新讀取／重新連結方向處理；不能把缺檔假裝成首次未下載。 |
| 外部查詢沒有結果       | 未登入、離線、服務錯誤、權益限制，或真的無結果？ | 區分原因與可重試性；仍能返回本機工作。                           |

已有來源 album 缺曲 slot、精確本地納入與播放停用狀態是可重用的基礎，見[來源發行契約](../../contracts/release-source-catalog.md)。若擴到想唱清單／外部榜單，應先決定參照 owner 與穩定識別；不直接把任意收藏參照塞進 `library.json`，也不把來源 album 的唯讀成員改成一般 playlist。

## 6. 更新、修改、匯出與刪除各有不同承諾

### 6.1 更新不是無條件蓋回官方版本

[PanelUpdateBeatmapButton](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Screens/Select/PanelUpdateBeatmapButton.cs)在未登入時導向登入；對 LocallyModified 內容先顯示確認，再 DownloadAsUpdate。[BeatmapImporter](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Beatmaps/BeatmapImporter.cs)處理更新時的本機關聯及收藏轉移；`BeatmapInfo.TransferCollectionReferences` 則處理譜面 hash 改變。這些是特定身份／更新規則，不能概括成所有人工修改都能自動合併。

本案含義：來源 catalog 更新、音源替換、歌詞時間修改、逐曲設定、分析重跑及外觀更新是不同操作。人工校對、offset 與來源 revision 應有各自的保留／失效規則；「更新來源」不能默認等於覆寫所有本機準備。既有[曲庫校對](../../contracts/library-reconciliation.md)已處理部分保存與引用復原，不再新建第二套合併系統。

### 6.2 可攜帶性要靠明確匯出，不只說資料在本機

lazer 採 hash 檔案庫與資料庫映射；外部修改的官方路徑是匯出、修改、再匯入，程式也有 [ExternalEditOperation](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Database/ExternalEditOperation.cs)。這顯示本機保存不自動代表資料可直接攜出、易備份或跨版本相容。[官方儲存說明](https://osu.ppy.sh/wiki/en/Client/Release_stream/Lazer/File_storage)

格式也要分清：這個 commit 的 [BeatmapExporter](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Database/BeatmapExporter.cs)輸出 `.olz`，[LegacyBeatmapExporter](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Database/LegacyBeatmapExporter.cs)使用 `.osz`，BeatmapImporter 接受兩者；不能把 lazer 所有匯出一概寫成 `.osz` 或保證來回轉換完全無損。

本案未來若做逐曲設定／準備組合匯出，應先回答包含哪些設定／參照、缺曲如何 remap、來源變更如何失效、哪些素材可以不附帶、版本如何相容。已接受的 preset 匯出入與外觀交付各循原規劃；本輪不另立含歌曲／歌詞／影片的社群包格式。

### 6.3 刪除與復原的限制值得反向學習

| 查核到的行為                                                                                                                                                                                                                                                                                                                                                          | 界線與本案含義                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ModelManager](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Database/ModelManager.cs)以 DeletePending 支援部分內容軟刪除／撤回；[BeatmapSettings](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Overlays/Settings/Sections/Maintenance/BeatmapSettings.cs)有還原最近刪除譜面與隱藏難度入口。 | 官方說明刪除會在重啟後永久化；這是短期復原窗口，不是持久備份，也不推論每類資料都有同樣保證。[官方註解](https://osu.ppy.sh/wiki/en/Help_centre/Upgrading_to_lazer#notes) |
| [CollectionsSettings](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Overlays/Settings/Sections/Maintenance/CollectionsSettings.cs)的全部收藏刪除經確認後直接移除 collection 記錄。                                                                                                                                                | 不應將譜面的可還原語意擴大成「所有資料都能救回」；刪收藏與刪媒體要分別描述。                                                                                            |
| BeatmapManager 可單獨刪除影片。                                                                                                                                                                                                                                                                                                                                       | 本案已有保留歌曲本體、只清理可重建衍生結果的[儲存管理契約](../../contracts/library-storage-management.md)；這是既有能力。未來影片仍須另定原始／衍生／可重取分類。       |
| BeatmapImporter 對支援的 `.osz`／`.olz` 回傳 ShouldDeleteArchive；RealmArchiveModelImporter 成功匯入後會嘗試刪除輸入封裝。                                                                                                                                                                                                                                            | 不能假設所有 import 都保留原始封裝。本案不複製這種隱含來源刪除策略，仍沿本機匯入的複製、staging 與原子提交。                                                            |

不建議為了借鏡而遷移 Realm、全域內容定址儲存或 hard link。Utawakui 的 filesystem authority、`tracks/<trackId>/`、sidecar、人工校對與來源證據已有實際契約；變更儲存的成本與風險遠高於本輪要解決的引導分類。

## 7. 帳號、權益、線上結果與本機使用分開判斷

### 7.1 同一個 App 不代表所有入口有相同條件

[BeatmapListingOverlay](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Overlays/BeatmapListingOverlay.cs)沿 [OnlineOverlay](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Overlays/OnlineOverlay.cs)的預設登入要求；[OnlineViewContainer](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Online/OnlineViewContainer.cs)區分 Offline、Connecting、Failing、Online 等狀態。相對地，SoloSongSelect 的 Play／Edit 動作沒有同樣登入前置，外部 Details／Copy Link 則要有 OnlineID。

[BeatmapListingFilterControl](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Overlays/BeatmapListing/BeatmapListingFilterControl.cs)在未登入時不排搜尋請求；對非 supporter 使用受限的個人遊玩／rank 篩選，也有明確的權益結果。不是將上述情況都當「搜尋不到歌曲」。

### 7.2 本機能玩與可以提交是不同資格

[SoloPlayer](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Screens/Play/SoloPlayer.cs)對無 OnlineID、本機改過的譜面或不相容 ruleset 不建立提交 token；token 取得失敗也不因此退出單人遊玩。[SubmittingPlayer](https://github.com/ppy/osu/blob/4e11ab19feb423c905cf98d9b8fa34700a8aeffa/osu.Game/Screens/Play/SubmittingPlayer.cs)另檢查登入／服務狀態，無 token 或不合條件的結果跳過提交。這提供實作層級的「可用內容與線上提交資格分離」證據；不等於所有未送結果都會在恢復連線後補送，也不證明所有成績都有排名資格。

對 Utawakui，能借鏡的是資格分開，而不是照搬登入後的自動提交。既有本機 qualified playback 次數、manual 演出完成、OBS 時間戳，未來歌曲熱度或 Mic 練習資料的含義不同。若日後有貢獻，仍需另定同意、事件分母、版本身份與去重，不由 Provider gate、帳號或下載成功取得上傳授權。

以下各軸宜在研究／狀態文案中分清，不必全部顯示成 badges：

| 判斷軸         | 要回答的問題                                       |
| -------------- | -------------------------------------------------- |
| 持有           | 有參照而已，還是本機有可讀音訊？                   |
| 本次動作就緒   | 只播原曲，或要歌詞、伴奏、練習分析、公開輸出？     |
| 使用者選擇     | 該流程是否啟用，這次是否允許外部查詢／下載？       |
| 執行環境       | 必要的 FFmpeg、runtime、model 與輸出服務是否就緒？ |
| 外部狀態       | 可離線完成，或目前需網路／登入／服務可用？         |
| 權益與資料資格 | 是否有相應服務權益、可信來源／版本及統計資格？     |

## 8. 對照使用旅程與本案的分類結果

### 8.1 用旅程驗證分層，而不是先長出功能清單

| 旅程                     | osu! 的依據／限制                                                                         | Utawakui 研究應回答的問題                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 初次使用、未登入且無網路 | wizard 沒有登入步驟；線上取得不可用，本機匯入與單人動作另有路徑。未實機驗證整段斷網流程。 | 能否只用自備音訊完成匯入與播放，再選擇是否加歌詞／伴奏？沿既有核心驗證，不新增帳號前置。          |
| 已有大量本機內容         | stable 搬移可按家族選擇；copy／hard link 有不同成本。                                     | 能否清楚分開匯入媒體、帶回個人設定、修復依賴與還原備份？不為遷移而自動取得所有服務。              |
| 想找新內容               | listing 為線上入口；登入、篩選權益與下載／匯入各有狀態。                                  | 找到選曲參照、持有音訊、準備好演唱要分開；既有 Provider 工作流與來源 catalog 優先重用。           |
| 收藏有一部分未安裝       | collection 保存缺件參照；不保證既有 UI 已能批次解決全部缺件。                             | 若做想唱／外部榜單，缺件能否留在資訊清單並明確選擇補齊？不可製造假本機 track。                    |
| 演出中準備其他內容       | importer 有可暫停政策與明確繞過參數。                                                     | 背景下載／分離／分析怎樣影響播放與 OBS？沿既有 scheduler 先量測；未驗證前不增加「演出模式」開關。 |
| 本機修改後遇到來源更新   | LocallyModified 更新前確認、收藏參照遷移；不保證任意修改自動合併。                        | 歌詞人工修訂、逐曲偏好與音源／catalog 更新的保留和失效條件是什麼？                                |
| 服務斷線或無提交資格     | online placeholder 與 SoloPlayer 提交判斷獨立；沒有事後補送保證。                         | 能否繼續本機播放／練習，並準確說明只是哪一項外部動作不能做？                                      |
| 清理空間、刪錯或換電腦   | 影片獨立清除、特定內容短期撤回、匯出格式有別。                                            | 清衍生結果、移除曲庫項目、刪原始素材、匯出設定及備份還原各承諾什麼？                              |

### 8.2 既有、待視覺、候選與不採用

| 分類                     | 整理結果                                                                                                        | 後續處理                                                                                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 已有基礎，應保持         | 本機匯入／播放不依賴服務；gates 與依賴家族分開；來源 catalog 缺曲參照；背景取得／分離；保留歌曲的衍生結果清理。 | 沿[架構](../../architecture.md#feature-gates-與最小依賴單位)、`shared/featureGates.json`、`shared/featureDependencies.json` 與既有 composable／Main owners，檢查文案和動作是否一致；不重列新功能。 |
| 等待視覺                 | 第一首內容路徑、可重進的引導入口、逐次揭露可選工具、對應原因的空狀態。                                          | 先保留本輪互動原則與旅程；視覺定案前不做畫面細規格，也不把所有步驟做成強制通關。                                                                                                                   |
| 已有方向，需補邊界       | 逐曲演唱設定、preset 匯出入、手機遙控／提詞器、Output 外觀作品。                                                | 分別沿原分類；逐曲設定仍是研究規劃，不因本次來源比較升格為已接受開發。重用播放／歌詞 authority，不發明另一份歌曲身份。                                                                             |
| 新研究缺口，優先於資料表 | 內容參照與持有對應、各動作的最小準備條件、更新失效及缺件回路。                                                  | 用現有資料與具體案例列出差異後再決定需不需要新結構；不先產生完整 schema 或包格式。                                                                                                                 |
| 後續選用擴充             | 只讀選曲／歌曲熱度、本機影片呈現、Mic 輸入分析與音量動畫。                                                      | 各自遵守原研究前置；osu! 沒有替我們證明素材配對、mic 監聽延遲、統計品質或外部 embed 可行。                                                                                                         |
| 不直接採用               | 全域 hash 檔案庫／Realm 遷移、隱含刪除匯入原包、照搬難度／Ranked 審核、強制帳號、社群媒體包平台。               | 概念收益不足以支持此輪成本；雲端協作／商用曲庫等仍須明確產品決策。                                                                                                                                 |

這個分類可以兼容一般歡唱者：只帶自備音訊就有可用成果，有需要再加歌詞、伴奏、排練或畫面；OBS 是可選演出出口。這是對既有架構的應用推論，正式 TA 仍由[受眾決策研究](audience-and-optional-cloud-2026-10-26.md)與產品決策處理，不把「像 osu!」當作市場需求證據。

## 9. 細化前的下一步與查核限制

建議依序使用本研究，不直接展開全部功能：

1. 先用上述八種旅程盤點現有行為，辨認「已有但不易理解」與「缺少契約／能力」。保存具體起點、動作、產出、失敗原因及可返回位置。
2. 再為「播放原曲、顯示歌詞、用伴奏唱、區段練習、送出畫面」各列最小準備條件；這份動作對照比先建立另一個全域 Ready 狀態更有用。
3. 若真有跨歌曲準備的保存需求，再決定逐曲偏好與準備組合的 owner、版本依賴、人工修訂保護及匯出入；不因 osu! 有 package 就預設本案需要封裝格式。
4. 待視覺定案才把已核對的旅程轉成引導與空狀態設計；帳號、榜單、雲端、影片與 Mic 仍各自研究，不列為初次可用的前置。

本輪完成的是官方文件與固定原始碼的交叉查核、失效語意及本案對照。尚未驗證 osu! 實機的無網路首次啟動、匯入時離開 wizard、程序重啟後任務狀態、檔案損壞、更新失敗回滾及大量曲庫操作延遲；也沒有執行其測試。原始碼中的 TODO、短期軟刪除與匯入錯誤合併均保留，不把設計意圖當作完整產品保證。

Utawakui 本輪不變更 production code、現有 gates、播放時鐘、Output 信任邊界或正式功能狀態；本頁保存研究證據，後續採用需回到 focused contract／必要 ADR 與 spec 的原有分類。
