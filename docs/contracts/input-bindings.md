# 輸入綁定契約

本文件是 renderer 輸入綁定的唯一清單與規則來源。app 層鍵盤綁定的程式碼真值是
[inputBindingRegistry.js](../../src/utils/inputBindingRegistry.js)，由
[useKeyboardShortcuts.js](../../src/composables/useKeyboardShortcuts.js) 分派；
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

## Registry 規則

- 按鍵比對不分大小寫；`Ctrl`、`Alt`、`Meta` 必須與綁定宣告完全相符，因此未宣告的 `Alt`／`Meta` 組合仍保留、不解析為任何綁定。目前只有歷史走訪宣告 `Alt`。
- `Ctrl` 是綁定的一部分：按住 `Ctrl` 時不會退回同鍵的純按鍵綁定。
- `shift` 為 `null` 時忽略 Shift；為 `true`／`false` 時必須相符。
- `editable: 'ignore'` 的綁定在 `INPUT`、`TEXTAREA`、contentEditable 目標上不觸發；`'allow'` 不看焦點。
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

- Roving focus：`UiTabs`、`UiSegmentedControl`、`ObsPositionPicker`、`useRovingRadioGroup`（方向鍵、Home／End、RTL）。
- 選單與下拉：`UiCombobox`、`ObsLookSelect`、各 Action Menu。
- `TrackTable`：欄位標題鍵盤重排、欄寬鍵盤調整；列 action 鍵。
- 縮放與移動把手：Sidebar、Right Dock（方向鍵、Home／End、Enter／Space）；BGM 標題列（方向鍵，Shift 加速，Home 復位）。
- 便利貼畫布：方向鍵移動、Enter／Space 啟動、編輯器內按鍵。
- 演唱計畫列、分離工具列的選單鍵、歌詞面板捲動鍵（暫停跟隨）。
- Enter 提交：曲目資訊、歌單詳情、藝人身分、資料夾便利貼、歌詞來源、匯入來源、輸出 runtime 設定。

## 系統入口

- 工作列縮圖按鈕（[windowState.js](../../electron/main/windowState.js)）。
- SMTC 卡片與硬體媒體鍵：註冊 `play`、`pause`、`previoustrack`、`nexttrack`（[useMediaSession.js](../../src/composables/useMediaSession.js)）；上一首／下一首與 PlayerBar 共用 [usePlaybackTransport.js](../../src/composables/usePlaybackTransport.js)。
- 系統匣導覽。
- 滑鼠側鍵、瀏覽器導覽鍵與 Windows `app-command`：見上方「Pointer 綁定與歷史走訪」。

## 已知差異（記錄，未修正）

下列項目為清點時發現，目前行為維持不變，待 Owner 依使用數據決定：

1. F 鍵（視圖切換）在輸入框內也會觸發，其餘 app 綁定則會忽略可編輯欄位。
2. 可編輯判斷只涵蓋 `INPUT`、`TEXTAREA` 與 contentEditable，`SELECT`、slider 等控件不在內。
3. 只有 `TrackPreviewOverlay` 會隔離全域按鍵；其他 modal 開啟時，F 鍵與 M／G／K／方向鍵是否穿透尚未實測。
4. Esc 由多個元件各自監聽，靠 `stopPropagation`、`defaultPrevented` 與 `hasOpenTransientOverlay` 協調，沒有統一的 dismiss 堆疊。
5. 沒有空白鍵播放／暫停。
6. `obs.marker` 的 K 為占位。
7. Alt+←／→ 同時是 `MusicAnalysisReferenceEditor`（dev）的邊界微調。編輯區內該元件先處理並 `preventDefault`，歷史走訪因 `skipIfHandled` 讓位；焦點在編輯區外時走訪優先。
8. 滑鼠側鍵與瀏覽器鍵在實機上是否同時送出 DOM 事件與 `app-command` 尚待 Owner 驗收；目前以 60 ms 去重涵蓋兩種情況。
