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

只有可編譯的 App 綁定進 registry。暫時面板檢視由同一 dispatcher 先交給 `usePanelView`，不新增 registry 列或可保存命令。Widget 慣例遵循對應 WAI-ARIA 模式，不當作 app 快捷鍵管理。

2026-10-29 依 HEAD `98e8286f` 及當時工作樹逐一核對明示 key handlers、表單與原生控件；本次是程式盤點，不代表已逐鍵完成可見 Electron／裝置驗收。正式版預設 registry 有 17 筆綁定；內部工作台開啟時另加 4 筆。這個分母不含下列區域操作、Esc 層、原生控件及系統媒體入口，也不把十個可自訂命令誤算為全部鍵盤行為。UI 呈現建議沿[原第 4 項提案](../research/product/keyboard-shortcuts-detail-2026-10-26.md#鍵盤設定呈現建議2026-10-29)，不另立 roadmap。

## 自訂快捷鍵契約前置

[keyboardShortcutContract.mjs](../../shared/keyboardShortcutContract.mjs) 固定十個可自訂命令：播放／暫停、上一首、下一首、移調 +1／−1、歌詞提前／延後 0.1 秒，以及主播放器音量 +10%／−10% 與靜音。Settings → 應用程式 → App 快捷鍵可逐列錄製、套用、停用或恢復預設，也可恢復全部預設。App 啟動後讀取機器設定，只有確認保存的配置才交給 registry／dispatcher 與既有命令 owners。沒有 OS 快捷鍵註冊，空白鍵不自動指派。

配置只收 `schemaVersion: 1`、`globalEnabled` boolean 及最多十筆 `bindings`；每筆只含 allowlist `command`、`app`、`global`。App 為 `default`、`disabled` 或含一組 `chord` 的 `custom`；global 為 null 或一組 chord。未列命令補為 App default／global null，重複命令與額外欄位拒絕。預設 global 關閉，App 沿原移調 Ctrl+↑／↓、音量 ↑／↓ 與靜音 M，其餘五個未設。

Chord 僅含邏輯 `key` 與明示 boolean 的 `ctrl`／`alt`／`shift`，不收 accelerator 字串。正規化大小寫、Up／Down／Left／Right 至 Arrow 名稱、Spacebar／空白字元至 Space；首版子集為 ASCII A–Z、0–9、四方向鍵、Home／End／PageUp／PageDown、Space、F10–F12。符號、非 ASCII、numpad、媒體鍵、Tab／Enter／Esc、F1–F9（包含 ADR 保留 F4 與 dev 工具）不開放。Meta／Windows 不在 DTO；Ctrl+Alt 組合、Alt+Space，以及 Ctrl 搭配 A／C／F／H／L／N／O／P／R／S／T／V／W／X／Y／Z（含 Shift）保留。Global 另須 Ctrl 或 Alt，且拒絕 Windows debugger 保留的 F12；App 內 F12 不變。這是允許提交的邏輯子集，不代表 OS 已註冊或所有鍵盤配置已實測。

驗證同時檢查有效 App、desired global（即使全域關閉）與呼叫端提供的固定 registry；Ctrl／Alt／Meta 精確相符，舊 `shift: null` 與兩種 Shift 都重疊。同 scope／不同命令、跨 scope／不同命令及固定鍵重疊拒絕，錯誤只附兩個命令識別。跨 scope 同命令同 chord 可存為候選；單一執行者與 global active 的分派仍待後續接線。原可替換命令依完整配置重新計算，不拿舊 Ctrl+↑／↓ 當不可釋放的固定鍵。

`createKeyboardBindings({ shortcutConfiguration })` 先驗整份候選，再移除被停用／替換的舊命令，新增每命令最多一組 App 綁定；不使用 global chord。default 沿舊 Key 長按政策，明示 custom 才啟用 `noRepeat`／`skipIfHandled`。候選解析經 [shortcutInputContext.js](../../src/utils/shortcutInputContext.js) 讓位於原生 editable、interactive 祖先與 composed path 的 ARIA widget；IME composing／229、AltGraph、Meta、numpad、repeat、已處理事件也拒絕。dispatcher 也讓 custom 避開現有 transient overlay，並支援 caller 的額外 blocked／recording context；錄製期間整個 dispatcher 讓位。下列舊綁定的浮層差異保留，不因此宣稱已修正。

`useKeyboardShortcuts` 接受完整配置值、ref 或 getter；更新須替換整份不可變配置。每次替換使舊 executor generation 失效，再編譯整份候選；壞配置退回舊基線，公開 bounded `configurationError`，不冒稱偏好恢復成功。custom 先驗 context 與 `canExecute` 才 `preventDefault`，每次按壓只交給一個 executor；repeat、busy／blocked 不排隊。卸載移除監聽、停止配置 watch 並使在途失效。

Settings 展開快捷鍵後依播放控制、音訊調整、歌詞對時、操作說明四個局部分類 Tab 排序；前三類分別 3／5／2 列，說明唯讀。設定、候選與參考透過 KeyboardShortcutKeys 重用 UiKbd，modifier 組合保持同列，替代鍵組可換行。功能、鍵組／狀態、操作分組，錄製獨立列，依快捷鍵區本身的 container 寬度換行；共通錄製、焦點及長按規則集中於「操作說明 → 設定方式」，不在每類重複揭露，歌詞偏移自動保存語意留在類別旁。更多選單收停用與單列預設，整組預設在區塊末端。切換 Tab 取消未提交錄製，保存中不切分類，錯誤留在負責列或讀取提示；不新增實體鍵盤圖或推薦預設。

面向使用者的標題／說明使用歌曲音量、升／降調、歌詞提前／延後、選單與面板等操作用語。UiKbd 鍵帽採常見精簡標示：PgUp／PgDn、Menu、Back／Fwd、Play/Pause／Prev／Next；完整中文功能放旁文與可存取名稱，不顯示事件識別字，也不改實際鍵位與保存值。操作參考以可收合分類區分使用位置、鍵組與動作，提供原音訊波形入口，保留波形只移檢視、草稿需儲存與便利貼 Esc 保留文字等必要差異。一般設定只展示正式版使用者可達的鍵盤操作；內部工作台與非鍵盤的系統／滑鼠入口仍完整記錄在本契約，不混入使用者參考。

操作參考不重複列出系統通用的複製／貼上／全選、文字復原、一般焦點走訪及原生控件慣例，只保留本產品功能與需要交代的特殊行為。同情境操作合併成一個標題，標題下仍逐列對照鍵組、動作及必要提醒，不將多組功能混成一句。

同一列的替代鍵組具有完全相同的 Ctrl／Alt／Shift 前綴時，共用一次修飾鍵鍵帽，以斜線分隔可任選的主鍵。首組修飾鍵與主鍵保持同列，其餘替代鍵可換行；不同修飾、無修飾或單組鍵不合併。可存取名稱仍逐組展開完整組合並以「或」區分，不改原始 chord、設定值、錄製與匹配，也不跨功能合併動作。

原七列 schemaVersion 1 檔案在記憶體補齊音量／靜音三列 default，讀取不重寫原 bytes，既有自訂與 CAS revision 保留；明確保存才寫十列。default 的音量／靜音仍沿共用 legacy Shift wildcard 與長按政策，custom／disabled 才替換或釋出原鍵。預設 wildcard 亦參與完整配置衝突驗證，不因命令變可設定就漏驗 Shift。

## 固定面板檢視

主工作區、已展開右側面板與原音訊波形共用 `usePanelView` 暫時檢視 owner；最近點選／聚焦者為目前目標，反引號鍵切換放大／還原，Escape 僅在放大中還原。三區共用「放大面板／還原面板」按鈕；波形標題也有明確入口。沒有新視窗、transport、editor 或偏好保存，17 筆正式 registry 與十個可自訂命令不變。

沿既有 dispatcher 在錄製 early return 後、registry 比對前呼叫 panel handler。只收無修飾的單次按壓，讓位已處理、IME／229／AltGraph、editable target 及 composed path；其他 dialog／menu／listbox 存在時不切換，唯波形自己的 dialog 可操作本身。Escape 次序為選單／輸入、還原放大、原關閉／摺疊。來源、目的地、Dock surface 或掛載失效解除放大並撤銷舊目標，詳見[Shell 契約](shell-layout.md#暫時放大目前面板)。符號鍵仍不在錄製子集，不註冊 OS global。

## 十命令執行邊界

[useShortcutCommands.js](../../src/composables/useShortcutCommands.js) 只協調 player／transport／lyrics；結果為 executed／busy／blocked／unavailable／stale／failed／unknown，不攜帶 private error，不保存歌曲 profile 或另一套命令佇列。

- 播放中明確 pause；一般 pending start 也 pause 並取消，不能因晚回結果重播。沒有載入曲目不猜第一首；loaded paused 呼叫原 `play`，A–B gap 沿原練習 owner 立即開始。場次 busy 的 pending 不以快捷鍵改接另一場次；manual 沒有曲目時不假完成。
- 上一／下一首沿原 transport／`canPlayNext`，通過檢查後先用 player practice boundary 清除練習，再交給原 queue／場次 previous／next。上一首無歷史沿原 restart、保留 paused；下一首不可用不改 queue／練習。場次的明確 next 沿原 interrupted 語意，不呼叫自然完成或 manual complete。
- 移調只從本次 DSP applied、兩個必要 lane 與畫面值一致的 confirmed 值 ±1，達 ±12、不確定／失敗或 pending 不再提交。現有 setter 接受 `isCurrent`，graph 跨 await 驗播放 id／URL／revision／start request 與配置 generation，失效不套到新曲。新快捷鍵的 busy 不排隊；舊預設 Key 長按仍維持原 setter 政策。
- 主播放器音量沿 setVolume 調整 ±10%、限制 0–100% 並取到整數百分比；靜音沿 toggleMute。不需已載入曲目、不受 transport pending／場次 busy 影響，不切歌、不改練習、不動 BGM／OBS／系統音量。無效值／音量端點不可執行，失效 receiver 不產生副作用，custom 單次且不排隊。
- offset 只調與載入 player 同曲的 active source；缺 session、來源讀取、timing／offset／source action／人工確認 busy、offset 保存錯誤或 profile／場次 pending 不執行。不暗選來源、不發布 editor 草稿或人工收據；±0.1 秒沿原 round／Main ±1 小時界限及 CAS 保存。
- offset 進原保存 queue 前再驗來源 session、timing／offset revision、播放與配置、較新的 offset intent 及 busy。尚未送 IPC 的取消，只撤回仍由該 intent 擁有的 preview；有新 edit 不覆蓋。已送出的保存沿原 source owner／Main CAS，提交結果不因配置變更回滾；晚回不對新情境報成功。成功須保存回應、session／revision 及目前 preview 都相符。

配置替換／卸載只取消仍由該 executor 同步交給 player、request revision 相符的 pending start，不取消其他 caller 的後續 start；已交給 transport／場次的操作仍由其 owner 管理，不逆向撤回已提交進度。Main global envelope／單一 OS 分派尚待後續，不用 App 單元結果取代 Windows gate。

## 機器保存與錄製

`electron/lib/keyboardShortcutSettings.js` 只使用 Main 提供的 userData，固定保存 `keyboard-shortcuts.json`，與 library 及一般 `config.json` 分開。檔案上限 16 KiB；只讀普通檔案，open 後再驗 identity／大小並有界讀取。Envelope 只含 `schemaVersion: 1`、每次寫入新產生的 `writeId` 及完整 `configuration`。公開 CAS revision 為 Main 導出的不透明 bytes digest；新 write id 使正常保存 A–B–A 不復活舊 revision。不存在時回 default／null revision，不自動建檔；壞 JSON、未知 schema、過量／不合法配置或重導目標保留原 bytes，不被 default 覆蓋。

本階段 Main 保存只接受 global 關閉、所有 global chord 為 null 的配置；含未支援 global 資料的檔案保持唯讀。純 validator 仍能預先檢查跨 scope 衝突，不代表已開放全域設定。保存前 Main 重驗十命令、與共用固定鍵的衝突及 expected revision，衝突不寫；沿既有原子 JSON primitive 使用 Main 隨機命名 staging，最後 rename 安裝，失敗清理自己的 staging，不改舊檔。沒有新增 dependency／worker 或 library 欄位。

全域註冊／占用／復原前置現沿[專用契約](global-keyboard-shortcuts.md)由唯一 Main manager 管理。Store 的 prepare 唯讀驗意圖及 CAS，set 在註冊 staging 後再驗 CAS；以既有原子 buffer primitive 寫入已序列化 bytes，rename 成功即回本次配置與其 digest，不因額外重讀失敗誤判已提交結果。這提供原子可見性，沒有新增 fsync 或宣稱斷電耐久。正式 capability allowlist 因 S10 重複 keydown 未過而維持空；App-only 保存範圍不變，未接全域命令執行／錄製入口。

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

目前十個可自訂命令有 Ctrl+↑／↓、↑／↓、M 五個預設；播放／暫停、上一首、下一首、offset +0.1 秒、offset −0.1 秒共五個預設未指派。擷取導唱、速度、OBS 標記、目的地與歷史雖有預設鍵，目前均不在十命令設定範圍。沒有預設的 seek、A／B 設點、練習切換、歌詞 editor 保存／復原、句首定位／試聽或提詞器專用快捷鍵；相應可聚焦按鈕仍可用原生 Enter／Space 操作。

上表的簡寫還有以下實際含義：

- F1／F2／F3／F9、M／G／K、純 ↑／↓ 與歷史綁定均為 `shift: null`，因此額外按 Shift 仍符合。例如 Shift+M 也切換靜音、Shift+↑ 也加音量、Alt+Shift+← 也回上一頁；不是只有表面列出的單一 chord。
- Ctrl+↑／↓ 必須沒有 Shift；加入 Shift 後改為速度調整。其餘未宣告的 Ctrl／Alt／Meta 組合不會退回純鍵。
- 舊 F／player 綁定沒有 `noRepeat`，長按可重複分派；歷史綁定忽略 repeat。新 custom 一次按壓只分派一次。這是 handler 政策，不代表每次重複必有可執行結果。
- F 鍵與歷史可以在 editable 內觸發；舊 player 除音量方向鍵外，仍只略過事件目標為 input／textarea／select／contentEditable 的情境。音量方向鍵（包含 Shift 及改成方向鍵的 custom 音量）另讓位於 handled、IME／AltGraph、互動祖先、ARIA widget、composed path、明示 tabindex 的工具／捲動區與浮層；未被區域接手時，舊預設仍可長按。其他 custom 維持原互動／IME／repeat／handled／錄製與浮層政策，不因本輪一併改變。

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

| 來源                                   | 輸入                                        | 行為                                                          |
| -------------------------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| `App.vue`                              | Esc                                         | 收合 Right Dock；有 transient overlay 或事件已被處理時不動    |
| `UiModal`                              | Esc、Tab                                    | 僅最上層 modal 關閉；Tab 焦點陷阱                             |
| `UiActionMenu`                         | Esc                                         | 有搜尋字時先清除，否則關閉選單並停止傳遞                      |
| `UiPopover`                            | Esc（capture）                              | 關閉浮層，排除相關浮層                                        |
| `BgmPlayer`                            | Esc                                         | 目前 picker 沿共用 `UiPopover` 關閉；沒有獨立 BGM Esc handler |
| `TrackPreviewOverlay`                  | ↑／↓、M（capture）                          | 上下首預覽、靜音；其餘按鍵隔離，F 鍵、Esc、Tab 放行           |
| `MusicAnalysisReferenceEditor`（dev）  | Ctrl／Cmd+S、Alt+←／→、B、N、1–7、Shift+1–7 | 人工標註；最多前七種角色，可編輯欄位內忽略                    |
| `LyricsProviderReviewWorkbench`（dev） | Ctrl+Enter、Ctrl+Backspace                  | 核准、退回；退回需非可編輯目標且已有理由                      |

另有 `UiTooltip` 的 Esc 關閉當前提示、可關閉通知內的 Esc 移除該通知；後者只在事件位於通知內時生效，均不是全 App 命令。盤點時工作樹的 `useTooltip` 亦在 Enter／Space 啟動時關閉提示並抑制同一 hover／focus session 再開，不攔截原按鈕啟動；此項屬同時進行的未提交修改。`TrackMetadataFields` 專輯篩選表單的 Esc 關閉篩選並還焦點，停止事件傳遞。`UiModal` 是否可關閉仍由各 caller 的忙碌／草稿政策決定；Esc 不等於一律丟棄或保存。

## 區域導覽與控件完整清單

以下為目前 production 元件自訂處理的全部行為群組；同一 primitive 的各使用頁共用該列，不按每顆按鈕重複計數。原生控件另見下一節。除明示者外，這些 handlers 並沒有統一的修飾鍵／repeat 防線，不應推論加 Ctrl／Alt／Shift 後一定不觸發。

| 聚焦位置／來源                                                                                               | 輸入                                     | 實際行為                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [UiTabs](../../src/components/ui/UiTabs.vue)                                                                 | ←／→、Home／End                          | 跳過 disabled，循環移動焦點並立即切換頁籤；RTL 反轉左右。                                                                                                |
| [UiSegmentedControl](../../src/components/ui/UiSegmentedControl.vue)                                         | 四方向、Home／End                        | 移動焦點並立即選取；循環、跳過 disabled，RTL 反轉左右。                                                                                                  |
| [ObsPositionPicker](../../src/components/output/ObsPositionPicker.vue)                                       | 四方向、Home／End                        | 3×3 定位格內移動並選取；左右同列、上下三格，Home／End 至首／末可用項，邊界不循環。                                                                       |
| [ArtworkSearchResults](../../src/components/library/ArtworkSearchResults.vue)                                | 四方向、Home／End                        | 封面候選循環選取並移焦；Home／End 首／末候選。                                                                                                           |
| [UiCombobox](../../src/components/ui/UiCombobox.vue)，含 OBS 配色／字型                                      | ↑／↓、Home／End                          | 上下開啟或移動候選；展開時 Home／End 到首／末可用項。                                                                                                    |
| UiCombobox                                                                                                   | Enter；唯讀選擇型另含 Space              | 展開或確認候選；editable 型的 Space 是輸入文字。                                                                                                         |
| UiCombobox                                                                                                   | Esc、Tab／失焦                           | Esc 關閉並回復查詢；Tab 關閉後正常移焦。IME composing／229 不處理。                                                                                      |
| [UiActionMenu](../../src/components/ui/UiActionMenu.vue) 項目                                                | ↑／↓、Home／End                          | 移動焦點至可用項；Home／End 首／末。                                                                                                                     |
| UiActionMenu 項目                                                                                            | →／←                                     | LTR 向右開子選單、向左返回；RTL 反轉。                                                                                                                   |
| UiActionMenu 項目                                                                                            | Enter／Space、可列印字元                 | 選取或開子選單；字元作前綴搜尋／循環找項，排除 Ctrl／Alt／Meta／Space。                                                                                  |
| UiActionMenu 搜尋欄                                                                                          | ↑／↓、Home／End、Enter                   | 改目前候選並提交；Esc 有搜尋字先清空，再按關閉。                                                                                                         |
| UiActionMenu                                                                                                 | Esc、Tab                                 | 關閉；Esc 還焦點，Tab 關閉並讓正常移焦繼續。                                                                                                             |
| [TrackCollectionRow](../../src/components/track/TrackCollectionRow.vue) 曲目 action                          | Space、Enter                             | Space 選取；Enter 呼叫該列表的 activate，由 caller 決定播放／開啟。                                                                                      |
| TrackCollectionRow 曲目 action                                                                               | ↑／↓                                     | 只有 dragEnabled 時移動曲目順序；不等於上一首／下一首。                                                                                                  |
| TrackCollectionRow 曲目 action                                                                               | ContextMenu／Shift+F10                   | 開曲目選單。                                                                                                                                             |
| [UiTrackRow](../../src/components/ui/UiTrackRow.vue) 共用 action                                             | Enter／Space                             | 沿原生 button 的列動作；若 caller 開啟 activateOnEnter，Enter 改發 activate 並拒 repeat。                                                                |
| [TrackTable](../../src/components/track/TrackTable.vue) 可重排標題本體                                       | Alt+←／→                                 | 欄位向左／右移一個可重排位置；內層控制不接。                                                                                                             |
| [欄寬把手](../../src/composables/useTrackCollectionColumns.js)                                               | ←／→；Shift+←／→；Home／End              | 調整 8px／24px，RTL 反向；Home 最小、End 當前容許最大。                                                                                                  |
| [PerformanceSessionPlanList](../../src/components/performance-session/PerformanceSessionPlanList.vue) 安排列 | Alt+↑／↓                                 | 向上／下移待唱項目；忙碌或已在端點不移動。                                                                                                               |
| [SeparationToolbarList](../../src/components/separation/SeparationToolbarList.vue) 項目                      | ContextMenu／Shift+F10                   | 開該工作／項目的操作選單。                                                                                                                               |
| [AppPlaylistSidebar](../../src/components/layout/AppPlaylistSidebar.vue) 把手                                | Enter／Space；→／End；←／Home            | 切換展開；展開；收合。                                                                                                                                   |
| [AppRightDock](../../src/components/layout/AppRightDock.vue) 把手                                            | Enter／Space；←／→；Home／End            | 切換展開；展開時加／減寬 8px；最小／當前最大寬。                                                                                                         |
| [ObsOutputSplitLayout](../../src/components/output/ObsOutputSplitLayout.vue) 把手                            | Enter／Space；←／→；Home／End            | 切換側欄；加／減寬 8px；最小／當前最大寬，受 geometry 限制。                                                                                             |
| [UiFolderArtifactCanvas](../../src/components/ui/UiFolderArtifactCanvas.vue) 物件                            | 四方向；Shift+方向；Home                 | 移動 8px／24px、帶到最前並保存位置；Home 回預設位置。釘住或編輯中不移動。                                                                                |
| UiFolderArtifactCanvas 可啟動物件                                                                            | Enter／Space                             | 啟動該物件；編輯目標不接。系統發出 contextmenu 時亦可開物件選單。                                                                                        |
| [UiFolderArtifact](../../src/components/ui/UiFolderArtifact.vue) 照片堆疊                                    | Enter／Space                             | 後層顯示上一張；前／中層顯示下一張，停止傳遞。                                                                                                           |
| UiFolderArtifact 原位編輯器                                                                                  | Esc／失焦                                | 結束並提交文字，一次提交；Esc 在 IME composing 時不接。這裡的 Esc 不是取消。                                                                             |
| [AppFolderNoteReaderModal](../../src/components/layout/AppFolderNoteReaderModal.vue)                         | ←／PageUp；→／PageDown                   | 閱讀上一／下一頁；editable 或已處理事件不接。                                                                                                            |
| [LyricsDocumentPanel](../../src/components/lyrics/LyricsDocumentPanel.vue) 捲動區本體                        | ↑／↓、Home／End、PageUp／PageDown、Space | 暫停跟隨目前句，捲動仍沿原生行為；子控件按鍵不觸發此標記。                                                                                               |
| LyricsDocumentPanel 讀音編輯欄                                                                               | Enter／Esc                               | 提交／取消目前讀音編輯。                                                                                                                                 |
| [LyricsSourceManagerModal](../../src/components/lyrics/LyricsSourceManagerModal.vue) 名稱編輯欄              | Enter／Esc                               | 提交／取消來源名稱編輯。                                                                                                                                 |
| [LyricsWaveformTool](../../src/components/lyrics/LyricsWaveformTool.vue) 面板移動把手                        | 四方向                                   | 移動浮動波形面板 10px，限制在視窗內；不是移動時間或 seek。                                                                                               |
| [波形全曲概覽](../../src/composables/lyrics/useLyricsWaveformViewport.js)                                    | ←／↓；→／↑                               | 檢視移至較早／較晚一個目前視窗跨度；停止跟隨播放。                                                                                                       |
| 波形全曲概覽                                                                                                 | PgUp／PgDn；Home／End                    | 移至較早／較晚五個跨度；到歌曲開頭／最後一個視窗。翻頁方向與一般閱讀一致。                                                                               |
| 波形面板內                                                                                                   | =／-                                     | 呼叫既有 viewport 縮放，保留 1×／2×／5×／10× 與原中心／取消流程；輸入、修飾鍵、IME、repeat、已處理事件、工具選單、未啟用／清除／來源失效／關閉時不接手。 |
| [波形句首／句尾／整句把手](../../src/composables/lyrics/useLyricsWaveformBoundaryDrag.js)                    | ←／→                                     | 提前／延後 100ms；合法才修改同一 editor 草稿，每次按鍵沿原復原流程，仍需手動保存。                                                                       |
| 波形句首／句尾／整句把手                                                                                     | Esc                                      | 把手收到 Esc 且有拖曳 gesture 時取消預覽。不是 window 全域取消監聽。                                                                                     |

概覽的所有鍵盤平移都只改檢視，不 seek、不播放、不改歌詞。句級數值欄是原生 number input，沿 `change` 提交及驗證；沒有額外 Enter 保存整份歌詞或 Ctrl+Z 的 editor shortcut。

## 表單與原生鍵盤行為

| 位置                                                               | 輸入／機制                     | 行為                                                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 曲目資訊的曲名／藝人欄                                             | 明示 keydown Enter             | 保存曲目 metadata。                                                                                                                               |
| 歌單詳情名稱；藝人顯示名稱                                         | 明示 keydown Enter             | 保存歌單；套用藝人顯示名稱。                                                                                                                      |
| Folder note editor 標題；photo text editor 的標題／內文欄          | 明示 keydown Enter             | 沿該 editor 的 save。多行 note 內文 Enter 保留換行。                                                                                              |
| 匯入來源搜尋；作品關聯搜尋                                         | form submit                    | 搜尋／解析來源或搜尋關聯曲目；單欄表單可由原生 Enter 送出。                                                                                       |
| 曲目封面專輯篩選；LRCLIB 搜尋                                      | form submit                    | 搜尋封面／歌詞；只在原生 submit 及 caller 可執行時送出。                                                                                          |
| 歌詞手動匯入                                                       | form submit                    | 保存貼上歌詞；單行標籤可走原生隱含提交，textarea Enter 仍為換行。                                                                                 |
| 新增場次手動項目；dev 歌詞審核表單                                 | form submit 與 submit button   | 提交新增／核准；仍受欄位驗證與 busy 限制。                                                                                                        |
| 場次項目編輯表單                                                   | `@submit.prevent` 無提交動作   | 阻止原生提交；Enter 不自動保存，需操作保存按鈕。                                                                                                  |
| Output runtime 設定                                                | 沒有自訂 Enter／submit handler | 操作套用按鈕才呼叫 commitSettings；不要沿舊代表性清單聲稱欄位 Enter 可提交。                                                                      |
| 全部可用原生控件                                                   | Tab／Shift+Tab                 | 依 DOM 焦點順序走訪；modal 有上述焦點陷阱，roving groups 只有目前項目進 Tab 順序。                                                                |
| button／summary／checkbox／link                                    | 原生控件語意                   | button／summary 的 Enter／Space 啟動，checkbox Space 切換，link Enter 開啟。disabled／loading 不啟動；caller 可覆寫，如列 action／錄製控制。      |
| input／textarea／contentEditable                                   | 原生編輯鍵                     | 輸入、IME、選取、方向／Home／End、Backspace／Delete、Ctrl+A／C／X／V／Z／Y 等由 Chromium／Windows 處理；不是 App 的歌曲／草稿復原命令。           |
| 原生 select                                                        | 原生選項鍵                     | 方向、Home／End、字元選項搜尋、開啟／確認／取消沿 Chromium／Windows。                                                                             |
| 原生 range／number                                                 | 原生數值鍵                     | 方向按各欄 step 調值；range 的 Home／End、PageUp／Down 沿 Chromium，number 沿 min／max／step 及 change 驗證。頁面沒有另外自訂通用數值鍵盤處理器。 |
| [UiRangeControl](../../src/components/ui/range/UiRangeControl.vue) | 原生 contextmenu 事件          | 有 defaultValue 時重設預設值；鍵盤 ContextMenu／Shift+F10 若由平台轉成此事件，也走同一路徑。                                                      |

此處列的是目前採用的原生語意及 app hook，不承諾每個 OS／IME 版本的完整組合；原生快捷選單、檔案選擇器與 Windows 視窗操作由系統擁有。Alt+Tab／Alt+F4／Win 組合不屬於可改的 App 命令。Main 已 `Menu.setApplicationMenu(null)`，Electron 預設選單 accelerator（含 Ctrl+0／+／− zoom）不作為本產品預設列入。

## 錄製設定與內部工具

錄製控制中 Control／Alt／Shift 單鍵等待完整組合；符合契約的完整 chord 只生成候選，按套用才保存。Esc 取消；Tab／Shift+Tab 取消並走焦點流程；blur／最小化／hidden／離開編輯群組／收合／卸載取消未提交候選。錄製與候選期間抑制 App dispatcher，控制的 keyup 也攔截，避免 Space 產生多餘 click。這些是設定流程鍵，不能重新綁成歌曲命令。

| 內部入口／工具                         | 輸入                                                 | 行為與條件                                                                                              |
| -------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| internalWorkbenchesEnabled             | F5／F6／F7／F8                                       | 音樂分析／診斷工作台／歌詞來源審核／視覺系統；正式一般入口不開放。                                      |
| MusicAnalysisReferenceEditor           | Ctrl 或 Cmd+S                                        | 非 editable 目標保存標註。                                                                              |
| MusicAnalysisReferenceEditor           | Alt+←／→                                             | 目前段落不是首段時，段落邊界 −／+100ms；編輯區已處理時歷史走訪讓位。                                    |
| MusicAnalysisReferenceEditor           | B；N                                                 | 目前位置加邊界（須可加）；跳下一個未完成標註。                                                          |
| MusicAnalysisReferenceEditor           | 1–7；Shift+1–7                                       | 對應 allowedRoles 前七項：設目前段落角色；加邊界並套角色。實際數量受角色清單長度限制。                  |
| LyricsProviderReviewWorkbench          | Ctrl+Enter                                           | 核准並下一筆；saving 不執行，可在 editable 內觸發。                                                     |
| LyricsProviderReviewWorkbench          | Ctrl+Backspace                                       | 有理由且非 editable 目標才退回並下一筆；saving 不執行。                                                 |
| 視覺系統 DemoActionMenuLayer           | ContextMenu／Shift+F10                               | 示範列開選單。                                                                                          |
| 視覺系統 DemoTrackCollectionRow／Table | Space／Enter／↑／↓、ContextMenu／Shift+F10、Alt+←／→ | 示範選取／啟動／排序／選單／欄重排，沿示範 caller；欄寬沿共用 resize owner。不是另一組正式 App 快捷鍵。 |
| 視覺系統 DemoCandidateModal            | Esc 原生 cancel；Tab／Shift+Tab                      | 關閉候選 dialog；候選的手動焦點循環。其他示範沿共用 primitives／原生控件，沒有額外產品命令。            |

內部標註工具的 modifier／IME／repeat 防線與新 recorder 不相同；例如 Shift+數字採 `event.key` 讀值，在鍵盤配置回報符號時不會得到數字角色。不能僅憑畫上數字鍵就宣稱所有配置可用。

## 系統入口

- 工作列縮圖按鈕（[mainWindow.js](../../electron/main/windows/mainWindow.js)）。
- SMTC 卡片與硬體媒體鍵：註冊 `play`、`pause`、`previoustrack`、`nexttrack`（[useMediaSession.js](../../src/composables/useMediaSession.js)）；上一首／下一首與 PlayerBar 共用 [usePlaybackTransport.js](../../src/composables/usePlaybackTransport.js)。
- 系統匣導覽。
- 滑鼠側鍵、瀏覽器導覽鍵與 Windows `app-command`：見上方「Pointer 綁定與歷史走訪」。

SMTC 是四種明確 action（play、pause、previous、next），不是新增四組可錄製 chord，也不等於 globalShortcut。Performer Self-View 與 Output 沒有掛主控制台的 App dispatcher 或新增鍵盤控制註冊；焦點在另一視窗／OBS 時，不以主窗 DOM 清單宣稱可操作。系統匣、工作列縮圖與滑鼠側鍵列在這裡是為區分來源，不計入 17 筆鍵盤 registry。

## 已知差異（記錄，未修正）

下列項目為清點時發現，目前行為維持不變，待 Owner 依使用數據決定：

1. F 鍵（視圖切換）在輸入框內也會觸發，其餘 app 綁定則會忽略可編輯欄位。
2. 可編輯判斷已涵蓋 `INPUT`、`TEXTAREA`、`SELECT` 與 contentEditable；原生 `INPUT` range 也在其中。自訂 ARIA widget／slider、內層事件目標與焦點組合仍需實機盤點。
3. `TrackPreviewOverlay` 會隔離全域按鍵；音量方向鍵本輪另明確讓位於阻擋浮層。其他 modal 開啟時，F 鍵與 M／G／K 是否穿透尚未實測。
4. Esc 由多個元件各自監聽，靠 `stopPropagation`、`defaultPrevented` 與 `hasOpenTransientOverlay` 協調，沒有統一的 dismiss 堆疊。
5. 沒有空白鍵播放／暫停。
6. `obs.marker` 的 K 為占位。
7. Alt+←／→ 同時是 `MusicAnalysisReferenceEditor`（dev）的邊界微調。編輯區內該元件先處理並 `preventDefault`，歷史走訪因 `skipIfHandled` 讓位；焦點在編輯區外時走訪優先。
8. 滑鼠側鍵與瀏覽器鍵在實機上是否同時送出 DOM 事件與 `app-command` 尚待 Owner 驗收；目前以 60 ms 去重涵蓋兩種情況。
9. 舊 F／player 綁定除音量方向鍵外，仍未統一讓位於 `defaultPrevented` 或 transient overlay。本輪已將音量方向鍵讓位交給既有 shortcutInputContext，包含已處理事件與明示聚焦工具；歌詞捲動區、波形面板移位及選單的原生操作已確認不連帶改音量。其他舊鍵的整體焦點統一仍未納入。
10. `UiFolderArtifact` 的 Esc 是提交原位文字，讀音／來源名稱的 Esc 是取消，modal／popover 的 Esc 是關閉，波形把手的 Esc 是取消手勢。說明必須帶上焦點情境，不能統稱「Esc 取消所有修改」。
