# 現行架構圖

本文件只描述 production code 已採用的 ownership 與 dependency boundaries。產品範圍
以 [spec.md](spec.md) 為準，決策理由保留在 [ADR](adr/)，詳細 protocol 則由 focused
contracts 與 tests 管理。

## Runtime Ownership

| Runtime                                               | 責任                                                                                                                                 | 不可持有                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Electron main (`electron/main/`)                      | Window lifecycle、IPC trust boundary、feature gate enforcement、local services、diagnostics                                          | Renderer reactive state、client-provided filesystem paths                                |
| Pure main libraries (`electron/lib/`)                 | Filesystem、provider、processing、dependency 與 sidecar logic                                                                        | BrowserWindow lifecycle、renderer presentation                                           |
| Preload (`electron/preload.js`)                       | Intent-based、固定 channel 的窄 IPC bridge；部分 dev-only channel 依 flag 條件註冊                                                   | Node API passthrough、任意 channel 或 path API                                           |
| Renderer (`src/`)                                     | Vue UI、interaction、player／queue／lyrics owners                                                                                    | Node／Electron import、dependency URL、model 或 executable path                          |
| Performer window (`electron/main/performerWindow.js`) | 第二個 sandboxed BrowserWindow：Self-View 呈現、獨立 preload、snapshot 讀取、bounded lyrics offset intent 與 normal bounds lifecycle | Core playback／queue／lyrics 權威狀態、lyrics source identity、renderer-derived geometry |
| Shared (`shared/`)                                    | Scalar JSON contracts 與純 cross-runtime presentation projections                                                                    | Filesystem、Electron、browser globals、mutable service state                             |
| Browser Source (`overlay/`)                           | OBS delivery adapters、DOM rendering 與獨立 visual tokens                                                                            | Control-panel tokens、canonical product-state ownership                                  |
| Spout helper (`electron/main/spoutHelperEntry.js`)    | Windows offscreen Lyrics surface、native Spout sender、texture release                                                               | Core state、renderer IPC、Spout receiver ownership                                       |

`electron/main.js` 是 composition root：設定 app identity、註冊 privileged scheme、建立
services，再將具名 dependency 注入各 domain handler。Handler 不以共享 context blob
隱藏依賴，也不彼此直接協調；跨 domain 流程由 composition root 建立的 service 負責。

Performer window geometry 由 main-owned config 與 window manager 共同持有。Config 只接受
bounded `{ x, y, width, height }` normal bounds；window manager 對 move／resize 做 debounce、
在 close flush，並排除 fullscreen／maximized geometry。建立視窗時由 composition root 注入
Electron `screen` work area，window manager 再以 32px margin 將保存值 fit 回目前 display；
沒有有效保存值時使用 960×540 並相對主視窗所在 display 置中。Reading-scale intent 不進入
這條 geometry 路徑，renderer 也沒有 bounds IPC。

`electron/entry.js` 保持 dependency-free process dispatcher；main composition root 與 Spout
helper bootstrap 各自在 ready／建立任何 `BrowserWindow` 前呼叫 `app.enableSandbox()`。
各 `BrowserWindow` 仍須明確宣告 `sandbox: true`、`contextIsolation: true` 與
`nodeIntegration: false`。主視窗、Performer、startup trace probe 及 Spout offscreen window
都透過 `electron/main/webContentsSecurity.js` 拒絕 popup，並只允許各 owner 的 exact
navigation URL；main-frame navigation 與 redirect 都採相同 fail-closed policy。這些是
固定 runtime invariant，不是 Settings 可切換的產品偏好。

四種 window 都明確設定 `navigateOnDragDrop: false`、`webSecurity: true`、
`allowRunningInsecureContent: false` 與 `webviewTag: false`。因此 feature-level Queue／Folder
拖曳不會被 Chromium 升級成頁面 navigation，HTTP loopback Overlay 也不取得 insecure
content 例外；DevTools 只在 main／Performer 的明確 development launch 啟用，startup probe
與 Spout helper 永遠關閉。這些同樣是 shell invariant，不建立一般使用者 toggle。
Startup trace 預設 probe 仍使用 profile session，包含首次持久化 Cookie store 初始化成本；
明確的 `--startup-trace-memory-probe` 僅在 trace 啟用時將診斷 probe 放入獨立 memory partition，
用來對照既有 Spout helper 的非持久化 session lifecycle。正常啟動與產品視窗不受此 flag 影響。
Trace 的 baseline metadata 記錄 allowlisted `probeSession`（`profile`／`memory`）；效能 harness
驗證實際模式與請求一致，避免舊 executable 忽略 flag 卻產生誤標記的結果。
正常 App 在 `app.whenReady()` 透過 `electron/main/previewSession.js` 並行準備原本的
default session Cookie store：只查詢固定 loopback URL，丟棄 Cookie 值，不發出 HTTP
請求、不寫 Cookie 或變更 session／proxy／cache 設定。主畫面、Output server 與設定載入
不等待準備完成；同步或非同步失敗均回到既有導航的初始化／錯誤處理。這讓稍後進入工作臺的
HTTP iframe 重用已初始化的 store；立即進入時仍可能有剩餘等待。模板庫 mockup 則由 renderer
本地組合，沒有直接的 Cookie-store 等待。外部 OBS 與既有 Spout memory session 不由此 helper 管理。

Raw Electron `ipcMain` 只在 composition root 交給
`electron/main/ipcSenderPolicy.js`。所有未特別列出的 channel 預設只接受目前主視窗的
main frame；Performer 只獲得自身 window controls、snapshot／status、renderer diagnostic、
三段 reading-scale preference 與固定 lyrics offset action。後兩者是明確 Performer-only
capability；offset intent 只允許 action、revision 與 track id，main 驗證後轉送主 renderer，
不得包含來源 filename、路徑或任意 offset。驗證同時比對 `event.sender`、`event.senderFrame` 與 owner
`webContents.mainFrame`，所以同一視窗內的 subframe 也不繼承 preload capability。拒絕事件
只記錄一次 bounded channel／capability／kind，不跨 IPC 暴露 URL 或 frame details。

主視窗 density 由 `electron/main/windowState.js` 的原生 `BrowserWindow` 狀態擁有：
windowed／restored 投影 `compact`，maximize／full-screen 投影 `standard`。初始 bounded 值
經 `additionalArguments` 同步提供給 preload，後續只透過固定 `ui-density:changed` channel
更新；`src/composables/useUiDensity.js` 驗證後寫入 document root。Renderer 不取得
`BrowserWindow`、不依 viewport 猜測狀態。唯一 production token entry 只對明列的
geometry roles 套用 compact remap；內容 reflow 仍由各 layout owner 決定。Dev-only
`VisualSystemView.vue` 只掛載 `DemoView.vue` 元件型錄；`DemoView.vue` 重用正式
`AppFolderPage` workspace composition，型錄內由 `UiTabs` 固定分類、單一
`UiScrollLayout` 擁有內容捲動。已被 production 採用的整頁 candidate 與其專用狀態不得
留在型錄形成第二份產品頁，migration／adoption status 也不進入 runtime catalogue。owner
檢查順序與歷史見
[Token v2 元件檢查契約](contracts/token-v2-component-review.md)，本文件不重複其細節。
已完成的 production replacement boundary 見
[Token v2 完整替換契約](contracts/token-v2-replacement.md)。Main 與 Performer 的 `#app`
在 Vue mount 前登記為 full-viewport v2 surface；兩個 renderer entry 只載入
`src/styles/tokens.css`。Document root 只投影 theme／density／motion／language metadata與
literal platform `color-scheme`，`body` 只保留 system-neutral mount fallback，registered
surface 承接 canvas／text／font。Shared recipe 由最近的 registered boundary 決定，production
Teleport 進入同 system overlay host，F8 與 isolated prototypes 也只登記自己的 surface。
Token v1 stylesheet、generated invalidation／manifest、migration generator、雙 entry import與
registry migration status均已移除；permanent source gate禁止 v1 scope／payload回流，並檢查
所有 production `--ui-*` reference都有正式或 component-owned declaration。Cross-feature
geometry／palette仍由 feature styles持有，public `overlay/` 繼續只使用獨立 `--ovl-*`。
Electron main／Performer native background與renderer canvas皆使用相同 adopted palette。

`InternalToolsView.vue` 以純資料 `constants/internalTools.js` 將工具分成兩個平面：
Operations 是可重複的產品／支援操作（F5 Music Analysis、F6 Live Diagnostics），
Evaluation 是有明確品質 gate 與結束條件的研究工作（Music M2、F7 Lyrics Provider
Corpus）。F5／F6／F7 仍直達各自工具；Music M2 只由分類導覽進入。四個 View 都是薄
wrapper，唯一 active workbench 才會 mount；`InternalToolsView.vue` 是 registry 中的 v2
composition surface，擁有同 system overlay host，但不改 document root。這個 dev-only route
graph 不改變產品 feature gate、IPC trust boundary 或正式 workflow ownership。

主視窗右側 Dock 由 `App.vue` 與 `useAppRightDock.js` 共同擁有 shell geometry、
surface stack 與 foreground navigation，不接管播放或處理資料。Token v2 Studio
Library metadata 可作為 retained fallback，production Queue 可顯示在前景；PlayerBar 縮圖是
direct metadata intent，會先取消其他前景 surface 再顯示 metadata。`QueuePanel.vue` 與
`src/components/playback/context/TrackContextPanel.vue` 各自只呈現 feature content，並透過 `AppRightDockPanel.vue` 共用
header、單一 scroll owner 與 content inset；播放 queue authority 仍由
`usePlaybackQueue.js` 持有。匯入與伴奏處理共用 shell-owned `PreparationDockPanel.vue`；Titlebar
只保留一個固定 `ListChecks`「曲目準備」controlled disclosure。Dock 與 Queue／Recently Played
沿用相同的固定 `UiTabs` bar header 與 linked tabpanels，在 `ImportDockContent.vue` 與
`SeparationDockContent.vue` 間切換；兩個 feature content 不再各自建立 Dock header、導覽 chrome
或 scroll shell。`ImportSourceField.vue` 在使用者聚焦空白外部來源欄位時，透過窄域
`import:clipboard-suggestion` intent 請 Main 讀取剪貼簿；Main 驗證前景主視窗與主 frame，
僅回傳支援的 YouTube／YT Music canonical 連結。剪貼簿偵測與手動貼上送出共用
`electron/lib/importInput.js` 的 `parseImportSourceUrl`：只保留來源 id、移除追蹤與播放位置參數，
並一致拒絕非 HTTP(S)、帶帳密或含內部空白／控制字元的網址；一般文字搜尋與裸 video id
仍由 `classifyImportInput` 處理。Renderer 以 session 記憶略過的連結，
欄位下方提示只在明確按「貼上連結」時填入，不自動解析或下載；晚到結果受欄位、busy、
Dock active 與卸載失效保護，不記錄或持久化剪貼簿內容。外部來源清單由 Renderer 以固定兩個 worker 投影工作，但 Main 的
`providerDownloadScheduler` 才是全域 admission owner：最多同時執行兩個不同 track id，重複 id
共用同一個工作，queued／active 都可由 bounded track-id intent 取消。每首下載完成後才進入固定
concurrency-one 的 library finalize lane，依序寫入索引、安排 optional sidecars／分析並套用 storage
policy；下載槽不等待這些 finalize 工作，因此網路取得與曲庫提交不會共用同一個資源鎖。Renderer
不提交 URL、path、process id、runner option 或 concurrency，也不提供 thread slider。Import 執行態
只投影「處理中／接下來／未完成／已完成」及必要的逐首停止／批次重試；選取 filter 與 checkbox
只存在於確認態。App shell 是 `useSeparationQueue.js` 的唯一
renderer owner，Titlebar status 與伴奏內容只消費同一 projection。伴奏清單將排序、移除、重試
與清除紀錄收在共用 `SeparationToolbarList.vue`；暫停與繼續依附對應 queue section header，preview 的
「開始準備」enqueue 後由 Main 自動執行，不另設第二列 transport control。Pending
列重用 `useDragReorder.js` 的整列拖曳與 `UiSeparator` drop feedback；低頻操作由右鍵或鍵盤開啟
同一 `UiActionMenu`，不以可見 ellipsis 壓縮曲目資訊，也不繼承播放 Queue 的選取、播放或 artwork action。四種狀態列以
`TrackIdentityRow navigation="artist"` 組合 canonical artist destination；Preparation Dock 先同步
collapse，再由既有 Library owner 完成 destination transition。一次 drop 只送出 bounded
整數 offset，main-owned queue 在單次更新內依相鄰 Pending 項目完成移動。伴奏處理狀態仍由
main-owned separation queue 持有，實際進度與錯誤權威不移入 Renderer。工具列模式的名稱、順序
與預設值由 Lyrics 同用的 `separationPresets.js` recipe catalog 投影；批次完成數屬於 header 摘要，
目前歌曲百分比只由 active row 上方的固定 status lane 顯示一次。`useSeparationPreparation.js`
明示持有 source selection：預設「目前播放順序」，另投影既有 playlist／album；來源或 recipe
改變時立即依 canonical source order 投影「尚未準備／已有伴奏」，並排除同 recipe 已由 Queue
代表的 track。Primary intent 只快照尚未準備的 track ids；既有 current result 只能由「已有伴奏」
section 的明確 regenerate intent 重做。集合失效時回退到播放順序。這個 selector 不提供單曲 picker，
也不改動 Playback Queue／Recently Played authority。Right
Dock 的 expanded resize width、persistent desktop reserved bay、compact overlay、Escape 與 focus restoration
屬於 shell，不得回流到 PlayerBar 或 playlist component。Pointer／keyboard resize separator 只在
expanded state 掛載；collapsed restore control 只保留按鈕局部邊界，不保留全高 rail、resize hit target
或 value semantics。Shell-owned bay仍維持workspace幾何，但其空白wrapper不承接pointer hit testing。
Shell 以 `--ui-shell-workspace-inline-start` 同時定義 Folder 主內容起線與 BGM movable boundary
左界；BGM 仍可覆蓋 Right Dock，right／bottom bounds 不依 Dock 展開狀態改寫。
Queue surface 內的 `UiTabs` 只負責 tab semantics 與 keyboard；`QueuePanel.vue` 持有真實
tabpanel ids、active state 與單一 scroll container。Header 留在該 scroll container 內 sticky，
只有 `scrollTop > 0` 才使用 active／Token v2 共用的 Right Dock background、blur 與 shadow
semantic tokens。Queue reorder 的 pointer drag 由整個 `QueueTrackButton` row 啟動且不提供
獨立 drag icon；artwork 與 `…` action 會排除 drag start。Queue 與 Recently Played 共用
Right Dock artwork cue／overflow action recipe：row hover／focus 顯示由 HTML audio state 投影的播放／暫停 cue，`…` 保留固定 trail
lane 以避免 layout shift，僅在 row hover、selected、focus-within 或 menu open 時顯示。`…`
tooltip 允許曲名依 viewport 換行，但將「的更多選項」保留為不可拆 suffix。Before／after 插入線
在相鄰 row gap 內組合實際 `UiSeparator`，不使用 row border／shadow；row inline size、
`select-none`、排序與 drag lifecycle 仍由 Queue feature owner 持有；可拖曳 row 不使用會裁切 gap overflow 的
paint containment，非拖曳 row 才可保留 `content-visibility` optimization。
shared `UiTrackRow` 不持有排序 semantics。最近播放由 feature adapter 直接
組合 `UiTrackRow`，保留 52／40px recipe，但不繼承 Queue selection、reorder、drop target
或整列 activation。
可重用的曲目身分導覽位於 `src/components/track/TrackIdentityRow.vue`，而非 `ui/` primitive：它以 opt-in `none／album／artist／identity` recipe 組合 `UiTrackRow`、`TrackArtistCredits` 與既有 `useAlbumNavigation`。只有能解析到本機專輯或 canonical artist 的文字才成為 CTA；目的地不存在時保持純文字。adapter 在切換 Library destination 前同步發出 `navigate`，讓 Modal／Dock caller先收合；封面動作、整列選取、播放、排序、trail狀態仍由各feature owner持有。

shell-owned `BgmPlayer.vue` 是唯一 BGM presentation owner；它以獨立 Titlebar disclosure 開啟／關閉，
啟動時常駐初始化 `useBgmSession` 並轉送即時 Titlebar status；完整視覺面板
`BgmPlayerPanel.vue` 到首次開啟才非同步載入。首開後保留面板實例，關閉只移除其 surface，
因此搜尋、Pin 與移動位置不重建；關閉期間仍保留 controller、還原、安全 gate 與狀態訂閱。
視覺面板
在 bounded body 內組合 `BgmTrackPicker.vue` 的本機曲庫搜尋／單曲取代，並以
`BgmPlayerTransport.vue` 呈現目前 BGM、進度與安全控制。它預設位於 PlayerBar 上方並避開 desktop
persistent Dock bay；compact viewport只在Dock overlay展開時避開其footprint。它不是場次面板或 Right Dock surface；Dock footprint 只決定 home anchor／safe edge，
不得覆寫 player-owned inline-size。使用者可在 shell 安全範圍移動並 Pin 位置。
`BgmCurrentSource.vue` 將曲名限制為單行，並整合單一 operational status 與 source-picker disclosure；
phase／deferred restore／bounded public error 由 pure `bgmPresentation.js` 合成一句狀態，不保留獨立
badge width slot。`BgmPlayerTransport.vue` 固定 progress 與 action slots；Play／Pause 共用同一節點，
Talk 是可見文字 toggle，Mute＋Volume 是同一 audio group，Emergency Cut 使用 shared danger intent。
Inactive 時可用同一 transport 明確試播本機 monitor，但不顯示 `OBS 未確認`；已確認 live／record（同時作用時
`live > record`）與 reconnecting 只更新 quiet session context，不覆寫使用者明確關閉。BGM feature 另向
App emit bounded Titlebar status projection，Shell 只中繼，不直接讀 audio controller。Titlebar presentation與source picker是正交狀態；
關閉完整player不停止deck或取消handoff，重新開啟時投影目前狀態。元件只消費
`useBgmSession.js` 的 readonly 投影與 actions，不成為 PlayerBar 模式或 Folder artifact。

Renderer 的 app destination state 由 module-scope `useAppView.js` 單獨擁有。Library／
Performance／Display 進入 `AppFolderLayout`＋`AppFolderPage` 的 Folder workflow branch；
layout family 是 registered v2 surface。`LibraryPage.vue`、`PerformancePage.vue` 與
`DisplayPage.vue` 是 destination-level composition owners。
`LibraryBrowseWorkspace.vue` 以完整 Library v2 boundary 包住 `AppFolderPage`，並持有 Folder artifacts；`LibraryBrowseContent.vue` 把 library identity／search 放在 fixed header，將 loading／error／empty／track list 留在唯一 document scroll body。`LibraryArtistIdentityController.vue` 單獨持有 artist identity modal 與 mutation orchestration。Registered boundary 只提供 token scope 與 local overlay host，不進入 document flow 覆蓋 neutral page paint。`AppFolderContentField.vue` 擁有 tracks／states 的 recessed neutral background，並隨 primary content 結束；loading／error／empty 使用有限高度的 `state` variant，正常列表維持 intrinsic terminus。Playlist／album dossier 與 toolbar 留在 field 上方，album 的本機同藝人專輯與曲庫摘要留在 field 下方的 document surface，且不新增第二個 scroll owner。`AppFolderPage`把`folder-tools`與Folder extension放在同一個第2列；extension直接顯露`AppFolderLayout`的單一Folder material，不建立滿版pseudo child surface、top seam、獨立工具列row或無效高度。`folder-tools`是row 2 upper-end的Folder背景控制，不繪製dock surface且位於floating plane下方；外層Scrollbar仍為最高paint owner。`LibraryBrowseWorkspace`只透過共用方形Command `UiIconButton`＋`UiActionMenu`提供新增照片／便條intent、loading與focus return，並以`useAppConfirmation`確認物件刪除；便條的建立與編輯由`LibraryBrowseWorkspace`開啟`AppFolderNoteEditorModal`（標題＋內文草稿，按儲存才經`useLibraryFolderObjects`寫入），不在紙上直接輸入；長便條由`UiFolderArtifact`的`capped`在紙上限高並以ResizeObserver回報是否被截斷，`LibraryFolderArtifactLayer`只讓被截斷的便條成為可啟用物件，啟用後由`LibraryBrowseWorkspace`開啟分頁閱讀的`AppFolderNoteReaderModal`；照片的拍立得短文字與說明便條（標題＋內文）同樣只經`AppFolderPhotoTextEditorModal`與`folder-page-objects:update-photo-text`儲存，說明紙色由編輯視窗選擇（兩個編輯視窗共用`src/utils/notePapers.js`的紙材清單與輪替），main只接受既有紙材；便條紙材是main在建立時隨機寫入payload的`paper`，renderer只依token與`src/assets/folder-paper/`的顆粒素材繪製，canvas在可編輯欄位上讓出拖曳與鍵盤移動。collection command rail不再轉送page-owned control；`useLibraryFolderObjects.js`是頁面物件的state／intent owner，以key為單位合併最新版面並以單一批次寫入。`LibraryFolderArtifactLayer.vue` 以type registry把 durable objects 與 page-scoped derived artist note 投影到同一個 Folder-wide canvas，避免座標與 stacking authority 分裂，並把main projection的rotation交給既有rotation-aware canvas；未登記的type不渲染。照片 activation 使用 renderer-root `UiModal`的shell-free media presentation；thumbnail與Preview都組合shared `UiPhotoFrame` material與filter，thumbnail依main保存的`ratio`做cover，`UiPhotoFrame`同時持有`frame`與`ratio`，Preview沿用同一相框，Preview使用intrinsic contain。Media grid在content的inline-end保留top-aligned vertical action rail；close先於caller action出現在DOM與Tab順序，remove使用shared `UiIconButton danger` intent、close維持neutral，content bounds會扣除rail與gap；frame material不是Modal shell。`UiModal`的backdrop預設保持inert，只有media caller opt in self-click dismissal；同一owner管理成對enter／leave transition、Escape、focus與finite open-order stack，`LibraryBrowseWorkspace`保留asset snapshot到leave完成後才釋放。所有物件只有一種paper／side／bottom region-local placement，Pin只鎖使用者移動；shared geometry按placement投影，side reserve不足時暫時fallback到底部且resize不寫回canonical pose。Import 不再擁有 destination 或 main-area page。Window Titlebar 的「曲目準備」controlled disclosure 由 shell 切換 retained `PreparationDockPanel.vue`，並保留目前 Library／Performance／Display 目的地；再次點擊只關閉這個前景 surface。短任務與單曲候選由 `ImportDockContent.vue` 在 Right Dock 內完成；playlist／album 的多選、filter、retry 交由寬版 `ImportReviewModal.vue`。Dock content 與 review modal 共用 module-scope `useImportSession`，不建立第二份 job queue 或下載歷史；完成項目的持久 truth 仍是 Local Library。Dock快速結果與Modal批次確認都直接組合 `UiTrackRow`：Import只在lead／trail加入選取、action、下載狀態與錯誤恢復，不帶入`TrackTable`的collection browse grid，也不帶入`QueueTrackButton`的播放、拖曳或排序行為。Collection摘要以整列action開啟review，trail維持object status；Modal次要批次操作使用既有`UiIconButton`與accessible label，footer只保留帶數量的主要動作。當row已表達成功時，Dock不重複surface success copy，錯誤與recovery仍保留。Separation queue以`AppRightDockSection`、`TrackIdentityRow`與既有Right Dock section／content gap token沿用相同heading tone、row密度與state surface；progress、reorder、retry與cancel仍由Separation owner持有。Pending順序由list位置與drag feedback表達，不再顯示ordinal／waiting copy；低頻row action只由pointer context menu或Context Menu鍵／Shift+F10開啟，不保留會壓縮artist文字的visible ellipsis。Terminal item以`UiStatusIcon`＋Tooltip／ARIA呈現狀態。

`TrackTable` 的 Album cell 先由 `useAlbumNavigation.js` 解析 source-backed album membership；若曲目只有 album scalar metadata，則由 `usePlaylists.js` 持有互斥的 session-only `selectedAlbumReference`，`albumReference.js` 以正規化專輯名稱從目前 filesystem-backed library 即時推導唯讀成員與 queue source id。這個 fallback 不寫入 `playlists.json`、不建立 collection membership，也不顯示 source-owned album mutation。Profile將column drag、track-row sort與Playlist manual row reorder分成`canReorderColumns`、`canSortTrackRows`與`canReorderPlaylistTracks`；Library all／local／Playlist可依可見欄排序rows，Album／Artist在資料投影邊界忽略殘留sort state並保持canonical order。Column descriptor分開`headerAlign`與value `align`，並以`numeric`投影tabular numeral；本機播放次數的header／value皆靠inline end，原始數值透過shared grouped-integer formatter投影成目前`zh-TW`locale的三位逗號分組。固定伴奏狀態／控制是 duration cell 內部保留 slot，不是獨立 header／grid column；因此 header、row、resize guide 共用同一欄界。Duration cell以`--ui-space-4`分隔伴奏控制與時長數值；尾端actions lane則固定為對應`--ui-space-5`的單一chooser／overflow control track，不另加spacer。
`DisplayPage.vue` 擁有 Display／local overlay host 的完整 v2 boundary，並直接組合 `ObsOutputWorkspace.vue`。
`ObsOutputWorkspace.vue` 在 `AppFolderPage` fixed header 放置唯一的畫面分頁（歌單／歌詞／播放中）、編輯／模板模式切換、runtime 燈號與啟動／停止，以及跳到 Settings「公開輸出與 OBS」的輸出設定入口（`openSettings('output')`），不再增加重複的可見頁名。連接埠、自動啟動、畫面延遲與 Spout2 由 `OutputRuntimeSettingsBlock` 在對外輸出 gate 啟用後呈現。
Lyrics 與 local overlay host 同樣使用完整 v2 boundary。
Output 的 `AppFolderPage surface="canvas"` 填滿 Folder 內緣；`ObsOutputSplitLayout`
只擁有共用工具區、CSS token bounds、pointer／keyboard resize、收合與具名 pane scroll。
`useOutputWorkspaceNavigation` 保存兩模式共用的 renderer-session requested width／collapsed
及極窄 pane reveal；有效寬度由容器推導，不寫入 template appearance 或 main config。
工作臺保留 preview 工具與外觀 draft authority，將原工具 Teleport 到共用工具 slot；
模板庫搜尋只篩選陳列，不改 browse／applied 分工。外部 Dock reservation 不參與此分配。
`PerformancePage` 固定以 workspace mode 組合 `PerformanceWorkspace`，以 `UiTabs` 依序切換「歌詞」與
「播放安排」；直接進入演唱工具預設開啟歌詞，明確的準備 intent 開啟播放安排。
兩個工具都以 `AppFolderWorkspaceToolbar` 呈現情境與動作，pane 直接放在紙面、以 ledger
rule 分隔。「播放安排」進入 `performance-session-workspace` boundary；`PerformanceSessionWorkspace`
以頂部單曲 NP 與下方待播／已完成兩個累積清單組合；清單各自擁有 bounded scroll，Folder page 不建立第二個 scroll owner。
Ordered plan／搜尋結果保留 `UiScrollLayout` 的內容安全預留；項目編輯與手動新增共用
feature-local `PerformanceSessionReviewPane` 的 scroll／固定 footer 對齊，按需以 `UiModal` 開啟；表單仍各自持有 draft、validation 與 intent。
唯讀曲庫資料直接以平面 ledger 分組呈現，不增加另一張卡片。Shell 內的
Titlebar 不提供重複場次入口；Right Dock 沿用 Queue surface 的一般／安排 variant，以獨立按鈕切換，Folder 主區排版維持原樣。
selected playlist／album 的「從清單建立」／
「從專輯建立」動作由 workspace toolbar 持有，既有 draft 的取代仍先確認。`PerformanceLyricsWorkspace`
與曲庫的 `LyricsAuthoringWorkspace` 共用 `useLyrics`／`useLyricsReading` module-scope owner：現場可在既有來源間
`selectSource`、缺讀音時呼叫 `generateReading`，並以 `openLyricsAuthoring` 前往曲庫歌詞編輯。
「顯示」內的來源選單列出已保存來源，不以只有一份來源為由禁用，僅在歌詞讀取中暫停互動。
兩個工作區的來源控制共用 `LyricsSourceControl`，以 `UiSelect`／`UiButton` 組合，
並使用同一個 `LyricsSourceManagerModal` 管理、搜尋及匯入來源；沒有來源時仍可開啟管理。
閱讀頁從「顯示 → 管理來源」直接開啟既有 modal，不先導航至曲庫；先關閉 popover，
再以常駐「顯示」按鈕作 modal 的焦點返回目標。來源異動仍由 canonical `useLyrics` 處理，
文字、讀音修正與時間軸編輯保留在曲庫 authoring 工作區。
讀音選項直接完成load／missing才generate，重選相同選項可重試；讀取失敗不視為missing，
pending request依track／source／document identity合併，切換內容或卸載後不為舊內容啟動generate。
兩頁的顯示選項與讀音準備由 `useLyricsDisplay` 協調，依賴既有 lyrics／reading owner，
不持有第二份讀音文件或 generation state；`useLyricsReading` 仍驗證 canonical identity、
合併底層 load 並持有 generation 鎖。字級使用共用 session-only「小／標準／大」偏好，
對應既有明確 typography tiers，不使用比例縮放，也不新增 persistence。
`LyricsDisplayControls` 共用來源、文字、讀音、字級與 busy／error UI；閱讀頁採 stacked，
編輯頁的 `LyricsPreparationBar` 同樣收進「顯示」popover，不再常駐整排設定。兩者都使用 `UiSelect`、
`UiSegmentedControl`、`UiIconButton`、`UiHint`／`UiNotice`，重選讀音即可重試。
暫時清空或載入歌詞不清除讀音偏好；韓文完成載入後把假名偏好轉成羅馬字。
編輯頁保留逐行讀音修正、時間軸與同曲重播刷新，讀取失敗不視為缺檔。
歌詞編輯的 `LyricsWorkspaceHeader` 使用 `AppFolderWorkspaceToolbar`，常駐只保留「顯示」與「編輯」。
編輯 `UiActionMenu` 收納修正讀音、逐字校時、選擇曲目與重新掃描；不新增模式 tabs。
預覽時不顯示逐行編輯動作，進入任務後只顯示該任務的 pencil 或 clock，以及情境提示與結束入口。
有逐行草稿時鎖定任務、來源與曲目切換，必須先儲存或取消，不新增確認 modal。
讀音輸入沿用 `UiTextField`，儲存中防連點，失敗保留草稿；逐字校時沿用原 toolbar／segment editor。
兩頁的顯示浮層採用 `UiPopover` opt-in initial focus，展開即聚焦第一個可用控制，
Escape 返回 trigger，非 modal Tab 仍可離開。逐字校時入口與草稿共用 `lyricsTiming.js`
能力判斷：需有效行起訖與至少兩段；優先保留來源分段，其次採同 lineId／原文且完整還原文字的
既有讀音 annotation spans，最後才使用保留空白的分段。讀音片段只是建議，不等於精準詞界，
不新增 tokenizer、不猜測內部時間；所有邊界有效且相對初始草稿有時間變更才開放儲存，復原回原值則停用。
伴奏處理不再重複放在歌詞工具列，沿用 shell「曲目準備」的 separation 工作流。

T1 聲學估計的第一階段另存 `lyrics/acoustic-estimates/<sourceFilename>.json`，
由 `lyricsAcousticEstimates.js` 驗證來源／timing／音訊與方法身分、限制大小並原子保存。
`lyrics:get-acoustic-estimate` 只讀取已登記 track／source，無 sidecar 不讀取整首音訊；
`useLyricsSourceDocuments` 在 canonical 歌詞發布後獨立載入，拒絕舊 request 的結果。
`useLyricsAcousticPreview` 僅擁有該來源的 session 啟用選擇，共用純投影沿用正式 T2 優先、
現行 T1 估算及整句回退。`LyricsAcousticPreview` 在 authoring 工作區顯示原文與詞塊起點，
不把估計寫進 canonical segments。應用內預設只接受合成 fixture profile，沒有歌曲模型產生 worker
或 Output extension；Self-View／Overlay 保持既有時間來源。
`scripts/research/lyricsAcoustic/` 另提供不進封裝的私有研究 CLI，以固定本機資產、
有上下文的 bounded windows、受控 Node／Python 子程序及明確 internal method profile
驗證中日歌曲。它不註冊產品 capability／activation 或 renderer start intent；CLI 內的
scheduler instance 也不代表已接入 app 的全域重工作排程。模型資料仍由正式 loader 預設拒用，
可見研究驗收只在隔離 composition 注入 profile；預覽可區分模型與合成來源。
`scripts/research/lyricsFreshEvaluation/`另提供HubertFA＋small獨立內容檢查、聽查與試用，
不建立產品producer。研究選型及各輪證據見[收斂結論](research/lyrics-alignment-summary.md)，
開發者執行步驟見[研究試用手冊](operations/lyrics-alignment-research.md)。
`electron/lib/lyricsAcoustic/` 另提供 main-owned 選配環境生命週期：固定 catalog／SHA、
獨立 `lyrics-acoustic` capability／`lyrics-alignment` environment／`alignment` model，
共用 Audio Python host 與 app heavy-job scheduler，Provider Python 不共用。
Settings 透過單一 `useLyricsAcousticCapability` owner 與六個零參數固定 IPC，手動準備、
真實 Python／Node ONNX 載入驗證、修復、取消及移除；掛載與重啟只讀狀態，不載入模型。
staging 完整驗證及 probe 後才發布 activation；失敗取消保留舊 activation／歌詞，
檢查所有 generation lease、共享 runtime，移除 journal 支援重啟後繼續清理。
正式 catalog 仍被 `weights-evidence-pending` 擋住，沒有預設下載或歌曲 start intent；
default sidecar loader 仍拒用研究模型。資源與驗收邊界見
[生命週期報告](research/lyrics-acoustic-lifecycle-2026-10-19.md)。
資料與後續 gate 見 [ADR 0026](adr/0026-t1-acoustic-estimates.md) 與
[聲學估計契約](contracts/lyrics-acoustic-estimate-contract.md)。

來源、讀音與字級收在工具列的「顯示」`UiPopover`，歌詞以 `LyricsDocumentPanel` 的 `presentation="sheet"` 印在紙面（目前行螢光筆、讀音印在上方）。Library 內的
歌詞編輯同樣使用 workspace mode，Folder page 不建立 document scroll；
`LyricsDocumentPanel`、timing editor 與來源搜尋只在各自 bounded 區域內擁有必要 scroll。Output
同樣使用 workspace mode；Workbench stage／inspector 與 Gallery grid／detail
各自擁有 bounded scroll。Workbench 的 Widget 尺寸由 preview option caption 單一表達，Lyrics
固定尺寸留在 preview footer；inspector 只保留模板 identity、短暫 save feedback、
error 與實際設定，模板描述留在 Gallery。Gallery 的縮圖與選中預覽預設只讀取 bundled 圖片；
缺圖不建立 live mockup。`ObsTemplatePreviewStage` 擁有單一預覽生命週期，滑鼠停留 250ms
或明確播放後才動態匯入 `ObsTemplateMockup`；離開 hover、切換模板與卸載都使 pending
結果失效。手動播放可持續至暫停或切換，觸控與 reduced-motion 不觸發 hover 自動播放。
Gallery 的靜態／動態層共用固定 16:9 frame，Widget capture 在其中 letterbox；Workbench
仍使用實際輸出尺寸。Template allowlist 不再包含 `focus-line`／`now-next`；舊 slot
讀取時由既有 normalization 回退為 Lyrics 的 `karaoke-stack` 與 Now Playing 的
`art-card`，新套用仍須通過同一 allowlist。純 presentation／appearance helpers 保留舊
ID 的相容解析，不使它們重新成為可選或可套用模板。
Lyrics preview 以可用寬、高較小者縮放完整 16:9 畫布；
inspection composition 依 runtime 狀態維持單一 owner：服務未啟動時由控制台 frame 繪製，live
cross-origin iframe 存在時由 iframe 內的 bounded Workbench query 繪製人物參考與
checker／dark／light；copied route 不帶這些參數；
Output 在紙面內的 `output-workspace` content container 小於 44rem 時，Workbench 以 2:1、Gallery 以 1:1 切成上下兩個 bounded pane，
不新增 page-level scroll。控制台 feature stylesheet 與 public `overlay/` 的
`--ovl-*` runtime 互不匯入。Settings 是 `AppFolderLayout` 的第四個正式 destination，
由 `SettingsPage` 在 registered `settings` boundary 中組合 document-mode `AppFolderPage`；
Folder exterior 使用 dark 炭灰／近黑、light 冷灰的 semantic neutral material，紙面仍沿用共用 neutral sheet。
Titlebar direct action 與 F9 都進入同一個 Settings destination，不建立 utility shell 或第二層 Folder。
`openSettings()` 只在首次進入時保存來源，`returnFromSettings()` 回到最近的非 Settings
view；F9、Tray 與 feature-gate／dependency setup request 都使用同一 action boundary。
Navigation history 由 module-scope `useNavigationHistory.js` 單獨擁有（[ADR 0025](adr/0025-renderer-navigation-history.md)）：它觀察 `useAppView` 與 `usePlaylists` 的位置狀態，只記錄目的地、Library workspace／選取目標與 Settings 返回來源，不記錄播放、佇列、搜尋、排序或 Performance tool。堆疊與位置模型是純邏輯（`navigationHistoryStack.js`、`navigationLocation.js`）；還原走 `useAppView.restoreLocation()`，不增加 root-entry revision。Settings 的返回優先沿歷史回到前一筆，無法對應時退回 `returnFromSettings()`。
歷史走訪的輸入由 `inputBindingRegistry.js` 宣告、`useNavigationInput.js` 收斂：滑鼠側鍵、`Alt+←／→`、瀏覽器鍵與 Main 轉送的 Windows `app-command`（`electron/main/appCommands.js`）共用同一個走訪出口，內含浮層守衛與短時間去重。
`SettingsPage` 擁有隨活頁紙移動的 Folder header、唯一 page Scroll Region 與 registered local overlay host；
`SettingsView` 保留曲庫、音訊、應用程式、選用功能與支援五個 domain composition owner；選用功能 owner
分別呈現外部來源與歌詞、本機音訊處理、公開輸出與 OBS，因此文件共有七個可見功能章節。各 focused section component
持有自己的 lifecycle、確認、deep-link 與區段 dialog 行為；共用回饋與章節彈窗由 Shell 各掛載一份，切頁仍由原 module owner 與 modal stack 管理。頁內沒有第二層 tabs 或 Scroll Region。一般設定項目使用平面
`SettingsDocumentItem`；`SettingsSection` 統一章節標題與內容 surface、分隔線與 container reflow。
`SettingsFeatureGateRow` 擁有真正的功能標題、啟用流程與明確的 settings／tools 內容；
`SettingsDependencyList` 收納元件管理，不接手 domain lifecycle。BPM 自動分析偏好與元件管理分為兩列。
雙欄與 Separation select 的特殊 geometry
由各自 component-local custom property 擁有，不回填 core token graph。
設定章節的 markup 與 deep-link target 維持完整掛載；只有選用功能的系統 FFmpeg
提示偵測經 `useOnFirstVisible` 延到該區段進入可視範圍，卸載時解除 observer。
Modal 的手動重新偵測不受影響。設定草稿、區段訂閱與 module-scope 的更新／OBS／
dependency 即時狀態仍各自維持原有 owner，不因延後提示偵測而中斷。

Renderer 操作通知由 `useAppNotifications.js` 保存公開投影與私有 action callback，
`App.vue` 只掛載一個 `AppNotificationHost`，沿 app-shell overlay host 呈現正式
`UiNotificationHost`。通知不持有 domain state 或 IPC 權威；設定中的診斷清除／匯出、
播放紀錄清除、去人聲清理結果與資料夾操作失敗由當次 operation 發送，持續讀取故障留頁內。
同 operation 替換、取消、重試與跨頁生命週期見
[Settings 操作回饋契約](contracts/settings-operation-feedback.md)。
`useTaskNotification.js` 以原 domain 的事件更新同一投影，覆蓋更新下載、dependency
管理與 BPM 元件；不建立任務 registry 或第二份執行狀態。`UiModal` 與通知共用
`useUiModalStack.js` 的既有鍵盤 stack，模態窗期間暫存通知及倒數，避免覆蓋操作。
已顯示通知被暫時隱藏時保留剩餘倒數，舊 action 失敗不取代新結果。
曲庫空間的 `useLibraryStorage` 按 bridge 共用操作與 snapshot，mounted consumer 只管理訂閱；
Windows／GPU／自動分析設定透過 `useSettingsPreference` 的 bridge／key 共用偏好 owner，
切頁不重建正在執行的寫入。讀取 revision 與操作 busy 仍屬 domain，不移入通知 owner。
OBS 設定 wrapper 同樣按原 connection state 共用，保留切頁中的操作結果；離頁清除
write-only 密碼輸入，不將密碼保存在通知或持久化草稿。

Windows notification-area lifecycle 由 main-owned
`electron/main/windowsTrayController.js` 持有；`windowState.js` 仍是唯一主
`BrowserWindow` owner。`windowCloseBehavior` 是 `ask`／`tray`／`quit` 三態 machine config，
預設 `ask`；Renderer 只經固定 config IPC 提交 allowlisted intent。`ask` 由 main 產生一次性
request id，再透過 `electron/main/windowCloseDecisionBridge.js` 請 Renderer 以 production
`UiModal` 呈現背景執行、完全結束、取消與記住選擇。Bridge 只接受目前主視窗 sender、目前
request id、`tray`／`quit`／`cancel`、boolean 與可選且 allowlisted 的 active-work kind；Renderer
只負責呈現，Tray、config、hide 與 quit 仍由 main 執行。伴奏處理尚在執行或暫停時，即使既有
偏好為固定退出，也改用一次性確認；該確認不能記住 destructive choice，背景繼續會保留記憶體
queue，停止並結束則取消目前工作且未處理順序不跨重啟保留。若 Renderer 未在期限內確認已呈現、
失去回應或已毀損，才退回 main-owned
Windows 原生 dialog，避免關閉流程因 UI runtime 故障而鎖死。背景執行先確保 Tray 可建立，再
隱藏同一個主視窗，因此 renderer-owned 播放／queue／lyrics 與 OBS／Output service 不會重建；
未記住的一次性 Tray 在視窗還原後銷毀。最小化行為不變。Tray 開啟、設定、雙擊與
second-instance 都 restore／show／focus 同一視窗；設定動作另送固定 `settings` 導頁事件，
不接受任意 route。Close prompt 維持 single-flight；記住選擇的 config write 或 Tray 建立失敗
時保持視窗可見並顯示 bounded error。
Tray 完整退出、app update install、正常 `before-quit` 及 Windows
`query-session-end`／`session-end` 會先同步設定 sticky quitting state，close handler 才放行；
這讓 updater 先關閉視窗、prompt 延遲完成及 Windows 關機／登出不發 `before-quit` 的路徑
都不會被誤攔為背景隱藏。

Machine config、feature confirmation 與 external navigation 分別由獨立 handler registrar
持有。Renderer 開啟固定說明頁面時只提交 allowlisted target id；provider discovery 則只提交
bounded query，由 `providerDiscoveryHandlers.js` 在 main 建立固定 YT Music search URL 並重查
`provider-flow` gate。Vendor origin／path 均固定在 main，preload 不提供任意 URL API。

OBS WebSocket integration 由 main-owned `obsAdapter.js` 持有。SDK 只在
`obs-integration` 已啟用且 desired state 開啟時 lazy-load；adapter 只讀取版本、直播／錄影
狀態與按需時間戳。連線握手與狀態請求各有期限，逾時會淘汰 transport 再以
bounded backoff 重連；disconnect／reconfigure 會取消進行中工作，舊連線完成不能回寫新狀態。
Transport failures 在 main 分類為 bounded public reasons：驗證失敗、連線遭拒、主機查找
失敗、逾時、協定不相容或未知錯誤。TCP refusal 無法證明是 OBS 未啟動、WebSocket 未啟用
或連接埠錯誤，因此 renderer 以同一個可操作提示呈現，不公開 endpoint 或底層例外文字。
它不提供任意 OBS request 或 scene／source 寫入。Endpoint scalar 驗證後保存在 machine
config，密碼只由 Electron `safeStorage` 加密後寫入獨立 credential file；OS 加密不可用
時優先拒絕設定變更，Settings 另提供明確的密碼移除動作。密碼不進 config、preset、
renderer state 或 diagnostics。
`sessionHistoryService.js` 消費既有 Output projection 的曲目變更，在 OBS 活動時向 adapter
取得當下時間戳並原子保存本機 session JSON；Renderer 只取得 public projection，並在本機
將場次時間標記投影為 YouTube 章節文字。OBS 顯示直播或錄影中時，`obsPowerSaveBlocker.js` 才啟用
`prevent-display-sleep`，兩者都停止後立即解除。

Titlebar resource projection 由 `appUsageService.js` 每 3 秒發布一次。平時只讀
`app.getAppMetrics()`；只有 `heavyJobScheduler` 忙碌時才透過 Windows process tree 補量
Python／FFmpeg 等 descendants。Renderer 只顯示 bounded CPU／RAM 百分比，不取得程序表，
也不把這份觀測值當成排程或播放權威。

Lyrics IPC 由 `electron/main/lyricsHandlers.js` 保留穩定註冊 facade；實際 channel 依責任
分在 `electron/main/lyrics/`：`documentHandlers.js` 只處理本機歌詞／timing，
`acquisitionHandlers.js` 處理 gated provider、候選與 provider-backed 回填，
`readingHandlers.js` 處理本機 reading worker／sidecar。三者不互相 import，facade 只注入
同一組具名 composition dependencies。

Reading sidecar v3 由 main 持有 `documentId`、normalizer profile、來源 fingerprint 與
line identity。Renderer 載入時只送當前 canonical identity；main 對文字相容的 v1／v2
sidecar 做原子 re-key 並保留人工修正，文字不相容或格式損壞才交回既有重新產生流程。
日文 worker 先由 package adapter 將 kuromoji raw fields 轉成 analyzer-neutral token，再交給
純 reading builder；quality evaluator 與 correction shadow resolver 只存在本機 benchmark
路徑，尚不套用第三方修正、不改 sidecar，也不進 startup critical path。

跨 runtime 的 presentation logic 位於 `shared/presentation/`。`overlay/shared/` 只保留
Browser Source route adapters；Output server 以 exact allowlist 提供兩個目錄的必要檔案，
不把 request path 轉成任意 filesystem path。

Output 外觀欄位由 `shared/outputAppearance.mjs` 單一擁有型別、預設、選項、數值邊界與
模板相容性。所有 template kind 都由 registry 投影這份欄位 metadata；Lyrics 再額外組合
presentation profile 與 availability，非 Lyrics 不依賴該 profile。固定藝術版型只宣告其 CSS
實際消費的欄位，避免無效 control。Electron 在 slot persistence boundary 驗證 recognized
appearance key，Renderer 依模板欄位 metadata 建立 control，Browser Source 則在套用前再次 normalize；enum 只進
root dataset，顏色只接受六位 hex，位置 offset clamp 後才進 `--ovl-*`。這層不依賴控制台
Token v2，Overlay semantic token 也不回頭消費 `--ui-*`。
所有可用模板都以既有 persisted `paletteId` 取得同一組 bounded semantic Look 選項；使用者可見名稱與
component vocabulary 採影像調色慣用的 Look，避免與 raw Hex 色票混淆。`lookAmount` 是 0–100 的 bounded
range，Browser Source appearance layer 以 `color-mix()` 從模板原始角色混合到 Look 的
text／surface／stroke／KTV／Kinetic／Manga／Ornate 目標角色，不對完成畫面做 opacity 或 LUT 處理，
也不覆寫模板 DOM 或 timing。Renderer 以帶代表色票的 select-only combobox 呈現 Look；方向鍵瀏覽不寫入，
只有 click／Enter 選取才進 autosave，Escape 保留原值。共享 appearance schema 擁有群組 metadata，
Workbench 依 `groupOrder`／`order` 固定以色彩處理、自訂色彩、文字、
可讀性、背景、版面、動態、內容顯示排序，空群組省略；間距密度、內容寬度與文字對比仍只在具有實際
CSS consumer 的模板公開。Ornate 的 raw Hex 欄位是 Look 後的進階角色 override；最近色票是
Output workspace MRU preference；最多八格的常用色則是同一 preference boundary 內的穩定
user-managed Palette。兩者跨 Output slot／模板與重啟共用，但 renderer 仍由目前 raw Hex 欄位
發出明確 apply／commit intent，不建立全域 active-field state。常用色滿額時不靜默淘汰舊色；
Look、模板預設、LUT 與 app-wide `UiColorField` 不讀取這些 preference，Overlay schema 也不持有它們。
Live Stage 額外以 `allowLocalFonts` 宣告本機字體 capability。Renderer 只在使用者按下
載入動作後呼叫 Local Font Access，Electron permission handler 也只允許 trusted main frame
的 `local-fonts`；公開 Overlay、Spout 與 nested frame 不取得列舉能力。可持久化值是經共享
schema 驗證的 `{ source, family, postscriptName, style }` record，不接受 path、URL 或任意 CSS；
renderer IPC payload builder 也只對 `fontFamily` 放行這個驗證後物件，其他 nested setting
繼續拒絕。Browser Source 不列舉字體，只把已正規化 family 寫入單一 quoted `--ovl-*`
custom property，並保留 Overlay UI stack fallback。重啟或換電腦後須由使用者重新載入清單
才能確認可用性；缺少時控制台標示不可用，公開輸出則安全回退。
歌詞呈現策略則由 `lyricsPresentationPolicies.mjs` 另行擁有；它不是 appearance 欄位，也不借用
尚未實作的 Style Set。現行只有 Live Stage 宣告轉播精簡、平衡分行與忠實原文三個 bounded
policy，slot persistence 依 template capability 驗證，Workbench 將它排入「內容顯示」群組，
仍與 appearance normalization 分開。
Renderer 的 `useOutputAppearanceAutosave` 將 Workbench 完整 bounded settings snapshot 以 350ms
debounce、single-flight 與 latest-wins 規則送入既有 slot persistence boundary；切頁、切換
Output kind 或套用模板前必須 flush，失敗則保留本地 draft 與 retry payload。Persistence
回傳只在狀態重新成為 saved 後同步經正規化的 slot，不得用較舊的 in-flight response 覆蓋
較新的本地輸入。模板套用與 Output runtime settings 仍是明確操作。

Lyrics presentation 分成兩層：第一層保留 canonical 原文與 T0／T1／T2 timing；只有有限
T1 fallback 會經 `lyricsTimingUnits.mjs` 產生唯一共用、無語意標記的 `{ text, weight }`
單元。原有換行、空白與標點無損附著，不在這層判斷斷句、角色或段落。
第二層 `lyricsPresentation.mjs` 才依 versioned Generic／KTV／Kinetic Pop／Ornate Vertical／Manga／Live Stage profile
做模板客製化；Generic 是 identity，其他 profile 才可把換行、標點、speaker label、括號
解讀成 phrase、role、bubble 或 caption page。Browser Source 以 document id、revision、
language、profile id／version 快取靜態結果，`state.mjs` 投影目前 template 的動態 frame
與下一個 boundary。`lyricsTemplateCapabilities.mjs` 是各模板 T1／T2、source mapping、music cue
consumer 與 scheduler wake 的唯一宣告；Workbench metadata 與 runtime 不另維護 template-id
清單。所有 Lyrics profile 都取得同一個 bounded `lyricsRhythm`：它以當前行、
lyrics offset 與 canonical playback clock 對照 current-track M1 cues；只在局部四拍連續、
confidence 至少 0.5 且間距落在 median 的 75%–125% 時輸出 beat-grid phase，否則只以可信
BPM 輸出無 phase cadence，再失敗便完全省略。Runtime 在每個可信 beat boundary 重投影，
但相同歌詞 identity 不重播換句動畫；模板只讀 current／next beat、行內拍序、拍長與限制在
0.75–1.35 的 motion scale，仍保有自己的視覺語彙。Scheduler 只為 capability 宣告的 consumer
喚醒；目前 beat phase／section boundary 只驅動 Classic KTV，Focus Line／Quiet Caption 只讀
bounded cadence，不再讓未消費節拍的模板逐拍重投影。Raw LRC／VTT parser 不進模板，模板
分句不回寫 canonical timing，T2 永遠優先。獨立 Reading Aid profile
仍未開放給 Output；Manga Frame 則可從 `lyrics.document` 的 optional reading projection
取得已存在、identity-matched 的日文 `{ text, reading }` segments。Publisher 只讀 sidecar，
不因 OBS 啟動 reading worker，缺少或 stale 時維持純文字。

Classic KTV 的 karaoke-stack 呈現封裝 `jf-open-huninn-2.1.ttf`（justfont open-huninn
2.1，OFL 1.1）；字型、來源 checksum 與授權隨 `shared/assets/fonts/` 封裝並只經 Output
server exact allowlist 提供，與其他模板字型共用同一分發邊界。

Live Stage profile 在相同 adapter 中提供三個 presentation policy：轉播精簡可移除可判定的
filler／連續重複與 CJK 顯示標點，平衡分行保留內容但重排 rows，忠實原文保留 authored rows。
三者都維持 canonical `sourceText`，不改 line／segment identity。Caption layout 先枚舉完整
1／2、2／1、2／2 候選，再以容量、作者邊界／跨語邊界、附著性與整體幾何選解；不以歌曲
專名例外修補。多頁且有 validated T2 時，`lyricsSourceMapping.mjs` 先把顯示頁文字安全映回
來源區間，再插值作者 segment 時間；映射失敗才使用 T1 視覺權重 page progress。

Manga Frame 的共享 layout contract 以 document language、實際假名或既有 reading segment
投影 `ja`／`other` 呈現提示。字型由 Appearance 選擇，預設為封裝的 GenEi Antique 6.0a
一般版（`antique`），也可改用 sans／serif／rounded，且不分語言一律套用；ruby `rt` 繼承
對話框字體。字型、固定來源 checksum 與 OFL 1.1 授權隨 `shared/assets/fonts/` 封裝，並只經
Output server exact allowlist 提供，不依賴遠端 webfont。

Ornate Vertical profile 同樣留在 Lyrics Output route 內。共享 adapter 以 grapheme
邊界保留原文：連續漢字合成一個 reveal unit，假名逐字，標點附著前一單元，拉丁字母與數字
成詞；整份 document context 只允許一個有足夠證據的漢字群組成為同尺寸藝術詞。視覺長句
可依原文斷點、標點、日文 word／助詞邊界自動拆成至多兩欄，不切連續漢字，也不建立新的
canonical／T2 timing；第一段留在右欄，第二段只向左展開。所有行使用右側安全區的
上／中／下錨點，並只接受受限 X／Y 微調；字型可在封裝的 Hina Mincho 與 GenEi Antique
間選擇，字級與主文字／同尺寸墨影色也由 safe appearance 設定提供。
`ornateVerticalMotion.mjs` 提供 Browser Source 與 Gallery 共用的短
stagger／裁切揭示，不使用位移、旋轉或縮放；換句以 outgoing 完整淡出作為單一 handoff，
incoming 到達該點才進入 DOM，兩個 source line 不同時可見；seek、source discontinuity 與
reduced motion 直接 commit。`overlay/lyrics/ornateVertical.mjs` 只擁有 DOM 與可中斷 GSAP swap，Hina Mincho、
來源 checksum 與 OFL 1.1 授權隨 `shared/assets/fonts/` 封裝並經 exact allowlist 提供。
模板不保存或載入 MV 場景素材。

Kinetic Pop profile 保持在同一 Lyrics Output route 內：共享 projection 依 source line
index 輪替三種材質，並以 grapheme-aware unit 判斷短句。每個已計時 source line 在任一時刻
只輸出一個橫向 row；此日文優先模板會把來源行內的作者空白編譯成 sequential phrases，依各段視覺
字重占比分配既有 `lineProgress`，先顯示前段再替換後段；有 validated T2 時則以共用的 source
range mapping 對齊作者片段起點，只有安全映射失敗才回退到 T1 權重估算。這個顯示排程不建立或回寫 canonical／
T2 timing；無空白的過長內容仍必須由上游 lyrics document／timing pipeline 斷成下一個 timed
line，模板不以第二列掩蓋來源問題。Kinetic Pop 的 Overlay、line、row 與三個材質 track 使用同一
份左右對稱 safe stage 寬度；glyph 群以完整輸出畫布為中心，背景圖不參與定位，超寬 `nowrap`
內容則由中心向兩側等量溢出。Output scheduler 會把下一個 phrase progress boundary 納入
喚醒時間。`overlay/lyrics/kineticPop.mjs` 只擁有 row／視覺字元 DOM 與 GSAP cross-swap；每個
caption／punch 與 phrase 替換都沿用 presentation-owned grapheme units 做逐字進場；T2 只決定
phrase 何時替換，不改字元動畫語彙。
DOM 以全行 depth／rim／fill track 分層，同一字的三個材質副本共用相同的 deterministic
interleaved phase；`kineticPopMotion.mjs` 讓 Browser Source 與 Renderer Gallery 共用 28ms
內重複的 burst delay contract。字元固定在最終水平排版位置，以奇偶相反的垂直位移、旋轉與縮放
短促回彈，不依字串長度累積成由左至右掃描；reduced motion 與 seek／source discontinuity 直接
commit。同一 shared motion module 也提供可選的 deterministic 八相位 rest pose；`端正`／缺值／
無效值落到零偏移，只有明確選擇 `些微偏移` 才保留幅度受控的字元傾斜、基線與尺寸差。設定經
appearance normalization 投影到 Overlay root dataset，既有可見行可由 CSS 即時切換，不重編
歌詞 presentation 或建立新的播放狀態；後續 GSAP 進場則直接落到相同 rest pose，且三個材質 track
共用每字姿態。樣式 2 使用 `0.03em` 白色 rim，最上層漸層 fill 則使用 hairline `0.0125em` 白色
stroke；fill 先畫、stroke 後畫，讓白框只作為漸層字面與黑色深度之間的薄分隔線，不能形成高份量
白色帶，fill 也不得使用黑色 stroke。M PLUS Rounded 1c 與漸層材質專用的
Keifont、來源 checksum 及各自的 OFL／Apache 2.0 授權都隨 `shared/assets/fonts/`
封裝，並由 Output server exact allowlist 提供；Renderer 預覽與 Browser Source
使用同一份字型檔。

Canonical document 與模板 profile 之間另有單一 renderer-owned 文字顯示變體：
`useLyrics` 預設把實際內容判定為中文的任一來源，以 bundled `opencc-js` 的 `s2tw-v1`
離線投影為台灣繁體，並保留可切回原文的 session intent。來源種類不參與語系判定；日文、
韓文與拉丁文字不套用。這個 display document 使用變體專屬 identity，控制面板與 Output
共用同一投影；原始 LRC／VTT／YRC、canonical document、timing sidecar、line／segment id
與來源 provenance 均不改寫。T2 優先整行轉換後依等長字元邊界切回原 segment；若無法安全
等長切分，才逐 segment 轉換並以其串接結果保持 line／segment 文字一致。
`src/utils/lyricsTextVariantLoader.js` 共用延遲載入的 OpenCC projector。`useLyrics` 與
`useCurrentTrackLyricsPreview` 在發佈中文文件前等待準備，等待後再檢查 request identity；
載入失敗走既有歌詞錯誤與重試路徑，不先發佈原文。即使當時選擇原文仍先準備中文投影，
確保後續原文／繁體切換保持同步。空文件及非中文不載入 converter；Library 使用的
content-language 字元表仍是獨立的首屏依賴。

## 權威狀態與資料

| 資料                                  | 權威 owner                         | 投影／持久化                                                                                                                                                   |
| ------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Track existence                       | Library filesystem                 | `library.json` 只補 scalar metadata                                                                                                                            |
| Track added time                      | Main library/import boundary       | 新匯入寫入 `library.json.importedAt`；舊資料由音訊檔 mtime 相容投影                                                                                            |
| Playback timing/state                 | Renderer HTML audio element        | Main、taskbar、SMTC 與 Output 只接收狀態投影                                                                                                                   |
| Performance audio preferences         | Main config state                  | `config.json.audioPreferences`；shared scalar contract，preload 同步 seed 第一幀，Renderer debounce/coalesce 寫回                                              |
| Queue／playing track／lyrics state    | Renderer composables               | Projection Hub 驗證後供 Self-View 與 Overlay 消費；Self-View 同步微調經 revision／track／source stale guard 回到既有 `useLyrics` owner                         |
| Recent playback events                | Main playback persistence service  | 本機 bounded JSON；Renderer 以目前曲庫解析 track ids                                                                                                           |
| Complete last-played index            | Main playback persistence service  | Main-private 本機 JSON；只供去人聲 LRU policy 使用                                                                                                             |
| Playback resume snapshot              | Renderer player／queue projection  | Main 驗證並原子保存；啟動只 paused rehydrate                                                                                                                   |
| Performance session current draft     | Main session plan store            | Library root bounded JSON；Renderer 提交 ids／labels／intent                                                                                                   |
| BGM standby preparation               | Main BGM plan store                | Library root `bgm-standby.json`；Renderer 只提交 ids／scalar intent                                                                                            |
| BGM transport／handoff                | Renderer BGM deck／coordinator     | HTML audio events、logical gain bus 與 readonly UI projection                                                                                                  |
| Feature confirmation                  | Main config state                  | Renderer 只顯示與提交 allowlisted intent                                                                                                                       |
| Lyrics／analysis／separation sidecars | Main library services              | Renderer 只提供 track id 與產品 intent                                                                                                                         |
| Library storage policy／snapshot      | Main config／library service       | Renderer 只接收分類容量並提交 allowlisted policy                                                                                                               |
| Dependency registry                   | `shared/featureDependencies.json`  | Main 解析 URL、hash、path、model 與 arguments                                                                                                                  |
| OBS endpoint／credential              | Main config／encrypted file        | Renderer 只提交 bounded settings intent                                                                                                                        |
| OBS session history                   | Main session history service       | 本機 JSON；Renderer 只讀並輸出場次時間標記                                                                                                                     |
| App CPU／RAM observation              | Main usage service                 | Titlebar 只接收 bounded percentage projection                                                                                                                  |
| Artist index／organization            | Main artist index／organization    | `artists.json` stable entity＋negative evidence＋唯讀投影；Renderer auto-resolve 只送無參數 intent，其他 mutation 只送 opaque ids、bounded 顯示名稱與 revision |
| Artist photos                         | Main artist photo services         | `artists/<artistId>/` sidecar；Renderer 只送 artist id／candidate id 與選圖／移除／候選 intent                                                                 |
| Track editing draft                   | Renderer editor＋Main path session | Renderer 持有文字／預覽草稿；Main 持有本機 path，單次 Save 才更新 metadata／artwork，失敗回滾封面                                                              |
| Folder page objects                   | Main folder object store           | Library root manifest＋opaque asset dirs；Renderer 只送 bounded page／object key／region placement／Pin／order batch intent                                    |

`library:list` 是本機曲庫投影的共同入口。Main 對每個 resolved library directory 在單次 App session
首次讀取前執行一次 `organizeTrackMetadataFromSidecars()`，從已保存的 `info.json` 套用目前的 bounded
normalization／enrichment 規則，再以更新後的 `library.json` 建立 track projection。這個 pass 不連線、
不重寫 sidecar，會保留帶有 manual origin 或無法判定來源的 title／artist；失敗只記錄 main diagnostic，
仍回傳可播放曲目；同一 session 不重複失敗掃描，下次啟動再自動重試。Renderer 不再持有
metadata-refresh IPC 或 Settings mutation。
因 artist index 與 MusicBrainz resolver 都在 Renderer 收到這份 track projection 後才啟動，artist identity
自動整理會以本機資訊整理後的 title／artist／duration evidence 運作。

Artist organization（[ADR 0022](adr/0022-artist-identity-and-organization.md)）由
`electron/lib/artists/artistIndex.js` 先依 `ytdlpInfo.extractPerformerCredits()` 的有序演出者 parts
（只在仍能重現曲庫 `artist` scalar 時採用）與 provider-neutral comparison key 建立 Tier A 分組，
再由 `artistOrganization.js` 把已確認 credit key 投影到 stable UUID entity；track metadata 與 credited
form 都不改寫。Library-root `artists.json` 保存 version／revision、bounded stable entities／catalog facts
與最多 20 筆 undo snapshot，採 corruption backup 與 atomic write。未被整理的 artist 繼續使用衍生 hash
id；投影提供 bounded legacy／old-stable redirect，讓既有 selection、queue／history source 與頁面 navigation
導向目前 stable id，且 redirect 隨 undo snapshot 一起復原。
Main 在 `library:get-artist-index` 首次被呼叫時才非同步讀取 sidecar，並以（track id、artist scalar）快取；
Renderer 的 `useArtistIndex.js` 在第一個顯示可導向 artist credit 的 surface 開啟時才請求，曲庫變動後重抓；
Library 所有 track-list mode 與 Preparation separation list 都屬於這類 surface。專輯歸屬由
`src/utils/artistCollections.js` 以成員曲目最多的 artist 決定。
Sidebar 參照區以 `orderReferenceItems()` 依藝人名稱混排專輯與藝人，並在曲庫清單載入後以 idle task 請求 index；artist 選取由 `usePlaylists.js` 的
`selectedArtistId` 擁有並與 collection 選取互斥，`src/utils/artistPage.js` 推導 sidebar 清單與 artist 頁，
`LibraryBrowseContent.vue` 以既有 header／唯讀曲目表／專輯 grid 呈現。Artist id 可作 queue／history source id，
`useAlbumNavigation.js` 會把它導回 artist 頁。
Artist-aware Track Row／PlayerBar／Queue／Preview／Track Context 以 `trackArtistIds` 投影 entity canonical
display name，index 尚未載入時才回退 track scalar；曲庫與 collection 搜尋同時納入 canonical name 和 entity
全部 credited forms。原始 scalar 不被改寫，split 後 presentation 與搜尋範圍會由下一份 index 一起分離。

Merge／split／display override／undo 由 `library:*artist*` fixed IPC intents 進入 Main，每次以 expected
revision 防止覆寫較新決策；Renderer 只傳 artist／credit id 與最多 200 字元的 display-name intent。
`electron/lib/artists/artistIdentityService.js` 透過既有 MusicBrainz client 與全 App 1.1 秒 scheduler
持有 identity resolver。第一個 artist-aware projection 與 track 變更只送無參數 start intent；Main 重查
`provider-flow`、自行取得曲庫，並以 single-flight、每輪最多 64 次的 queue 查詢 credited forms。唯一
exact name／alias 會用最多兩首本機曲目的 title／duration／recording artist-credit 佐證，只有 strict
corroborated candidate 會自動 apply；歧義與弱證據留給整理視窗的重新查詢 fallback。Apply 只保存 MBID、
name／sort name／type／disambiguation、最多 32 個 aliases 與 fetched time；相同 MBID 會自動合併。
Provider gate 在同一 session 由關閉轉為啟用時，renderer 會對未變曲庫重送一次 start intent；除此之外相同
track signature 不重複啟動，且沒有獨立的自動整理 preference。
Split 同一 mutation 保存 bounded credit-pair／credit-to-MBID negative evidence，避免下輪回併；明確 manual
merge／catalog apply 才清除，undo 一起還原。`provider-flow` 關閉或 provider unavailable 時，手動整理與
本機頁面仍完整可用。Provider 專屬 notice version 會要求既有使用者重新同意自動送出本機藝人名稱，
不使其他 feature gate 失效。Renderer 永遠不收到 MBID、MusicBrainz URL 或 raw response。

藝人照片由 `electron/lib/artists/artistPhotoService.js` 擁有。`provider-flow` 開啟時，renderer 對 sidebar
藝人與開啟的 artist 頁送出 `library:resolve-artist-photo`（只帶 artist id，逐一、每次啟動最多一次）；main
由 artist index 推導該藝人第一署名曲目的多數非 Topic `channel_id`，以 app-managed yt-dlp 讀固定的頻道
`/featured` 分頁取頭像，再經 `artwork/image.js` 的驗證下載（只允許 HTTPS `yt3.googleusercontent.com`／
`yt3.ggpht.com`）寫入 `artists/<artistId>/photo.<ext>` 與 `photo.json`。本機選圖與移除也經 main；移除會留下
標記，自動查詢不再寫回。Stable identity mutation 會相容讀取舊 derived／stable sidecar，依本機照片、
人工 YT Music、automatic evidence 與時間選出可提升狀態，寫到 canonical stable id 但保留所有來源目錄，
讓 split／undo 無損。Renderer 只透過 `utawakui-media://artist-photo/<artistId>/<filename>` 讀取，
該路由由 `artistPhotos.resolveArtistPhotoPath()` 比對 provenance 記錄的唯一檔名。沒有照片時顯示人像圖示，
不借用專輯封面。

Folder 頁面物件由 `electron/lib/library/folderPageObjects.js` 擁有。`folder-page-assets.json` v4 以單一 `objects[]` 保存 key、type、source、page identity、paper／side／bottom placement、Pin、bounded rotation、同頁共用的有限 order、依 type registry 驗證的 payload 與時間；`user` key 為 `<type>:<uuid>`，`derived` key 為 `derived:<slug>`，只有 user 物件可刪除並計入每頁 12 個上限。Main 的原生 picker 每次只選一個本機 JPEG／PNG／WebP，先以 byte、magic 與 dimension bounds 驗證，再複製到 `folder-page-assets/<assetId>/image.<ext>`；新物件由 main 放在 bottom region 的 4×3 格點並以可測試的 random source 加入每軸最多 0.04 normalized jitter 與四個 ±3.25° 以內的非零角度，randomness 不進 render path。版面以 `saveFolderPageLayout` 批次寫入：整批先驗證再一次寫入，user 物件只更新 placement／Pin／order，derived 物件於第一次版面變更時建立紀錄，寫入後同頁 order 重新壓成 1..n。v3 的 `assets[]`／`layouts[]` 在讀取時遷移：未 Pin 的舊 anchor 視為 paper placement，同序時衍生物件排前。`electron/main/folderPageObjectHandlers.js` 重新驗證目前 entity 存在，preload 只暴露 list／choose-photo／save-layout／remove 四個固定 intent，renderer 不提交 path、URL、filename 或任意 IPC channel。圖片只經 exact `utawakui-media://folder-asset/<assetId>/<filename>` 路由讀取；resolver 以 manifest 比對唯一檔名。缺檔在讀取時 reconciliation，移除物件與刪除 collection 都先更新 manifest，再清理精確 asset directory。

Artist stable entity 會把 canonical Folder page 與所有目前 credit source pages 合成同一投影；新物件仍寫在
真實 credit page，因此 merge／split／undo 不需複製或刪除資產，合併後的 12-object 上限也以整體計算。

缺圖 artist 頁的明確「搜尋線上藝人照片」動作由
`electron/lib/artists/artistPhotoCandidateService.js` 擁有。Main 從 artist index 推導名稱與最多三筆
first-credit recording／channel evidence，以 app-owned `resources/provider/artist_photo_ytmusic_worker.py`
在已準備的 Provider Python 中做一次 anonymous YT Music lookup。Service 全局串行查詢、使用短期
opaque candidate session，限定三個圖片 host 並重新驗證 redirect。Renderer 只得到 candidate id／名稱
與驗證後的 bytes，以 blob URL 預覽；不得到 remote URL／browse id／worker response。Apply 會重建目前
artist context 指紋，並在下載前後重查現有照片，因此本機／官方照片在 race 中優先。這條路徑
目前一律 `user-confirmed`；strict auto policy 保持關閉，要等 48–72 小時、三個時點／兩個 locale
drift gate 通過。`artistPhotos.js` 對新照片寫入 schema v2，只保存 allowlisted source／acceptance／
時間與 source-specific bounded evidence，並繼續讀取 v1。完整邊界見
[artist photo provider contract](contracts/artist-photo-provider.md)。

Lyrics、provider import、artwork discovery 與 artist／album organization 共用
`electron/lib/musicIdentity/` 的 provider-neutral observations 與逐軸 evidence。這個純 domain
不執行網路、檔案或 IPC，也不擁有 feature 總分、自動保存或 canonical artist entity；
`musicTitle.js`／`trackIdentity.js` 保留相容 API，各 provider 與 consumer 繼續擁有自己的
query lifecycle、候選排序與套用 policy。Comparison key、artist split hints 與
`trackIdentityKey()` 都是可重新計算的 discovery／cache 資料，不是 persistent identity。
Identity profiles 與 query variants 保留 alias kind／source／confidence，採原文優先、有限去重
與硬上限，且不做 alias Cartesian product；romanization／fuzzy 必須由 consumer 明示開啟。
Lyrics 由 `electron/lib/lyricsProviders/recordingPolicy.js` 將逐軸 evidence 映射成現有 lexical
scale 與 band；各 provider 仍自行定義門檻、capability、request 與 persistence guard。
Import 由 `electron/lib/importRecordingPolicy.js` 建立 observed tracks 並映射原有 field weights；
`importResolver.js` 仍擁有 playback kind、view count、candidate order 與 download recommendation。
Artwork discovery 由 `musicbrainz/`／`coverArtArchive/` provider adapters、
`artwork/discoveryService.js` 的短期 opaque candidate sessions 與
`artwork/releasePolicy.js` 的 release-level policy 組成。Discovery 先查 original recording，
不足時才依序補 release group 與有限文字 variants；Cover Art metadata 使用 bounded concurrency
與 early stop，排序後再以 canonical image identity 去重。Main 擁有節流、快取、timeout、redirect
allowlist、圖片 bytes／MIME／magic／尺寸／總像素驗證與 apply；Renderer 只提交目前 metadata draft、
選填 album filter、track id 與 candidate id，收到文字候選後即呈現，再以有界併發漸進載入經驗證
bytes 的 `blob:` 預覽，不直接 hotlink。候選 selection、本機 picker 與移除只更新 Renderer 預覽；本機
path 只存在 Main 的 sender／track scoped process-memory session。單一 Save 才由 library owner套用
bounded `keep／local-draft／candidate／clear` intent 與 title／artist；artwork mutation 前保存
`thumbnail.<ext>`／`artwork.json` snapshot，後續 metadata 或 candidate 失敗即還原，成功只發出一次
library update。自動 backfill 不得覆寫既有封面，也沒有自動套用或 metadata side effect。完整邊界見
[Music Identity／Evidence 契約](contracts/music-identity-evidence-contract.md)與
[曲目編輯契約](contracts/track-editing.md)。

本機媒體經 `utawakui-media:` protocol 交付 renderer。Scheme 與 handler 註冊在
`electron/main/mediaScheme.js`／`mediaProtocol.js`；`electron/lib/` 只提供其呼叫的
path／range 工具函式。Resolver 只接受 track id 與 allowlisted asset names，並由 main
建立正確的 HTTP range response；renderer 不接觸 absolute path。

本機音訊匯入由 `electron/lib/library/importLocal.js` 在 library root 的隱藏 staging
目錄執行非同步 copy 與 SHA-256，並以 `music-metadata` 解析實際容器、codec、時長及
有界的 title／artist／album／year／embedded artwork。檔案必須通過副檔名 allowlist、
可解析性、正時長及容器／codec 相容檢查後，才原子移入 `tracks/<trackId>/` 並寫入
`library.json`；索引寫入失敗會回滾新 track directory。Main diagnostics 保留原始錯誤，
renderer 只收到 basename、固定 reason code 與必要的 existing track id。
`electron/lib/library/constants.js` 的 direct-play registry 是 picker、filesystem allowlist、
media MIME 與 validation family 的單一來源。目前直接支援 MP3、FLAC、WAV family 的
PCM／IEEE float／μ-law、MP4 family 的 AAC、ADTS AAC，以及 Ogg／WebM family 的
Opus／Vorbis。Picker 另接受經實際 container／codec 驗證的 WMA、AIFF／AIFF-C、M4A／ALAC、
Monkey's Audio、WavPack 與 CAF，但這些格式不會加入 direct-play MIME allowlist。Ogg／Speex、
壓縮 WAV、其他 WebM codec、DRM、MIDI、CDA、播放清單與 video-bearing media 會以 bounded
`unsupported-codec`／`unsupported-media`／`format-mismatch` 拒絕。

相容轉檔依 [ADR 0024](adr/0024-explicit-local-audio-compatibility-transcoding.md) 實作為
main-owned、使用者明示的第二階段。初次選檔只把來源 path 與 allowlisted format code 放入
15 分鐘、process-memory、one-shot review session；renderer 只取得 opaque UUID、basename 與
格式代碼。使用者選擇「轉成 FLAC 並匯入」後，Main 重新檢查 `audio-processing-flow`、解析既有
verified FFmpeg runtime 並重驗來源，再以固定參數輸出到 library-root staging。輸出會重新通過
direct FLAC validation、hash、duplicate、metadata、artwork、atomic move 與 rollback 契約；原檔
不修改。`library.json` 只保存原始 basename、allowlisted `sourceFormat` 與 `conversionFormat: flac`，
不保存來源 path、raw codec、executable 或 command line。缺少 FFmpeg 只導向既有 Settings 準備
流程，不靜默下載，也不回滾同批已完成的直接匯入。

Main 啟動時，`electron/lib/config.js` 的 `loadConfigSnapshot()` 由同一次讀取／解析
產生 normalized config 與 audio-preference presence metadata，交給 `configState` cache。
Metadata 只供舊版播放設定遷移判斷，不進 persisted config 或 renderer projection；既有
`loadConfig()` 仍只回傳設定。Config schema、單檔儲存與 atomic write 邊界保持不變。

曲庫位置由 `electron/main/configState.js` 的 guarded resolver 統一驗證。預設 Music
位置可由 main 建立；使用者選擇的自訂位置若消失、不是目錄或無法讀寫，設定仍保留且不
改寫到 fallback，所有 library consumer 暫停讀寫並回傳 bounded unavailable error。
`config:get` 另投影 available／reason 供 Settings 顯示復原入口；Output slots 的啟動同步與
`utawakui-media:` request 會在各自邊界內降級，不能阻止主視窗建立或把失效位置投影成空曲庫。

曲庫容量由 `electron/lib/library/storage.js` 依 allowlisted 結構掃描實際檔案大小，分類為
歌曲、去人聲與其他；未知檔案只能計入其他。`electron/main/libraryStorageHandlers.js` 擁有固定
inspect／set-policy／cleanup IPC，renderer 不提供 path、候選 track ids 或刪除目標。
`libraryStorage` machine config 只保存 boolean 自動管理 intent 與 allowlisted 去人聲上限；
自動管理預設關閉。清理只透過 separation manifest 移除可重新產生的 artifact，先處理非
selected recipe，再依 main-private 完整 last-played index 做 LRU；目前播放、Queue 與處理中
track ids 由 main 組合成保護集合。歌曲本體、其他 sidecar 與未知檔案不屬於候選。
容量與淘汰契約見
[曲庫空間管理契約](contracts/library-storage-management.md)。

最近播放與啟動恢復由 `electron/lib/playbackPersistence.js` 保存到 app user data，並由
`playbackPersistenceHandlers.js`／preload 的固定 channels 暴露 bounded intent。History 只接受
track id 與 source context，時間由 main 產生；resume version 2 只接受 ids、position、playback mode
與 Queue scalar state。演唱 master volume／mute 與導唱監聽／擷取 level 由
`shared/audioControlValues.json` 定義 canonical scalar contract，Main
`config.json.audioPreferences` 逐欄正規化並在建立 BrowserWindow 前透過 preload 同步 seed
Renderer 第一幀；舊 resume version 1 的 volume／mute 只在 config 尚無新偏好時遷移一次。
Renderer 的 `useAudioPreferences.js` 以 coalesced write 保存變更，不依賴 current track；BGM
volume／mute／dim／fade 則維持由完整 `bgm-standby.json` plan 持有，不拆入 machine config。
Renderer 的 `usePlaybackHistory.js` 依 HTML audio progress／
ended 判定 qualified event；`useRecentPlaybackActivation.js` 只協調 Queue／Player owners，
將明確選取的歷史曲目作為單曲 interrupt 播放，不重建來源 Queue；
`usePlaybackResume.js` 只投影／rehydrate owner state。啟動先以目前 library 過濾缺檔，再恢復為
paused；corrupt 或失效 current track 會降級並清除 snapshot。
同一 qualified event 另更新 main-owned `playback-usage.json`；它不受最近 50 首顯示上限或
清除最近播放操作影響，保存全曲庫去人聲 LRU 的 durable `lastPlayedAt`（不跨 IPC）與本機
`playCount`。後者只經唯讀 channel 投影給曲目列「播放次數」，不做雲端統計。
完整 schema 與 UI 邊界見
[播放紀錄與啟動恢復契約](contracts/playback-history-and-resume.md)。

演出場次準備由 `electron/lib/performanceSessionPlan.js` 在 library root 原子保存一份
`performance-session-plan.json` current draft；schema 只接受 bounded source／item／track ids、
item mode、session-local labels、verification compatibility state、cursor、revision、progress／progressRevision 與 timestamp。
`electron/main/performanceSessionPlanHandlers.js` 每次操作都以 main-derived playlist 與 library projection 驗證
canonical order 與 track availability，preload 只暴露固定 intent。Renderer 的 module-scope
`usePerformanceSessionPlan.js` 序列化 mutation 並消費完整 projected snapshot；Setlist preparation
workspace 的預設路徑是搜尋曲庫後以 track id 立即加入 ready item；main 解析 canonical title／artist
與 availability。非 App 控制的自行伴奏／外部來源使用明確 manual item，BGM 不是 plan item。舊版
文字 placeholder 只保留為 recovery state；workspace 另負責 session-local label override、relink、
duplicate、reorder 與 remove，不借用 playback Queue。曲庫刪除只解除 draft 中所有 occurrence 的
track link，保留 authored label 供 operator 修復。Session details 將 canonical title／artist 視為唯讀
projection，不提供或轉送 global metadata editor intent；display save 只送 session-local labels，relink
才可另送既有 track id，兩者都不呼叫 library metadata write handler。
`PerformanceSessionWorkspace.vue` 持有編排、selected playlist／album 的建立／取代與按需 editor。
Right Dock 的 `PerformanceSessionDockContent.vue` 消費既有 module-scope owners；主區維持原 Board／PlanList。
唯一 NP 由 `PerformanceSessionCurrent.vue` 重用 QueueSection／QueueTrackButton，保留真實封面播放／暫停、
selection／menu 與場次完成／停止；manual 不提供音訊操作，busy 仍可停止取消。
`PerformanceSessionSummary.vue` 在 AppRightDockPanel 可選 summary slot 消費原 plan／library／playback，
以 `performanceSessionSummary.js` 投影共用固定統計；計數以 occurrence 為單位，曲目長度與未知／略過／中止分開，沒有新增時鐘或持久化 owner。
待播與完成的顯示序號透過 QueueTrackButton 的 optional ordinal 進入原 UiTrackRow lead；完成先編號再倒序，Recent 無序號的預設不變。
待播使用 `PerformanceSessionQueueList.vue` 組合既有 QueueTrackButton／useDragReorder，保留 selection、
封面 action、更多選項與拖放配方。itemId 識別 occurrence；固定 reorder-item intent 由 main 驗證 queued source／target
後一次原子保存，不連續寫入多次 renderer 計算的相鄰 offset，progress revision 與結果 labels 維持。
其中已完成 tab 由 `PerformanceSessionCompletedList.vue` 以既有 `RecentPlaybackList`／QueueTrackButton 呈現，
只有 completed occurrence、最新在上，沿用 Dock 的單一 scroll，不帶 NP／連續播放／重複結果標題。
封面重播透過原 duplicate intent 的序列化 main response 取得新 itemId，再交給原 arrangement playback owner，保留舊結果。
Dock 展開／切換只改變側欄呈現，主頁維持原本搜尋與完整編排；兩個呈現使用不同 heading IDs，消費同一個播放進度 owner。
`usePerformanceSessionPlaybackController.js` 協調 occurrence identity、confirmed playing、單一 NP、完成／略過／中止與連續播放；
`usePerformanceSessionPlayback.js` 提供 module-scope owner，與 `usePlaybackTransport` 共用 PlayerBar／SMTC／ended 的下一首決策。
HTML audio 維持唯一 timing／play-state authority；一般 Queue 與安排不各自註冊自動前進。OBS、公開輸出或 live／record 皆不是本地進度的前置條件。
Main 的 set-progress intent 以獨立 progressRevision 驗證轉換；每個 library 在 process 首次操作時把殘留 playing 恢復為 interrupted，結果保留而不自動發聲。
`usePerformanceSessionWorkspace.js` 只協調 open／return state。`usePlaybackDockDisplay` 消費原有 playback ownership 與 OBS 狀態；
獨立的預設關閉 boolean 偏好只控制 ready 後顯示，手動收合不被同連線的更新覆蓋，不形成播放 gate。
`performanceSessionOutput.js` 在安排 ownership 期間從 confirmed current snapshot 與 completed progress 產生既有公開 queue／playback 投影；
sourceName 沿用 plan source，canonical id 仍解析 media／lyrics／artwork，未開始草稿與略過／中止不冒充完成。普通播放保留原投影。
BGM 沿用既有音訊交接；安排的 session-local label／manual／completed history 專屬公開投影與 OBS history commit 尚未接線。完整邊界見
[演出場次準備契約](contracts/performance-session-preparation.md)。

BGM 準備由 `electron/lib/bgmStandbyPlan.js` 在 library root 原子保存
`bgm-standby.json`。Main store 只接受單一 bounded track id、position 與 scalar 音量／
mute／fade／Dim／pre-roll／post-roll settings；loop 固定為 true。每次投影都從 authoritative library 解析
metadata 與 availability，曲庫刪除會清除 reference。`electron/main/bgmStandbyPlanHandlers.js`
與 preload 只暴露固定 get／set-track／settings／position intents，不接受 path、
URL 或 renderer metadata。Persisted schema v3 的 handoff defaults 是 fade-out `0.6s`、pre-roll
`0.75s`、post-roll `1.0s` 與 fade-in `1.0s`；正常 BGM 音量預設為 `0.25`，Talk attenuation
預設為 `-12 dB`。Active Talk 不持久化，完整啟動回到 disabled；deck 本身仍 paused，不會自動
發聲。v1／v2 只有完整舊預設 tuple 會遷移，customized settings 保留。

播放器的 renderer ownership 再分成兩層：`src/composables/usePlayer.js` 是模組單例、
HTML audio event authority、transport actions 與既有 public composable facade；
`src/composables/player/usePlayerAudioGraph.js` 是由 facade 建立的 Web Audio resource
owner，負責四聲道 accompaniment／guide-vocal routing、monitor／capture mix、Signalsmith
Stretch pitch processing、capture sink 與 graph cleanup。Audio graph 不註冊 media timing events，
也不直接建立第二份 playback state；所有播放時間與 phase 仍只由 HTML audio events
更新。Monitor graph 採 lazy initialization，Renderer module startup 不建立 native
`AudioContext`；已儲存的 capture device 必須先由 `useAudioOutput.js` 成功列舉並驗證，只保存為
待啟用 intent，第一次播放才建立 capture context。裝置缺失、sink loss 或 native render error
一律關閉 capture、清除 persisted device id 並保留 monitor playback；capture 不得 fallback 到
系統預設喇叭。

`src/utils/pitchProcessorLoader.js` 在第一次需要 pitch processing 時才載入 Signalsmith，
monitor／capture 共用模組載入 promise，各自擁有 AudioWorkletNode；載入失敗可重試。
Worklet 保持由 Vite 提供的 self-hosted URL，沒有放寬 CSP。Capture 在模組載入後再次
確認 graph 仍有效，避免裝置切換期間建立過期節點。

BGM transport 與演唱播放器分開：`src/bgm/audioDeck.js` 擁有第二個 HTML audio element、lazy
AudioContext 與單一 logical gain bus；現行只連到系統預設 monitor destination。
`src/bgm/handoffCoordinator.js` 分開仲裁目前 BGM request 與 performance 後 deferred restore，並擁有
exact-zero fade gate、monotonic pre-roll／post-roll、manual hold 與 stale generation；performance
start 取得優先權後會立即重置 BGM transport，BGM control／source action 不得取消其 fade／pre-roll。
OBS-derived `live > record` mode
只負責 session projection、compact auto-visibility 與 confirmed-exit cleanup。`useBgmSession.js` 組合 plan、library、
OBS、deck、coordinator 與既有 player 的單一 pre-start hook；`usePlayer.js` 的 new-track 與 resume
start 共用同一 request revision／gate，且仍是 performance timing
權威，並以 confirmed playing／explicit pause／ended／terminal stop subscription 回報交接。明確
pause 投影 `track-paused` 並恢復手動 BGM Play，但不自動播放；buffering／stalled／seek 仍保留
performance lane lock。BGM 不進 Queue、history、resume、Output、SMTC 或 taskbar transport；OBS capture
routing 尚未由 App 擁有，完整決策見 [ADR 0021](adr/0021-bgm-standby-audio-and-handoff.md)。

同一 coordinator 也仲裁第三條、最低優先的曲目試聽 lane：`acquirePreview()` 回傳可被搶占的 lease，
`audibleLane` 值域含 `preview`；演唱 start、BGM play、session 進入 record／live 都會先搶占試聽，
試聽持有 lane 時不做任何自動 BGM 恢復。`useBgmSession` 的 `acquirePreviewLane()` 先以
`usePlayer.cancelPendingStart()` 丟棄待開始的演唱並 pause，再交給 coordinator；record／live 期間
直接拒絕且不碰演唱播放器。試聽 owner 是 `useTrackPreview.js`（自有 audio element，播放原始音訊、
只監聽；選段時唯讀既有的 music-structure sidecar 與偏好歌詞來源，皆為可缺的輔助訊號），`src/components/track/TrackPreviewOverlay.vue` 只投影狀態並以 `track-preview` surface 提供自己的 overlay host，
入口在 CollectionActionRail，由 `LibraryBrowseContent.vue` 接線，見 [曲目試聽契約](contracts/track-preview.md)。

節拍器由 `useMetronome.js` 擁有 session state，並以獨立 AudioContext 與 lookahead
scheduler 發聲，不接入 player monitor／capture graph。`useMetronomeTrackTempo.js` 是唯一
曲目分析接線：只接受既有 confidence gate 通過的 tempo，且在節拍器停止、使用者尚未
手動覆寫時套用；它不回寫 analysis sidecar 或播放 tempo。

Lyrics renderer 同樣維持單一 public owner：`src/composables/useLyrics.js` 保留 library／
playlist scope、選曲、HTML audio playback projection、watchers 與 `useLyrics()` facade；
canonical `lyricsDocument` 仍供 timing／reading authoring，衍生 `displayLyricsDocument` 則供
工作區與 Output；預設開啟的台灣繁體變體只依實際歌詞 script 判斷，不依 provider。
`src/composables/lyrics/useLyricsAcquisition.js` 負責 gated LRCLIB／NetEase／Better Lyrics
手動候選 acquisition；三者共用 renderer 候選狀態與搜尋 workspace。Main 的
allowlisted `all` intent
平行執行各來源、容納 partial failure，再以來源中立的錄音相關性與 timing capability 排序，
同錄音只在 presentation group 中提供來源替代項。每個 provider 仍保有自己的 scheduler、
parser、save-time refetch 與 provenance；跨來源不拼接歌詞。成功 discovery 使用 bounded
main-memory TTL cache，相同 in-flight query 去重，同來源的新 query abort 舊 query。NetEase
使用固定 HTTPS origin 的 bounded direct client，先做 metadata gate，再自適應取得足夠候選
的歌詞；逐筆驗證完整 YRC 才建立 T2 canonical timing sidecar，沒有有效 YRC 時只如實保存
T1／T0。Provider import 與 metadata backfill 另共用 main-owned automatic acquisition
orchestrator：只平行搜尋 LRCLIB／NetEase、只保存最佳 exact candidate，同一錄音內完整
T2 優先於 T1；Better Lyrics 不在自動 policy。最多同時處理兩首曲目並維持每曲 single-flight；
完整 T2 要求每一行都有 validated segments。Provider save-time refetch／fingerprint 後、同步保存
前再次檢查完整 T2、曲目音訊與 main-derived track-id generation，防止舊工作在曲目刪除或同 id
重建後提交；刪除先確認 filesystem record、失效該曲目的工作與 discovery cache，再同步移除，
generation 會在相關工作完成後回收。音訊 import 不等待此背景工作；provider source 保存成功
就以 bounded refresh options 刷新 library，後續 automatic preference 寫入失敗只記錄 bounded
diagnostic，不隱藏已提交來源。歌詞
manifest 的可選 preference 由 main 持久化，renderer 採 user preference 優先，
automatic preference 不覆寫使用者選擇。完整契約見
[多來源歌詞搜尋契約](contracts/multi-source-lyrics-search-contract.md)與
[Better Lyrics 快取來源取得契約](contracts/betterlyrics-acquisition-contract.md)。Better Lyrics
使用固定公開 cache-first API，不接受
API key 或 Apple token；其回應缺少實際命中 metadata，因此維持手動預覽／保存且不自動取得。
Bounded SAX TTML parser 只把完整 primary authored spans 投影為 T2，背景／翻譯／羅馬字 lane
不混入單線 canonical timing。退役前保存的 AMLL source／timing／artifact 維持可讀與可刪除，
但 `amll` 不在 renderer 入口、main allowlist 或 `all` fan-out；相容邊界見
[AMLL 退役相容契約](contracts/amll-acquisition-contract.md)。
此 composable 也保留沒有
production UI caller 的 Musixmatch official-API probe compatibility path；
`src/composables/lyrics/useLyricsSourceDocuments.js` 負責本機來源讀取、offset、timing、
label／delete 與手動匯入。Musixmatch path 不加入 candidate search／save 或自動取得；它只
作為未來取得付費 API 後的備用接線，詳細邊界見
[Musixmatch reserve adapter contract](contracts/musixmatch-reserve-adapter.md)。兩個內部
composable 接受具名 dependency，不互相 import；reading aid 與 timing editor 繼續由既有
獨立 composable 持有，不建立第二份 Lyrics state。

Import renderer 維持單一 module-scope session owner：`src/composables/useImportSession.js`
提供 readonly draft／accepted activity facade、computed UI projection、selection／filter、
草稿 status/error 與 download-directory adapter。草稿以 revision 隔離來源回應與舊工作寫回；
確認後的單曲／批次快照不隨新搜尋、Modal 關閉或 Dock 換頁清除；
`src/composables/import/useImportSourceResolution.js` 負責 provider-backed text／URL、
playlist／single resolution、candidate selection 與 structured-clone-safe preview；main 的
`electron/lib/importInput.js` 先將 bounded intent 分類，`playbackSearch.js` 只組合固定
YT Music `#songs` URL 與 bounded flat `ytsearch` 查詢。前者完整解析最多三筆結構化歌曲
資訊，後者每個 query 最多取八筆一般 YouTube 版本；runner 回傳後再次截到各來源上限，
同 video id 合併 provider evidence，再由 `importResolver.js` 對完整 bounded pool 評分後
最多投影十二筆。YT Music hostname 或搜尋命中本身不覆蓋 live／MV／variant 證據；
Topic／auto-generated music fields、官方音源、title／artist、duration 與弱化封頂的
`view_count` 共同決定 recording fit 與順序。純文字搜尋只有 finite-duration
release recording 可自動選取，其他版本保留人工選擇。Renderer 只顯示來源、版本、
長度與精簡觀看數，不揭露內部分數或 confidence badge。
Spotify／Apple Music URL 目前只回傳 deferred 狀態，不觸發外站 request。需要人工探索時，
現有 session owner 只發出
「以目前文字開啟 YT Music」意圖；系統瀏覽器的帳號／cookie 不進入 Electron，結果必須由
使用者複製回既有 allowlisted input；
`src/composables/import/useImportExecution.js` 持有 accepted batches 與共用兩路下載提交池，
同曲 in-flight consumer 去重、逐首／整批停止與重試，以及 playlist／album finalizing。
同來源的 collection 寫入依序合併成功成員，已下載歌曲不因清單儲存失敗而重下載。
Main 原有 scheduler、feature gate、下載與逐首曲庫提交仍是執行邊界；不新增 progress IPC。
Dock 與 Modal 只投影同一批次 id：Dock 延遲顯示件數監看、持續保留未完成結果，Modal
可關閉並重開唯讀明細。每批最多 500 個不同 track id，最多保留 50 批 session 記錄，
滿額時先清除舊成功記錄，不清除執行中或失敗工作；不持久化或宣稱重啟續傳。
兩個內部 composable 接收具名 dependencies，不互相 import。詳細狀態、取消與驗證邊界見
[匯入工作 session 契約](contracts/import-task-session.md)。

候選搜尋的 duration 是預覽資訊；下載階段會由 yt-dlp 對 main-derived video id 再做 metadata
phase，完成後 `info.json` 的 duration 才是 library index 與 optional lyrics acquisition 的本機
權威。Renderer 不提供 executable、provider option、任意 URL 或最終 duration。

Music Analysis Workbench 同樣以 `src/composables/useMusicAnalysisWorkbench.js` 作為唯一
session state 與 public facade，負責 track selection、library／isolated signal owner、共用
phase/error/notice、初始化順序及既有 `useMusicAnalysisBatch.js` composition；
`src/composables/analysis/useMusicAnalysisCapabilitySession.js` 按 renderer bridge 共用一份
capability projection 與進度訂閱，跨 Settings／Workbench 生命週期；內部
`useMusicAnalysisCapability.js` 負責 status、準備／修復／移除與 bounded setup progress。
`src/composables/analysis/useMusicAnalysisJob.js` 維持 workbench 內的單曲 analysis progress、
status polling、run／cancel 與 sidecar reconciliation。內部 owner 接收具名 dependencies，
不互相 import，也不取代獨立 batch owner；離開 Settings 不停止 capability 訂閱。

一般使用者的 Music Analysis lifecycle 位於 Settings：
`src/composables/useMusicAnalysisSettings.js` 負責 boolean-only 自動分析偏好與既有
capability owner 的組合，`MusicAnalysisSettingsRow.vue` 只呈現用途、安裝狀態與
準備／修復／移除 intent。F5 Operations Workbench 只保留單曲強制執行、批次重跑與結果
診斷；capability 未準備或受損時只導向 Settings，不再重複 lifecycle action，也不是新曲
分析的必要入口。Evaluation 的 Music M2 Workbench 組合人工標註與 Benchmark Review；
`useMusicAnalysisReferenceAnnotation.js` 單獨擁有 renderer draft，main 以 opaque session
鎖定已驗證的 run config 與固定 `reference-worklist.json`，renderer 不提供路徑，且該路徑
不讀 prediction、不寫歌曲 sidecar。

`electron/lib/audioProcessing/structureAnalysisAutoQueue.js` 是 main-owned、記憶體內、
去重且單工的匯入後佇列。Provider download 與 local import handler 只交付 main-derived
track id；佇列重新檢查自動分析偏好、`audio-processing-flow`、capability readiness 與
sidecar currentness，並在手動 analysis／batch 結束後再執行。排入、檢查或分析失敗均
不得回滾已成功的下載或本地匯入。

`electron/lib/audioProcessing/separationQueueService.js` 是另一個 domain-specific、main-owned
記憶體佇列；它不與播放 Queue 或 Music Analysis batch 共用產品狀態。既有單曲產生與
播放清單批次加入都經過同一 owner，依序執行並以 open `(trackId, recipeId)` 去重；每首開始前
重新檢查 gate、依賴、來源與目前 profile 結果，預設略過已存在的 current result，只有明確
重新準備 intent 才覆寫。Main 提供 bounded status query／progress event、pause-after-current、
active cancel、pending move／remove／atomic clear、failed retry／dismiss 與 successful-history clear；Renderer 只提交
track ids、allowlisted product intent 與 boolean override。Queue status 只代表本次 App session
的操作進度，manifest 仍是結果存在與可播放的權威；重啟持久化、平行處理、ETA、完成通知與
worker／model reuse 不屬於第一階段。Renderer 的 clear-completed 只是移除 session history，
不得使用 durable delete 語意或刪除 manifest result。`separationHandlers.js` 將同一 bounded status 送往
`windowState.js`；Windows taskbar 以已完成首數加目前單曲百分比投影 aggregate progress，百分比
未知時使用 indeterminate、暫停時使用 paused、仍有失敗或取消項目時使用 error，idle／完成後清除。
伴奏工作清單的容量提示只在所有計畫歌曲都有可靠時長時顯示「最多新增」上限，不能冒充曲庫總占用；
曲庫實際分類容量與管理上限仍只由 Settings 的 storage owner 顯示。

## Feature Gates 與最小依賴單位

| 產品動作                               | Gate                    | 最小 managed unit              | Lifecycle boundary                                                                            |
| -------------------------------------- | ----------------------- | ------------------------------ | --------------------------------------------------------------------------------------------- |
| Local import、library、playback        | 無                      | 無                             | 永遠可用，不等待 optional service                                                             |
| Local compatibility conversion         | `audio-processing-flow` | FFmpeg                         | 使用者明示後才執行；缺依賴不影響同批直接匯入                                                  |
| Provider acquisition／search／backfill | `provider-flow`         | `yt-dlp-provider-tool` runtime | Embedded Python、yt-dlp wheel、provider 與 plugin 原子驗證／啟用                              |
| External lyrics lookup                 | `lyrics-flow`           | 無 installed binary            | 每次 external request 檢查；provider failure 不回滾已成功的本機工作                           |
| Quick／general separation              | `audio-processing-flow` | FFmpeg + selected model        | FFmpeg 與每個 model 可獨立 install／repair／remove                                            |
| BPM／beat analysis                     | `audio-processing-flow` | Beat This! `small0` capability | Settings 管理 lifecycle；ready 後新匯入依偏好進入 main-owned 單工佇列                         |
| Audio Python capabilities              | Capability policy       | Immutable lock／generation     | 獨立 runtime family、scheduler 與 lease；不與 Provider 或 ONNX lifecycle 合併                 |
| OBS loopback output                    | `public-output-flow`    | Built-in Overlay assets        | Start／publish 受 gate；stop／status 保持可用以復原                                           |
| OBS status／session timestamps         | `obs-integration`       | `obs-websocket-js`             | Main-owned lazy adapter、encrypted credential、bounded connect／request／reconnect；read-only |

BPM／beat analysis 的「依偏好」是 gate 內的預設開啟行為，不是獨立於 gate 之外；
app update 的啟動時自動檢查則不受本表任何一個 gate 保護，兩者的定義與理由見
[PRODUCT.md 的 Feature Gate 語意](../PRODUCT.md#feature-gate-語意)。

Research-only reverse-provider validation runs from `scripts/` in an ignored,
separately locked runtime and is not part of either product gate, Electron startup,
packaging, preload, renderer acquisition, or the fixed lyrics-provider registry.

`electron/lib/featureDependencies.js` 是 compatibility barrel；實作依責任拆為 registry、
download、safe archive、manifests、provider runtime、FFmpeg、models 與 lifecycle service。
每個 active dependency 必須對應一個已註冊 gate，deprecated model 不屬於 active state。
Registry-derived id、version 與 relative asset path 必須在 main 驗證後才能解析到
`userData/dependencies`；remove 以 dependency family root 為單位清除既有版本、暫存與
legacy model，不接受 renderer path，也不觸碰曲庫或已產生的分離結果。
系統與 managed FFmpeg 共用 `resolveFfmpegRuntime()`；失效的 system intent 只在已驗證的
managed executable 存在時降級，Settings status 與 processing runtime 不得各自重做來源
判斷。Dependency HTTP transfer 使用 connect／idle deadline，PowerShell archive extraction
另有 hard deadline；yt-dlp provider 子程序以 stdout／stderr activity 重設 idle deadline，
失去進度時終止 child。下載 URL、實際路徑、stderr 與 cancellation token 都留在 main。

## Output Boundary

Renderer 是 player／queue／lyrics 的來源，Main Projection Hub 則是所有外部投影的
收斂邊界。Envelope 使用 `bootId`、`sourceEpoch` 與 revision 排除 stale source；Output
server 分開呈現 liveness、source readiness 與 content/state updates。

Renderer Output ownership 分成三層：`src/composables/useOutputRuntime.js` 保留唯一
public singleton facade，負責 status／settings、port recovery、start／stop、slot
persistence、diagnostics 與初始化組合；
內部 `src/composables/output/useOutputRuntimeStatus.js` 接收同一 state 與具名 callbacks，
集中 status normalization、各操作錯誤與 healthy recovery，不建立第二份 state 或持有 IPC；
`src/composables/output/useOutputProjectionPublisher.js` 負責
player／queue／lyrics／既有日文 reading／music structure projection、document-before-state
envelope 排序、continuity／`sourceEpoch`、各 stream
revision/reference 與 latest-only watcher publishing；
`src/composables/useSpoutOutput.js` 只負責 Spout2 sender 的 status／FPS intent／
start-stop renderer IPC，不持有 canonical projection。三者都只透過具名 callbacks 取得
bridge、gate 與 runtime status 邊界，不持有服務啟停、設定或 slot persistence（除
`useOutputRuntime.js` 本身）。

Browser Source 只能讀取 canonical snapshot 與 allowlisted media，路由涵蓋
`overlay/lyrics/`、`overlay/setlist/` 與 Now Playing。Now Playing 的封面模板由已公開
的 track id 經 `/media/artwork/` 解析縮圖；snapshot 不包含 `utawakui-media:` URL、
absolute path 或 provider payload。Public WebSocket 不接受 playback commands。

App-owned Overlay choreography 透過 exact allowlist 提供的 GSAP browser asset 執行；
GSAP recipe 持有可中斷的 playhead、sequencing、reduced-motion 與 lifecycle cleanup，
但只消費 canonical projection，不建立第二份播放狀態。CSS 仍持有 layout、material、
transform origin、靜態 state 與簡單且非歌曲同步的 transition；兩個引擎不得同時持有
同一 animated property。控制面板的 Gallery mockup 可使用輕量 CSS preview，真實
Workbench iframe 則沿用 Browser Source runtime。

`electron/lib/outputServer.js` 保留 public service API、WebSocket lifecycle 與 projection
delivery ownership；`electron/lib/outputServer/http.js` 是獨立的唯讀 HTTP delivery plane，
持有 exact static/artwork route、asset cache、security headers 與 bounded startup telemetry。
HTTP plane 只透過具名 getter 讀取 canonical snapshot／client count，不 import `ws`、delivery
queue 或 mutable projection state。

Spout2 重用 canonical Lyrics route。Main 推導固定 surface／loopback URL、重新檢查 gate 並監督 helper；helper 才載入 native bridge、擁有 sandboxed offscreen BrowserWindow／sender、驗證 shared texture 並釋放每個 frame。Renderer IPC 只有 status、30／60 FPS intent、start 與 stop。名稱碰撞、連續 texture defect 或 renderer failure 都回傳 bounded error；`sending` 只代表首幀已送入 sender。Browser Source 獨立運作，Output server 重建前會先停止 helper。

## 錯誤與 Diagnostics

1. Handler 在 gated operation 開始前先 enforcement；gate-disabled 是預期控制流，不記錄
   為 failure。
2. Operational failure 由 main diagnostics service 保存原始 error 與有限的 categorical
   context。
3. IPC 只回傳 bounded `UTAWAKUI_APP_ERROR`，不包含 path、URL、stderr 或 provider body。
4. `diagnosticRecorded: true` 防止 renderer 重複保存；若 main recording 失敗，renderer
   才保存 safe public fallback。
5. Cross-runtime download-failure values 位於 `shared/downloadFailureValues.json`；main
   負責分類，renderer 負責顯示文案。

`electron/main/diagnosticsLifecycle.js` 仍是 process／webContents failure recorder；只有目前
主視窗的 fatal renderer exit、main-frame load／preload failure 或 unresponsive 會轉交
`rendererRecovery.js`。Recovery 在每個 main process 最多開啟一個原生 dialog，只提供
「重新啟動 Utawakui／退出」；選擇重新啟動時由 main 執行 `app.relaunch()` 後進入正常
quit lifecycle，dialog 本身失敗則記錄 bounded code 並退出。Performer、startup probe、
Spout helper 與 Chromium child-process failure 仍由各自 owner／Chromium recovery 處理，
不會彈出重複 recovery dialog。

使用者回饋建立在同一 diagnostics service 上，但不共用它的 IPC boundary：
`electron/lib/feedback/{constants,payload,client}.js` 是純函式與注入式
`fetch` client，`electron/main/feedbackHandlers.js` 才是唯一的 IPC 邊界，
沿用 `diagnosticsHandlers.js` 的 `{ok, errorCode}` result object 慣例，不跨
IPC throw。Payload 建構重用既有 `buildDiagnosticsSupportBundle` 與
`service.listRecent`；只有錯誤回報可夾帶最近 50 筆事件，其餘三種回饋類別
完全不夾帶。Renderer 端 `src/composables/useFeedbackReport.js` 是唯一
module singleton，任何入口（錯誤通知的 action、Settings 常駐入口）都呼叫
同一個 `openReport()`，不建立第二份草稿狀態。CSP 沒有 `connect-src`，所以
上傳請求只能由 main 發出；relay（`services/feedback-relay/`）獨立部署，不
在 `electron-builder.yml` 的封裝範圍內，也不受任何 feature gate 保護——
每次送出前的強制預覽才是實際防護。Production client 固定送到
`https://api.utawakui.llazypilot.com/feedback/submit`，並帶公開、版本化且不視為
驗證秘密的 client marker；relay 只接受該 exact POST route，對 streamed body
設上限，且在 KV binding 缺失或操作失敗時 fail closed。Wrangler 關閉平行的
`workers.dev` route，Custom Domain 是唯一 production origin。決策細節見
[ADR 0016](adr/0016-user-feedback-intake.md)。

## Packaging Boundary

完整第三方授權集合以 `third-party/NOTICES.txt`／`manifest.json` 經 `extraResources` 交付至 `resources/third-party/`；離線 generator 及 afterPack／unsigned-package verifier 檢查版本、全文與指定 native binary。原始 Electron／Chromium 及字型 notices 繼續各自保留，按需下載的權利義務不混入基礎 installer 已驗證範圍。

- `dist/` 是 Vite renderer output；`overlay/` 不進入 Vite bundle。
- 封裝固定使用 Electron 43.7.8，並關閉 Node options environment 與 Node CLI inspect
  fuses、開啟 embedded ASAR integrity 與 only-load-from-ASAR。`RunAsNode` 暫時保留給
  ADR 0005 的 yt-dlp EJS runtime 及 ADR 0026 固定、受控的 ONNX 環境 probe；
  兩條 Node 子程序路徑都遷移後才可關閉。`GrantFileProtocolExtraPrivileges` 暫時保留給主
  renderer 的 `file://` 載入。兩者都要在替代 runtime／app-owned scheme 完成後才能關閉。
- `electron/`、`shared/` 與內建 resources 進入 `app.asar`，需要外部解析或執行的檔案
  由明確 `asarUnpack`／`extraResources` 規則交付。
- App-managed Provider、FFmpeg、models 與 Audio Python 存在 user data dependency root，
  不綁入 base installer，也不進入 app startup critical path。
- 完整 package mapping 以 [release-inventory.md](operations/release-inventory.md) 為準。
- App update 由 `electron/main/appUpdateService.js`／`appUpdateHandlers.js` 經
  `electron-updater` 驅動，`shared/appUpdateValues.json` 提供 renderer 快照；
  `src/composables/useAppUpdate.js` 是唯一 renderer owner。目前 `signExecutable`／
  `verifyUpdateCodeSignature` 為 false，屬 unsigned updater runtime。Ordinary CI 使用
  官方 v0.3.0 installer，對候選版執行 same-root 覆蓋安裝、資料保留、installed startup
  與 uninstall cleanup gate；production stable-feed 應用內跨版本更新仍須等候選版
  公開後取得實際證據。封裝檔名依 ADR 0002 保留 `electron.exe`，Electron 43 的
  `app.isPackaged` 因而可能為 false；只有 `detectPackagedRuntime()` 已由 exact
  `resources/app.asar` 確認為正式 artifact、且 Electron heuristic 不一致時，composition
  root 才為 `electron-updater` 啟用 override，並把 config path 固定到 builder-owned
  `resources/app-update.yml`。Source／普通 development launch 不會因此接觸公開 feed。
  每次 check 在 upstream resolve 後仍須已收到 available／not-available／error terminal
  event；沒有事件（包含 updater inactive 回傳 `null`）一律轉為可重試 error，不能停在
  `checking`。Installer 下載位置由 `electron-updater` 的 app cache／`pending` 目錄持有，
  renderer 不提供目的路徑；每次下載使用 cancellation token 與 progress-reset idle deadline，
  upstream resolve 後若未收到 `update-downloaded`／error terminal event 也一律 fail closed，
  不能停在 `downloading`。
- `electron/lib/updateManifestClient.js`、`updateManifestVerification.js` 與
  `tools/update-signing/` 提供 app-level signed manifest foundation。Main-private
  descriptor 將 installer basename／size／SHA-512 exact-bind 到
  `electron-updater` 的 `UpdateInfo`；schema v2 使用 Ed25519 多簽章、SPKI SHA-256
  key id 與 RFC 8785 相容 canonical bytes，可讓 active／retiring key 在跳版 client
  間重疊驗證。Release workflow 已拆成無 secret package、protected sign 與 protected
  publish jobs。`signedManifestEnabled` 目前仍為 false，registry 只有 development key，
  因此尚未改變已發布版本的安全邊界。Installer 維持 owner 明確接受、目前不規劃購買
  Authenticode 憑證的 unsigned channel。
- `obs-websocket-js` 隨 production dependency closure 封裝，但 disabled adapter 不在
  startup 載入 SDK，也不開 socket 或 timer。
- 「有什麼新變化」公告內容隨版本內建於 `shared/releaseAnnouncement.json`
  （`version`／`summary`），不在 runtime 解析或下載遠端 release notes；
  `src/composables/useAppAnnouncement.js` 是唯一 renderer owner，比對 main 存的
  `lastSeenAnnouncementVersion` 決定是否顯示一次。`shared/releaseAnnouncement.test.js`
  斷言 `version` 與 `package.json` 同步；發版流程見
  [release-notes-template.md](operations/release-notes-template.md)。
