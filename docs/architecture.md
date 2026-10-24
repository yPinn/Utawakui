# 現行架構圖

只描述 production code 已採用的 ownership 與依賴邊界。產品範圍見 [spec](spec.md)，決策理由見 [ADR](adr/README.md)，行為細節見[契約](contracts/README.md)，視覺規則見 [DESIGN](../DESIGN.md)。

## Runtime Ownership

| Runtime                                                      | 責任                                                                                                  | 不可持有                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Electron main (`electron/main/`)                             | Window lifecycle、IPC trust boundary、feature gate enforcement、本機服務、diagnostics                 | Renderer reactive state、client 提供的路徑               |
| Pure main libraries (`electron/lib/`)                        | 檔案系統、provider、處理、依賴與 sidecar 邏輯                                                         | BrowserWindow lifecycle、renderer 呈現                   |
| Preload (`electron/preload.js`)                              | 固定 channel 的 intent bridge；dev-only channel 依 flag 註冊                                          | Node API passthrough、任意 channel 或路徑 API            |
| Renderer (`src/`)                                            | Vue UI 與 player／queue／lyrics owners                                                                | Node／Electron import、依賴 URL、模型或執行檔路徑        |
| Performer window (`electron/main/windows/prompterWindow.js`) | 第二個 sandboxed 視窗：提詞器呈現、獨立 preload、snapshot、offset 與播放／讀音 control intent、bounds | 播放／佇列／歌詞權威、來源 identity、renderer 推導的幾何 |
| Shared (`shared/`)                                           | Scalar JSON 契約與純 cross-runtime 投影                                                               | 檔案系統、Electron、瀏覽器全域、可變服務狀態             |
| Browser Source (`overlay/`)                                  | OBS 交付 adapter、DOM 呈現與獨立 `--ovl-*` tokens                                                     | 控制台 tokens、產品狀態                                  |
| Spout helper (`electron/main/spoutHelperEntry.js`)           | Offscreen Lyrics surface、native Spout sender、texture 釋放                                           | 核心狀態、renderer IPC                                   |

`electron/main.js` 是 composition root：設定 app identity、註冊 privileged scheme、建立服務，再以具名依賴注入各 domain handler。Handler 不共用 context blob，也不彼此協調；跨 domain 流程由 root 建立的 service 負責。

`src/package.json` 只為 `src/` 宣告 ESM scope；根目錄與 Electron Main／preload 維持 CommonJS。Main 的歌詞研究流程以同步 `require()` 載入無 top-level await 的純歌詞 ESM modules，不依賴 Node 自動語法偵測。封裝同時保留 `src/package.json` 與兩份歌詞模組，避免 packaged runtime 遺失此邊界。

### 安全不變式

- `electron/entry.js` 是無依賴的 process dispatcher；main 與 Spout helper 在建立任何視窗前呼叫 `app.enableSandbox()`。所有視窗明確設定 `sandbox`、`contextIsolation`、`nodeIntegration: false`、`navigateOnDragDrop: false`、`webSecurity`、`allowRunningInsecureContent: false`、`webviewTag: false`。
- `electron/main/webContentsSecurity.js` 拒絕 popup，只允許各 owner 的 exact navigation URL，redirect 同樣 fail closed。DevTools 只在明確的 development launch 對 main／Performer 開啟。
- Raw `ipcMain` 只交給 `electron/main/ipcSenderPolicy.js`。未列出的 channel 預設只接受目前主視窗的 main frame；Performer 只取得自己的視窗控制、snapshot／status、diagnostic、閱讀距離、固定 offset action 與播放／暫停／讀音 control intent。Offset 與 control intent 只帶 action、revision、track id，由 main 驗證後轉送主 renderer。驗證同時比對 `event.sender`、`senderFrame` 與 owner 的 main frame，subframe 不繼承 capability。
- 這些是固定 shell 不變式，不是使用者設定。

### 視窗

- `electron/main/windows/outputWindow.js` 管理每種固定 slot 的只讀可見視窗，`outputWindowHandlers.js` 只開放控制台 main frame 的 kind intent；沿用 canonical loopback URL、slot 與尺寸，不建 Output Vite entry。獨立 session 無 preload 且拒絕權限／下載／外部導向。Output runtime 的 slot-change callback 同步內容尺寸，beforeStop 先清理視窗再停止 Spout；控制台實際關閉清理，Tray 隱藏保留。視窗黑色 substrate 與 OBS 擷取限制見 [Output runtime](contracts/output-runtime.md#只讀輸出視窗)。
- 主視窗與提詞器 owner 集中在 `electron/main/windows/mainWindow.js`／`prompterWindow.js`，分別保留原有 native integration 與獨立視窗生命週期；沒有通用視窗 factory。`shared/rendererEntries.json` 給 Vite、HTML 品牌注入與 main 同一入口對照：主入口仍為根目錄 `index.html`，提詞器 HTML／bootstrap 位於 `src/entries/prompter/`，建置後保留同層級。兩份 preload 仍在 `electron/`，原有 IPC、設定鍵、renderer surface id 與 Spout helper 不變。
- `shared/appIdentity.json` 是固定品牌與視窗角色（`main`／`prompter`／`output`）的資料來源；不讀 Electron、userData 或設定。Main 保持先 `app.setName()` 再載入 domain 模組。`electron/main/windows/windowIdentity.js` 解析共用 native icon，主視窗與提詞器使用同一資產；Vite 的 `viteAppIdentity.js` 在處理 HTML 前注入標題與 favicon。主視窗仍可隨歌曲更新標題。`output` 角色名稱同樣供只讀 Output 擷取視窗使用。
- 主視窗 density 由 `electron/main/windows/mainWindow.js` 依原生狀態投影：視窗化為 `compact`，最大化／全螢幕為 `standard`；初值經 `additionalArguments` 給 preload，之後只經 `ui-density:changed` 更新，`useUiDensity.js` 寫入 document root。
- Performer bounds 由 main config 與 window manager 持有：只接受 `{ x, y, width, height }` normal bounds，move／resize debounce、close 時 flush，排除全螢幕與最大化；依目前 work area 以 32px margin 調回螢幕內，無保存值時 960×540 置中。Renderer 沒有 bounds IPC。
- `electron/main/previewSession.js` 在 ready 時並行初始化 default session 的 Cookie store（只查詢固定 loopback URL、不送請求、不寫值），讓 Workbench iframe 重用；主畫面與 Output 不等待它。

## Renderer

### Shell、目的地與導覽

- `useAppView.js` 單獨擁有目的地狀態。Library／Performance／Display／Settings 進入 `AppFolderLayout`＋`AppFolderPage`；`LibraryPage`、`PerformancePage`、`DisplayPage`、`SettingsPage` 是各目的地的組合 owner。
- 導覽歷史由 `useNavigationHistory.js` 擁有（[ADR 0025](adr/0025-renderer-navigation-history.md)）：只記目的地、Library 選取與 Settings 返回來源，不記播放、佇列、搜尋或排序。滑鼠側鍵、`Alt+←／→`、瀏覽器鍵與 Main 轉送的 Windows `app-command` 經 `inputBindingRegistry.js`／`useNavigationInput.js` 共用同一出口。
- `openSettings()` 首次進入時保存來源，`returnFromSettings()` 回到最近的非 Settings 目的地；Titlebar、F9、Tray 與依賴設定請求共用此 action。
- Token：Main 與 Performer 的 `#app` 在 mount 前登記為 v2 surface，兩個 entry 只載入 `src/styles/tokens.css`。Token v1 已全部移除，source gate 禁止回流（[Token v2 替換](archive/token-v2-replacement.md)）。`overlay/` 只用 `--ovl-*`，兩者互不匯入。
- Modal 內的動作選單由 `UiModal` 提供當前 backdrop 作為局部 floating host；`UiActionMenu` 優先 Teleport 至該 host，保持在 clipped panel 外且屬於同一 dialog 堆疊。非 modal 選單仍使用已登記的 surface overlay host，不以頁面自訂 z-index 修補遮蔽。
- Dev-only：`VisualSystemView.vue` 只掛載 `DemoView.vue` 元件型錄；`InternalToolsView.vue` 以 `constants/internalTools.js` 分為 Operations（F5 音樂分析、F6 Diagnostics）與 Evaluation（Music M2、F7 歌詞 provider 語料），一次只掛載一個工作台，不改變 gate 或 IPC 邊界。

### 曲庫瀏覽

- `LibraryBrowseWorkspace.vue` 持有 Library 的 Folder 頁與頁面物件；`LibraryBrowseContent.vue` 把曲庫身分與搜尋放在固定 header，其餘留在唯一 document scroll；`LibraryArtistIdentityController.vue` 單獨持有藝人整理 modal 與 mutation。
- `TrackTable` 的 profile 分開 `canReorderColumns`、`canSortTrackRows`、`canReorderPlaylistTracks`：全部曲目、本機檔案與播放清單可依可見欄排序；專輯與藝人頁忽略殘留排序、維持 canonical 順序。伴奏狀態是時長欄內的保留 slot，不是獨立欄。
- 專輯欄先由 `useAlbumNavigation.js` 解析來源型專輯；只有 scalar album 時，`usePlaylists.js` 持有 session-only 的 `selectedAlbumReference`，`albumReference.js` 以正規化專輯名即時推導唯讀成員，不寫 `playlists.json`。
- Sidebar 參照區由 `orderReferenceItems()` 依藝人名混排專輯與藝人；`selectedArtistId` 與 collection 選取互斥，`artistPage.js` 推導藝人頁。曲目列、PlayerBar、Queue 以 `trackArtistIds` 投影 entity 顯示名稱，index 未載入時回退 scalar；搜尋同時接受 canonical 名稱與所有 credit。

### Right Dock

- `App.vue` 與 `useAppRightDock.js` 擁有 Dock 幾何、surface stack 與前景切換，不持有播放或處理資料。寬度調整、桌面保留欄位、compact overlay、Escape 與焦點還原屬於 shell，不回流到 PlayerBar。
- `QueuePanel.vue`、`TrackContextPanel.vue` 與 `PreparationDockPanel.vue` 透過 `AppRightDockPanel.vue` 共用 header、單一 scroll owner、可選 summary 與 footer slot。PlayerBar 縮圖是直接開啟 metadata 的 intent。
- Queue surface 有一般與「演出安排」兩個 variant；安排 variant 的 footer 放場間音樂，OBS 直播／錄影中時 Dock 加強框色並顯示 LIVE／REC（只讀 OBS 投影，讀取失敗即清除）。
- Queue 與最近播放的列由 `QueueTrackButton`／`RecentPlaybackList` 組合 `UiTrackRow`；排序與拖曳由 Queue feature 持有，`UiTrackRow` 不持有排序語意。`playbackActions=false` 可關閉封面、Enter 與雙擊播放。`TrackIdentityRow.vue` 提供可導向專輯／藝人的曲目身分列，在切換目的地前發出 `navigate` 讓 Modal／Dock 先收合。

### 匯入與曲目準備

- Titlebar 只有一個「曲目準備」disclosure，開啟 shell 持有的 `PreparationDockPanel.vue`，以 tabs 切換 `ImportDockContent.vue` 與 `SeparationDockContent.vue`，不改變目前目的地。
- `useImportSession.js` 是匯入的唯一 session owner；`import/useImportSourceResolution.js` 處理文字／URL 解析與候選，`import/useImportExecution.js` 持有已確認批次、兩路下載提交、去重、停止、重試與 collection finalize。兩者以具名依賴組合、不互相 import。Dock 與 `ImportReviewModal.vue` 投影同一批次；每批最多 500 首、保留 50 批 session 紀錄，不持久化。見[匯入 session 契約](contracts/import-task-session.md)。
- 外部來源欄位聚焦時以 `import:clipboard-suggestion` 請 Main 讀剪貼簿；Main 驗證前景主視窗，只回傳支援的 YouTube／YT Music canonical 連結。剪貼簿與手動貼上共用 `electron/lib/importInput.js` 的 `parseImportSourceUrl`，只保留來源 id、移除追蹤參數，拒絕非 HTTP(S)、含帳密或控制字元的網址。只在使用者按「貼上連結」時填入，不持久化剪貼簿。
- 搜尋：`playbackSearch.js` 只組合固定 YT Music `#songs` URL（最多 3 筆）與 flat `ytsearch`（每 query 最多 8 筆），同 video id 合併後由 `importResolver.js` 評分，最多投影 12 筆；只有純文字搜尋的有限時長 release recording 可自動選取。Renderer 不顯示內部分數。Spotify／Apple Music URL 回 deferred；「以 YT Music 開啟」走系統瀏覽器，帳號與 cookie 不進入 Electron。
- Main 的 `providerDownloadScheduler` 是全域 admission owner：最多同時兩個 track id，重複 id 共用工作，可逐首取消。下載完成後進入並行 1 的曲庫 finalize lane（寫索引、排程 sidecar／分析、套用空間政策），下載槽不等待。下載時以 yt-dlp metadata phase 取得的 `info.json` duration 為準。
- `useSeparationQueue.js` 由 App shell 唯一持有；`useSeparationPreparation.js` 持有來源選擇（預設目前播放順序，或 playlist／album），依來源順序投影「尚未準備／已有伴奏」並排除同 recipe 已在佇列的曲目。主要動作只快照尚未準備的曲目，既有結果只能明確重新準備。佇列操作（排序、移除、重試、清除紀錄）在 `SeparationToolbarList.vue` 與右鍵選單；處理狀態權威在 main。

### 播放、BGM、試聽、節拍器

- `usePlayer.js` 是 HTML audio event 權威與 transport facade；`player/usePlayerAudioGraph.js` 擁有四聲道 accompaniment／guide-vocal 路由、monitor／capture mix、Signalsmith pitch、capture sink 與清理，不註冊時間事件。Monitor graph lazy 建立；儲存的 capture 裝置須先由 `useAudioOutput.js` 列舉驗證，裝置遺失或錯誤時關閉 capture、清除設定並保留 monitor，不 fallback 到預設喇叭。`pitchProcessorLoader.js` 首次需要時才載入 Signalsmith worklet，失敗可重試，不放寬 CSP。
- Chromium 自然 EOF 的 pause→ended 由 ended 這個 terminal owner 處理，不投影為操作暫停，以免略過 BGM post-roll。
- 最近播放與啟動恢復：`usePlaybackHistory.js` 依實際 progress／ended 判定 qualified event；`useRecentPlaybackActivation.js` 以插播方式播放歷史曲目，不重建來源佇列；`usePlaybackResume.js` 只投影與 paused rehydrate。演唱音量與監聽／擷取 level 由 `shared/audioControlValues.json` 定義，存於 `config.json.audioPreferences`，preload 同步 seed 第一幀，`useAudioPreferences.js` 合併寫回。見[播放紀錄契約](contracts/playback-history-and-resume.md)。
- BGM：`src/bgm/audioDeck.js` 擁有第二個 audio element 與 logical gain bus（目前只連系統預設 monitor）；`src/bgm/handoffCoordinator.js` 仲裁 BGM request、演唱後 deferred restore、fade gate、pre-roll／post-roll 與 stale generation。`useBgmSession.js` 由 App 在啟動時初始化一次，組合 plan、library、OBS、deck、coordinator 與 player 的單一 pre-start hook；`BgmPlayer.vue` 是安排 Dock footer 的場間音樂控制組合，主頁更多選單可導向此處，mount／unmount 不改變音訊。BGM 不進 Queue、history、resume、Output、SMTC。見 [BGM 契約](contracts/bgm-standby-lane.md)與 [ADR 0021](adr/0021-bgm-standby-audio-and-handoff.md)。
- 曲目試聽是同一 coordinator 仲裁的第三條、最低優先 lane：`acquirePreview()` 回傳可被搶占的 lease；演唱開始、BGM 播放、進入直播／錄影都會搶占試聽，直播／錄影中直接拒絕。Owner 是 `useTrackPreview.js`（自有 audio element），`TrackPreviewOverlay.vue` 只投影狀態。見[試聽契約](contracts/track-preview.md)。
- 節拍器 `useMetronome.js` 使用獨立 AudioContext 與 lookahead scheduler；`useMetronomeTrackTempo.js` 只在停止且未手動覆寫時套用通過信心門檻的分析 BPM，不回寫 sidecar。

### 演出安排

- `usePerformanceSessionPlan.js` 序列化 mutation 並消費 main 回傳的完整 snapshot；`usePerformanceSessionPlaybackController.js` 協調 occurrence、confirmed playing、完成／略過／中止與連續播放；`usePerformanceSessionPlayback.js` 與 `usePlaybackTransport` 共用 PlayerBar／SMTC／ended 的下一首決策。一般 Queue 與安排不各自註冊自動前進。
- `PerformanceSessionWorkspace.vue` 是主頁組合：目前項目、連續播放、場間音樂、待唱與演出紀錄。`PerformanceSessionCurrent.vue` 供主頁與 Dock 共用（保留封面播放／暫停）；`PerformanceSessionQueueList.vue` 與 `PerformanceSessionCompletedList.vue` 關閉清單播放動作，「再次加入」只建立新 occurrence。`PerformanceSessionSummary.vue` 以 `performanceSessionSummary.js` 投影統計，主頁與 Dock 共用。
- `performanceSessionOutput.js` 在安排持有播放時，從 confirmed current 與 completed progress 產生公開 queue／playback 投影，使用 occurrence 名稱；未開始與略過／中止不冒充完成。
- `PerformanceSessionHistoryTools.vue` 共用紀錄頁選單、明確封存與封存集合；`PerformanceSessionPlaylistExportModal.vue` 先呈現 main 預覽的合併／排除數再保存。`useObsSessionExport` 指定安排場次後，重讀保持同一身分。
- 封存集合重用 `PlaylistSidebarRow`／`UiCollageThumb`，main 摘要僅附最多四個去重的 canonical cover ids，不下放整份 items 或路徑。`useAppView.performanceArchiveId` 與既有 navigation history 擁有場次位置；`PerformanceSessionArchive.vue` 在主區重用 Folder document／dossier／Track Row 顯示唯讀 occurrence 原序，`usePerformanceArchive` 隔離載入／重試與切換競態，不改目前安排或播放。
- 見[演出安排契約](contracts/performance-session-preparation.md)。

### 歌詞

- `useLyrics.js` 是唯一 public owner：選曲、播放投影、canonical `lyricsDocument`（給 timing／讀音編輯）與衍生 `displayLyricsDocument`（給工作區與 Output）。中文內容預設以 bundled `opencc-js` 的 `s2tw-v1` 投影為台灣繁體，可切回原文；只依實際 script 判斷，不改寫任何來源、timing 或 id。T2 先整行轉換再依等長邊界切回 segment。`lyricsTextVariantLoader.js` 延遲載入 converter，發布前等待並重查 request identity。
- `usePlayer.samplePlaybackClock()` 同步唯讀採樣 audio 位置、實際倍率、phase、identity 與配對時間，不回寫 transport state。`useLyrics` 內部的 `lyrics/useLyricsClock.js` 在既有 timeupdate／控制事件與 T1／T2／已套用 T1+ 起點期限重新讀取媒體，只更新歌詞顯示位置；晚到不累加推算位置。Output publisher 在內容傳送 await 後與拒絕重試前重查文件／continuity，再採樣發布，手動演出維持其虛擬投影。細節見[歌詞時間契約](contracts/lyrics-timing-contract.md)與[Output 契約](contracts/output-runtime.md)。
- 內部 composable 以具名依賴組合、不互相 import：`lyrics/useLyricsAcquisition.js`（手動候選搜尋，與 dormant Musixmatch probe）、`lyrics/useLyricsSourceDocuments.js`（本機來源、offset、timing、label、刪除與匯入）。Main 端行為見[歌詞來源契約](contracts/lyrics-sources.md)。
- 演唱工具「歌詞」與曲庫歌詞編輯共用 `useLyrics`／`useLyricsReading`；`useLyricsDisplay` 協調顯示選項與讀音準備，不持有第二份讀音文件。兩頁共用 `LyricsSourceControl` 與 `LyricsSourceManagerModal`；文字、讀音修正與時間編輯只在曲庫編輯頁。逐字校時能力由 `lyricsTiming.js` 判斷。
- 讀音：`useLyricsReading` 驗證 canonical identity、合併讀取並持有產生鎖；讀取失敗不視為缺檔。Reading sidecar v3 由 main 持有 documentId、normalizer profile、來源 fingerprint 與 line identity；文字相容的 v1／v2 原子 re-key 並保留人工修正。日文 worker 先把 kuromoji 欄位轉成中立 token，再交給純 builder。
- 提詞器 snapshot 投影同一 `useLyricsReading.variant`；main 驗證 `off`／`furigana`／`romaji`。`usePerformerSelfView` 以提詞器生命週期持有的 detached `useLyricsDisplay` scope 準備讀音，關閉時停止。見[提詞器契約](contracts/performer-prompter-contract.md)。
- Lyrics IPC 由 `electron/main/lyricsHandlers.js` facade 註冊，實際分在 `electron/main/lyrics/` 的 `documentHandlers`、`acquisitionHandlers`、`readingHandlers`，三者不互相 import。
- 共用文字預處理由 `shared/presentation/lyricsTextProcessing.mjs` 持有保真標註、括號配對與禁則；`useLyrics` 內部的 `useLyricsTextProcessing` 持有每來源 session 的逐行確認。Output publisher 在原讀音驗證後才過濾選取行，發布獨立衍生 identity 並排除隱藏行 active id；本機編輯／閱讀保留原索引。模板進階呈現仍由 profile／policy 持有，Live Stage 缺省使用保留實唱內容的 Balanced。見[文字預處理契約](contracts/lyrics-text-processing.md)。

### 聲學估計與研究

- T1 聲學估計另存 `lyrics/acoustic-estimates/<sourceFilename>.json`，由 `lyricsAcousticEstimates.js` 驗證並原子保存；`useLyricsAcousticPreview` 只持有 session 啟用選擇，不寫入 canonical segments。正式 loader 預設拒用研究模型。見 [ADR 0026](adr/0026-t1-acoustic-estimates.md) 與[聲學估計契約](contracts/lyrics-acoustic-estimate-contract.md)。
- `electron/lib/lyricsAcoustic/` 持有選配環境生命週期（固定 catalog／SHA、獨立 capability、共用 Audio Python host 與 heavy-job scheduler）；Settings 經 `useLyricsAcousticCapability` 與六個零參數 IPC 操作。正式 catalog 仍被 `weights-evidence-pending` 擋住。
- 實驗性研究：`electron/lib/lyricsResearch/` 管理隔離下載、完整性、載入與片段；`main/lyrics/researchHandlers.js` 只接收有界意圖；環境在 userData `lyrics-research/installed`，不寫正式 activation。預設關閉的 `experimentalLyricsAfterSeparation` 在分離結果發布後經 `lyricsResearch/automatic.js` 接續分析，結果由 `estimates.js` 驗證後寫入 `lyrics/experimental-estimates/`。`lyricsResearch/language.js` 以歌詞正文辨識中／日／英，證據不足保留未知。
- 實驗分析由 `lyricsResearch/language.js` 派生逐行語言計畫，`engine.js` 與研究 job 共用同一計畫／CPU 聲學窗，內容查核依行語言執行；來源與手選只作主要語言提示，句內混語維持 T1。估計封套 v5 綁定計畫與細時間配方，schema 2 可另存中日模型 Word 起訖及精確 occurrence 文字範圍；跨框／重疊／缺 end 不補猜。前一配方 schema 1 可繼續載入粗提示。
- `useExperimentalLyrics` 持有手動套用狀態，交付本機閱讀區與 Output（`outputDocument` 經 `useOutputProjectionPublisher` 以既有 v3 revision 發布；line 的可選 `estimatedStarts` 由 `shared/outputStreamContract.js` 驗證）。分析在 main 入列時固定來源與版本，佇列仍單一 heavy owner；`LyricsSourceAnalysis` 依來源／版本選取任務，以 job id 取消。專用完成通知只刷新分析；其他來源或相同結果不解除目前套用。來源／文件／offset 或結果實質變更才解除套用，既有 sidecar 格式與模型時間不改。見[聲學估計契約](contracts/lyrics-acoustic-estimate-contract.md)。
- 舊分析唯讀相容：`lyricsResearch/estimateCompatibility.js` 僅為完全身分等價的 v2→v3 純 T1 結果做記憶體 ID 映射；原 strict gate、粗／細時間與原檔保持，8 筆有界 memo 不落磁碟。`estimateReader.js` 在回覆前重驗功能開關、曲庫與來源，loader 重驗結果檔 stamp；套用仍手動，失敗不自動重分析。
- 長句容量：`shared/presentation/lyricsDisplayLayout.mjs` 持有保真候選、頁面與時間依據，`lyricsDisplayFrame.mjs` 投影既有模板；`overlay/lyrics/lyricsFit.mjs` 與本地 `usePerformerLyricsFit` 各持有 DOM 量測及失效快取，使用同一播放器時鐘，量測不進播放 tick。T1+ 按模型起點立即提示整段，不以相鄰起點／句尾推算主提示的掃完時間；模型起點與 canonical T2 保持分離，讀音、字型與視窗尺寸納入可見驗收。
- Output 歌詞 scheduler 以絕對 deadline 扣除同步準備／commit 耗時；跨界後有限次重投影，過期 generation 不提交。Focus 在設定、字型與啟用後以可取消工作先讀既有容器樣式，不寫未來歌詞或取代正式 fit。`lyricsTrace=1` 才啟用有界數值 stage trace，預設關閉，不記歌詞文字。見[Output 長尾延遲修正](archive/lyrics-display-performance-2026-10.md#output-deadline-與首字準備2026-10-22)。
- 本地 document reader 在 list／sheet 共用 `LyricsFineText.vue`：當前原句固定螢光筆，原生 T2／套用 T1+ 僅為當前非空白詞塊加藍色底線，跨讀音仍保留完整文字；句間定位與演唱 active 分離。`src/utils/lyricsLocalCues.js` 從同詞塊內相鄰有效 fine 證據導出已知停頓，僅暫隱底線；`useLyricsClock` 沿既有媒體時鐘重採兩側邊界，原 coarse 起點不延後，缺證據不判靜音。這些本地 cue metadata 不發布、不回寫。Output Focus／KTV 繼續由 `shared/presentation/lyricsFineFrame.mjs` 與 `shared/browser/lyricsFinePaint.mjs` 做連續填色；Focus 保留底線，KTV 無底線、保留角色色／描邊／雙列。資料層細時間與顯示估計保持分離；Output starts-only、其他模板與 Self-View 不變。
- 填色完成與來源換句分開：共用 paint plan 的 `paintEndMs`／`holdUntilMs`／`cueEnds` 僅為顯示投影，完整文字及原起點不改；完成 deadline 只重採既有媒體時鐘。推定句框的缺尾依有限局部速度補顯示終點，證據不足維持 unknown；品質原因不授權改動既有 fine。KTV 保留既有雙列／預備與停留規則，無底線；容量頁依有效列顯示，不能固定隱藏實體第二列。段落／歌聲活動只做離線對照，未接 live gate 或 BPM。規則見[歌詞時間契約](contracts/lyrics-timing-contract.md#capacity-aware-display-pages)。
- Focus 細填色 adapter 以有界快取保存靜態文字／來源範圍／模型時間結構，不保存進度；一個完整 grapheme 恰對應粗分段時共用既有節點。動畫只在取樣時鐘的前進／hold 分段等價時重用，任何時間錨點、速率或不連續修正即重新定位，不另加等待。見[首字成本驗證](archive/lyrics-display-performance-2026-10.md#細填色首字成本2026-10-22)。
- Focus 容量量測按精確來源範圍重建合法細填色盒，保留非 fine 文字與跨邊界降級；整句已通過容量檢查時，共用 planner 省略拆分搜尋，仍沿原時間規則。多行狀態與清除下一句獨立保留，診斷以 cycle／timer／delivery／pass 關聯同次工作，預設不採樣新增時鐘。見[冷啟動與舊分組診斷](archive/lyrics-display-performance-2026-10.md#冷啟首字與舊分組排查2026-10-22)。
- 研究 CLI 在 `scripts/research/`，不進封裝（App 試用只明列所需推論模組）。選型見[研究結論](research/lyrics-alignment/lyrics-alignment-summary.md)，步驟見[試用手冊](operations/lyrics-alignment-research.md)。

### Settings 與通知

- `SettingsPage` 擁有唯一 page scroll 與 local overlay host；`SettingsView` 組合曲庫、音訊、應用程式、選用功能與支援五個 domain，各 section component 持有自己的 lifecycle、確認與 deep-link。系統 FFmpeg 偵測經 `useOnFirstVisible` 延到區段可見時。
- `useAppNotifications.js` 保存通知投影與私有 action callback，`App.vue` 掛載唯一 `AppNotificationHost`；`useTaskNotification.js` 由各 domain 事件更新同一投影。Modal 與通知共用 `useUiModalStack.js`，modal 開啟期間暫停通知倒數。見 [Settings 操作回饋契約](contracts/settings-operation-feedback.md)。
- 偏好與儲存狀態由 `useLibraryStorage`、`useSettingsPreference` 依 bridge 共用，切頁不重建寫入；OBS 密碼輸入離頁即清除。

## Main 服務

### 視窗關閉與 Tray

- `electron/main/windowsTrayController.js` 持有 tray；`mainWindow.js` 仍是唯一主視窗 owner。`windowCloseBehavior` 為 `ask`／`tray`／`quit`（預設 `ask`）。`ask` 由 main 產生一次性 request id，經 `windowCloseDecisionBridge.js` 請 renderer 以 `UiModal` 呈現；renderer 逾時或失去回應才退回原生對話框。伴奏處理執行中改用不可記住的一次性確認。
- 背景執行先確保 tray 可建立，再隱藏同一視窗，播放與 Output 不重建。Tray 開啟、設定、雙擊與 second-instance 都還原同一視窗。
- Tray 完全退出、更新安裝、`before-quit` 與 Windows `query-session-end`／`session-end` 先設定 sticky quitting 狀態，close handler 才放行。

### 設定與外部導覽

- `config.js` 的 `loadConfigSnapshot()` 一次讀取產生正規化設定與遷移用 metadata，交給 `configState` cache。
- 曲庫位置由 `configState.js` 的 guarded resolver 驗證：自訂位置消失或無法讀寫時保留設定、不改用 fallback，所有曲庫 consumer 回 bounded unavailable；`config:get` 投影可用性供 Settings 復原。
- 開啟說明頁只提交 allowlisted target id；YT Music 探索只提交 bounded query，由 `providerDiscoveryHandlers.js` 組固定 URL 並重查 `provider-flow`。

### 曲庫與匯入

- 作品與版本（[ADR 0028](adr/0028-local-works-versions-and-releases.md)）：`electron/lib/works/` 持有曲庫根目錄 `works.json`、revision、profile、Main 私有原始媒體 binding 與刪除 receipt。runtime 驗證 canonical audio、CAS／epoch 與當頁候選；正式 local／convert／provider import 的短提交及刪曲共用 service lane。`main/library/workOrganizationHost.js` 協調啟動恢復及 playlist／session／BGM 引用；固定 workOrganizationHandlers／preload intents 只投影產品資料。 逐曲連結只傳 targetTrackId，由 Main 解析目標作品並在提交前重驗兩份音源；搜尋候選不代表已確認關係。`useWorkOrganization` 持有版本／連結草稿及請求世代；`useSongEditor` 協調它與既有 `useTrackMetadataEditor`，統一開啟、分頁、儲存與關閉確認。編輯器不提供共同歌名／作品改名；逐曲連結與解除只修改關係，曲目歌名、演唱者及版本資訊獨立。既有作品識別／內部名稱及 Main 相容 API 保留，不遷移資料。App 單掛 WorkVersionEditor；TrackMetadataFields 只提供歌曲資訊及封面內容，Library／Queue／播放資訊／preview 不再各掛 metadata modal。兩領域仍各自提交，部分失敗保留未完成草稿並提示已儲存部分。作品異動使用專用事件，不啟動 provider backfill；播放與歌詞權威不變。
- `playlists.js` 讀取 v1–v3，首次寫回舊版本先備份；v2 不重跑 kind heuristic，損壞或未來版本拒寫。`releases/schema.js` 驗證 optional `releaseInfo`，逐欄解析人工覆寫／source-bound facts，協調 revision、主打與成員 bindings；保留既有 collection UUID／kind／source／曲序。現有 playlist IPC 投影移除私有 localMemberBindings。詳見[作品與發行契約](contracts/works-versions-and-releases.md)。
- 發行操作：`releases/runtime.js` 與作品共用 lane，`main/library/releaseHandlers.js`／preload 限定五個讀寫與驗證 intents；CAS／epoch、來源權威及 Main 私有 bindings 不跨界。列表只投影 resolvedRelease，不啟動整庫摘要；`useReleaseMembers` 在選取集合／藝人時有界驗證，播放／加入佇列另取新驗證，Main 待唱集合匯入在同 lane 驗證後同步提交。`useReleaseOrganization` 擁有 editor 草稿、專用事件及建立單首發行；App 掛載 ReleaseInfoEditor。藝人「音樂作品」沿用 LibraryAlbumSupportingContent／LibraryAlbumCard，以同一 Main 投影篩選 Album／Single／EP，未知不猜；Single 詳情在原 album＋UUID 頁面內以 releaseDetailPresentation 投影正式總數、durable 成員與驗證狀態；單首、多曲及部分收錄直接共用專輯的136px封面、TrackTable、欄位與密度設定；正常摘要不重複計數，詳情不顯示主打tag。作品分類使用內容寬度的UiTabs bar variant及中文分類，穩定tab／panel ID保留鍵盤導覽，播放／編輯沿用P3 owner。

- `library:list` 是曲庫投影入口。每個曲庫目錄在單次 session 首次讀取前執行一次 `organizeTrackMetadataFromSidecars()`：以已保存的 `info.json` 整理 metadata，不連網、不改寫 sidecar、保留手動編輯；失敗只記 diagnostic。
- 本機匯入 `library/importLocal.js` 在 library root 的隱藏 staging 非同步複製與計算 SHA-256，以 `music-metadata` 驗證容器、codec、時長與有界 tag／封面，通過後原子移入 `tracks/<trackId>/`，索引失敗即回滾。`library/constants.js` 的 direct-play registry 是 picker、allowlist、MIME 與驗證的單一來源。
- 相容轉檔（[ADR 0024](adr/0024-explicit-local-audio-compatibility-transcoding.md)）：首次選檔只把路徑放入 15 分鐘、記憶體內、one-shot 的 review session，renderer 只拿到 UUID、basename 與格式碼。確認後重查 `audio-processing-flow` 與 FFmpeg，以固定參數輸出到 staging，再走完整 FLAC 驗證與原子移入；原檔不改，`library.json` 只存原 basename、`sourceFormat` 與 `conversionFormat: flac`。
- 媒體經 `utawakui-media:` 交付：scheme 與 handler 在 `electron/main/mediaScheme.js`／`mediaProtocol.js`，`electron/lib/` 只提供 path／range 工具；resolver 只接受 track id 與 allowlisted asset 名稱。
- 空間：`library/storage.js` 依 allowlisted 結構掃描實際大小；`libraryStorageHandlers.js` 只有 inspect／set-policy／cleanup 固定 IPC。見[空間管理契約](contracts/library-storage-management.md)。
- 播放紀錄：`playbackPersistence.js` 保存到 userData；同一 qualified event 也更新 main 私有的 `playback-usage.json`（去人聲 LRU 用的 `lastPlayedAt` 與只讀投影的 `playCount`）。

### 藝人、照片與封面

- 藝人整理（[ADR 0022](adr/0022-artist-identity-and-organization.md)）：`artists/artistIndex.js` 依有序演出者 credit 建立分組；`artistOrganization.js` 把已確認 credit 投影到 stable UUID entity，不改寫曲目 metadata。`artists.json` 保存 revision、entities、catalog facts 與最多 20 筆 undo，原子寫入並備份損毀檔；未整理藝人用衍生 hash id，舊 id 有 redirect。Index 在首次請求時才讀取。
- Merge／split／顯示名稱／undo 經固定 IPC，以 expected revision 防止覆寫；renderer 只傳 id 與最多 200 字的名稱。`artistIdentityService.js` 經全 App 1.1 秒的 MusicBrainz scheduler 自動整理：重查 `provider-flow`、single-flight、每輪最多 64 次，只自動套用有本機曲目佐證的唯一 exact name／alias；相同 MBID 自動合併，split 保存 negative evidence。Renderer 永遠拿不到 MBID 或原始回應。
- 藝人照片：`artistPhotoService.js` 在 `provider-flow` 開啟時，以 yt-dlp 讀第一署名曲目多數非 Topic 頻道的頭像，經 `artwork/image.js` 驗證下載（只允許兩個 Google 圖片 host）寫入 `artists/<artistId>/`。明確的線上候選搜尋由 `artistPhotoCandidateService.js` 在 Provider Python 做一次匿名 YT Music 查詢，renderer 只拿到 candidate id 與驗證後的 bytes，一律由使用者確認。見[照片契約](contracts/artist-photo-provider.md)。
- Music identity：`electron/lib/musicIdentity/` 是 provider 中立的逐軸 evidence 純 domain，不連網、不寫檔，也不決定總分或自動保存；歌詞（`lyricsProviders/recordingPolicy.js`）、匯入（`importRecordingPolicy.js`）與封面各自映射並保有自己的門檻。 Consumer 直接匯入所需子模組；跨模組驗證位於同目錄的 integration test。
- 封面候選：`musicbrainz/`、`coverArtArchive/` adapter、`artwork/discoveryService.js` 的短期 opaque session 與 `artwork/releasePolicy.js`。Main 擁有節流、快取、redirect allowlist 與圖片驗證；renderer 以 blob URL 預覽，不 hotlink。只有曲目資訊的單一 Save 才套用，失敗即還原 `thumbnail`／`artwork.json`。見 [identity 契約](contracts/music-identity-evidence-contract.md)與[曲目編輯契約](contracts/track-editing.md)。

### Folder 頁面物件

`library/folderPageObjects.js` 持有 `folder-page-assets.json` v4（v3 的 `assets[]`／`layouts[]` 在讀取時遷移）。原生 picker 每次只選一張 JPEG／PNG／WebP，驗證 bytes、magic 與尺寸後複製到 `folder-page-assets/<assetId>/`。新物件放在 bottom region 的 4×3 格點，加 ±0.04 jitter 與隨機左右 0.75°–4°，隨機來源可測試且不進 render path。`saveFolderPageLayout` 整批驗證後一次寫入，同頁 order 壓回 1..n。`folderPageObjectHandlers.js` 重驗 entity 存在，preload 只有 list、choose-photo、save-layout、remove 等固定 intent；圖片只經 `utawakui-media://folder-asset/` 路由。合併後的藝人頁投影所有 credit 頁的物件，新物件仍寫在真實頁面。Renderer 端由 `useLibraryFolderObjects.js` 持有狀態，`LibraryFolderArtifactLayer.vue` 以 type registry 投影到單一 Folder canvas。行為見 [Folder 頁面物件契約](contracts/folder-page-objects.md)。

### 演出安排與 BGM 儲存

- `performanceSessionPlan.js` 在 library root 原子保存 `performance-session-plan.json`，只接受 bounded ids、mode、labels、驗證狀態、cursor、revision 與 progress；`performanceSessionPlanHandlers.js` 每次以 main 推導的 playlist 與曲庫驗證順序與可用性。Set-progress 以獨立 `progressRevision` 驗證；每個 library 在 process 首次操作時把殘留 playing 恢復為 interrupted。
- `performanceSessionArchive.js` 在同一文件保存 sessionId、逐次時間軸與封存，同次 atomic write 封存並輪替空白新場；舊 id 重試不清新場。`performanceSessionHistoryHandlers.js` 序列化 archive／指定場次讀取／預覽與歌單保存；確認時重算 token，`playlists.savePerformancePlaylist` 一次保存完整歌單與冪等 key。現有 runtime globs 封裝新模組，無外部依賴。
- `bgmStandbyPlan.js` 原子保存 `bgm-standby.json`：單一 track id、position 與音量／mute／fade／Dim／pre-roll／post-roll（loop 固定）。Schema v3 預設 fade-out 0.6s、pre-roll 0.75s、post-roll 1.0s、fade-in 1.0s、音量 0.25、Talk −12 dB；Talk 不持久化。

### OBS 與資源監視

- `obsAdapter.js` 只在 `obs-integration` 啟用且期望連線時 lazy 載入 SDK，只讀版本、直播／錄影狀態與時間戳；握手與請求有期限，逾時淘汰 transport 並退避重連，舊連線不得回寫。失敗分類為有限的公開原因，不暴露 endpoint 或例外。密碼只以 `safeStorage` 加密存在獨立檔案，不可用時拒絕設定。
- `sessionHistoryService.js` 消費 confirmed performance identity：安排由 main 驗證 sessionId＋itemId，安排外由 App 的 `usePerformanceHistoryObserver` 訂閱 player.onPlaying 後送 epoch／playbackRevision／trackId。OBS ready／degraded 且對應輸出 active 才擷取獨立快照；安排在 progress playing 保存 occurrence，離線時間為 null。標記綁定 main 場次 context，封存先 flush。OBS convenience log 保留既有略過門檻與 Settings 入口，production 不再由 Output trackId 變更觸發。`obsPowerSaveBlocker.js` 只在直播或錄影中防止螢幕休眠。
- `appUsageService.js` 每 3 秒發布 CPU／RAM；平時只讀 `app.getAppMetrics()`，`heavyJobScheduler` 忙碌時才補量子程序。

### 音訊處理與分析

- `audioProcessing/separationQueueService.js` 是 main 記憶體內的序列佇列，以 `(trackId, recipeId)` 去重，每首開始前重查 gate、依賴、來源與結果；只有明確重新準備才覆寫。佇列狀態只代表本次 session，manifest 才是結果權威；清除紀錄不刪除結果。`separationHandlers.js` 把狀態送到 `mainWindow.js`，taskbar 顯示 aggregate progress、paused 或 error。
- `audioProcessing/structureAnalysisAutoQueue.js` 是匯入後的去重單工佇列，重查自動分析偏好、gate、capability 與 sidecar 是否最新，手動分析結束後才執行；失敗不回滾匯入。
- Renderer：Settings 的 `useMusicAnalysisSettings.js`／`MusicAnalysisSettingsRow.vue` 管理 lifecycle 與自動分析偏好；`analysis/useMusicAnalysisCapabilitySession.js` 依 bridge 共用 capability 投影。F5 工作台 `useMusicAnalysisWorkbench.js` 只做單曲強制執行、批次重跑與診斷；Music M2 的 `useMusicAnalysisReferenceAnnotation.js` 持有人工標註草稿。見[音樂分析契約](contracts/music-analysis.md)。

## 權威狀態與資料

| 資料                      | 權威 owner                         | 投影／持久化                                                                                |
| ------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| 曲目存在                  | 曲庫檔案系統                       | `library.json` 只補 scalar metadata                                                         |
| 曲目加入時間              | Main library／import               | 新匯入寫 `importedAt`；舊資料以音訊 mtime 相容投影                                          |
| 播放時間與狀態            | Renderer HTML audio element        | Main、taskbar、SMTC、Output 只收投影                                                        |
| 演唱音訊偏好              | Main config                        | `config.json.audioPreferences`；preload seed 第一幀                                         |
| Queue／目前曲目／歌詞     | Renderer composables               | Projection Hub 驗證後給提詞器與 Overlay；提詞器操作經 revision／track 驗證回到原 owner      |
| 最近播放                  | Main playback persistence          | 本機 bounded JSON                                                                           |
| 完整最後播放索引          | Main playback persistence          | Main 私有，只供去人聲 LRU                                                                   |
| 啟動恢復                  | Renderer player／queue 投影        | Main 驗證並原子保存；啟動只 paused rehydrate                                                |
| 演出安排                  | Main session plan store            | Library root bounded JSON                                                                   |
| BGM 準備                  | Main BGM plan store                | Library root `bgm-standby.json`                                                             |
| BGM transport／交接       | Renderer BGM deck／coordinator     | HTML audio 事件與唯讀投影                                                                   |
| Feature confirmation      | Main config                        | Renderer 只顯示與提交 allowlisted intent                                                    |
| 歌詞／分析／分離 sidecars | Main library services              | Renderer 只提供 track id 與產品 intent                                                      |
| 曲庫空間政策              | Main config／library service       | Renderer 只收分類容量並提交 allowlisted 政策                                                |
| 依賴 registry             | `shared/featureDependencies.json`  | Main 解析 URL、hash、路徑、模型與參數                                                       |
| OBS endpoint／密碼        | Main config／加密檔                | Renderer 只提交 bounded 設定                                                                |
| OBS session history       | Main session history service       | 本機 JSON；renderer 只讀                                                                    |
| CPU／RAM 觀測             | Main usage service                 | Titlebar 只收百分比                                                                         |
| 藝人 index／整理          | Main artist index／organization    | `artists.json`；renderer 只送 opaque id、名稱與 revision                                    |
| 藝人照片                  | Main artist photo services         | `artists/<artistId>/`；renderer 只送 id 與選圖／移除／候選 intent                           |
| 曲目編輯草稿              | Renderer editor＋Main path session | Main 持有本機路徑，單一 Save 才寫入，失敗回滾封面                                           |
| Folder 頁面物件           | Main folder object store           | Library root manifest＋opaque 資產目錄；renderer 只送 page／key／placement／Pin／order 批次 |

## Feature Gates 與最小依賴單位

| 產品動作                      | Gate                    | 最小 managed unit              | Lifecycle                                                  |
| ----------------------------- | ----------------------- | ------------------------------ | ---------------------------------------------------------- |
| 本機匯入、曲庫、播放          | 無                      | 無                             | 永遠可用                                                   |
| 本機相容轉檔                  | `audio-processing-flow` | FFmpeg                         | 使用者明示才執行；缺依賴不影響直接匯入                     |
| Provider 取得／搜尋／backfill | `provider-flow`         | `yt-dlp-provider-tool` runtime | Embedded Python、yt-dlp、provider 與 plugin 原子驗證與啟用 |
| 外部歌詞                      | `lyrics-flow`           | 無                             | 每次外部請求都檢查                                         |
| Quick／general 分離           | `audio-processing-flow` | FFmpeg＋所選 model             | 各自 install／repair／remove                               |
| BPM／節拍分析                 | `audio-processing-flow` | Beat This! `small0` capability | Settings 管理；就緒後新匯入依偏好排入佇列                  |
| Audio Python capabilities     | Capability policy       | Immutable lock／generation     | 獨立 runtime family、scheduler 與 lease                    |
| OBS loopback 輸出             | `public-output-flow`    | 內建 Overlay                   | Start／publish 受 gate；stop／status 永遠可用              |
| OBS 狀態與時間戳              | `obs-integration`       | `obs-websocket-js`             | Main lazy adapter、加密 credential、唯讀                   |

自動分析是 gate 內的預設行為；更新檢查不受任何 gate 保護。兩者定義見 [PRODUCT](../PRODUCT.md#feature-gate-語意)。研究用的 reverse provider 驗證在 `scripts/` 的獨立 runtime，不屬於任何產品 gate、啟動、封裝或 provider registry。

`electron/lib/featureDependencies.js` 是相容 barrel，實作分為 registry、download、safe archive、manifests、provider runtime、FFmpeg、models 與 lifecycle。每個 active 依賴對應一個 gate；registry 的 id、版本與相對路徑須經 main 驗證才解析到 `userData/dependencies`，移除以依賴 family root 為單位，不碰曲庫或分離結果。系統與 managed FFmpeg 共用 `resolveFfmpegRuntime()`。HTTP 下載有 connect／idle deadline，PowerShell 解壓有 hard deadline，yt-dlp 子程序以輸出活動重設 idle deadline。外部服務的冷卻由 `providerServiceCooldown.js` 處理，見[外部服務請求契約](contracts/external-service-request-policy.md)。

## Shared Boundary

`shared/` 集中跨 main、renderer、Browser Source 與獨立服務使用的純契約。根目錄 JSON 提供功能 gate／依賴、值域與版本資料；JS／MJS 提供驗證與解析，不持有檔案系統、視窗或服務生命週期。CJS 契約保留 main 的同步 `require()` 用途，不為統一副檔名新增相容入口。

`shared/presentation/` 是 canonical 純呈現與 timing 投影；`overlay/shared/` 保留 Browser Source 路徑轉接。外觀 schema 只在 `shared/outputAppearance.mjs` 維護；Manga 尺寸從 `mangaFrameTextLayout()` 的 layout 結果取得。新增共用函式前先核對這些 owner，避免在各 surface 重寫相同投影。

`shared/assets/fonts/` 保留五套實際使用的字型及各自的來源／授權全文。Renderer CSS 經 `viteSharedAssets.js` 使用封裝內唯一的 shared 字型副本；Output 仍只開放明列的 HTTP module／font routes。封裝與測試邊界見 [release inventory](operations/release-inventory.md#packaging-locations)。

## Output Boundary

Renderer 是 player／queue／lyrics 的來源，Main Projection Hub 是所有外部投影的收斂點。傳輸、狀態與頁面生命週期見 [Output runtime](contracts/output-runtime.md)，外觀與模板呈現見 [Output 外觀](contracts/output-appearance.md)。

- Renderer 分層：`useOutputRuntime.js` 是唯一 public facade（狀態、設定、port 復原、start／stop、slot 保存）；`output/useOutputRuntimeStatus.js` 集中狀態正規化與錯誤；`output/useOutputProjectionPublisher.js` 發布 player／queue／lyrics／讀音／音樂結構投影，負責 document-before-state 排序、`sourceEpoch` 與各 stream revision；`output/useSpoutOutput.js` 只處理 Spout 狀態、FPS 與 start／stop。後三者都以具名 callback 取得邊界。
- 外觀：`shared/outputAppearance.mjs` 單一擁有欄位型別、預設、值域與模板相容性；元素宣告由 `shared/outputTemplateElements.mjs` 擁有（純資料，目前只有 cover-player），元素設定以 `element.<元素>.<屬性>` 鍵保存（ADR 0027）；Electron 在 slot 保存邊界驗證、renderer 依欄位 metadata 建控制、Browser Source 再正規化。`useOutputAppearanceAutosave` 以 350ms debounce、single-flight、latest-wins 保存，切頁或套用模板前 flush，失敗保留草稿。最近／常用色票是 Output workspace 的偏好，不影響模板預設。Live Stage 的本機字型只在使用者操作後經 Local Font Access 取得，permission handler 只允許可信 main frame。歌詞呈現策略由 `lyricsPresentationPolicies.mjs` 另行擁有。
- Server：`electron/lib/outputServer.js` 持有 service API、WebSocket 與投影交付；`outputServer/http.js` 是唯讀 HTTP plane，持有 exact route、asset cache 與 security headers，只透過具名 getter 讀 snapshot，不 import `ws`。Browser Source 只讀 snapshot 與 allowlisted media；封面由 track id 經 `/media/artwork/` 解析。`shared/presentation/` 放跨 runtime 的呈現邏輯，`overlay/shared/` 只放 route adapter。
- 收據歌單：`shared/presentation/receiptSetlist.mjs` 持有純frame／排序／分段，`overlay/setlist/receiptView.mjs` 與 `receiptMotion.mjs` 共用於Browser Source及Vue預覽。`queue.document.receipt` 是可選的有界完成明細與來源總數；一般播放history不冒充completed。既有queue-board保留；exact routes與材質封裝見release inventory。
- 舊 slot 的 `focus-line`／`now-next` 讀取時回退為 `karaoke-stack`／`art-card`；新套用須通過 allowlist，純 helper 保留舊 id 的相容解析。
- 封面電台：`coverPlayerMotion.mjs` 僅協調封面／metadata切歌fade，播放器的volume／mute／progress由`artworkLayout.mjs`獨立即時呈現；reduced-motion、恢復與模板切換清除舊過場。portrait預設360×480，portrait-large保留480×640，兩者共用同一3:4設計座標。
- Display 頁：`ObsOutputWorkspace.vue` 擁有畫面分頁、編輯／模板切換、runtime 狀態與 start／stop；`ObsOutputSplitLayout` 擁有分割與收合；`useOutputWorkspaceNavigation` 只保存 session 寬度。Gallery 的預覽由 `ObsTemplatePreviewStage` 單一管理，hover 250ms 或明確播放才載入 `ObsTemplateMockup`。
- Spout2 重用 Lyrics route：main 推導固定 surface 與 loopback URL、重查 gate、監督 helper；helper 載入 native bridge、擁有 offscreen 視窗與 sender、驗證並釋放每個 texture。Output server 重建前先停止 helper。見[整合契約](contracts/integration-adapter-contract.md#spout2-native-video-profile)。
- 開發用 `scripts/output-appearance-audit.mjs` 與 `scripts/output-performance-probe.mjs` 使用隔離 profile 與合成資料，不進封裝，見[驗收 runbook](operations/output-appearance-acceptance.md#f4-隔離-capture-重跑)。

## 錯誤與 Diagnostics

1. Handler 在 gated 操作開始前檢查；gate 關閉是預期流程，不記為失敗。
2. 失敗由 main diagnostics service 保存原始錯誤與有限分類 context。
3. IPC 只回傳 bounded `UTAWAKUI_APP_ERROR`，不含路徑、URL、stderr 或 provider body。
4. `diagnosticRecorded: true` 防止 renderer 重複保存；main 記錄失敗時 renderer 才保存安全 fallback。
5. 下載失敗值在 `shared/downloadFailureValues.json`；main 分類、renderer 顯示文案。

`diagnosticsLifecycle.js` 記錄 process／webContents 失敗；只有主視窗的致命 renderer 結束、main-frame 載入或 preload 失敗、無回應會交給 `rendererRecovery.js`，每個 process 最多一個原生對話框（重新啟動／退出）。Performer、startup probe、Spout helper 與 Chromium 子程序各自處理。

使用者回饋：`electron/lib/feedback/` 是純函式與注入式 fetch client，`feedbackHandlers.js` 是唯一 IPC 邊界，沿用 `{ ok, errorCode }` 結果。Payload 重用 `buildDiagnosticsSupportBundle`，只有錯誤回報附最近 50 筆。Renderer 的 `useFeedbackReport.js` 是唯一 singleton，所有入口呼叫同一 `openReport()`；`lyricsIssueReport.js` 只投影有界的歌曲／來源資訊，不附歌詞、音訊或路徑。CSP 沒有 `connect-src`，上傳只能由 main 發出，固定送到 `https://api.utawakui.llazypilot.com/feedback/submit`。Relay（`services/feedback-relay/`）獨立部署、不在封裝內，見 [ADR 0016](adr/0016-user-feedback-intake.md)。

## Packaging Boundary

- `dist/` 是 Vite renderer 輸出；`overlay/` 不進 Vite bundle。`electron/`、`shared/` 與內建 resources 進 `app.asar`，需外部解析或執行的檔案以明確 `asarUnpack`／`extraResources` 交付。完整對照見 [release inventory](operations/release-inventory.md)。
- Electron 43；實際 patch 由 npm lock 與 `electron-builder.yml` 一致釘選，見 [release inventory](operations/release-inventory.md#current-build-shape)。關閉 Node options 與 inspect fuses，開啟 ASAR integrity 與 only-load-from-ASAR。`RunAsNode` 暫時保留給 yt-dlp EJS runtime（ADR 0005）與 ONNX 環境 probe（ADR 0026）；`GrantFileProtocolExtraPrivileges` 保留給主 renderer 的 `file://` 載入，兩者待替代方案完成後關閉。
- Provider、FFmpeg、models 與 Audio Python 存在 userData 依賴目錄，不綁入 installer，也不在啟動關鍵路徑。
- 第三方授權全文 `third-party/NOTICES.txt`／`manifest.json` 經 `extraResources` 交付到 `resources/third-party/`，由 generator 與 afterPack verifier 檢查；Electron／Chromium 與字型 notices 各自保留。
- 更新：`appUpdateService.js`／`appUpdateHandlers.js` 驅動 `electron-updater`，`useAppUpdate.js` 是唯一 renderer owner；目前為 unsigned updater。依 ADR 0002 保留 `electron.exe`，只有 `detectPackagedRuntime()` 以 `resources/app.asar` 確認為正式產物時才啟用 updater override，開發啟動不接觸公開 feed。每次 check／download 若未收到 terminal 事件一律轉為可重試錯誤；下載有 cancellation token 與 idle deadline。CI 以 `scripts/release-baselines.json` 釘選的已發布 installer（v0.4.0 每次執行）覆蓋安裝候選版並驗證資料保留、啟動與移除。
- Signed manifest foundation：`updateManifestClient.js`、`updateManifestVerification.js` 與 `tools/update-signing/` 把 installer basename／size／SHA-512 綁到 `UpdateInfo`，schema v2 使用 Ed25519 多簽章與 canonical bytes；release workflow 分為 package、sign、publish。`signedManifestEnabled` 仍為 false、只有 development key。Installer 維持 unsigned channel。
- `obs-websocket-js` 隨 production 依賴封裝，但停用時不載入 SDK、不開 socket。
- 「有什麼新變化」內建於 `shared/releaseAnnouncement.json`，`useAppAnnouncement.js` 比對 `lastSeenAnnouncementVersion` 只顯示一次；發版流程見 [release notes 範本](operations/release-notes-template.md)。

演出安排的 collection append 由既有 performanceSessionPlanHandlers 解析 sourceId 對應的 main-owned playlist membership，store 共用 collection snapshot builder 並在一次 mutate 內檢查總容量及追加。preload 的固定 append-from-collection intent 只攜帶 sourceId；一般播放queue與演出occurrence保持不同owner，Sidebar以明確動作選目的地。

封存場次追加由固定 append-from-archive intent 只送 sessionId，main 在原 plan store 的一次 mutate 內讀取權威 archives、驗證總容量並建立 queued occurrences；重唱、手動及既有顯示 snapshot 保留，原目前場次與 audio owner 不改。Renderer 的 usePerformanceQueueActions 共用單曲、collection 與archive三種明確來源，封存主頁沿用 CollectionActionRail。
