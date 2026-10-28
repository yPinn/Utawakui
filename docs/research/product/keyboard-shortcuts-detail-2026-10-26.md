# 可自訂／全域快捷操作：行為提案

2026-10-26；2026-10-28 已接 S01–S03 配置／registry 前置及 S11–S13 的七命令／dispatcher 執行切片，App 保存／錄製切片已接入；OS 全域操作及 S01–S18 的完整平台驗收仍待逐項執行。共用前置見[規劃入口](player-practice-planning-2026-10-26.md#共用前置)。按鍵只呼叫既有命令，設定已保存、OS 已註冊、當下可執行是不同狀態。

## 七個命令與預設

| 命令                | 提案語意                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 播放／暫停          | playing 時 pause；一般 pending start 取消並 pause；loaded paused 時 Play，A–B gap 依練習規則立即開始。沒有曲目不猜第一首，不完成 manual。 |
| 上一／下一首        | 共用 transport／場次／canNext／fallback restart，不造另一套索引；先處理 A–B 取消，不假自然完成或略過 BGM／profile。                       |
| Key +1／-1          | 調本次已確認值，不自動存 profile；DSP pending 回 busy／失敗，不無界排隊。                                                                 |
| offset +0.1s／-0.1s | 只調與播放曲目相符的 active 來源，沿原自動保存；不調最後看過的別首／來源、不暗選來源或補人工確認。                                        |

共七命令。每個最多一組 App chord／一組 global chord；全域初始關閉且不預搶鍵。App Key 沿舊預設，其他本階段命令不自動新增，尤其不直接把空白鍵設為播放。

不開 cents／tempo／音量／裝置／擷取導唱／OBS 寫入／刪除／發布／巨集／任意 IPC；既有非自訂範圍的鍵不因此移除。設定屬機器 userData，不屬曲目／library；換庫保留鍵位，在途命令仍驗當前目標。

固定 command catalog、binding、executor 分工；執行仍由 player／lyrics／transport。未知 config schema／壞檔保原 bytes、自訂／global 不搶鍵，基本操作沿舊基線，不假報偏好已恢復。

## 正規化與衝突

自訂 chord 明定 Ctrl／Alt／Shift true／false，正規化大小寫、alias、modifier 順序與 Windows 映射。舊 shift=null 會匹配多組，需要檢查重疊集合，不能只比字串或靠 registry 先後。

只開同 validator 固定的單鍵子集加 modifiers，不開多段／雙擊／滑鼠巨集或任意 accelerator。global 至少 Ctrl 或 Alt，不開普通字元／Shift 字元；先排除 Meta／Windows、AltGr、Dead／Process／Unidentified、Ctrl+Alt 可輸入字元及系統／編輯保留組合。F1／2／3／9、歷史與工具保留鍵不重綁，F4 沿 ADR 0023。Tab／Esc／Enter、Ctrl+C／V／X／Z／A 等不任意全域搶占。

沿邏輯 chord，不以 KeyboardEvent.code 假稱跨鍵盤位置相同；符號／numpad／語系支援須明定及實測。

| 衝突                               | 處理                                                           |
| ---------------------------------- | -------------------------------------------------------------- |
| 同 scope／兩 command 相同 chord    | 提交前拒絕，指出命令，不採先／後者勝出。                       |
| 與固定鍵／wildcard 重疊            | 拒絕；允許替換的同一命令也須明列，不留兩個 handler。           |
| 跨 App／global 相同 chord 不同命令 | 第一版拒絕，避免焦點改變就做別事。                             |
| 跨 scope 相同 chord 同命令         | global active 只由 Main 分派；未註冊則只沿已有效 App binding。 |
| OS／其他 App 占用                  | 註冊失敗保舊 active，提供改鍵／重試，不保證知道占用者。        |
| 媒體鍵                             | 沿 SMTC，不用 globalShortcut 再搶一次。                        |

## 焦點與錄製

新 App 綁定預設拒 event.repeat；IME composing／AltGraph／editable／widget 已處理／錄製／阻擋浮層時讓位，尊重 defaultPrevented。真正接手才 preventDefault，保 Tab／Esc／Enter／widget 方向鍵。既有 Key 長按若改政策，須明列而非默改；舊 F 鍵／浮層差異未盤完不稱已修。

INPUT／TEXTAREA／SELECT／contentEditable 與原生 INPUT range 已在現有 helper；自訂 ARIA widget、內層 target／composed path、slider 仍需驗。Main callback 進來也要按當下 receiver 的 registry／playback／source generation、editable／IME／浮層驗可用性，busy／stale／blocked 不排到之後。

主控制台聚焦時套同一執行政策；Performer 未接有效輸入情境前保守阻擋新 global 命令，保留原控制；Output 不接命令。失焦／最小化／Tray 可操作存活 receiver，不強制帶前，不監聽其他程式文字／IME。OS 已註冊但命令被抑制，也不宣稱按鍵已還給別的 App。

只在明確聚焦的設定欄錄製，期間 executor 全停；modifier 未完整、IME、失焦／取消不存半組。候選、試註冊、commit 分開，試鍵 callback 不真的換曲。提供可點擊停用／恢復預設，不靠待改的按鍵救回。

## 分派與長按

global active chord 由 Main 擁有，DOM 若也收到就不再執行；不能先雙 toggle 再猜結果。事件含 boot／registry generation／單調 id，重送冪等、舊 mapping／receiver 拒絕；不能把導覽既有 60ms 去重當所有命令限速。

SMTC play／pause 保持明確意圖，不改成 toggle。Key／offset 跨 await 再驗目標與 edit generation；來源不符、timing／offset 提交中或必要 DSP 未就緒，回 blocked／busy，不晚到錯調新曲。Renderer reload／crash／未就緒不累積命令，恢復不補播；Main 不代建音訊播放器。

公開 globalShortcut callback 未承諾 DOM repeat／keyup；cooldown 只能限速，不能證一次長按不多次跳曲。需在本案 Windows／Electron／鍵盤下測短按、長按與焦點切換，無法可靠抑制就不開該 global 命令，尤其 previous／next。App 自訂可先交付，不私加低階鍵盤 hook／原生監控／模擬輸入。

## Main 註冊與復原

唯一 manager 在 single-instance／app ready 後運作；設定 CAS、驗完整有界配置及 command allowlist。desired config 與 runtime active 分開，Renderer 不指定 callback／IPC channel。

1. 計算新增／沿用／移除 chords；同 App 已持有的鍵只換 mapping，不先釋放搶回。
2. 逐筆試註冊新增鍵、驗持有；staging callback 不執行。任一失敗清新增、保原配置。
3. 原子保存 desired，失敗撤 staging；成功後同步 commit active mapping／generation，再清舊鍵。
4. 舊排程 callback 不沿舊 mapping 執行；清理／回復另驗，失敗回報實際集合與降級，不假稱 OS 整組 transaction 或百分之百恢復，也不無限搶鍵。

| 事件           | 提案政策                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------- |
| 啟用／改鍵     | 成功才提交，衝突分明，App 仍有原可用操作。                                                     |
| 移除／停用     | 先停止分派、釋放自有鍵；不清其他命令／模組。停用保存失敗仍本次停用，明示重啟設定未存並可重試。 |
| 恢復預設       | 回 App 原綁定、global 關閉，不批次重新搶鍵。                                                   |
| 重啟           | 讀 desired 重試，重新呈現 active／blocked，不沿上次成功假稱已註冊。                            |
| reload／HMR    | 舊 receiver 失效，新 ready 才分派，不重複訂閱或補送。                                          |
| 睡眠／環境變更 | 驗實際註冊，失效明示／重試；未實測不承諾全數自復原。                                           |
| quit           | 停分派、釋放本 manager 所有鍵，不因收面板 unregister 全產品。                                  |

介面分清未設／關閉／衝突／active 但暫停，以及保存／執行失敗；正常觸發不逐次通知。diagnostics 沿既有有界機制，不記別處輸入文字。

## 待執行驗收

| ID  | 情境與必要結果                                                                    |
| --- | --------------------------------------------------------------------------------- |
| S01 | schema／command／過量或任意 accelerator／modifier 拒絕，不開任意 IPC。            |
| S02 | 大小寫／alias／順序／wildcard 正規化與重疊一致。                                  |
| S03 | 同 scope／跨 scope／保留鍵衝突明示，同 chord 同命令單一 executor。                |
| S04 | 初始／預設／換庫／重啟不多搶鍵，設定保留、active 重驗。                           |
| S05 | 原生 editable／widget 讓位，defaultPrevented 保持，不冒稱舊差異已修。             |
| S06 | IME／AltGr／Dead／鍵盤配置不誤觸、存半組，邏輯對應明確。                          |
| S07 | modal／menu／popover／錄製／取消失焦不穿透或試鍵真執行。                          |
| S08 | 主視窗／Performer／失焦／最小化／Tray 按政策，不帶前、不接 Output 控制。          |
| S09 | DOM＋OS、重送 id／舊 generation 單次，不誤吞合法新按壓。                          |
| S10 | 短／長／快速重按與 callback 序列實測，不合格就不開該 global 命令。                |
| S11 | paused／playing／pending／A–B gap／manual 不猜曲、假完成或重啟取消播放。          |
| S12 | previous／next／場次／Queue 尾端共用 transport／canExecute。                      |
| S13 | DSP pending／失敗、offset 來源不同／保存中不錯調、排無界隊或假保存。              |
| S14 | OS／他 App 占用、isRegistered=false 不當空閒，保原 active、可重試。               |
| S15 | 多鍵中途失敗／映射交換／寫偏好失敗 staging 正確，不假 OS 原子交易。               |
| S16 | 移除／停用／回復失敗、排程 callback 有 generation 防線，runtime／保存分報。       |
| S17 | crash／reload／quit／睡眠釋放或重驗，無訂閱累加／補播／假永遠 active。            |
| S18 | 可見 Windows 與 OBS／瀏覽器、SMTC／taskbar 並行無雙註冊，焦點／長按／衝突可重現。 |

## 實作前決策與證據

2026-10-28 前置與執行切片：七命令 allowlist、有界 schema、明示 modifiers／邏輯子集、default／disabled／custom、同 scope／跨 scope／固定鍵及 Shift wildcard 衝突已有純測試。registry 可編譯驗過的 App 配置，替換只保留一組、停用釋出原鍵，default Key 保留原長按、custom 拒 repeat／handled；dispatcher 可接不可變配置，驗 editable／widget composed path／IME／AltGr／錄製／浮層及 canExecute，換配置／卸載使在途失效。S11–S13 執行協調既有 player／transport／lyrics；一般 pending 取消、真 player／練習 owner gap 立即播放、DSP confirmed／來源失效、offset 保存前取消與 CAS 由測試涵蓋。詳細目前契約見[輸入綁定](../../contracts/input-bindings.md#七命令執行邊界)。App 由單一機器偏好 owner 讀取配置，Settings 已接錄製／套用／取消／停用／預設，global 未註冊；不把單元結果當 Windows 每命令或全部場次／OBS 驗收。後續仍為 Main manager／Windows 每命令長按與去重 gate。

先定七命令／保留鍵／焦點，補 App 自訂；再固定 Main manager／envelope／staging 契約，最後 Windows 每命令過 gate 才 global opt-in。前三項的未完成／錯誤可供 canExecute 使用，不要求三項全實作後才做 App 綁定。

較早的命令執行切片另以隔離 RASEN 副本、程式指定的測試配置跑可見 Electron 14 項原生操作：Key confirmed 與未自動存 profile、offset ±0.1／CAS、active source 清除、播放／暫停、Queue 尾端、paused previous restart、widget／錄製讓位、靜音真媒體 A–B gap 立即恢復、壞配置 fallback 與卸載。沒有在 App 安裝正式配置或 OS 註冊；測試值恢復、正式媒體 9 檔 SHA256 不變。這不代表真實裝置／OBS 聽辨、DSP 音質或 Windows global 長按已驗收。

本輪查 [registry](../../../src/utils/inputBindingRegistry.js)、[dispatcher](../../../src/composables/useKeyboardShortcuts.js)、[DOM](../../../src/utils/dom.js)、[SMTC](../../../src/composables/useMediaSession.js)、[transport](../../../src/composables/usePlaybackTransport.js)及[輸入契約](../../contracts/input-bindings.md)；G 實為擷取導唱、SELECT 已忽略，taskbar 上／下一首目前停用。7份既有測試73 passed，僅基線，原 K01–K04 留[初始證據](player-practice-planning-2026-10-26.json)。

package-lock 為 Electron43.8.3，查核 Context7 43 系列並交叉實際 [v43.8.3 API](https://github.com/electron/electron/blob/v43.8.3/docs/api/global-shortcut.md)／[快捷鍵文件](https://github.com/electron/electron/blob/v43.8.3/docs/tutorial/keyboard-shortcuts.md)：Main ready 後註冊、失焦可觸發、register 可因占用失敗，isRegistered 只查本 App，registerAll 不提供整組交易，accelerator 為不分大小寫的 modifiers＋單鍵。上述平台能力不替代本案的 Windows 實測。

本輪 App 保存／錄製切片使用同一隔離 RASEN profile，在完整重啟的新 Main／preload 下跑 22 項原生操作：候選／半組／Space／保留 F 鍵／Shift wildcard 不提前保存或誤執行、套用後正式 App dispatcher 生效、改 Key 釋放原鍵、停用／單列預設保其他設定、亮暗及 960px、重啟自動恢復且不重寫、CAS 保較新檔並要求重讀、native blur／最小化取消、壞檔保 bytes／待讀、修復後明確重讀及整組預設。Tab 取消回可見設定按鈕，結束 paused／無錄製／Key 與音量恢復，僅隔離設定檔被寫入。保存契約與不支援 global 的邊界見[機器保存與錄製](../../contracts/input-bindings.md#機器保存與錄製)；實際裝置／OBS 音質、跨程式 global 長按／去重仍不在這批證據內。
