# Capture-only 最小路徑實作驗證

本紀錄驗證原 `usePlayerAudioGraph` 內的最小切片，不延伸 [R01](derived-audio-reduction-r01-2026-10-30.md) 根因矩陣。產品現況見 [spec](../../spec.md)，路由與取消語意見[套用契約](../../contracts/player-audio-controls.md#capture-only-輸出路徑)。正式 FLAC 維持關閉，既有音訊不遷移；階段提交保存實作與有限驗收，不代表 monitor 品質已通過。

## 變更與保留邊界

Monitor 明確 mute 或音量恰為 0、capture 已選且沒有啟用的 programme input 時，原開始準備交易可把來源 context 綁到該 capture sink，以獨立 capture mix／導唱／DSP／總音量直接輸出。原 audio element、四聲道順序與所有播放 owners 保留；兩路皆需發聲時仍用原 bridge，即使裝置相同也不合併混音。

開回 monitor、切裝置及 BGM prepare 經終端 gate／串行 native sink 交易退出直接模式；取消／期限不釋放尚未完成的 native 操作，也不容許晚回 play。Capture graph 借用來源 context 時只拆自己的 edges，不 close 來源。BGM 的 audio／bridge／gate／coordinator 保留，Mic 研究未接入。

基線 HEAD 為 `b8a2fb42`，實際驗證的是其上的未提交切片；graph 來源 SHA-256 為 `ef3304fbd7b10583fd78551ae5e40046eb94076a4281647837fe0169074a1383`。每次原生案例保存 player／graph／start／BGM 與工具來源 SHA；各案來源快照前後相同。機器私有收據、原 PCM、OBS 錄檔與執行來源留在本機 `tasks/r01-capture-only-native/`，未隨本文件交付，不能僅憑本摘要重播當時環境。

## 自動化與啟動

- 17 個 owner suites、368 項測試通過，包含原 player／device／DSP、BGM、Queue／場次、練習與歌詞導航的來源／offset／pending 保護。
- Graph 定向 coverage：行 96.53%、分支 83.06%；此數字綁定當時的 147 項定向測試，不冒充全庫 coverage。
- 第一次原生權限完整回歸：1,221 個檔案通過、1 個 skipped；12,530 項通過、4 項 skipped。收尾完整結果另列如下，不概稱最新全工作樹零失敗。
- ESLint、243 份 Markdown、定向 Prettier、renderer build 通過。Build 保留既有大型 chunk 警告，未改門檻。
- 完整 source Main／preload 與 built renderer 以隔離 profile／空曲庫啟動，bridge 存在、renderer 無 error、1280px 寬窗正常載入並經正常 quit；不是 packaged／installer 或播放品質證據。

首輪沙箱完整回歸有 93 檔／752 項失敗及 11 個 unhandled errors，包含 atomic rename `EPERM` 與 loopback `EACCES`；原 log 保留，再以原生權限重跑同套通過，未改原子保存、網路邊界或 timeout 求綠。

收尾時工作樹另有並行 i18n 拆檔，完整回歸分母新增測試，不能把前一次成功移植為其驗證。再跑原生回歸有 29 個 suites 因實驗性 transform cache 的 `EPERM rename` 無法載入，已執行的 12,358 項通過；未刪共享快取或停其他 session。僅對下一次執行關閉該效能快取後，1,221 檔通過、1 檔失敗、1 檔 skipped，12,531 項通過、1 項失敗、4 項 skipped；唯一失敗是 NetEase runtime 的 5 秒操作 timeout。未改其期限／程式；同一 NetEase suite 與本案 graph／player 隔離核對 3 檔 179 項通過，原因未確診，原完整失敗保留。本案十個檔案在該輪回歸期間 SHA 未變；並行變更未納入音訊切片。

Code review 找到並修正共享節點拆線順序、失效後 monitor gate、過度串行化舊 capture resume／DSP、native binding 後開回 monitor 的競態、pending-direct 的 BGM prepare 與 stale candidate 清理。既有取消／替換測試保留，沒有先解開舊 Promise 來放寬契約。最終 review 無未解高信心缺陷。

## 有限原生案例

原生 renderer harness 使用真實 player／audio graph、BGM deck／coordinator、production media 與 permission handlers；不是完整 App／preload／CAS UI 驗收。使用既有四聲道 WAV、明確耳機端點及專用 portable OBS process capture；不修改系統 mixer、正式 profile 或其他 session。

| 案例                   | 已核對結果                                                                                                         | 證明界線                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| N1 舊路徑固定短窗一次  | 兩 contexts；source 伴奏／output／同次 OBS 各 0 段精確短零                                                         | 只限本案 30 秒                                                               |
| N1 direct 固定短窗一次 | 一個共用 context；source 伴奏／output／同次 OBS 各 0 段                                                            | 不代表比舊路徑更可靠                                                         |
| N2 direct 全長一次     | 371.426667 秒原生 EOF、全程 checkpoint 路徑／gates 正確、無 player／capture error                                  | 無同步 PCM 探針；人工聽感未接受，不稱全長 sample 級品質通過                  |
| N3／N4 owner 操作      | 獨立裝置與 mix、非零 pitch／cents／tempo、paused 切換、原生 context 停止後重選、pre-start cancel 與真 BGM 交接通過 | Context suspend 不是實體拔除；原生晚到 sink 取消由 owner mocks 補證          |
| N3 播放中開回 monitor  | 回原兩 contexts；來源／occurrence／clock 保留，沒有 play／pause／seek／ended 事件                                  | 路由準備 52.9ms；操作錄音內部有一段 2,560 frames／53.33ms 精確零，不宣稱無縫 |

每份本輪錄製都有本次 OBS STOPPED、inactive、250ms 穩定 SHA，末次再驗檔案 SHA 相符；來源退休後才退出自有 OBS。完整播放只有一次；沒有重跑全長取代失敗。

N1 每案保存兩份完整 PCM，各 1,440,000 frames／48kHz。實際 start 等於 requested start，end−start 等於 frames，bytes／channels 正確，無 missing frames、channel mismatch 或 discontinuities；direct 的兩探針另核同 context 共同 startFrame。探針保留完整 buffer，pause 與 OBS STOPPED 後才 flush。

零段沿 R01 定義：雙聲道共同精確零、至少 16 frames，完整位於窗口；source4 只取伴奏前兩聲道。各案 output→同次 OBS 第一聲道 valid-lag NCC 約 .99999850；direct 同 context output 對 source 伴奏 ×0.1 的最大誤差為 `4.470348355378739e-9`。兩案沒有可配對零段，分析欄位的空集合映射真值不當作事件映射證據。未另證跨次共同原始內容對齊，不把本窗口套到 R01 的 150–170 秒診斷窗。

N3 的 52.9ms 是準備交易耗時；53.33ms 是整份操作錄音內部零段長度，兩者分開保存，不等同實體聲學延遲，也不作逐 sample 原因確診。此處測得的明確切換缺口與 N1 穩態窗口分開判讀。

## 失敗與限制

- 第一次 operations 工具未等原生 pause 事件，就把 `requestBgmPlay()` 的 deferred true 當作已開始，導致「BGM returned legacy」斷言失敗。保留原失敗；工具改等 player 與 coordinator 的 pause 事件，同一操作續驗通過，產品未因此另改。
- 全長前有兩次前置失敗：逐次 OBS ownership 檔名碰撞，以及 OBS 重啟讀回上一輪已知來源的磁碟快照。均在 Electron 播放／StartRecord 前停止，沒有全長音訊資料。原資料保留；改用逐次收據，並只在專用 profile 已 inactive 時清理已知自有來源，拒絕未知來源。未把前置失敗改成播放成功。
- Reviewer 要求的 renderer／OBS cleanup 期限已補入後續工具：renderer 3 秒、OBS requests 5 秒、既發 requests 最多等 15 秒；不能以強殺冒充 STOPPED。N1 舊快照不回填為新版 cleanup 的執行證據。
- 本輪未做人工 CPU 負載，也未配平整機負載；不能推 Node CPU 因果。兩個短窗都沒有零段，不能推故障率或宣布歷史 bridge 失敗已解。
- R01 的多段電流聲、OBS 才明顯、斷續／卡頓與對齊失敗全部保留。本輪程式／錄製成功不覆蓋它們；人工品質仍待使用者聽辨回報。非零失真、雙路長時間耐久、休眠／實體拔插與其他裝置／平台不在此有限驗收內。

## N3 靜音候選後單次驗收（2026-10-31）

使用者另授權只續作原定 N3，沒有重跑 N1／全長或增加矩陣。HEAD 為 `3d530aca`，執行的是工作樹上的核准 graph，SHA-256 為 `b395566125c5bfebe5d33350275fd1e8da4f121cbd829a31f2ee63158c026e57`；本節不回填前述舊案例的程式快照。靜音候選切片的 22 個 owner suites／399 tests 通過，graph 行覆蓋率 96.11%、分支 85.92%，詳細路由仍由套用契約持有。

固定同一 WAV、來源位置 140 秒、沿原 `seconds=8` 流程、第 2 秒將 monitor 從 0 開到 0.03、capture 音量 0.1、pitch／cents 為 0、tempo 為 1、兩路 pitch nodes 皆未建立、無 PCM 探針。輸出裝置標籤與原 N3 相同，使用新的隔離 portable OBS／profile／錄製目錄及原生 renderer harness；錄製前先核對可見視窗，不接桌面音訊或 Mic。這仍不是完整 App／preload／CAS UI 或實體聲學延遲驗收。

| N3 錄音                  | 內部共同精確零 sample 區間 | Frames | 時長     | 工具準備耗時 |
| ------------------------ | -------------------------- | ------ | -------- | ------------ |
| 原始直接退出             | `[132991,135551)`          | 2,560  | 53.33 ms | 52.9 ms      |
| 靜音候選後，本次唯一錄製 | `[135728,138256)`          | 2,528  | 52.67 ms | 171.7 ms     |

兩份錄音皆為 48kHz stereo PCM16；沿用整份錄音內部、雙聲道共同精確零、至少 16 frames 的定義，新錄音只見表中一段，兩側相鄰 frame 非共同零。只少 32 frames／0.67ms，本次未證明實質改善或無縫，不為取得更好結果補錄。工具準備耗時包含資源準備及每 20ms 輪詢，與錄音零段分開，不作每個 sample 的底層原因確診。既有工具的 systemBusy 舊案平均約 11.54%，本案八次取樣皆為 100%；此輪沒有配平負載或另行校準計數器，不能將本次差異歸因 CPU，也不能作故障率或跨次共同內容對齊證據。

本次來源／occurrence 保留，audio clock 向前，切換期間 eventCount 不變，沒有新增 play／pause／seek／ended；最後為 monitor default＋獨立 capture context、兩個終端 gate 為 1、routePending 為 0，無 player／capture error。OBS STOPPED、inactive、250ms 穩定 SHA 及退出後再驗相符；新原檔 SHA-256 為 `396da48fd36303b4d62c5b30f58e7d09890f014bb713ed20a4cb04b1a88a4f66`，自有 Electron／OBS 程序均已退出，已保存的執行來源快照前後未變。

新錄音共 430,080 frames／8.96 秒（含錄製留白），原 PCM 不經增益、淡化、EQ、動態處理或重採樣，另包成 WAV；聽辨短片精確取原 PCM `[39728,282256)`，242,528 frames／5.052667 秒，缺口在片內 2.000–2.052667 秒。初次工具以 stream-copy 解封裝核對，再由獨立複核及另份收據以 PCM decoder 真正重解新舊 AVI 與兩份新 WAV，逐 byte 確認 WAV 等於來源切片；原全長／原 N3 錄檔及既有聽辨檔 SHA 重新核對未變。機器私有收據、原錄音、analysis 與 listening manifest 留在本機 `tasks/r01-monitor-return-native-20261031/`。

保留兩個未播放／未錄製的前置工具失敗：沙箱拒絕 CIM 唯讀程序查詢，以及空程序集合未產生 JSON 檔而使後續讀取失敗。修正查詢執行權限及空集合序列化後才開始唯一 N3；沒有把它們改記為成功。原 harness 的 CSP warning 也留在 console 收據；正式程式未因本輪改動。所有歷史失敗及原 53.33ms 證據保留，人工聽感仍 pending，正式 FLAC 關閉、音訊未遷移、沒有 commit。

## N3 capture 直出／monitor relay 單次驗收（2026-10-31）

只執行原定 N3 一次，沒有補錄或擴矩陣。HEAD 為 `da67268145ae8f6eda11980c606d4b787e001a8f`，執行工作樹 graph SHA-256 為 `fa40e9a5cc8c4b593a6a4a85d1012eaeb55cef8cae5db8fb353f16b9ad6648ea`；沿同一 WAV／140 秒位置、capture 0.1、monitor 0→0.03、第 2 秒切換、8 秒流程、pitch／cents 0、tempo 1，未接 BGM／Mic。仍是隔離原生 renderer harness 及專用 portable OBS process capture，不是完整 App／preload／CAS UI 驗收。

為區分 capture 與 monitor，這一次加入四個不輸出聲音的 PCM 觀測點：source4、capture 終端、monitor mix／DSP 後且舊終端前的 reference，以及 default context relay 終端。前三者在來源 context 共同 `[18816,306816)`、各 288,000 frames／6 秒；relay 在自己的 context `[13568,205568)`、192,000 frames／4 秒，不能直接相減當共同時鐘。四份均完整，actual／requested start、frames／bytes／channels、SHA 相符，missing／channel mismatch 為 0、無 frame discontinuity。舊兩次 N3 沒有這些觀測點，整機負載未配平；不推故障率、探針／CPU 因果或跨次共同原始內容對齊。

| 各自 N3 的 OBS 錄音              | 內部共同精確零區間 | Frames | 時長     | 工具準備耗時 |
| -------------------------------- | ------------------ | ------ | -------- | ------------ |
| 原直接退出                       | `[132991,135551)`  | 2,560  | 53.33 ms | 52.9 ms      |
| 靜音候選後                       | `[135728,138256)`  | 2,528  | 52.67 ms | 171.7 ms     |
| 本次 capture 直出／monitor relay | 未見符合定義區間   | 0      | 本窗未見 | 31.4 ms      |

表中沿用雙聲道共同精確零、至少 16 frames、完整位於整份錄音內部的定義。新 OBS 共 424,960 frames／8.853333 秒；capture 與同 context source 伴奏也未見該項短零。Capture 全 6 秒逐 sample 等於 source 前兩聲道乘 Float32 的 0.1；以 Float64 乘 0.1 比較最大誤差為 `4.470348355378739e-9`。這支持本次有限 capture 觀測窗連續，不能保證長時間、非零失真或實體輸出品質。31.4ms 包含原工具 20ms 輪詢，另有 28.6ms 的 relay 觀測點設置；皆不等同 PCM 缺口或聲學延遲。

Monitor reference 沒有內部同項短零；relay 有以下六段，各 480 frames／10ms，起點每隔 30,720 frames／640ms。Frame 為 relay 觀測窗內索引，不能與 OBS frame 直接配對。

| Relay 零段 | Frame 區間        | 片內時間（秒）    |
| ---------- | ----------------- | ----------------- |
| 1          | `[15712,16192)`   | 0.327333–0.337333 |
| 2          | `[46432,46912)`   | 0.967333–0.977333 |
| 3          | `[77152,77632)`   | 1.607333–1.617333 |
| 4          | `[107872,108352)` | 2.247333–2.257333 |
| 5          | `[138592,139072)` | 2.887333–2.897333 |
| 6          | `[169312,169792)` | 3.527333–3.537333 |

七個非零 100ms 小窗的左右聲道 NCC 皆接近 1，reference index−relay index 均為 101,344；它們只證局部內容與基線對齊。共同 overlap 為 relay `[0,186656)`／reference `[101344,288000)`、3.888667 秒，並非全窗逐 sample 相同：六段各 2,880 frames／60ms 的差異，共 17,280 frames；其中前 480 frames 是零，後 2,400 frames 的內容精確等於基線 reference 向前取 480 frames，即局部延後 10ms，然後恢復基線、略過 reference 接下來 480 frames。其餘 overlap 逐 sample 相同。這是六個「10ms 零＋50ms 延後內容＋追回跳接」的觀測，不是六段 60ms 靜音；不單憑此確診 bridge FIFO、CPU 或裝置驅動根因。

延遲只在上述七個正常局部窗，以最近的兩 context `getOutputTimestamp()` anchors 換算同內容相對端點輸出時間。Default monitor 相對 capture 估計為 −30.53 至 −20.36ms，中位 −25.03ms；負號表示預設端點估計較早，不是負的 bridge 處理延遲。Capture 與 monitor 的 API outputLatency 分別為 128–136ms、40–56ms，輸出管線不同；anchors 未校準、未提供誤差界限、最遠外推約 0.491 秒，不能套到六段異常內。未使用 `currentTime−timestamp.contextTime` 估算可靠輸出延遲；方法限制參照 [Web Audio 時戳定義](https://webaudio.github.io/web-audio-api/#dom-audiocontext-getoutputtimestamp)。沒有實體 loopback／Mic，虛擬 default 下游與耳機聲學延遲仍未量測，不能給物理監聽延遲通過結論。

切換前後 source／occurrence／context 與 capture graph 保留，audio clock 向前，eventCount 不變；capture sink 未重綁、capture gate 維持 1，source monitor terminal 維持 0，relay default gate 為 1，無 player／capture／monitorOutput error。OBS STOPPED、inactive、250ms 穩定 SHA 及安全退出完成，新原 AVI SHA-256 為 `0bab9e4808fe4fd1e8714e8f0d6ea0298cb62d8b60c17cc1496ab000acb2449a`，自有 Electron／OBS 程序均已退出。API 沒有報錯不代表 PCM 或聽感良好。

原錄音與四份原 PCM 保留在本機 `tasks/r01-monitor-relay-native-20261031/`，另有全長 OBS、切換前後 5.04 秒、capture 6 秒、relay 全觀測 4 秒及兩份同次對齊 3.888667 秒聽辨 WAV。OBS 維持 PCM16，觀測 PCM 維持 Float32；不增益、淡化、降噪、正規化或重採樣，皆經實際 FFmpeg decoder 及獨立複核驗證等於來源 byte slice。Relay 最後 5,344 frames 無 reference overlap，仍保留於完整 WAV，不概稱四秒內容全部驗證。OBS 短片 `[43040,284960)` 的操作標記約在片內 2.00–2.04 秒，來自同次開 monitor 前 capture→OBS NCC 約 .99999912，不是跨次原曲或物理共同時鐘證據。

工具失敗亦保留：port 前置檢查的 SyntaxError 發生在啟動／播放／錄製前；取消後 readout 不能借用已撤銷的意圖檢查，已先以紅／綠工具測試修正並獨立 review；CUA AX 可確認原生 N3 ready，但桌面 screenshot 被其他視窗遮擋，保留限制，不作視覺或聽感通過依據。未重錄求綠，未改產品程式。

使用者聽過本次 relay 原音量片段，明確回報「聽得到卡頓／雜音，品質不接受」。因此本次 monitor 人工品質不通過；capture／OBS 的有限正向結果不覆蓋此失敗，也不覆蓋 R01 電流聲、斷續、內容對齊失敗與前兩個 N3 缺口。正式 FLAC 關閉、既有音訊未遷移、並行修改完整保留、本輪沒有 commit。

## 階段保存與聽感補充（2026-10-31）

使用者其後明確授權將音訊實作與有限驗收紀錄分開作階段提交，不 push、不重錄、不擴矩陣、不開正式 FLAC、不遷移，逐 hunk 排除並行修改。前述各輪「沒有 commit」保留為當時操作紀錄，不改寫成早已提交或品質成功。

使用者補充「底下的比較清楚，上方的有延遲」，並進一步描述下方較清楚、上方較模糊。這裡下方指 OBS 開回 monitor 前後片段，上方指隔離 monitor relay 四秒原音量片段；與先前卡頓／雜音拒絕分別保留，monitor 人工品質仍未通過。兩者路徑、混音與設定音量不同（capture 0.1、monitor 0.03），這不是同內容、感知響度已配平的清晰度 A/B；主觀延遲不換算成實體聲學毫秒數。

此回報與 R01「bridge 後已有部分短零」方向相容；同次 reference→relay 的精確零、局部延後及跳接是連續性證據，不能據此認定持續的頻響模糊、底層唯一根因或整個 R01 已解。階段保存只整理已完成實作與既有證據，不新增研究案例或補錄。
