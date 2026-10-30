# 可自訂／全域快捷操作：行為提案

> 已歸檔（2026-10-30）：已實作，行為與驗收案例由[全域契約](../contracts/global-keyboard-shortcuts.md)持有；本文只保留設計推導，其中的階段與待辦不代表現況。

本提案固定原第 4 項的十命令、輸入／註冊政策與 S01–S18 分層驗收。功能現況只見 [spec](../spec.md)，現行 App 行為見[輸入契約](../contracts/input-bindings.md)，背景交易與平台門檻見[全域契約](../contracts/global-keyboard-shortcuts.md)。共用前置見[規劃入口](../research/product/player-practice-planning-2026-10-26.md#共用前置)。設定已保存、OS 已註冊、當下可執行是不同狀態。

## 十個命令與預設

| 命令                | 提案語意                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 播放／暫停          | playing 時 pause；一般 pending start 取消並 pause；loaded paused 時 Play，A–B gap 依練習規則立即開始。沒有曲目不猜第一首，不完成 manual。 |
| 上一／下一首        | 共用 transport／場次／canNext／fallback restart，不造另一套索引；先處理 A–B 取消，不假自然完成或略過 BGM／profile。                       |
| Key +1／-1          | 調本次已確認值，不自動存 profile；DSP pending 回 busy／失敗，不無界排隊。                                                                 |
| offset +0.1s／-0.1s | 只調與播放曲目相符的 active 來源，沿原自動保存；不調最後看過的別首／來源、不暗選來源或補人工確認。                                        |

2026-10-29 Owner 接受分類設定切片，加入主播放器音量 +10%／−10% 與靜音三個命令，共十命令。每個最多一組 App chord／一組 global chord；全域初始關閉且不預搶鍵。App Key 沿舊預設，其他本階段命令不自動新增，尤其不直接把空白鍵設為播放。

不開 cents／tempo／裝置／擷取導唱／OBS 寫入／刪除／發布／巨集／任意 IPC；既有非自訂範圍的鍵不因此移除。設定屬機器 userData，不屬曲目／library；換庫保留鍵位，在途命令仍驗當前目標。

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

## 類型分類與最低設定建議（2026-10-29）

Owner 要求在完整盤點後，先分類、判斷最低設定範圍，再依同定位應用給建議。Owner 已接受十命令與四個局部分類 Tab；原不開音量的範圍在本切片增加音量三命令。下方推薦 Space／切歌配置仍只供建議，不更動現有預設。現行行為仍以[輸入契約](../contracts/input-bindings.md)為準，本切片沿既有 schema、保存與播放器 owners，沒有註冊 global。

### 按用途與作用範圍分類

| 類型                   | 功能                                                  | 最低設定建議                                                                        |
| ---------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 播放控制               | 播放／暫停、上一首、下一首                            | 三個可設定命令，日常核心；只沿原 transport／場次語意。                              |
| 即時音訊調整           | 音量增／減、靜音、移調增／減                          | 五個可設定命令，日常核心；只調明示的主播放器，不默指所有 BGM／OBS／系統音量。       |
| 演出歌詞修正           | 歌詞提前／延後 0.1 秒                                 | 兩個可設定命令放進階區，預設未指派；沿 active source CAS 保存，不能誤以為暫時預覽。 |
| 排練與歌詞編輯         | 速度、seek、A–B、句首定位／試聽、標記、草稿保存／復原 | 維持各工具的局部操作與現有固定鍵，先不擴大自訂；未實作快捷鍵的功能不因本表新增。    |
| BGM／導唱／Output／OBS | BGM 操作、監聽／擷取導唱、OBS 標記、公開輸出          | 先保留明確具名的原 UI／既有固定行為；不納最低自訂，更不建立混合緊急停止巨集。       |
| App 導覽與版面         | 目的地 F 鍵、歷史、Dock／欄寬／排序                   | 保留標準／既有情境操作，提供唯讀查閱；不塞入日常命令錄製列表。                      |
| 控件／系統／內部工具   | Tab、Enter、Esc、文字編輯、widget 方向鍵、SMTC、dev   | 尊重原生與 local owner；系統／內部參考另列，不作 App 可自訂命令。                   |

### 官方對照與適用範圍

以下查核日期為 2026-10-29；是官方文件可確認的行為，沒有安裝競品實測，也不推論其完整預設、可自訂程度或 global 行為。

| 應用與關係                                                                                                                                                                           | 官方可確認的例子                                                                                 | 本案取捨                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| [KaraFun Windows](https://www.karafun.com/help/windows_791.html)：歌唱播放器直接對照                                                                                                 | Space 播放／暫停；Ctrl+→ 下一首；Ctrl+↑／↓ 音量；Ctrl+Shift+↑／↓ 移調；Ctrl+Shift+→／← 速度。    | 播放、音量、Key 是一組日常控制；下一首與 seek 是不同操作。Ctrl+↑ 在本案已是 Key，不能直接當音量遷入。              |
| [歌回救星歌詞編輯器](https://github.com/NoonIsAwesome/Singing-Stream-Savior-Manual/blob/master/lyrics-editor.md)：歌回工作流直接對照                                                 | Ctrl+Enter 記錄句／詞時間，明示只在本頁作用；可預覽、復原與重標。                                | 標記時間屬編輯器的局部命令，支持與演出 offset 分層；不據此推定其主播放器預設。                                     |
| [VLC hotkeys](https://thresh.videolan.me/vlc-user/userguide/hotkeys.html) 與 [Windows FAQ](https://docs.videolan.me/vlc-user/en/support/faq/faqwindows.html)：本機播放／同步相鄰參考 | Space 播放／暫停、M 靜音、Ctrl+↑／↓ 音量、N／P 上下首、Shift+←／→ seek；G／H 調字幕 delay 50ms。 | 支持播放／音量為核心，偏移有成對操作；G 在本案已有擷取導唱，不能直接複製。VLC delay 與本案 offset 的正負方向不同。 |
| [OBS 官方快捷鍵](https://obsproject.com/kb/keyboard-shortcuts)：直播共用環境相鄰參考                                                                                                 | 選中來源時 Ctrl+↑／↓ 改來源順序；預覽選框用方向鍵微移；Space 加拖曳／滾動操作預覽。              | 同鍵會因工具與焦點有不同用途；不把主窗 App 推薦配置自動升成全域鍵，也不宣稱可避開使用者自訂 OBS 鍵。               |

聲嶼本輪可取得的官方頁沒有足夠具體鍵位表，指定 tag 文件亦未能由本輪查核工具取得；不據此推論它沒有快捷鍵，也不把未確認鍵位加入比較。KaraFun／VLC 的 Ctrl+↑ 是音量、Utawakui 是 Key、OBS 是排序，足以證明這組鍵不是跨應用一致標準。Space 播放在兩個播放器中有共同證據；是否成為本案預設仍是建議而非已改變行為。

### 最低可設定範圍與推薦配置

最低設定為十個命令：基本八個（播放三個＋音訊五個），進階兩個（歌詞提前／延後）。相對原七命令，本輪加入音量＋／−與靜音三個，讓使用者能改鍵或停用現有 ↑／↓／M；不是重建完整輸入設定系統。可設定不等於全部必有出廠鍵。

| 命令              | 推薦 App 配置 | 與現況的差別                                                                                  |
| ----------------- | ------------- | --------------------------------------------------------------------------------------------- |
| 播放／暫停        | Space         | 新推薦；目前未指派。只在沒有控件／編輯器接手的播放工作區使用，不覆寫文字空白或按鈕啟動。      |
| 上一首            | Ctrl+←        | 新推薦；目前未指派。沿 transport，無前曲時仍沿既有 restart，不能另造索引。                    |
| 下一首            | Ctrl+→        | 新推薦；目前未指派。與 seek 分開；場次仍是明確 next 的 interrupted 語意。                     |
| 主播放器音量＋10% | ↑             | 沿既有鍵與步幅，但須先統一 widget／浮層讓位與生效範圍，不能在調排序／移波形面板時同時改音量。 |
| 主播放器音量−10%  | ↓             | 同上；允許使用者換為其他未衝突 chord 或停用。                                                 |
| 主播放器靜音切換  | M             | 沿既有鍵；明說不等於 BGM／OBS／系統全部靜音。                                                 |
| 移調＋1 半音      | Ctrl+↑        | 沿本案既有操作記憶，提供改鍵；不因 KaraFun 對照默換成音量。                                   |
| 移調−1 半音       | Ctrl+↓        | 同上。                                                                                        |
| 歌詞提前 0.1 秒   | 未指派        | 進階可錄製；對應現有 offset-up／+0.1。                                                        |
| 歌詞延後 0.1 秒   | 未指派        | 進階可錄製；對應現有 offset-down／−0.1。                                                      |

上表是一組待接受的推薦配置，不能現在將既有 `default` 正規化成新鍵，或讓更新後的舊使用者默得 Space／切歌鍵。採用時要明確套用建議配置並處理既有設定／版本語意。所有 global 繼續未指派、關閉，沿原平台 gate；Alt+←／→ 保持歷史，Ctrl+←／→ 才是此建議的上下曲。也不複製 KaraFun 的 Ctrl+Alt seek 組合，該組合不在本案開放子集。

本案時鐘讀值為 audio position＋offset，因此增加 offset 會提前歌詞；UI 應用「提前／延後」與目前偏移結果，不能照搬 VLC 的 delay 加減號。歌詞兩命令仍沿原保存屏障，草稿句級修改與來源 offset 保存是不同動作；不加一個「歸零」快捷鍵以免誤消已保存修正。

落地前的最低輸入政策亦須先接受並驗證：錄製／浮層與可編輯／IME 優先，控件已處理事件及工具局部命令讓位，再到 App 命令；普通按鈕的 Enter／Space 維持原生啟動。普通按鈕焦點不應一律讓未使用的 modifier chord 失效，但這是對目前 custom 全互動祖先阻擋的調整建議，需與 UI primitives 一起驗，而非本輪已修正。切歌與 toggle 一次按壓一次；數值命令首版 custom 也維持 noRepeat／busy 不排隊，舊預設的長按政策若變更需明示。沒有可執行曲目／來源就沿 unavailable，不猜曲、換 Queue 或補播。

### 設定 UI 的最低交付

沿既有 Folder 文件、四個局部 Tab 與 UiKbd：播放三列、音訊五列、歌詞兩列、操作說明唯讀。提供功能名稱、確認鍵位、作用範圍、設定／停用／恢復預設與衝突回饋；固定導覽與元件參考用 disclosure。主播放器／BGM／擷取導唱等對象必須直接具名。

首版十列不需要整張實體鍵盤圖；UiKbd 加分組清單已足以設定與查閱，也能呈現未指派功能。全鍵盤圖可作後續輔助，等焦點／Shift wildcard／布局與更多命令範圍穩定後再評估；若採用仍沿下一節的 modifier／情境切換，不當另一套綁定真值。

## 顯示與版面預設的同類參考（2026-10-29）

Owner 要求依操作類型參考常見預設，特別是 OBS 與 Adobe 的顯示調整。以下保留官方文件查核後的推薦與取捨；Owner 隨後明確接受先修方向鍵音量讓位、統一波形 PgUp／PgDn，再加局部波形縮放鍵，本輪已依序接入。沒有變更保存配置、十命令範圍或 global。播放操作沿前節歌唱／本機播放器對照；物件、預覽與時間檢視則分別參考 OBS、After Effects、Premiere，不能將三種用途當成相同縮放。

| 類型           | 官方可確認的 Windows 預設                                                                                                                                                                                                                            | Utawakui 建議與現況                                                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 物件位置       | [OBS](https://obsproject.com/kb/keyboard-shortcuts) 選中預覽物件後以方向鍵微移；[After Effects](https://helpx.adobe.com/after-effects/desktop/get-started/keyboard-shortcuts/keyboard-shortcuts-reference.html) 方向鍵移 1px、Shift＋方向鍵移 10px。 | 沿方向鍵小幅、Shift＋方向鍵大幅的一致規則。本案便利貼／照片已有 8px／24px，不為模仿競品改步幅；波形面板目前四方向 10px，不宣稱已有 Shift 大步幅。本輪已接音量方向鍵讓位，區域操作不再連帶改音量。 |
| 時間檢視縮放   | [Premiere](https://helpx.adobe.com/premiere/desktop/get-started/keyboard-shortcuts/default-keyboard-shortcuts.html) 與 After Effects 的時間軸用 `=`／`-` 放大／縮小。AE 的影像預覽則是句點／逗點，兩者用途不同。                                     | 已接波形面板內 `=`／`-`，呼叫既有縮放 owner；不更動音訊時間、句子草稿或播放，仍只在工具內使用。                                                                                                   |
| 時間檢視翻頁   | Premiere 的 PgUp 顯示上一頁、PgDn 顯示下一頁。                                                                                                                                                                                                       | 已統一 PgUp 往歌曲開頭、PgDn 往結尾；保留五個視窗跨度及媒體邊界，只調檢視、不 seek。                                                                                                              |
| 面板放大／還原 | [Premiere 面板說明](https://helpx.adobe.com/premiere/desktop/get-started/tour-the-workspace/display-any-panel-full-screen.html) 與 AE 用反引號鍵（` 的按鍵，通常位於數字 1 左側）切換單一面板大小；非美式鍵盤可能不同。                              | Owner 已確認並接入主工作區／右側面板／波形：最近點選或聚焦為目標，單次反引號切換、Escape 還原，共用明確按鈕。不開新視窗、不保存版面或加入十命令錄製。                                             |
| 移動畫面檢視   | OBS 在 Fixed Scaling 下用 Space＋拖曳平移、Space＋滾輪縮放；AE 按住 Space 暫切手形工具。                                                                                                                                                             | 波形普通拖曳已平移，保留現有直接操作。未來畫布才考慮 Space 暫切平移；與前節 Space 播放推薦先定義手勢分工，不讓拖曳放開時誤播放。                                                                  |
| 置中／適合畫布 | OBS 的 Ctrl+D 置中來源、Ctrl+F 將來源配合畫布；這會修改來源變形。AE 的 Shift＋斜線則只將預覽縮放至適合面板。                                                                                                                                         | 將「置中物件／調整物件尺寸」和「只縮放預覽」分開具名；未有對應功能時不配鍵。Ctrl+F／Ctrl+R／Ctrl+S 不挪用為全 App 顯示命令，避免與搜尋／既有保留語意混淆。                                        |
| 目的地與工作區 | Premiere 用 Shift＋數字切面板，Alt+Shift＋數字切工作區；不是跨工具統一標準。                                                                                                                                                                         | 本案 F1／F2／F3／F9 已對應正式目的地，維持現有預設，不為套用 Adobe 習慣換鍵；F4 沿 ADR 0023 保留。                                                                                                |

前四項已沿此順序實作：音量方向鍵讓位 handled／IME、互動或明示聚焦區與浮層；PgUp 往開頭、PgDn 往結尾並保留五視窗跨度；波形面板內單次 `=`／`-` 沿原 zoom；Owner 確認主工作區、右側面板與波形共用放大／還原。最近點選或聚焦為目標，單次反引號切換，Escape 先交選單再還原，來源／目的地失效自動解除。共用按鈕沿原 DOM，不重建 owner 或保存寬度。取消與草稿／transport 不變沿[波形契約](../contracts/lyrics-waveform.md)及[輸入契約](../contracts/input-bindings.md#固定面板檢視)。畫布平移、置中／適合等新增命令仍留待對應功能決策。畫面檢視、歌曲播放、資料修改分開；顯示操作不能附帶 seek、開始播放或保存歌詞。

現行 App 錄製子集仍不收 `=`／`-`／斜線／反引號，也只開十個執行命令；`=`／`-` 是波形固定操作，反引號是三種面板共用的固定檢視操作，沒有放寬共享驗證器或冒充可錄製命令。已存在的 Ctrl+↑／↓ 在本案是升降調、在 OBS 是來源排序；維持工具／焦點分層，所有推薦仍不註冊 global，不宣稱能避開使用者自訂 OBS 鍵。

Owner 本階段要求放大先收斂於最低可用：承接各區目前的閱讀／編輯、右側原操作及波形時間對照，不違反既有顯示規則，不造成閱讀困難或穿模。先驗原資訊／控制／捲動／浮層與還原，僅修破壞這些底線的問題；專用放大排版與明確使用效益另待後續，不以已能切換大小宣告設計完成。

## 鍵盤設定呈現建議（2026-10-29）

Owner 已確認快捷鍵區內依播放控制（3）、音訊調整（5）、歌詞對時（2）、操作說明（唯讀）四個 Tab 排序。沿既有 Settings 文件與 UiTabs，不改整體設定頁導覽；設定方法及共通規則集中於「操作說明 → 設定方式」，功能鍵參考沿同一入口。波形「⋯ → 操作說明」只留局部鍵帽與圖例；完整鍵盤圖不列入本輪交付。

Owner 要求在操作檢查階段盤點所有鍵盤行為，再決定設定與視覺化。現況唯一清單見[輸入綁定契約](../contracts/input-bindings.md#分層)：17 筆正式預設 App 綁定、內部另 4 筆，另有各元件、表單、錄製與系統入口。本輪沿原第 4 項增加十命令分類設定，不更動既有預設鍵或開放 global；下列鍵盤圖部分維持可選擴充建議。

主操作建議採可搜尋的「功能／目前按鍵／作用範圍／狀態／操作」清單，搭配可收合的鍵盤圖。功能清單能表達未指派的五個命令、同鍵不同焦點行為與不可自訂項；鍵盤圖用來找鍵、理解修飾鍵層與查占用，兩者共用同一份解析後綁定資料。沿既有 Settings Folder 活頁文件與 disclosure，不新增另一個控制台視覺系統。

| 呈現           | 建議內容／元件搭配                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 主要功能列     | 依播放、音訊、歌詞、導覽分組；顯示人類可讀名稱、目前已確認綁定、預設／自訂／停用／未指派、焦點範圍。只有十命令有編輯操作，固定鍵為唯讀。                           |
| 元件內操作說明 | 依曲目表、波形、歌詞、Folder、表單等情境列參考；不把 Tab／Enter／Esc／方向等標準操作全部混入可錄製列表。內部工具單獨標示。                                         |
| 按鍵顯示       | 重用既有 `UiKbd`（原生 kbd 與現有 tokens），每個 modifier／主鍵各一個 keycap；格式沿 `keyboardShortcutPresentation`，文字可讀且不只靠圖示。                        |
| 錄製           | 沿既有 recorder、候選、套用／取消與保存狀態；完整組合才有候選，試按不執行產品命令。衝突在列旁說明「哪個功能、什麼範圍占用」，不只標紅。                            |
| 就地提示       | 對應按鈕／選單／tooltip 顯示目前有效鍵；停用或未設不顯示舊預設。可用 `aria-keyshortcuts` 附加機器語意，但仍需可見 keycap／可讀說明。                               |
| 輔助鍵盤圖     | 預設收合；可切基本／Ctrl／Shift／Alt 與組合層，再選主窗／曲目表／波形等情境。點鍵只選取並揭露對應功能，不觸發播放、seek 或保存，也不直接覆寫綁定。                 |
| 鍵盤圖狀態     | 同時顯示文字／形狀差異：已指派、可錄製、保留、此情境無動作、其他情境有動作。保留不等於已指派；OS／IME 保留不等於可查知其他 App 的占用。                            |
| 窄窗／無障礙   | 功能列為完整可用主入口；圖可隱藏或局部捲動，不迫使用者操作大量鍵格才能改鍵。圖若只重述清單可用純展示；若可互動必有可聚焦控制與文字等價資訊，不能依賴 hover／顏色。 |

鍵盤圖首版若採 Windows ANSI 示意，須明說布局僅示意；現有 chord 是邏輯 `event.key`，不能把圖上的固定物理位置或 `code` 當匹配真值。ISO／JIS、中文 IME、numpad、Fn／媒體鍵的外觀與可錄製範圍不同，不應畫成全數可綁。Shift wildcard 要在圖的 Shift 層也揭露，例如 Shift+M 同樣靜音；未設／停用仍由功能清單呈現，不能從鍵盤空位推論功能不存在。

輸入優先序、Shift wildcard／長按與十命令範圍沿[輸入契約](../contracts/input-bindings.md)，不重新列為未決政策。Custom 讓位於聚焦的普通按鈕；若要改成允許未使用的 modifier chord，仍須另驗 primitives 與 S05–S07，不在清單或鍵盤圖另造分派器。Global 依逐命令 Windows gate，沒有新排程。

## 驗收情境（S01–S18）

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

## 整合與驗收入口

十命令的 App 保存／錄製與既有 executor 邊界見[輸入契約](../contracts/input-bindings.md#機器保存與錄製)；背景作用範圍、候選試用、套用／取消及占用／保存失敗復原，見[全域互動契約](../contracts/global-keyboard-shortcuts.md#第-4-項續接互動設定與候選試註冊)。兩者共用原 settings／recorder 與 player／queue／lyrics owners。

App、自有可見視窗、stub owners、in-memory 註冊、原生 helper 與真實 Windows／OBS 必須分層驗收；S01–S18 表是完整情境，不是全部待做或全部通過的進度表。歷次數字、modifier-only 推論撤回與實體回報限制集中於[分層驗證紀錄](../research/engineering/global-keyboard-shortcut-verification-2026-10-29.md)；正式開放條件與現況由 [spec](../spec.md) 持有，不在提案另列逐輪日誌。
