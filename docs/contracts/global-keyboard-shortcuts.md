# 全域快捷鍵註冊與失敗復原

沿[原第 4 項提案](../research/product/keyboard-shortcuts-detail-2026-10-26.md)，本契約先固定 Main 註冊與機器設定交易。App 內設定與命令執行仍見[輸入契約](input-bindings.md)。全域預設關閉；設定已保存、OS 持有按鍵、命令可執行是三個不同狀態。

## 平台門檻與本階段範圍

Main 在 single-instance 成功及 app ready 後建立唯一註冊管理器；renderer 只傳既有十命令與有界邏輯 chord，不傳 accelerator、callback 或 IPC channel。Windows x64 已接僅負責註冊的 helper，取代原先只能評估的公開 Electron 路徑；不加入低階 hook、raw input、持續鍵盤監看或模擬輸入至產品。正式 capability 仍為空，App 內快捷鍵不依賴 helper。

2026-10-29，現用 Electron 43.8.3／Chromium 150.0.7871.250 的 Windows OS 註冊探針可成功註冊及釋放；一次短按與一段重複 keydown 序列合計收到 14 次回呼。這是隔離測試視窗中的 Windows SendInput 測試，不冒充實體鍵盤長按或 OBS 驗收。公開 callback 沒有 keyup／repeat 證據，因此本階段所有正式全域命令仍未通過 S10；產品 capability allowlist 保持空，不保存或註冊這些全域配置。不能用 cooldown 宣稱一次持鍵只執行一次。

本階段可實作及驗證註冊／復原前置，測試才注入已驗命令及模擬 receiver。正式全域命令 envelope、前景 DOM 與 OS 單一分派、設定錄製入口及 S08–S10／S18 平台操作仍待此門檻解除後接入；未接好的路徑不得因 manager 存在就自動開放。

## Windows 持鍵抑制的隔離驗證

2026-10-29 接續 S10，以同機隔離 Win32 原型比較 RegisterHotKey 有無 MOD_NOREPEAT。原型未進產品、未改正式設定，也未新增產品依賴。按鍵由測試程式只送到已確認聚焦的自有 Electron 視窗；另一自有視窗用於驗證接收者不必是前景視窗，不代替 OBS／瀏覽器或實體鍵盤驗收。

| 情境                             | 一般註冊通知數 | MOD_NOREPEAT 通知數 |
| -------------------------------- | -------------- | ------------------- |
| 短按一次                         | 1              | 1                   |
| 主鍵按下後再送 12 次重複 keydown | 13             | 1                   |
| 保持修飾鍵，主鍵放開重按 3 次    | 3              | 3                   |
| 快速放開重按 10 次               | 10             | 10                  |
| 切到另一自有視窗後短按 3 次      | 3              | 3                   |
| 切回後重複 keydown               | 13             | 1                   |

MOD_NOREPEAT 並非主鍵放開證據。另測主鍵保持按住、放開再按 Ctrl，仍新增一次通知；持鍵時解除再重建註冊，也新增一次通知。2026-10-29 Owner 已確認全域操作採完整組合重新形成可再次觸發：例如 F11 未放開，Ctrl 放開後再按 Ctrl，可算新按壓；普通持鍵連發仍只一次。重建／喚醒本身不算新按壓，不可因此補觸發。此確認只解決全域按壓語意，不改 App 內既有 repeat 政策，也不代表原生後端已驗收。

隔離原型另在註冊前後各讀一次已設定 Ctrl／Shift／F11 的 GetAsyncKeyState 高位，不用低位歷史、不持續輪詢或安裝 hook。實測啟動時已按住會拒絕；持鍵重建時保留原註冊且拒絕該次要求，後續重複 keydown 新增零通知；全部放開後明確重試與兩次新短按得到兩次通知。外部占用拒絕與程序終止後另一程序重新取得亦通過。這僅驗特定序列中的註冊保護：各鍵取樣與 OS 註冊不是原子操作；高位清除也不能證明放鍵歷史，API 在非作用中 desktop／權限限制下亦可能回零。完整組合重組已獲接受，正式後端的註冊生命週期與平台操作仍須另驗，S10 未整體結案。

### 原型至後端接入

Windows 完整組合重新形成的操作語意已接受。本輪接入只擁有註冊與 WM_HOTKEY 訊息的 Windows helper，明列其 .NET Framework 4.8 以上前提與包裝邊界。GetAsyncKeyState 的有界狀態觀察不能稱為完全沒有鍵盤狀態觀察；不以 cooldown、漏吞合法重按或隱藏鍵盤監看補洞。

後端沿同一註冊交易，不另建設定／播放 owner：

- Main 固定 helper 路徑、版本與協定；只傳已驗命令導出的有限鍵組，不接 renderer 提供的執行檔、原生鍵碼或任意 channel。單一 helper 執行緒擁有訊息迴圈與所有註冊，使用 MOD_NOREPEAT；不收集任意鍵盤事件。
- manager 已改可等待同步或非同步 backend，不能用尚未回覆的 helper 假扮同步 globalShortcut。須等待逐筆 ACK、跨等待保 busy、保存前再驗 CAS；新增註冊仍只 staging，同 chord 換映射保留實際註冊。取消／休眠／故障先撤分派，保存結果與清理結果分報。
- 每個 helper instance、實際註冊 token、啟用 generation 與通知 sequence 均由受信任端持有；重建、換映射或重啟後的舊通知不得以當前映射補送。待啟用的 OS／pipe 佇列不能只在收件時套上最新 generation，就當成新按壓。
- 啟動／停止與協定回覆有期限、訊息與註冊數有界；EOF、程序退出、錯誤或逾時先停止命令分派，釋放狀態無法確認就降級。只明確重試，不背景等待放鍵、改鍵或重啟；預設關閉不啟動 helper。
- 本輪採 C# x64 helper，在建置／封裝時以 Framework64 v4 compiler、固定參照與選項編譯。執行時須 Windows x64 與 .NET Framework 4.8 以上；不在使用者啟動時呼叫編譯器／PowerShell、安裝 runtime 或下載 helper。每次產物記錄來源與 compiler SHA-256，不聲稱二進位逐 byte 可重現。完整安裝版仍待驗。

上述原型、已接受操作語意與已接後端都未開啟正式 capability。S08／S09／S18、前背景單一分派、實體鍵盤／OBS 與真實休眠仍未驗收；本輪未修改正式 receiver 或全域設定入口。

## Windows helper 與實體資源

`native/keyboard-shortcuts/HotkeyHost.cs` 是單一註冊 owner。Reader 只將最多 4096-byte ASCII frame 放入 32 筆有界佇列；owner thread 建立訊息迴圈後才發 ready，處理 register／query／unregister／activate／stop，最多持有 20 個 slot，原生 id 不重用。stdout 由獨立 writer 與 256 筆有界佇列處理，不讓輸出堵住註冊執行緒；滿佇列、壞輸入／管線與 EOF 使 owner 停止並清理。父程序以一次開啟的 SYNCHRONIZE handle 等待，未以 PID 重用或持續查程序猜存活。

註冊使用 MOD_NOREPEAT。前後各取樣一次已設定的主鍵與修飾鍵，當前 input desktop 不可確認或不同時拒絕，持鍵回 keys-held 而不假報占用；仍不保證可取得所有權限情境的放鍵證據。啟用時先停轉送、有界排空已排入 owner 的 WM_HOTKEY，再切 generation 與 active token 集合；排空失敗不回成功。ACK 與後續事件由同一 writer 順序輸出，事件在 owner 端附 instance／slot token／generation／sequence，已輸出的舊通知不改標籤。這是來源佇列切換邊界，不冒稱原子實體放鍵或一般鍵盤事件監看。

`windowsShortcutBackend.js` 以固定、驗過 hash 的檔案 lazy spawn，無 shell、隱藏視窗、有限環境，父程序 id 只由 Main 導出。Ready 最多等 5 秒，逐請求最多 3 秒、最多 32 筆；輸出 frame 最多 8192 bytes。錯 instance、壞資料、逾時、非預期 EOF 或 stream error 立即撤分派並拒絕在途要求；清理先關 stdin，1.5 秒後仍未退出才終止自己的 ChildProcess，最多等 4 秒確認退出。不以送出 kill 就宣稱釋放；不確定者保原 manager 的清理責任與 degraded。明確重新讀取才可 reset 並重建，無自動重啟／改鍵。

`scripts/build-keyboard-shortcut-helper.mjs` 產生 `.build/HotkeyHost.exe`／`.exe.config` 與 manifest；beforePack 在 Main bundle 建置後產生可信的 `runtime/keyboard-helper.json`，再以 builder 精確複製兩個實體檔到 `resources/keyboard-shortcuts/`。Main 使用本案 detectPackagedRuntime，而非 app.isPackaged；manifest 位於 ASAR，固定 basename、長度、hash、x64 PE 與 protocol 均須吻合，不接受 renderer 路徑、redirected file 或任意 exe。缺失或不符僅使全域後端不可用，不停用 App 內設定／命令。全域關閉且無註冊時不查檔、不啟動 helper。

休眠先撤 Main 分派再清理；退出若仍有 helper，before-quit 先阻止一次退出，等有界清理後再 quit，移除自身 listener 避免迴圈。EOF 與 parent-handle 路徑補 Main 非正常結束的釋放；不影響其他程序或其他內部註冊者。正式 receiver 尚未接入，故這些基礎不構成全域控制已交付。

## 設定交易

Main 的 store 沿原固定 userData 檔、16 KiB 上限、完整驗證、CAS revision 及原子保存。新增 prepare 只驗意圖、目前 bytes 與 revision，不寫檔；真正 set 在寫入前重新驗 CAS。global chord 即使全域關閉也必須屬平台已驗命令；預設空 allowlist 保持目前 App-only 的保存與未知資料唯讀行為。

1. 先驗完整意圖、十命令／保留鍵衝突、平台 allowlist 及 CAS。無效、壞檔、未知版本、衝突均不碰 OS。
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

啟動等待 ready，明確重新讀取重驗已保存 desired，不自動改檔或挑另一組鍵。停用成功才釋放舊鍵；尚未確認釋放者以 degraded 呈現。休眠／退出同步撤銷分派及生命週期 token，再等待在途確認、清理自己的鍵；舊交易不能重新保存、啟用或覆寫停止狀態。喚醒等待先前清理完成後重新讀取與逐筆確認，失敗保持不可執行；較新休眠會使較早喚醒失效。EventEmitter listener 接住 Promise rejection，不累積訂閱，不在 renderer crash／reload 後補發命令。will-quit 本身不等待非同步 listener；有 helper 時使用前述 before-quit 與 parent-disconnect 清理，本輪空 capability 不持有產品 OS 鍵。

固定 keyboard-shortcuts:runtime 只接受主控制台 main frame、無 payload；既有 get/set 仍走同一驗權與 diagnostics 邊界。Performer／Output／foreign frame 不可讀寫。Renderer 不可藉 payload 開啟平台 capability；本階段未新增命令執行 IPC。

## 驗收

- S03／S04：完整衝突、同 chord 換映射、初始／重啟不多搶鍵、global 關閉及空 capability 不註冊。
- S14／S15：外部占用、內部既有持有、多鍵中途失敗、staging callback、保存失敗／CAS 再驗失敗保原檔與映射。
- S16／S17：移除／停用／清理失敗、撤銷 callback、實際 held 與 active 分報、明確重驗、suspend／resume／quit 清理與訂閱釋放。
- 正常 Windows OS 路徑另驗 register/isRegistered/unregister 與占用復原；單元 mock 不替代平台證據。S10 重複 keydown 已見不合格，所以正式全域入口保持關閉。
- S08–S10／S18 及全域命令執行／去重屬下一切片，不能沿用 App 內通過數當成全域操作已驗收。

2026-10-29 前置驗證：相鄰 store／manager／lifecycle／handler／preload 與架構檢查共 8 檔 144 項通過；完整回歸 1191 檔、12185 項通過／1 skipped。隔離雙程序 OS 測試另通過占用保原狀、釋放後重試、中途占用撤新增、保存失敗復原、新 manager 讀取恢復且不改檔、停用後另一程序可取得、正式 capability 不能被測試配置開啟七項。完整重啟的 App 驗主視窗唯讀 runtime、拒絕全域配置、原設定 bytes 不變及零 OS 註冊；未驗實體鍵盤、OBS 並行或實際休眠。

接續非同步交易切片：相鄰五檔 110 項通過；四個核心模組定向 coverage 為 statements 93.59%、branches 87.84%、functions 96.82%、lines 96.15%。完整回歸單獨執行為 1191 檔、12197 項通過／1 skipped；首次與全庫格式／lint 並行時出現跨模組逾時及一項斷言失敗，未調整逾時或產品程式，單獨完整重跑通過，失敗紀錄保留。全庫 lint／Markdown／format、renderer／Main runtime 建置通過。隔離 Windows 雙程序七項重新通過；以新 Main／preload 與已建置 renderer 完整重啟，設定 bytes 不變、busy 為 false、pending／active／held 為空且零正式 OS 註冊，測試 App 正常退出。這批不涵蓋 native helper、安裝版、實體鍵盤／OBS 或真正休眠。

Windows helper 與封裝切片：最終完整回歸 1194 檔、12229 項通過／1 skipped；四個核心模組 63 項定向測試，coverage 為 statements 92.17%、branches 84.82%、functions 93.81%、lines 95.03%。全庫 lint／Markdown／format 通過，renderer 建置及兩次隔離 unpacked artifact／afterPack 資源檢查通過。實體 helper 的合成按鍵驗一般／快速／自有 A–B 視窗通知數為 1／1／3／10／3／1，完整組合重組為 1／1／2；staging 不補通知、外部占用後明確重試、持鍵 resume 拒絕且不自動重試／改檔、放開後明確恢復與父程序結束後另一程序可取得均通過。

另以隔離 Electron host 載入 artifact ASAR 內的 Main／preload／renderer，實際設定 IPC ready、拒絕正式全域配置、原設定 bytes 不變且正式 helper 啟動數為零；再明確測試該 artifact 的實體 helper 註冊／確認／啟用／退出，App exit 0，無殘留專案 helper。這是封裝程式與資源路徑驗證，不是安裝版 executable、實體鍵盤、OBS、真實休眠或權限／配置矩陣驗收；排空上限／極端原生 queue backlog 尚未獨立壓測，正式 capability 維持空。

## 平台來源

[Electron 43.8.3 globalShortcut](https://github.com/electron/electron/blob/v43.8.3/docs/api/global-shortcut.md) 定義 ready 後註冊、逐鍵 boolean 結果及 isRegistered 只查本 App。[對應 Chromium Windows listener](https://github.com/chromium/chromium/blob/150.0.7871.250/ui/base/accelerators/global_accelerator_listener/global_accelerator_listener_win.cc) 與 [RegisterHotKey observer](https://github.com/chromium/chromium/blob/150.0.7871.250/ui/gfx/win/singleton_hwnd_hot_key_observer.cc) 沒有提供本契約需要的 keyup 證據。來源與隔離 OS 探針共同限制本階段 capability，不外推到所有 Electron 版本或實體裝置。

[Microsoft RegisterHotKey](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerhotkey) 定義 MOD_NOREPEAT、執行緒訊息迴圈與 F12 的 debugger 保留；本輪 Windows 後端與 global chord 已拒絕 F12，不能將現有 App 鍵子集直接當 OS 可註冊集合。[GetAsyncKeyState](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getasynckeystate) 說明高位為取樣當下狀態、低位不可依賴，零也可能是取樣失敗；本輪沒有據此宣稱可靠 keyup 或啟動時必然可確認所有按鍵已放開。

[Microsoft .NET Framework 版本與相依性](https://learn.microsoft.com/en-us/dotnet/framework/install/versions-and-dependencies) 列出 Windows 內建 4.8／4.8.1 的版本差異。本案 helper 以 4.8 為明示前提，不將所有舊 Windows 或被移除的系統元件當成已確認可用，也不自動安裝環境。
