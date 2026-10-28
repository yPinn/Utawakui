# 輸入綁定契約

本文件是 renderer 輸入綁定的唯一清單與規則來源。app 層鍵盤綁定的程式碼真值是
[inputBindingRegistry.js](../../src/utils/inputBindingRegistry.js)，由
[useKeyboardShortcuts.js](../../src/composables/useKeyboardShortcuts.js) 分派；
固定 player／history 定義在 [keyboardBindingDefinitions.mjs](../../shared/keyboardBindingDefinitions.mjs)，Main 與 renderer 共用其保留鍵與 Shift wildcard 政策；
新增、移除或改動任何 app 層綁定時，必須同步更新 registry、本文件與
[測試](../../src/utils/inputBindingRegistry.test.js)。

導覽歷史模型見 [ADR 0025](../adr/0025-renderer-navigation-history.md)；本文件記錄目前已實作的輸入。

## 分層

| 層級         | 範圍                                        | 擁有者                            |
| ------------ | ------------------------------------------- | --------------------------------- |
| App 綁定     | 全域 `keydown`，與焦點無關的 app 級動作     | `inputBindingRegistry.js`         |
| Pointer 綁定 | 滑鼠側鍵（button 3／4），共用歷史走訪出口   | `inputBindingRegistry.js`         |
| Dismiss 層   | Escape 關閉最上層的浮層、Dock 或面板        | 各浮層元件，彼此靠事件協調        |
| Widget 慣例  | 焦點在控件內時的方向鍵、Enter、Home／End 等 | 各 `Ui*` 原件與 feature 元件      |
| 區域工具綁定 | 僅在某工具或對話框掛載期間有效的快捷鍵      | 該工具元件（目前皆為 dev 或浮層） |
| 系統入口     | 工作列、SMTC、系統匣；不經過 DOM 事件       | Electron main／媒體工作階段       |

只有 App 綁定進 registry。Widget 慣例遵循對應 WAI-ARIA 模式，不當作 app 快捷鍵管理。

## 自訂快捷鍵契約前置

[keyboardShortcutContract.mjs](../../shared/keyboardShortcutContract.mjs) 固定七個可自訂命令：播放／暫停、上一首、下一首、移調 +1／−1、歌詞 offset +0.1／−0.1 秒。Settings → 應用程式 → App 快捷鍵可逐列錄製、套用、停用或恢復預設，也可恢復全部預設。App 啟動後讀取機器設定，只有確認保存的配置才交給 registry／dispatcher 與既有命令 owners。沒有 OS 快捷鍵註冊，空白鍵不自動指派。

配置只收 `schemaVersion: 1`、`globalEnabled` boolean 及最多七筆 `bindings`；每筆只含 allowlist `command`、`app`、`global`。App 為 `default`、`disabled` 或含一組 `chord` 的 `custom`；global 為 null 或一組 chord。未列命令補為 App default／global null，重複命令與額外欄位拒絕。預設 global 關閉，App 只有原移調 Ctrl+↑／↓ 有預設鍵，其餘五個未設。

Chord 僅含邏輯 `key` 與明示 boolean 的 `ctrl`／`alt`／`shift`，不收 accelerator 字串。正規化大小寫、Up／Down／Left／Right 至 Arrow 名稱、Spacebar／空白字元至 Space；首版子集為 ASCII A–Z、0–9、四方向鍵、Home／End／PageUp／PageDown、Space、F10–F12。符號、非 ASCII、numpad、媒體鍵、Tab／Enter／Esc、F1–F9（包含 ADR 保留 F4 與 dev 工具）不開放。Meta／Windows 不在 DTO；Ctrl+Alt 組合、Alt+Space，以及 Ctrl 搭配 A／C／F／H／L／N／O／P／R／S／T／V／W／X／Y／Z（含 Shift）保留。Global 另須 Ctrl 或 Alt。這是允許提交的邏輯子集，不代表 OS 已註冊或所有鍵盤配置已實測。

驗證同時檢查有效 App、desired global（即使全域關閉）與呼叫端提供的固定 registry；Ctrl／Alt／Meta 精確相符，舊 `shift: null` 與兩種 Shift 都重疊。同 scope／不同命令、跨 scope／不同命令及固定鍵重疊拒絕，錯誤只附兩個命令識別。跨 scope 同命令同 chord 可存為候選；單一執行者與 global active 的分派仍待後續接線。原可替換命令依完整配置重新計算，不拿舊 Ctrl+↑／↓ 當不可釋放的固定鍵。

`createKeyboardBindings({ shortcutConfiguration })` 先驗整份候選，再移除被停用／替換的舊命令，新增每命令最多一組 App 綁定；不使用 global chord。default 沿舊 Key 長按政策，明示 custom 才啟用 `noRepeat`／`skipIfHandled`。候選解析經 [shortcutInputContext.js](../../src/utils/shortcutInputContext.js) 讓位於原生 editable、interactive 祖先與 composed path 的 ARIA widget；IME composing／229、AltGraph、Meta、numpad、repeat、已處理事件也拒絕。dispatcher 也讓 custom 避開現有 transient overlay，並支援 caller 的額外 blocked／recording context；錄製期間整個 dispatcher 讓位。下列舊綁定的浮層差異保留，不因此宣稱已修正。

`useKeyboardShortcuts` 接受完整配置值、ref 或 getter；更新須替換整份不可變配置。每次替換使舊 executor generation 失效，再編譯整份候選；壞配置退回舊基線，公開 bounded `configurationError`，不冒稱偏好恢復成功。custom 先驗 context 與 `canExecute` 才 `preventDefault`，每次按壓只交給一個 executor；repeat、busy／blocked 不排隊。卸載移除監聽、停止配置 watch 並使在途失效。

## 七命令執行邊界

[useShortcutCommands.js](../../src/composables/useShortcutCommands.js) 只協調 player／transport／lyrics；結果為 executed／busy／blocked／unavailable／stale／failed／unknown，不攜帶 private error，不保存歌曲 profile 或另一套命令佇列。

- 播放中明確 pause；一般 pending start 也 pause 並取消，不能因晚回結果重播。沒有載入曲目不猜第一首；loaded paused 呼叫原 `play`，A–B gap 沿原練習 owner 立即開始。場次 busy 的 pending 不以快捷鍵改接另一場次；manual 沒有曲目時不假完成。
- 上一／下一首沿原 transport／`canPlayNext`，通過檢查後先用 player practice boundary 清除練習，再交給原 queue／場次 previous／next。上一首無歷史沿原 restart、保留 paused；下一首不可用不改 queue／練習。場次的明確 next 沿原 interrupted 語意，不呼叫自然完成或 manual complete。
- 移調只從本次 DSP applied、兩個必要 lane 與畫面值一致的 confirmed 值 ±1，達 ±12、不確定／失敗或 pending 不再提交。現有 setter 接受 `isCurrent`，graph 跨 await 驗播放 id／URL／revision／start request 與配置 generation，失效不套到新曲。新快捷鍵的 busy 不排隊；舊預設 Key 長按仍維持原 setter 政策。
- offset 只調與載入 player 同曲的 active source；缺 session、來源讀取、timing／offset／source action／人工確認 busy、offset 保存錯誤或 profile／場次 pending 不執行。不暗選來源、不發布 editor 草稿或人工收據；±0.1 秒沿原 round／Main ±1 小時界限及 CAS 保存。
- offset 進原保存 queue 前再驗來源 session、timing／offset revision、播放與配置、較新的 offset intent 及 busy。尚未送 IPC 的取消，只撤回仍由該 intent 擁有的 preview；有新 edit 不覆蓋。已送出的保存沿原 source owner／Main CAS，提交結果不因配置變更回滾；晚回不對新情境報成功。成功須保存回應、session／revision 及目前 preview 都相符。

配置替換／卸載只取消仍由該 executor 同步交給 player、request revision 相符的 pending start，不取消其他 caller 的後續 start；已交給 transport／場次的操作仍由其 owner 管理，不逆向撤回已提交進度。Main global envelope／單一 OS 分派尚待後續，不用 App 單元結果取代 Windows gate。

## 機器保存與錄製

`electron/lib/keyboardShortcutSettings.js` 只使用 Main 提供的 userData，固定保存 `keyboard-shortcuts.json`，與 library 及一般 `config.json` 分開。檔案上限 16 KiB；只讀普通檔案，open 後再驗 identity／大小並有界讀取。Envelope 只含 `schemaVersion: 1`、每次寫入新產生的 `writeId` 及完整 `configuration`。公開 CAS revision 為 Main 導出的不透明 bytes digest；新 write id 使正常保存 A–B–A 不復活舊 revision。不存在時回 default／null revision，不自動建檔；壞 JSON、未知 schema、過量／不合法配置或重導目標保留原 bytes，不被 default 覆蓋。

本階段 Main 保存只接受 global 關閉、所有 global chord 為 null 的配置；含未支援 global 資料的檔案保持唯讀。純 validator 仍能預先檢查跨 scope 衝突，不代表已開放全域設定。保存前 Main 重驗七命令、與共用固定鍵的衝突及 expected revision，衝突不寫；沿既有原子 JSON primitive 使用 Main 隨機命名 staging，最後 rename 安裝，失敗清理自己的 staging，不改舊檔。沒有新增 dependency／worker 或 library 欄位。

`keyboard-shortcuts:get` 無 payload；`keyboard-shortcuts:set` 只收 expected revision 與完整配置。兩者只接受主控制台的 main frame，Performer／Output／foreign frame 不可使用；preload 僅暴露固定方法，將 readonly renderer 配置投影為有界普通 DTO，不轉送 callback、任意欄位、檔案路徑或 accelerator。I/O 錯誤沿既有 Main diagnostics／public error 邊界；壞資料與 CAS 衝突是有界預期結果。

`useKeyboardShortcutSettings` 是 App 與 Settings 共用的單一機器偏好 owner。讀取失敗／壞檔／未支援格式讓 custom 停用並呈現待讀，基本綁定仍可操作；不把 fallback 顯示為已讀取。保存採悲觀啟用、busy 不排隊，回應須是相同完整配置與新的有效 revision。失敗保原 active／候選並提供重讀；CAS／不合法磁碟狀態使舊 custom 失效，重讀後才重新啟用。讀寫有 10 秒結果等待上限，timeout 不聲稱回滾 Main 已提交的保存，晚回與卸載不改新 owner。

錄製只在明確聚焦的設定控制內接收完整邏輯 chord。Modifier 單獨按下不存半組，IME／AltGr／Meta／numpad／repeat／handled 或保留鍵不成為候選；與固定／其他命令衝突顯示已知命令名稱。錄到候選後仍持有錄製 session，直到套用或取消才恢復 App dispatcher，避免放開前的長按或試鍵觸發原命令。候選不自動保存；套用成功才更新 active，失敗可重試或取消。Esc、Tab、離開編輯群組、native blur／最小化、hidden、收合或卸載取消未提交錄製；已送出保存的確認結果由偏好 owner 管理，不冒稱取消可撤回已提交。獨立 token 防止舊 recorder 清掉新的錄製 session。

## Registry 規則

- 按鍵比對不分大小寫；`Ctrl`、`Alt`、`Meta` 必須與綁定宣告完全相符，因此未宣告的 `Alt`／`Meta` 組合仍保留、不解析為任何綁定。目前只有歷史走訪宣告 `Alt`。
- `Ctrl` 是綁定的一部分：按住 `Ctrl` 時不會退回同鍵的純按鍵綁定。
- `shift` 為 `null` 時忽略 Shift；為 `true`／`false` 時必須相符。
- `editable: 'ignore'` 的綁定在 `INPUT`、`TEXTAREA`、`SELECT`、contentEditable 目標上不觸發；`'allow'` 不看焦點。
- 視圖切換綁定由 [appDestinationRegistry.js](../../src/utils/appDestinationRegistry.js) 衍生，不重複宣告快捷鍵。
- dev-only 綁定只在 `internalViewShortcuts` 提供時存在，正式版沒有。
- `noRepeat` 的綁定忽略按鍵自動重複（仍 `preventDefault`）；`skipIfHandled` 的綁定在事件已被元件處理（`defaultPrevented`）時讓位。

## App 綁定

| id                            | 輸入            | 動作               | 編輯欄位內 | preventDefault |
| ----------------------------- | --------------- | ------------------ | ---------- | -------------- |
| `view.library`                | F1              | 前往曲庫           | 觸發       | 是             |
| `view.performance`            | F2              | 前往演唱工具       | 觸發       | 是             |
| `view.display`                | F3              | 前往畫面輸出       | 觸發       | 是             |
| `view.settings`               | F9              | 開啟設定           | 觸發       | 是             |
| `view.internal.*`             | F5–F8（僅 dev） | 開啟內部工作台     | 觸發       | 是             |
| `player.transpose-up`         | Ctrl+↑          | 移調 +1            | 忽略       | 是             |
| `player.transpose-down`       | Ctrl+↓          | 移調 −1            | 忽略       | 是             |
| `player.tempo-up`             | Ctrl+Shift+↑    | 速度 +0.05         | 忽略       | 是             |
| `player.tempo-down`           | Ctrl+Shift+↓    | 速度 −0.05         | 忽略       | 是             |
| `player.mute`                 | M               | 靜音切換           | 忽略       | 否             |
| `player.guide-vocal`          | G               | 導引人聲切換       | 忽略       | 否             |
| `player.volume-up`            | ↑               | 音量 +10%          | 忽略       | 是             |
| `player.volume-down`          | ↓               | 音量 −10%          | 忽略       | 是             |
| `obs.marker`                  | K               | 新增 OBS 標記      | 忽略       | 否             |
| `history.back`                | Alt+←           | 上一頁             | 觸發       | 是             |
| `history.forward`             | Alt+→           | 下一頁             | 觸發       | 是             |
| `history.back.browser-key`    | BrowserBack     | 上一頁（瀏覽器鍵） | 觸發       | 是             |
| `history.forward.browser-key` | BrowserForward  | 下一頁（瀏覽器鍵） | 觸發       | 是             |

F4 依 [ADR 0023](../adr/0023-renderer-destination-and-workspace-model.md) 保持未指派。
`obs.marker` 的 K 是占位綁定，待 Owner 依功能使用數據統一安排；清點前保留現狀。
音高（cents）刻意只提供滑鼠與面板操作。

目前 `player.guide-vocal` 的 G 實際呼叫 `toggleCaptureGuideVocal`，切換擷取導唱，與監聽導唱開關不同；registry 顯示名稱較泛，本文件明示執行對象，不在此改變綁定。

## Pointer 綁定與歷史走訪

| id                      | 輸入                     | 動作   |
| ----------------------- | ------------------------ | ------ |
| `history.back.mouse`    | 滑鼠上一頁鍵（button 3） | 上一頁 |
| `history.forward.mouse` | 滑鼠下一頁鍵（button 4） | 下一頁 |

滑鼠在按鍵放開（`mouseup`）時走訪；`mousedown` 與 `auxclick` 只阻止瀏覽器預設行為。
鍵盤、滑鼠與 Windows `app-command` 三條來源都收斂到 `requestHistoryTraversal`
（[useNavigationInput.js](../../src/composables/useNavigationInput.js)），共用兩條規則：

- 有 modal、menu 或 popover 開啟時不走訪（關閉由 Esc 負責）；編輯欄位內仍可走訪。
- 同方向的請求在 60 ms 內只算一次：Windows 上一次側鍵或瀏覽器鍵可能同時產生 DOM 事件與
  `app-command`。

Main 端的 `app-command`（`browser-backward`、`browser-forward`）由
[appCommands.js](../../electron/main/appCommands.js) 轉成固定的 `back`／`forward` 意圖，
經 `onHistoryCommand` 送到 renderer；其他 app command 不轉送。

## Dismiss 層與區域工具綁定

| 來源                                   | 輸入                                        | 行為                                                       |
| -------------------------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| `App.vue`                              | Esc                                         | 收合 Right Dock；有 transient overlay 或事件已被處理時不動 |
| `UiModal`                              | Esc、Tab                                    | 僅最上層 modal 關閉；Tab 焦點陷阱                          |
| `UiActionMenu`                         | Esc                                         | 有搜尋字時先清除，否則關閉選單並停止傳遞                   |
| `UiPopover`                            | Esc（capture）                              | 關閉浮層，排除相關浮層                                     |
| `BgmPlayer`                            | Esc                                         | 先收合 picker，再要求關閉                                  |
| `TrackPreviewOverlay`                  | ↑／↓、M（capture）                          | 上下首預覽、靜音；其餘按鍵隔離，F 鍵、Esc、Tab 放行        |
| `MusicAnalysisReferenceEditor`（dev）  | Ctrl／Cmd+S、Alt+←／→、B、N、1–9、Shift+1–9 | 人工標註；可編輯欄位內忽略                                 |
| `LyricsProviderReviewWorkbench`（dev） | Ctrl+Enter、Ctrl+Backspace                  | 核准、退回；退回需非可編輯目標且已有理由                   |

## Widget 慣例（代表性清單）

- Roving focus：`UiTabs`、`UiSegmentedControl`、`ObsPositionPicker`（方向鍵、Home／End、RTL）。
- 選單與下拉：`UiCombobox`、`ObsLookSelect`、各 Action Menu。
- `TrackTable`：欄位標題鍵盤重排、欄寬鍵盤調整；列 action 鍵。
- 縮放把手：Sidebar、Right Dock（方向鍵、Home／End、Enter／Space）。
- 便利貼畫布：方向鍵移動、Enter／Space 啟動、編輯器內按鍵。
- 演唱計畫列、分離工具列的選單鍵、歌詞面板捲動鍵（暫停跟隨）。
- Enter 提交：曲目資訊、歌單詳情、藝人身分、資料夾便利貼、歌詞來源、匯入來源、輸出 runtime 設定。

## 系統入口

- 工作列縮圖按鈕（[mainWindow.js](../../electron/main/windows/mainWindow.js)）。
- SMTC 卡片與硬體媒體鍵：註冊 `play`、`pause`、`previoustrack`、`nexttrack`（[useMediaSession.js](../../src/composables/useMediaSession.js)）；上一首／下一首與 PlayerBar 共用 [usePlaybackTransport.js](../../src/composables/usePlaybackTransport.js)。
- 系統匣導覽。
- 滑鼠側鍵、瀏覽器導覽鍵與 Windows `app-command`：見上方「Pointer 綁定與歷史走訪」。

## 已知差異（記錄，未修正）

下列項目為清點時發現，目前行為維持不變，待 Owner 依使用數據決定：

1. F 鍵（視圖切換）在輸入框內也會觸發，其餘 app 綁定則會忽略可編輯欄位。
2. 可編輯判斷已涵蓋 `INPUT`、`TEXTAREA`、`SELECT` 與 contentEditable；原生 `INPUT` range 也在其中。自訂 ARIA widget／slider、內層事件目標與焦點組合仍需實機盤點。
3. 只有 `TrackPreviewOverlay` 會隔離全域按鍵；其他 modal 開啟時，F 鍵與 M／G／K／方向鍵是否穿透尚未實測。
4. Esc 由多個元件各自監聽，靠 `stopPropagation`、`defaultPrevented` 與 `hasOpenTransientOverlay` 協調，沒有統一的 dismiss 堆疊。
5. 沒有空白鍵播放／暫停。
6. `obs.marker` 的 K 為占位。
7. Alt+←／→ 同時是 `MusicAnalysisReferenceEditor`（dev）的邊界微調。編輯區內該元件先處理並 `preventDefault`，歷史走訪因 `skipIfHandled` 讓位；焦點在編輯區外時走訪優先。
8. 滑鼠側鍵與瀏覽器鍵在實機上是否同時送出 DOM 事件與 `app-command` 尚待 Owner 驗收；目前以 60 ms 去重涵蓋兩種情況。
