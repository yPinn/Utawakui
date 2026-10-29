# 全域快捷操作的分層驗證紀錄

2026-10-29–30 的驗證與決策記錄；歷史片段從原第 4 項提案與契約集中整理，保留當時的數字、分母、限制與後續描述，不把當時的「待接」當作目前進度。功能現況只見 [spec](../../spec.md)，現行行為見[輸入契約](../../contracts/input-bindings.md)與[全域契約](../../contracts/global-keyboard-shortcuts.md)。

## 場次與保存競態的自動化補驗（2026-10-30）

同日接續原第 4 項 S11–S13，並修復獨立複核找到的停用復原缺口。沒有重新送 Windows 按鍵；使用全新隔離 profile、自製靜音 WAV／LRC、完整 Main／preload／App 與原 dispatcher／executor／player／queue／lyrics／場次 owners。Registration 改用測試工廠的 in-memory adapter，來源由真 receiver.dispatch 注入並經一次性 admission；不建立 native backend、不保留 OS 鍵，也不開正式 gate。

| 範圍                        | 最終案例數 | 核對結果                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 場次／transport（S11／S12） | 13         | 場次 Previous 在 playing／paused 保同一 occurrence 與原播放狀態；Next／manual 明確 Next 以 interrupted 結束前項，非 completed。Manual Previous 與場次尾端不落回一般 Queue。進度保存中重按不排隊；場次 pending 不被快捷鍵改接。開始確認保存失敗最終 queued／paused；Next 保存失敗不前進、明確重試成功。自然 ended 完成／接續、重送與舊 occurrence 不溢出到一般 Queue，完成保存失敗也不前進。 |
| offset／來源／CAS（S13）    | 7          | 保存中重按不增加 IPC；rename 失敗保 bytes／revision、阻擋後續快捷鍵，明確 retry 才保存。外部 offset 寫入導致 CAS 拒絕，來源 bytes 改變拒絕舊保存。已提交後換來源，晚回不套新來源；admission 等待間換來源不進保存 IPC。已交 Main 的保存遇配置變更仍沿 CAS 提交，命令回 stale、不回滾或假報成功。                                                                                             |
| 真 monitor DSP（S13）       | 3          | schedule ACK 等待中重按不排隊；注入 schedule 拒絕不報 applied，後續按鍵不自動重試；換曲後舊 ACK 不改新曲控制值／application revision，命令回 stale。                                                                                                                                                                                                                                        |
| 停用復原（S16）             | 2          | runtime 唯讀讀取失敗仍能送原固定停用意圖，Main 清 active／held。連停用保存也失敗時 Main 保 sessionDisabled 與停止狀態；明確重試可保存，不重新啟用。                                                                                                                                                                                                                                         |

25 例皆比對真 owner／audio 狀態與執行次數，保存案例另比實際 JSON bytes、progress／offset revision；重送 ended 後等原 session.settled() 再檢查。IPC before／after 延遲、僅限自有 fixture 路徑的 rename EACCES，以及真 node.schedule 發出後的 ACK 等待／拒絕是測試注入，不冒充外部裝置故障。開始確認保存失敗時 audio 可能已短暫開始，證據只宣稱最終 queued／paused，不能宣稱從未播放或從未發聲。Monitor DSP 不代表 capture 裝置、音訊聽感或失真根因驗收。

獨立 code review 先重現 P2：已確認背景啟用後，runtime 重讀先清投影，失敗／逾時／等待期間 hasGlobalSettings 消失，owner 與 UI 一起擋住停用。補 5 項 RED 後，停用改只依隔離本地資格、可編輯及已確認啟用配置，仍走原 set／Main gate／CAS；啟用仍要求已確認 runtime。新增晚回不覆寫、保存再失敗後重試、正式 singleton／unknown／invalid／disposed 不得取得 stop 資格等測試，owner／真 SFC 共 39 項通過（本輪新增 10 項）。Settings owner coverage：statements 92.92%、branches 89.52%、functions 95.12%、lines 94.47%。

主要本機收據：`tasks/shortcut-races-20261030-2Flw56/acceptance.json`（25／25）；初輪 22 例在 `tasks/shortcut-races-20261030-xR13Sx`。原場次 fixture 錯把 playing 確認保存與 session busy 視為同一生命期，等待條件未成立的失敗留在 `tasks/shortcut-races-20261030-pd1u5c`；改 hold interrupted 保存後才驗 busy，另驗真正 performance-settings pending。重送的較早觀察保留在最終目錄的 initial-duplicate-observation；不以失敗／過期快照充作通過。自有 App 皆 exit 0，最終 runtime disabled、active／held／pending 空。

獨立複核先審整批快捷鍵變更，P2 修正後比對固定四檔 SHA 並重跑 owner／SFC 兩檔 39 項通過；再唯讀核對 25 個唯一案例、腳本與收據，最終 APPROVE、沒有未解決的 material finding。未獨立啟動或重跑這 25 例，也未送原生按鍵。複核初次曾出現測試／import 輸出與實際檔案不一致，保留原結果，重新核對絕對 cwd／SHA 後才接受固定快照結果；未據此宣稱工作樹遭還原或歸因產品缺陷。

本輪結束時，並行 shell／styles／demo 作業已將 HEAD 推進到 1b3ccaf5，快捷鍵變更仍未提交，原 dirty 均保留。本輪固定快捷鍵四檔 SHA、停止自有驗收／coverage／建置後的最終完整回歸：1197 檔、12291 項通過／1 skipped，maxWorkers=2、167.70 秒（`tasks/shortcut-races-full-test-final.log`）。分母反映該 HEAD 的測試集合，與前輪 1198 檔分開保留。lint、235 份 Markdown、全域格式、renderer build 與 531 個相關連結／錨點檢查通過。較早完整回歸跨過並行修改，出現 TrackTable 來源斷言與既有 release runtime 5 秒逾時；兩檔在新 HEAD 原樣隔離重跑 90 項通過，再完成上述完整回歸。失敗紀錄仍保留，未修改無關程式或提高 timeout；其他使用者開發程序與提交未被停止或回退。

以上補的是無人工操作的真 owners 與交易交錯；實體持鍵／快速重按、原生 Tray 回復、OBS／瀏覽器／SMTC／taskbar 並行、裝置／capture DSP、休眠／安裝版的完整平台矩陣仍依原 gate。不得把注入來源與上一輪原生短按相加成完整 Windows 驗收。

## 真 owners 與 Windows 前背景補驗（2026-10-30，前一輪）

沿原第 4 項 S08–S13／S18，使用全新隔離 profile、自製兩段 90 秒靜音 WAV 與三句 LRC，載入完整 App、Main、preload、實際 Windows helper，以及原 player／queue／lyrics／transport／練習／場次 owners。僅測試程序包裝既有工廠注入十命令資格與同組 App／背景 Ctrl+Shift+F11；沒有產品環境開關、第二套播放 owner 或低階鍵盤 hook。每次只註冊一個命令，命令效果、執行次數、audio 事件、來源與保存 revision 分別記錄。原生按鍵由 Computer Use 送到已辨識的自有視窗，不等同實體鍵盤長按。

| 原案例 | 本輪核對的證據                                                                                                                                                                                                         | 尚未涵蓋                                                                                                                      |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| S08    | 真 App 前景執行；真 Performer 前景阻擋；獨立程序前景時，背景／最小化／實際 close-to-tray 隱藏均可單次靜音，主窗不帶前、不還原。                                                                                        | Tray 關閉經實際 controller，但回復使用隔離 harness，未驗原生 Tray 選單／雙擊入口；未等同 Output 或所有內部視窗。              |
| S09    | App／背景設成同組 chord，原生 tap 經 helper 與一次性 admission 只產生一筆真 executor 效果；OS 吞掉主鍵 DOM 時明列原始 DOM 紀錄。重送同一 envelope 的整合補驗不再次保存。                                               | 不把 OS 吞鍵當同一 native tap 同時送 DOM＋OS；完整舊世代／TTL 競態仍另見既有單元與 receiver 支援證據。                        |
| S10    | 真 owners 的十命令皆走過原生短按；播放／暫停及音量另有完整按鍵操作後再按的單次效果。                                                                                                                                   | 工具不提供持鍵時長，未補實體長按、保持修飾鍵的主鍵重按、快速重按及所有命令／平台矩陣；不解除正式 gate。                       |
| S11    | 真 audio play／pause、loaded paused、受控延遲原 performance-settings IPC 的 pending-start 取消；晚回不換曲、不啟播。按鍵當下再次核對 A–B gap 後沿練習 owner 立即開始。真 manual 場次無曲時不猜曲、不假完成、不改場次。 | pending 案例的延遲是測試注入；完整 BGM／裝置／所有場次交易交錯仍待驗。                                                        |
| S12    | 真 Queue Next 切至下一首且只一次；尾端 Next 不改 Queue／練習、不啟播；無歷史 Previous 定位 0 並保 paused。                                                                                                             | 未完成場次 previous／next、manual 明確 next、自然結束與 SMTC／taskbar 並行的完整矩陣。                                        |
| S13    | 真 DSP applied acknowledgement 的升／降 Key、真來源 offset ±0.1 秒及 CAS revision；正負兩側歸零以原生按鍵重驗。不同歌詞曲目由真 receiver 的 canExecute 在 executor 前阻擋（注入來源補驗）。                            | DSP pending／失敗、offset 保存中／保存失敗／來源切換競態的真 owners 與 Windows 完整矩陣仍待補，既有單元通過不升格為實機通過。 |
| S18    | 真 App 與另一自有 Electron 程序的前背景操作；使用既有 helper，結束後 active／held／pending 空，所有自有 App exit 0，唯讀程序盤點無 Electron／HotkeyHost 殘留。                                                         | 該程序不是 OBS 或瀏覽器；未補 OBS／裝置聽感、SMTC／taskbar 同時操作、安裝版及實際休眠／喚醒。                                 |

首次真 offset-down 從 +0.1 秒歸零時，Main 已成功保存、畫面與 CAS revision 正確，但命令回報 failed。根因是 Main 來源投影省略零值，而 executor 要求明列 offsetMs=0。先補正負兩側歸零 RED 兩項，再只修 executor 回應比對：有來源且省略 offsetMs 視為 0；缺失來源、null 或字串值仍拒絕，原 session／revision／preview 檢查不變。重啟完整 App 後兩側原生歸零均回 executed。相關 40 項測試通過，executor coverage：statements 98.47%、branches 98.46%、functions 95%、lines 98.21%。

原始失敗與範圍修正均保留：首次設定重讀與 receiver rearm 重疊而 loaded=false 的 tap 未執行，僅算準備失敗；音量測試誤用 5% 預期，依原契約修為 10%，並以執行次數核對。不同歌詞來源在 receiver 前置檢查即被擋，不能要求出現 executor unavailable 紀錄。第一次 pending fixture 用錯 IPC channel 而已播出，不能當 pending 取消證據；修正為實際 channel 後才驗。較早 gap 觀察可能跨過倒數，另以按鍵前立即快照重驗；標為 background 的一筆音量紀錄實際 role=main，只算音量 owner。桌面使用者活動兩次阻擋送鍵，均未執行；取得使用者暫停操作回覆後才完成集中原生案例。獨立 Vite port 的 HMR WebSocket 被既有 CSP 擋下，保留錯誤，未放寬產品 CSP。

本機主要收據：`tasks/owners-native-20261030-Fz2Bjc`（十命令首輪與原始歸零失敗）、`tasks/owners-native-20261030-Xrn0Ps`（注入來源、真 manual／Queue／gap 補驗）、`tasks/owners-native-20261030-gbhWF5`（最終原生補驗與停用／退出）。注入來源與原生結果分開，不相加為完整平台驗收數。正式狀態仍只見 spec。

最終固定程式快照、停止桌面驗收與其他重型檢查後，完整回歸 maxWorkers=2：1198 檔、12281 項通過／1 skipped，163.95 秒（`tasks/owners-native-full-test-idle.log`）。lint、235 份 Markdown、全域格式與 renderer build 通過，531 個相關連結／錨點零失敗；未搬動 runtime 資源，本輪未重做安裝版。此前在程式仍修改時啟動的一輪完整回歸載入中間版本，抓到 null 被誤認為零，該日誌保留；固定修正後、與桌面／coverage 並行的另一輪，既有 FLAC 測試超過原 5 秒，停止自有程序後該檔 16 項原樣重跑通過，再完成上述全回歸。受限暫存區原子 rename 的 EPERM 也保留，正常 Windows 相鄰測試重跑通過；沒有增加 timeout 或修改無關程式來掩蓋失敗。

## 前一互動切片的驗證範圍

以下是同一原第 4 項的隔離互動驗證，未開啟正式 capability。完整回歸、設定交易、可見介面與平台操作的分母分開，不能相加成全域命令驗收數。

| 層次     | 已讀取的結果                                                                                                                                                 | 限制與收據                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 完整回歸 | 1198 檔、12276 項通過／1 skipped，maxWorkers=2，189.25 秒。                                                                                                  | 本機紀錄：`tasks/global-interaction-full-test.log`；不等於平台或音訊品質驗收。                                                                                                      |
| 可見互動 | 明暗各 1280／960 的候選畫面，加窄版占用、試用成功、啟用、停用保存失敗與重試恢復，共 9 個狀態通過。                                                           | 真 Settings SFC／共用 UI／owner／recorder／preload／Main manager／store；隔離工廠僅允許 mute，註冊 backend 為 in-memory。`tasks/global-interaction-visible-final/acceptance.json`。 |
| 正式閉鎖 | 完整重啟 Main／preload，載入建置 renderer；全域 test／enable／set 均拒絕，設定 bytes 不變，eligible／active／held／pending 空、helper 啟動與 OS 註冊皆為零。 | 隱藏隔離 profile，只驗 IPC 閉鎖。`tasks/global-interaction-production/result.json`。                                                                                                |

試用不寫檔、不執行命令；背景關閉時套用只保存鍵位。合法停用在讀檔／CAS／保存前撤分派，prepare I/O 或保存失敗仍保留 Main 的本次停用；普通 App 保存、runtime 投影讀取失敗、重讀與喚醒不可解除，明確 enable 才沿原交易重新啟用。相關缺陷有定向 RED→GREEN 與獨立 code／security 複核。

可見測試另發現 loading 停用焦點控件會觸發 focusout、提前清除候選；改為試用前聚焦同組仍可用的取消按鈕，保留真正離組、native blur／hidden 與晚回防線。九張最終圖逐張檢查，沒有重疊或水平溢出；Impeccable detector 為空，獨立 finish review 為 SHIP。lint／Markdown／format、renderer／Main runtime build 通過。沒有新增實體資源或搬檔，本切片未重做安裝版驗收。

受限桌面啟動、compositor 擷取、Vite 掃入歷史 tasks 及舊 quit 重播等 harness 失敗均保留於本機紀錄；未取得核准的桌面擷取不列通過。最終使用 show:true、backgroundThrottling:false 的自有可見 BrowserWindow 擷取；DOM 合成錄製與 in-memory 註冊不代表 OS 合成、真播放器、實體鍵盤、OBS、真正休眠或裝置／音訊品質。

本機 `tasks/` 收據不隨專案保存，也不作產品狀態來源；本頁保留其已核對的驗證範圍。先前 13 組 receiver 支援證據與本次 9 個 UI 狀態分開，均未解除 S08–S10／S18 的完整平台門檻。

## 公開 Electron API 的原始觀察

2026-10-29，現用 Electron 43.8.3／Chromium 150.0.7871.250 的 Windows OS 註冊探針可成功註冊及釋放；一次短按與一段重複 keydown 序列合計收到 14 次回呼。這是隔離測試視窗中的 Windows SendInput 測試，不冒充實體鍵盤長按或 OBS 驗收。公開 callback 沒有 keyup／repeat 證據，因此本階段所有正式全域命令仍未通過 S10；產品 capability allowlist 保持空，不保存或註冊這些全域配置。不能用 cooldown 宣稱一次持鍵只執行一次。

## Windows 持鍵原型（原契約片段）

2026-10-29 接續 S10，以同機隔離 Win32 原型比較 RegisterHotKey 有無 MOD_NOREPEAT。原型未進產品、未改正式設定，也未新增產品依賴。按鍵由測試程式只送到已確認聚焦的自有 Electron 視窗；另一自有視窗用於驗證接收者不必是前景視窗，不代替 OBS／瀏覽器或實體鍵盤驗收。

| 情境                             | 一般註冊通知數 | MOD_NOREPEAT 通知數 |
| -------------------------------- | -------------- | ------------------- |
| 短按一次                         | 1              | 1                   |
| 主鍵按下後再送 12 次重複 keydown | 13             | 1                   |
| 保持修飾鍵，主鍵放開重按 3 次    | 3              | 3                   |
| 快速放開重按 10 次               | 10             | 10                  |
| 切到另一自有視窗後短按 3 次      | 3              | 3                   |
| 切回後重複 keydown               | 13             | 1                   |

現行再次觸發操作為主鍵放開再按；Ctrl／Shift 等修飾鍵可以保持按住，普通持鍵連發只執行一次。不承諾主鍵仍按住時，只放開重按 Ctrl 就一定再次觸發。2026-10-29 Owner 在實體測試後明確接受此規則，取代稍早接受的完整組合重組語意。重建／喚醒本身不算新按壓，不可因此補觸發；App 內既有 repeat 政策不變。

先前合成探針在 Ctrl 放開／重按後，又額外送五次 F11 keydown 才觀察新增通知，混合兩種刺激，不能證明 modifier-only 重組成功；撤回該成功判斷，保留原始記錄並註明範圍。持鍵解除再重建註冊的另一觀察仍只用於生命週期防護，不代表可繞過主鍵重按操作。MOD_NOREPEAT 是 OS 抑制連發行為，不是本 App 獨立取得的 keyup 歷史。

隔離原型另在註冊前後各讀一次已設定 Ctrl／Shift／F11 的 GetAsyncKeyState 高位，不用低位歷史、不持續輪詢或安裝 hook。實測啟動時已按住會拒絕；持鍵重建時保留原註冊且拒絕該次要求，後續重複 keydown 新增零通知；全部放開後明確重試與兩次新短按得到兩次通知。外部占用拒絕與程序終止後另一程序重新取得亦通過。這僅驗特定序列中的註冊保護：各鍵取樣與 OS 註冊不是原子操作；高位清除也不能證明放鍵歷史，API 在非作用中 desktop／權限限制下亦可能回零。現行主鍵重按規則不解除正式後端的註冊生命週期與平台操作驗收，S10 未整體結案。

### 原型至後端接入

Windows 主鍵放開再按的操作語意已接受。本輪接入只擁有註冊與 WM_HOTKEY 訊息的 Windows helper，明列其 .NET Framework 4.8 以上前提與包裝邊界。GetAsyncKeyState 的有界狀態觀察不能稱為完全沒有鍵盤狀態觀察；不以 cooldown、漏吞合法重按或隱藏鍵盤監看補洞。

後端沿同一註冊交易，不另建設定／播放 owner：

- Main 固定 helper 路徑、版本與協定；只傳已驗命令導出的有限鍵組，不接 renderer 提供的執行檔、原生鍵碼或任意 channel。單一 helper 執行緒擁有訊息迴圈與所有註冊，使用 MOD_NOREPEAT；不收集任意鍵盤事件。
- manager 已改可等待同步或非同步 backend，不能用尚未回覆的 helper 假扮同步 globalShortcut。須等待逐筆 ACK、跨等待保 busy、保存前再驗 CAS；新增註冊仍只 staging，同 chord 換映射保留實際註冊。取消／休眠／故障先撤分派，保存結果與清理結果分報。
- 每個 helper instance、實際註冊 token、啟用 generation 與通知 sequence 均由受信任端持有；重建、換映射或重啟後的舊通知不得以當前映射補送。待啟用的 OS／pipe 佇列不能只在收件時套上最新 generation，就當成新按壓。
- 啟動／停止與協定回覆有期限、訊息與註冊數有界；EOF、程序退出、錯誤或逾時先停止命令分派，釋放狀態無法確認就降級。只明確重試，不背景等待放鍵、改鍵或重啟；預設關閉不啟動 helper。
- 本輪採 C# x64 helper，在建置／封裝時以 Framework64 v4 compiler、固定參照與選項編譯。執行時須 Windows x64 與 .NET Framework 4.8 以上；不在使用者啟動時呼叫編譯器／PowerShell、安裝 runtime 或下載 helper。每次產物記錄來源與 compiler SHA-256，不聲稱二進位逐 byte 可重現。完整安裝版仍待驗。

上述原型、已接受操作語意與已接後端都未開啟正式 capability。接收端與單一分派基礎見下節；S08／S09／S18 可見前背景操作、實體鍵盤／OBS 與真實休眠仍未驗收，全域設定入口保持關閉。

## 註冊、封裝與接收端（原契約片段）

2026-10-29 前置驗證：相鄰 store／manager／lifecycle／handler／preload 與架構檢查共 8 檔 144 項通過；完整回歸 1191 檔、12185 項通過／1 skipped。隔離雙程序 OS 測試另通過占用保原狀、釋放後重試、中途占用撤新增、保存失敗復原、新 manager 讀取恢復且不改檔、停用後另一程序可取得、正式 capability 不能被測試配置開啟七項。完整重啟的 App 驗主視窗唯讀 runtime、拒絕全域配置、原設定 bytes 不變及零 OS 註冊；未驗實體鍵盤、OBS 並行或實際休眠。

接續非同步交易切片：相鄰五檔 110 項通過；四個核心模組定向 coverage 為 statements 93.59%、branches 87.84%、functions 96.82%、lines 96.15%。完整回歸單獨執行為 1191 檔、12197 項通過／1 skipped；首次與全庫格式／lint 並行時出現跨模組逾時及一項斷言失敗，未調整逾時或產品程式，單獨完整重跑通過，失敗紀錄保留。全庫 lint／Markdown／format、renderer／Main runtime 建置通過。隔離 Windows 雙程序七項重新通過；以新 Main／preload 與已建置 renderer 完整重啟，設定 bytes 不變、busy 為 false、pending／active／held 為空且零正式 OS 註冊，測試 App 正常退出。這批不涵蓋 native helper、安裝版、實體鍵盤／OBS 或真正休眠。

Windows helper 與封裝切片：最終完整回歸 1194 檔、12229 項通過／1 skipped；四個核心模組 63 項定向測試，coverage 為 statements 92.17%、branches 84.82%、functions 93.81%、lines 95.03%。全庫 lint／Markdown／format 通過，renderer 建置及兩次隔離 unpacked artifact／afterPack 資源檢查通過。實體 helper 的合成按鍵驗一般／快速／自有 A–B 視窗通知數為 1／1／3／10／3／1，舊重組探針記錄為 1／1／2，但含額外 F11 keydown，不作 modifier-only 證據；staging 不補通知、外部占用後明確重試、持鍵 resume 拒絕且不自動重試／改檔、放開後明確恢復與父程序結束後另一程序可取得均通過。

另以隔離 Electron host 載入 artifact ASAR 內的 Main／preload／renderer，實際設定 IPC ready、拒絕正式全域配置、原設定 bytes 不變且正式 helper 啟動數為零；再明確測試該 artifact 的實體 helper 註冊／確認／啟用／退出，App exit 0，無殘留專案 helper。這是封裝程式與資源路徑驗證，不是安裝版 executable、實體鍵盤、OBS、真實休眠或權限／配置矩陣驗收；排空上限／極端原生 queue backlog 尚未獨立壓測，正式 capability 維持空。

單一接收端切片：定向 10 檔 189 項通過；三個 receiver 實作模組 coverage 為 statements 86.01%、branches 85.87%、functions 87.17%、lines 87.86%。完整回歸單獨執行為 1198 檔、12255 項通過／1 skipped；全庫 lint／Markdown／format、renderer／Main runtime 建置及獨立 code／security review 通過。完整重啟的隱藏隔離 App，以新 Main／preload 和已建置 renderer 驗到 root 接收端 connect offered、正式全域意圖拒絕、原設定 bytes 不變、eligible／active／held／pending 空且 helper 啟動／OS 註冊皆為零，正常退出。

較早的可見原生送鍵探針因送鍵當下 OS 前景非自有視窗而拒絕，未送鍵，不列通過；未放寬前景限制或反覆帶前。前述自動化／IPC 證據不替代 S08／S09 可見主視窗／Performer／跨 App／最小化／Tray 與原生去重驗收，也未新增實體鍵盤、OBS、音訊品質、真休眠或安裝版證據。正式 capability／全域 UI 保持關閉。

接續以 Computer Use 操作可見隔離視窗，兩批共 13 組檢查通過。Main 沿真正 manager／Windows backend／receiver，僅測試工廠允許 mute；renderer 載入真正 `useKeyboardShortcuts`、registry、executor 與 receiver，只以共用 reactive stub 取代 player／lyrics／transport／OBS owners。App custom 與 global 都設 Ctrl+Shift+F11，比較 owner 呼叫次數，避免雙 toggle 回原狀而誤判。正式 runtime／設定未開 gate，也未使用產品 env flag。

原生合成短按涵蓋前景一次、錄製／editable／浮層阻擋、自有獨立程序前景下忽略主窗舊 editable 焦點且不帶前、最小化不還原、隱藏不顯示、同 App 另一內部視窗阻擋、明確 remount 後新按壓一次，以及停用 global 後同 chord 回 App 路徑一次。Windows 註冊時未收到該 F11 DOM keydown，故普通／repeat DOM 抑制另以合成 `KeyboardEvent` 經真正 dispatcher 驗證；envelope 重送、unresponsive 注入／remount 不補送另列支援證據。來源變更後延遲 admission 未執行，但該情境亦跨過 1 秒期限，未獨立歸因為來源防線。

這批是可見自有視窗、合成短按與 stub effect 的整合證據；另一內部視窗不等於真 Performer，隱藏不等於 Tray 入口已驗，未驗真播放器／十命令效果、實體長按／修飾鍵重組、OBS 前景、真休眠或安裝版。S08–S10／S18 維持部分證據、完整驗收未結案；人工回報另見下段，正式 capability 仍為空。

人工實體測試回報：保持 Shift+F11，只放開重按 Ctrl 沒有增加計數，原重組要求未滿足；Owner 因此接受主鍵放開重按。針對維持 Ctrl+Shift、F11 放開短按兩次各增加一次，再長按約 1 秒只增加一次的追問，Owner 回覆「都正常了」。這是隔離 mute stub 的人工煙霧驗證，沒有逐次前後的 helper 收據，不能據累計數定位哪層吞通知。追問亦含條件式 OBS 前景檢查，回覆未獨立列出 OBS 是否開啟／擷取方式；不將它擴大為 OBS、真播放器或十命令驗收，也不開正式 capability。

唯讀狀態列切片的定向 3 檔 27 項通過，coverage 為 statements 96.01%、branches 94.76%、functions 97.72%、lines 97.12%。全庫 lint／Markdown／format、renderer 建置與最終獨立 code／security／UX review 通過。完整回歸以 2 個 worker 執行，1198 檔、12261 項通過／1 skipped；前兩次預設 worker 執行分別有一／兩個 release runtime 建置前置超過原 10 秒門檻，失敗紀錄保留，未增加 timeout 或修改無關程式。

新 Main／preload 載入建置 renderer 的隔離可見 BrowserWindow，明暗主題各驗 1280／960 寬度，另驗窄版讀取失敗／重試恢復，共六個狀態通過；實際視窗 capturePage 與幾何檢查均未見文字／按鈕重疊或水平溢出，人工檢視擷取圖確認換行。原生畫面工具混入其他前景畫面，未用其錯誤擷取作驗收；這批不驗 OS alpha 合成。設定 bytes 不變，runtime 的 eligible／active／held／pending 為空，隔離 App 正常退出。沒有全域啟用入口，平台／OBS／音訊品質與安裝版限制不變。

## 第 4 項提案的階段片段

### 2026-10-29 註冊／復原前置與平台門檻

沿本案先固定[全域註冊與復原契約](../../contracts/global-keyboard-shortcuts.md)，接唯一 Main manager、唯讀 prepare／CAS 再驗、staging／保存／映射提交、占用與清理失敗降級，以及休眠／喚醒／退出清理。runtime 快照只報 Electron 可觀察的本 App 註冊，不將 isRegistered 當 OS 空閒或獨立存活證據；Store rename 後回已知 bytes 的結果，沒有新增 fsync。

現用 Windows／Electron43.8.3 的隔離 OS 路徑，一次短按與一段重複 keydown 得到14次回呼，且公開API沒有放鍵證據。S10未過，正式 capability allowlist 保持空，不能靠cooldown假單次，也不私加native hook／鍵盤監看。此為註冊／復原前置當時的門檻；後續 helper 與 receiver 基礎進度見下一段，全域錄製入口及 S08–S10／S18 完整平台驗收仍待完成，不將 App 內或 mock 通過數當全域已驗。

接續的隔離 Win32 MOD_NOREPEAT 原型可將普通持鍵連發的 13 次通知降至 1 次，並保留 3 次主鍵重按及 10 次快速短按；舊重組探針在重按 Ctrl 後又額外送 F11 keydown，不能證明只重按修飾鍵可再次觸發，已撤回該成功判斷。Owner 實體回報主鍵保持時重按 Ctrl 無新增，改為接受主鍵放開再按、修飾鍵可持續按住；再驗主鍵重按／長按回報正常。普通持鍵連發只一次，重建／喚醒本身不補觸發，App 內既有 repeat 政策不變。註冊前後各一次的限定鍵狀態取樣，實測可拒絕持鍵註冊並保原註冊、放開後明確重試，仍無法證明完整放鍵歷史。Windows x64 註冊 helper 已接 Main adapter 與封裝：建置時編譯、ASAR manifest 驗實體檔，明列 .NET Framework 4.8 以上前提；不加入 hook、持續監看或執行時編譯／下載。既有 manager 已接可等待 backend 的 busy／CAS／生命週期取消、保存後 runtime 分報與可選來源啟用柵欄；Main–renderer receiver 已接安裝確認後來源世代、一次性 admission、同一 executor 與 DOM repeat 所有權抑制；UI 與來源跨等待失效分驗，reload／crash／unresponsive 撤租約。正式全域 UI 未開，capability 仍為空，關閉時不啟動 helper；S08／S09 可見前背景驗收仍待完成。證據、限制與同一交易後續所需的通知世代／封裝條件集中於[Windows 持鍵抑制驗證](../../contracts/global-keyboard-shortcuts.md#windows-持鍵抑制的隔離驗證)，不另立全域計畫或將 S10 改列完成。

### 實作前決策與證據

2026-10-28 前置與執行切片：七命令 allowlist、有界 schema、明示 modifiers／邏輯子集、default／disabled／custom、同 scope／跨 scope／固定鍵及 Shift wildcard 衝突已有純測試。registry 可編譯驗過的 App 配置，替換只保留一組、停用釋出原鍵，default Key 保留原長按、custom 拒 repeat／handled；dispatcher 可接不可變配置，驗 editable／widget composed path／IME／AltGr／錄製／浮層及 canExecute，換配置／卸載使在途失效。S11–S13 執行協調既有 player／transport／lyrics；一般 pending 取消、真 player／練習 owner gap 立即播放、DSP confirmed／來源失效、offset 保存前取消與 CAS 由測試涵蓋。詳細目前契約見[輸入綁定](../../contracts/input-bindings.md#十命令執行邊界)。App 由單一機器偏好 owner 讀取配置，Settings 已接錄製／套用／取消／停用／預設，global 未註冊；不把單元結果當 Windows 每命令或全部場次／OBS 驗收。後續仍為 Main manager／Windows 每命令長按與去重 gate。

先定七命令／保留鍵／焦點，補 App 自訂；再固定 Main manager／envelope／staging 契約，最後 Windows 每命令過 gate 才 global opt-in。前三項的未完成／錯誤可供 canExecute 使用，不要求三項全實作後才做 App 綁定。

較早的命令執行切片另以隔離 RASEN 副本、程式指定的測試配置跑可見 Electron 14 項原生操作：Key confirmed 與未自動存 profile、offset ±0.1／CAS、active source 清除、播放／暫停、Queue 尾端、paused previous restart、widget／錄製讓位、靜音真媒體 A–B gap 立即恢復、壞配置 fallback 與卸載。沒有在 App 安裝正式配置或 OS 註冊；測試值恢復、正式媒體 9 檔 SHA256 不變。這不代表真實裝置／OBS 聽辨、DSP 音質或 Windows global 長按已驗收。

本輪查 [registry](../../../src/utils/inputBindingRegistry.js)、[dispatcher](../../../src/composables/useKeyboardShortcuts.js)、[DOM](../../../src/utils/dom.js)、[SMTC](../../../src/composables/useMediaSession.js)、[transport](../../../src/composables/usePlaybackTransport.js)及[輸入契約](../../contracts/input-bindings.md)；G 實為擷取導唱、SELECT 已忽略，taskbar 上／下一首目前停用。7份既有測試73 passed，僅基線，原 K01–K04 留[初始證據](../product/player-practice-planning-2026-10-26.json)。

package-lock 為 Electron43.8.3，查核 Context7 43 系列並交叉實際 [v43.8.3 API](https://github.com/electron/electron/blob/v43.8.3/docs/api/global-shortcut.md)／[快捷鍵文件](https://github.com/electron/electron/blob/v43.8.3/docs/tutorial/keyboard-shortcuts.md)：Main ready 後註冊、失焦可觸發、register 可因占用失敗，isRegistered 只查本 App，registerAll 不提供整組交易，accelerator 為不分大小寫的 modifiers＋單鍵。上述平台能力不替代本案的 Windows 實測。

本輪 App 保存／錄製切片使用同一隔離 RASEN profile，在完整重啟的新 Main／preload 下跑 22 項原生操作：候選／半組／Space／保留 F 鍵／Shift wildcard 不提前保存或誤執行、套用後正式 App dispatcher 生效、改 Key 釋放原鍵、停用／單列預設保其他設定、亮暗及 960px、重啟自動恢復且不重寫、CAS 保較新檔並要求重讀、native blur／最小化取消、壞檔保 bytes／待讀、修復後明確重讀及整組預設。Tab 取消回可見設定按鈕，結束 paused／無錄製／Key 與音量恢復，僅隔離設定檔被寫入。保存契約與不支援 global 的邊界見[機器保存與錄製](../../contracts/input-bindings.md#機器保存與錄製)；實際裝置／OBS 音質、跨程式 global 長按／去重仍不在這批證據內。

平台 API 來源集中於[全域契約](../../contracts/global-keyboard-shortcuts.md#平台來源)。
