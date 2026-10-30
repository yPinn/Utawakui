# 全域快捷鍵註冊與失敗復原

沿[原第 4 項提案](../archive/keyboard-shortcuts-detail-2026-10-26.md)，本契約固定 Main 註冊、機器設定交易與單一接收端邊界。App 內設定與命令執行仍見[輸入契約](input-bindings.md)。全域預設關閉；設定已保存、OS 持有按鍵、命令可執行是三個不同狀態。

## 平台門檻與本階段範圍

Main 在 single-instance 成功及 app ready 後建立唯一註冊管理器；renderer 只傳既有十命令與有界邏輯 chord，不傳 accelerator、callback 或 IPC channel。Windows x64 已接僅負責註冊的 helper，取代原先只能評估的公開 Electron 路徑；不加入低階 hook、raw input、持續鍵盤監看或模擬輸入至產品。正式 capability 仍為空，App 內快捷鍵不依賴 helper。

註冊／復原與 Main–renderer 單一分派接收端基礎已接入，測試才注入已驗命令。正式 capability 仍為空；全域設定錄製入口與 S08–S10／S18 完整平台操作尚未開放或驗收，不因 manager／receiver 存在就自動開放。

## Windows 持鍵抑制的隔離驗證

再次觸發以主鍵放開再按為準；Ctrl／Shift 等修飾鍵可持續按住，普通持鍵連發只執行一次。不承諾主鍵仍按住時只重按 Ctrl 就會再次觸發。重建／喚醒本身不算新按壓，不補觸發；App 內既有 repeat 政策不變。

Windows helper 使用 MOD_NOREPEAT；註冊前後各一次、限已設定鍵的 GetAsyncKeyState 高位取樣，不是 keyup 歷史，也不能消除 OS 註冊、desktop／權限與取樣之間的非原子限制。不能靠 cooldown、低階 hook 或持續鍵盤監看補成通過。

原合成探針在重按 Ctrl 後另送 F11 keydown，不能證明 modifier-only 重組，成功推論已撤回。Owner 接受主鍵重按規則並回報實體重按／長按正常，證據仍限隔離 mute stub；原始數據、撤回與人工回報限制見[分層驗證紀錄](../research/engineering/global-keyboard-shortcut-verification-2026-10-29.md#windows-持鍵原型原契約片段)。

## Windows helper 與實體資源

`native/keyboard-shortcuts/HotkeyHost.cs` 是單一註冊 owner。Reader 只將最多 4096-byte ASCII frame 放入 32 筆有界佇列；owner thread 建立訊息迴圈後才發 ready，處理 register／query／unregister／activate／stop，最多持有 20 個 slot，原生 id 不重用。stdout 由獨立 writer 與 256 筆有界佇列處理，不讓輸出堵住註冊執行緒；滿佇列、壞輸入／管線與 EOF 使 owner 停止並清理。父程序以一次開啟的 SYNCHRONIZE handle 等待，未以 PID 重用或持續查程序猜存活。

註冊使用 MOD_NOREPEAT。前後各取樣一次已設定的主鍵與修飾鍵，當前 input desktop 不可確認或不同時拒絕，持鍵回 keys-held 而不假報占用；仍不保證可取得所有權限情境的放鍵證據。啟用時先停轉送、有界排空已排入 owner 的 WM_HOTKEY，再切 generation 與 active token 集合；排空失敗不回成功。ACK 與後續事件由同一 writer 順序輸出，事件在 owner 端附 instance／slot token／generation／sequence，已輸出的舊通知不改標籤。這是來源佇列切換邊界，不冒稱原子實體放鍵或一般鍵盤事件監看。

`windowsShortcutBackend.js` 以固定、驗過 hash 的檔案 lazy spawn，無 shell、隱藏視窗、有限環境，父程序 id 只由 Main 導出。Ready 最多等 5 秒，逐請求最多 3 秒、最多 32 筆；輸出 frame 最多 8192 bytes。錯 instance、壞資料、逾時、非預期 EOF 或 stream error 立即撤分派並拒絕在途要求；清理先關 stdin，1.5 秒後仍未退出才終止自己的 ChildProcess，最多等 4 秒確認退出。不以送出 kill 就宣稱釋放；不確定者保原 manager 的清理責任與 degraded。明確重新讀取才可 reset 並重建，無自動重啟／改鍵。

`scripts/build-keyboard-shortcut-helper.mjs` 產生 `.build/HotkeyHost.exe`／`.exe.config` 與 manifest；beforePack 在 Main bundle 建置後產生可信的 `runtime/keyboard-helper.json`，再以 builder 精確複製兩個實體檔到 `resources/keyboard-shortcuts/`。Main 使用本案 detectPackagedRuntime，而非 app.isPackaged；manifest 位於 ASAR，固定 basename、長度、hash、x64 PE 與 protocol 均須吻合，不接受 renderer 路徑、redirected file 或任意 exe。缺失或不符僅使全域後端不可用，不停用 App 內設定／命令。全域關閉且無註冊時不查檔、不啟動 helper。

休眠先撤 Main 分派再清理；退出若仍有 helper，before-quit 先阻止一次退出，等有界清理後再 quit，移除自身 listener 避免迴圈。EOF 與 parent-handle 路徑補 Main 非正常結束的釋放；不影響其他程序或其他內部註冊者。接收端基礎不解除 capability 門檻，也不構成全域控制已交付。

## 設定交易

### 第 4 項續接：互動設定與候選試註冊

App 與背景是兩個設定範圍，共用既有四分類與十命令，不另建命令或設定 owner。App 只在主窗使用；背景適用其他程式前景、最小化或隱藏時，仍受 receiver 與當下命令政策限制，不帶前。正式 `eligibleCommands` 維持空，renderer 的正式工廠仍拒絕全域配置；以下互動先由隔離工廠注入已驗命令驗證，狀態回覆不能授予正式 UI 權限。

- 選背景範圍只檢視／編輯該命令的背景綁定，不複製 App 鍵位、不自動啟用。未通過平台門檻的命令不可錄製或保存。總啟用與逐命令綁定分開；停用保留已存鍵位，移除單鍵不影響 App 綁定。
- 錄製只收完整、合法且無內部衝突的候選；候選期間所有 executor 停止。重新錄製、換範圍／分類、失焦、隱藏、Esc、取消或卸載均撤候選及試用結果，不寫檔。
- 「試用按鍵」把候選完整配置與 expected revision 交同一 Main manager：驗 gate／CAS，短暫 staging 新增鍵，隨即釋放並以新來源世代恢復舊映射。試用不保存、不執行任何產品命令、不跨 RPC 留租約；回覆後的占用可能改變，成功文案僅為「目前可用」。背景已啟用時，套用再註冊及重驗 CAS；背景關閉時只以 CAS 保存鍵位，不留下註冊，之後明確啟用才再驗占用。試用完成前可取消 UI；晚回結果不復活候選，Main 仍完成清理。
- 背景候選須試用成功才能套用。套用送出後不可假報取消；只有確認保存的配置更新設定投影，runtime 的暫停／降級另行呈現。試用或套用遇占用可改鍵或明確重試，不猜占用者，不自動換鍵或輪詢。
- 試用釋放失敗保實際持有並降級；不顯示成功或允許套用。試用期間休眠／退出沿原立即撤分派及晚到 ACK 清理，不恢復舊意圖。
- 啟用／改鍵保存失敗撤新增並保舊配置／舊 active；CAS 衝突要求重讀，不覆寫外部新版本。關閉背景或恢復全部預設先撤分派及清理，再嘗試保存；保存失敗仍保持本次停用，明示下次啟動的設定尚未儲存，重讀不代替明確的重新啟用。
- Main 的純意圖解析與讀檔分開：完整意圖及 gate 合法的停用先撤分派，再讀檔／驗 CAS／保存；讀取 I/O 失敗亦不能讓背景繼續操作。未保存的本次停用由 Main `sessionDisabled` 持有；普通 set、App 改鍵、重讀與喚醒均不解除。只有固定 `keyboard-shortcuts:enable` 的明確啟用意圖在 CAS 保存及啟用成功路徑才可解除；它沿同一交易與平台 allowlist，不能由任意 channel 或 runtime 投影授權。

唯讀 runtime 讀取中、逾時或失敗不阻擋停用：隔離工廠有本地資格且已確認啟用配置時，停用仍送原固定 set 意圖，由 Main 再驗 gate／CAS 並先撤分派；停用保存失敗可明確重試，不能因狀態未知而自行恢復。啟用仍須已確認 runtime，讀取晚回不能蓋過停用結果。正式 singleton 不因這條復原路徑取得資格。

以上切片不解除 S08–S10／S18 平台門檻，也不新增 OBS、實際裝置／音訊或安裝版驗收證據。

Main 的 store 沿原固定 userData 檔、16 KiB 上限、完整驗證、CAS revision 及原子保存。新增 prepare 只驗意圖、目前 bytes 與 revision，不寫檔；真正 set 在寫入前重新驗 CAS。global chord 即使全域關閉也必須屬平台已驗命令；預設空 allowlist 保持目前 App-only 的保存與未知資料唯讀行為。

1. 先驗完整意圖、十命令／保留鍵衝突及平台 allowlist，再驗 CAS。無效或越權意圖不碰 OS；啟用／改鍵遇壞檔、未知版本或衝突亦不碰 OS。合法的停用／恢復全部預設例外：先撤分派並清理，再讀檔／驗 CAS，不覆寫有問題或較新 bytes。
2. 由 Main 正規化 chord 導出固定 accelerator。沿用前先重驗本 App 的註冊紀錄，遺失或無法確認就停止分派、不保存新設定，待明確重驗；只逐筆註冊新增鍵。新增 callback 尚未 commit 時不執行，其他內部持有者的鍵不搶占或清除。
3. 任一新增註冊失敗，僅清理本交易新增鍵，保留原 bytes 與原映射。register=false 表示這次未取得，不將 isRegistered=false 當成系統空閒。
4. 全部新增鍵確認持有後才呼叫 store.set。保存失敗或 CAS 再驗失敗，撤新增鍵；已送出保存不向 renderer 假報取消。
5. 保存成功後確認新 mapping／generation 的啟用並釋放舊鍵，全部確認後才開分派。同 App 沿用同 chord 換命令不先釋放搶回；已撤銷 callback 不得再執行。
6. 清理失敗時保存結果與 runtime 分開回報。未釋放的鍵只記錄實際持有，停止全域分派並進 degraded，不宣稱完整還原；不無限重試或讓失敗鍵累積。明確重新讀取／恢復時才作一次重驗。

每次交易可等待 backend，但不重入；busy 不排隊，持續涵蓋註冊確認、啟用與清理。Store prepare／set 與原子 rename 仍同步，最後生命週期檢查到 CAS／rename 中間不插入 await。任何清理只作用於本管理器建立或不確定是否已取得的註冊，不用 unregisterAll 或全域 setSuspended 影響其他內部功能。OS register／unregister／isRegistered 例外保留 Main 診斷，公開狀態只含固定碼與已知命令。註冊明示 false 回占用；API 例外回不可用，兩者不混稱。遠端 ACK 拒絕不代表遠端未取得，須保留清理責任；單純 Promise timeout 不能當註冊已取消或鍵已釋放。

manager 的 backend 方法可回同步值或 Promise；有來源柵欄的 backend 另實作 activate，收到 Main 指定的 generation 與註冊 token 集合後回 true 才確認啟用。Callback 必須攜帶來源端已標記的 generation／registrationToken，不能在 Main 收件時套上最新映射。每次交易先使前一通知世代失效；成功保存或失敗後恢復舊映射都須重新確認啟用，保留同 chord 的實際註冊。缺欄位、舊世代或舊 slot 的通知不執行。普通 Electron adapter 沒有此來源柵欄，仍受空 capability 限制；helper instance、sequence 與 OS／pipe 佇列邊界由 Windows backend 保證；manager 的 mock 不替代原生佇列／pipe 驗證。

有來源柵欄的 backend 也須以註冊 token 確認及釋放特定 slot；普通 Electron adapter 維持原本的公開 API 引數。等待 precheck 後可能有其他內部 consumer 先取得該鍵，register 明示 false 時不能因後續 App map 為 true 就認領或清理對方的鍵。

保存成功後啟用／舊鍵清理失敗，只回已保存 ready 與 degraded／不可分派 runtime，不進保存前 rollback；保存成功後休眠／退出亦保留該保存結果。保存前取消則不寫入，晚到的成功註冊 ACK 仍由本 manager 清理。

## Runtime 與生命週期

唯讀 runtime 快照同步讀取快取，區分 disabled、active、blocked、degraded、suspended、disposed，另列 active、仍持有或待確認釋放的 held、等待註冊確認的 pending、busy、平台已驗命令及有界問題。這些是透過 backend 可觀察的本 App 註冊紀錄：Electron 的 isRegistered 不是獨立 OS 存活探針，unregister 也不回成功 boolean；不能據此保證所有 OS 失效都能被偵測。bootId／generation 由 Main 產生；不把註冊持有視為目前播放或來源可操作的證據。另一隔離程序可重新取得測試鍵，才是本輪 OS 釋放驗證的補充證據。

啟動等待 ready，明確重新讀取重驗已保存 desired，不自動改檔或挑另一組鍵；未保存的本次停用優先於 desired，重讀不重新啟用。合法停用先撤分派／釋放舊鍵再保存；尚未確認釋放者以 degraded 呈現。休眠／退出同步撤銷分派及生命週期 token，再等待在途確認、清理自己的鍵；舊交易不能重新保存、啟用或覆寫停止狀態。喚醒等待先前清理完成後重新讀取與逐筆確認，失敗保持不可執行；較新休眠會使較早喚醒失效。EventEmitter listener 接住 Promise rejection，不累積訂閱，不在 renderer crash／reload 後補發命令。will-quit 本身不等待非同步 listener；有 helper 時使用前述 before-quit 與 parent-disconnect 清理，本輪空 capability 不持有產品 OS 鍵。

固定 keyboard-shortcuts:runtime 只接受主控制台 main frame、無 payload；既有 get/set 與下述 receiver 操作仍走同一驗權與 diagnostics 邊界。Performer／Output／foreign frame 不可讀寫。Renderer 不可藉 payload 開啟平台 capability，沒有 renderer 自選命令的執行 IPC。

## Main–renderer 單一分派接收端

`shared/globalShortcutReceiver.mjs` 固定 offer、命令 envelope 與有界回覆意圖。Main `keyboardShortcutReceiver.js` 持有唯一主控制台 main-frame 租約；renderer 在既有 `useKeyboardShortcuts` 內接 `useGlobalShortcutReceiver`，共用同一 `useShortcutCommands` executor 與 player／transport／lyrics owners，不增加播放器或歌詞狀態來源。

1. Renderer 先訂閱固定 state／command 事件，再要求 connect。Main 回隨機 receiverId／offerId、bootId／generation、實際 active 命令／chord 與視窗角色；desired、占用失敗或未確認持有的鍵不算 active。
2. Renderer 先安裝該 active chord 的 DOM 所有權抑制，包含 repeat keydown，再送 opaque contextRevision 確認。Main 沿同一 manager rearm，等待新的來源 generation ACK 才標 ready；不保存設定，也不解除重建同鍵註冊。安裝前已排入的舊 OS／pipe 通知不能在 DOM 已執行後重送。
3. Main 只從當前 active mapping 送固定十命令 envelope，附租約、offer、來源世代、單調 sequence 與已確認 contextRevision。重送、舊來源、busy、未就緒或失效 frame 直接丟棄。最多保留 32 個一次性 admission 識別，1 秒到期；不排隊命令或補發溢出／到期通知。
4. Renderer 先驗全部身分／世代／sequence 與當下 context，再請 Main 消耗該 sequence 的 admission。Main 再驗 frame、runtime 與視窗角色；renderer 等待後再驗本地 context，才呼叫原 executor。重送 admission 不得執行第二次。
5. UI 版本涵蓋錄製、IME、editable／widget 焦點、阻擋浮層與設定未就緒；進入與離開均使在途 global 失效。來源版本另含曲目、播放 request／revision、歌詞 source session／timing／offset 等本地身分，跨等待失效即丟棄；不將這些私有身分送 Main。已進 executor 的操作沿原來源／CAS／pending-start ownership，自己的播放或 offset 更新不自行撤銷。Global context 取消只撤自己的 pending，不影響 App 操作。

固定 invoke 為 `keyboard-shortcuts:receiver-connect`、`receiver-confirm`、`receiver-admit`、`receiver-release`（後三者沿同一前綴）；固定推送為 `keyboard-shortcuts:receiver-state`、`keyboard-shortcuts:command`。Confirm 只收 receiverId／offerId／contextRevision，admit 只收 receiverId／offerId／sequence，release 只收 receiverId；不收任意 command、路徑、channel、焦點或來源狀態。Preload 只投影已知欄位，Main 重新驗權與完整 payload，操作錯誤沿既有私有診斷／有界公開錯誤。

主控制台前景採本 App 焦點／IME／浮層規則，Performer、其他內部視窗或 DevTools 聚焦時拒絕。主控制台失焦、最小化或 Tray 隱藏但 renderer 仍存活時，可按背景政策請求執行；不帶前、不查其他 App 文字／IME，也不把舊 activeElement 當其他 App 焦點。隔離視窗支援證據不代替真 Performer、Tray 入口、十命令或 OBS 完整驗收。

Main-frame navigation、frame 更換、crash、destroy 或 unresponsive 撤租約與待決 admission；初次載入中的 lease 保留至 did-finish-load 才重新 offer。焦點或 runtime 變更撤 ready，重新確認須經來源柵欄；較早 rearm 完成不得覆蓋較新 offer。重新載入、明確重讀／保存配置可重連；不以 responsive 或 timer 自動重播。卸載精確移除訂閱並只釋放自己的 receiverId。正式 eligible 仍為空，這條路徑不啟動 helper 或提供全域設定 UI。

正式設定區只提供背景狀態的唯讀列，沿同一 `useKeyboardShortcutSettings` owner 與共用設定列；展開才讀既有 runtime 快取，失敗可重讀，不觸發註冊復原。只把白名單 runtime 欄位轉成短狀態，不展示私有錯誤、原生識別或路徑，也不把 held／desired 當 active。讀取逾時或失敗不清 App 偏好，dispose 不接晚到結果；沒有全域啟用、錄製或保存入口，正式 capability 不變。

## 驗收

- S03／S04：完整衝突、同 chord 換映射、初始／重啟不多搶鍵、global 關閉及空 capability 不註冊。
- S14／S15：外部占用、內部既有持有、多鍵中途失敗、staging callback、保存失敗／CAS 再驗失敗保原檔與映射。
- S16／S17：移除／停用／清理失敗、撤銷 callback、實際 held 與 active 分報、明確重驗、suspend／resume／quit 清理與訂閱釋放。
- 正常 Windows OS 路徑另驗 register/isRegistered/unregister 與占用復原；單元 mock 不替代平台證據。公開 Electron adapter 的重複 keydown 證據不合格；helper 與現行主鍵重按規則僅部分驗證，正式全域入口保持關閉。
- S08／S09 已有 receiver／DOM 所有權及一次分派的自動化基礎；S08–S10／S18 可見 Windows／跨 App／實體操作仍待驗，不能沿用 App 內或 mock 通過數當成全域操作已驗收。

歷次測試數、原生探針、接收端支援證據及隔離互動結果，集中於[分層驗證紀錄](../research/engineering/global-keyboard-shortcut-verification-2026-10-29.md)。公開 Electron callback 缺少 keyup／repeat 證據，helper 與隔離互動測試不能直接解除逐命令平台門檻。

## 平台來源

[Electron 43.8.3 globalShortcut](https://github.com/electron/electron/blob/v43.8.3/docs/api/global-shortcut.md) 定義 ready 後註冊、逐鍵 boolean 結果及 isRegistered 只查本 App。[對應 Chromium Windows listener](https://github.com/chromium/chromium/blob/150.0.7871.250/ui/base/accelerators/global_accelerator_listener/global_accelerator_listener_win.cc) 與 [RegisterHotKey observer](https://github.com/chromium/chromium/blob/150.0.7871.250/ui/gfx/win/singleton_hwnd_hot_key_observer.cc) 沒有提供本契約需要的 keyup 證據。來源與隔離 OS 探針共同限制本階段 capability，不外推到所有 Electron 版本或實體裝置。

[Microsoft RegisterHotKey](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerhotkey) 定義 MOD_NOREPEAT、執行緒訊息迴圈與 F12 的 debugger 保留；本輪 Windows 後端與 global chord 已拒絕 F12，不能將現有 App 鍵子集直接當 OS 可註冊集合。[GetAsyncKeyState](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getasynckeystate) 說明高位為取樣當下狀態、低位不可依賴，零也可能是取樣失敗；本輪沒有據此宣稱可靠 keyup 或啟動時必然可確認所有按鍵已放開。

[Microsoft .NET Framework 版本與相依性](https://learn.microsoft.com/en-us/dotnet/framework/install/versions-and-dependencies) 列出 Windows 內建 4.8／4.8.1 的版本差異。本案 helper 以 4.8 為明示前提，不將所有舊 Windows 或被移除的系統元件當成已確認可用，也不自動安裝環境。

## 驗收案例

案例編號沿用[原提案](../archive/keyboard-shortcuts-detail-2026-10-26.md)；表格列完整情境，不是進度表，現況見 [spec](../spec.md)。

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
