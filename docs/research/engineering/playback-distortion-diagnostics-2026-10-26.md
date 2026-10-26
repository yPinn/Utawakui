# 播放失真排查：第一階段工具、比較結果與局部修正

日期：2026-10-26（Asia/Taipei）。接續[基線與實驗方案](playback-distortion-investigation-2026-10-26.md)。
來源為 v0.5.1／`74714d6f` 加本輪未提交的單一 capture 路由修正；沒有更新正式安裝、建立 installer 或操作正式 OBS。
使用者補充症狀影響多數曲目，因此以共用播放管線為優先，唯讀複製不同編碼原曲，沒有要求先找出唯一問題檔案。
數字、來源 hash 與 run 參照見[機器紀錄](playback-distortion-diagnostics-2026-10-26.json)。

## 已確認與仍未確認

已重現並修正 capture pitch 初始化與歸零的路由競態。
這不是偶發電子音已解決的判定：兩個修正前原生實驗都重現錯誤路由，但合成 tone 沒有出現使用者描述的隨機雜訊。
真實裝置接收端、OBS、完整 App 背景工作與使用者聽到的異常片段仍缺少同步證據。

一般診斷 log 仍保留原本規則；本輪新增的是獨立、明確啟動的本機實驗工具。
未擴大正式 IPC／診斷 schema、變更 DSP／播放 buffer／timeout、強制 sample rate，或改變 audio element 的狀態權威。
四聲道順序仍為 accompaniment L/R、guide L/R。

## 工具與錄音契約

本機工具與測試位於 ignored 的 `tasks/playback-distortion-20261026/`，使用方式見其 `README.md`。
它載入真正的 `usePlayer.js`、`usePlayerAudioGraph.js`、Signalsmith 1.3.2 與正式 media protocol；不啟動正式 Main 的背景服務。
Electron 43.8.3，sandbox／context isolation 開啟、renderer 無 Node integration。
每次使用獨立 userData／sessionData／logs／曲庫與 owned PID；自動實驗使用 silent sink，並靜音 BrowserWindow。

- 事件時間線包含 HTML media 事件／實際狀態、pitch 初始化、gain automation、connect／disconnect、context state／rate／latency、source generation、人工 marker。
  Main 與 renderer 以五次往返記錄 monotonic clock 對時區間，不把 IPC 收到時間當成事件發生時間。
- 兩個測點各有預配置 planar float32 ring，保存 marker 前 15 秒與後 10 秒；48 kHz 下每點 1,200,000 frames、約 9.6 MB。
  錄音完成才轉移原有 buffer，重排與 WAV 寫入在音訊執行緒之外進行。
  這個 ring 只儲存診斷音訊，不參與播放緩衝。
- PCM 統計包含非有限值、超滿刻度樣本、缺聲道、context frame 缺口、peak、sum of squares、零樣本。
  數字是自啟用 recorder 起的累積統計；匯出 WAV 是最後的有界片段，兩者分母不同。
- 事件 trace 保留最新 20,000 筆並記覆寫數；每測點最多 16 MiB，手動工作階段四小時截止。
  高輸出 rate 超過記憶體界線時拒絕診斷錄音，不擅自修改裝置設定。
- 錄音失敗會保存失敗狀態，不自動重啟播放。一般 heartbeat／Main CPU／event-loop 以每秒記錄，沒有逐 quantum IPC／console／磁碟寫入。
  沒有取得可用的 GC／原生 underrun counter，不能將 context frame 缺口為零解讀成裝置沒有 underrun。

目前的 PCM 測點是 App 內、裝置之前：monitor 最終輸出，以及 capture 最終 master；未開 capture 時第二點為 source-decoded。
它們不包含 Windows endpoint 實收或 OBS 內部音訊。
原曲檔名、裝置 id 與正式曲庫路徑不寫入本報告；原始音訊與私有紀錄沒有提交或上傳。

## 先驗證 recorder 與觀測成本

四項儲存測試先因缺少實作失敗，再通過：環形覆寫與末 quantum 截斷、啟動未滿的前段、重複 marker、非有限／缺聲道／frame 缺口計數、記憶體界線與提前結束。
第一輪原生 dry 的 source-decoded 與 monitor-output 各有完整 25 秒，WAV hash 相同。
合成 44.1 kHz 音源進入 48 kHz context 後，兩個測點也逐 byte 相同。
這證明指定測點的錄音完整性；沒有驗收真實裝置的時鐘與輸出。

最小 Web Audio 圖的一組 recorder off／on 短測，去除前兩次 Main sample 後，renderer `percentCPUUsage` 中位數約 0.120 → 0.211。
這是 API 回報數值增加約 0.091，且 on 包含兩個 recorder 與接線觀測；不是零開銷，也不是多輪效能保證。
兩輪 Main interval p95 的中位數約 32.49／32.39 ms；它受計時器與 20 ms 採樣解析度影響，不是音訊處理 deadline 或裝置 latency。
on 輪的 PCM 沒有非有限／超滿刻度／缺聲道／context frame 缺口，trace 無覆寫；沒有因這個短測而調高任何播放 buffer。

## 精確競態與單一修正

重現順序：

1. 先將 monitor 設為非零 pitch。
2. 選 capture 裝置，在 capture worklet 註冊開始後暫停該 promise。
3. 將 transpose 或 cents 歸零，等待 setter 完成；此時 capture dry／wet 為 1／0。
4. 放行原本的初始化，等待增益穩定，再讀實際路由。

修正前，兩項回歸測試都得到 dry=0／wet=1；兩次獨立原生 run 也得到同樣結果。
根因在 `syncCaptureChainToCurrentState()`：`needsPitch` 在 await 前判斷，await 後仍無條件切到 wet。
schedule 已採用最新的零 semitones，gain 卻沿用舊的非零意圖。

本輪只在該 await 完成後依目前 transpose／cents 重新判斷 active，再決定 dry／wet 目標。
沒有斷開已建立的 pitch node，沒有改其他 lane 的接線或 processor 生存期。
修正後兩項回歸通過，原生同順序 capture 維持 dry=1／wet=0。

修正前／後 capture tone residual RMS 約為 4.696e-6／4.695e-6（左聲道），都接近這個 PCM tone 的量化殘差。
所以這項證據確認的是錯誤的旁路狀態，沒有證明隨機電子音的成因。
若在 fresh session、從未啟用 pitch 的原曲仍出現異常，這個競態也不能解釋該情境。

## 合成與原曲短測

六個合成條件依序完成：最小圖 recorder on、monitor pitch +2→0、fresh dry capture、雙路 pitch +2→0、四聲道 guide 混音、44.1 kHz source。
每輪在 marker 後錄滿十秒，兩個測點各保存 25 秒；未記到非有限值、超滿刻度、缺聲道或 context frame 缺口。
四聲道測試有不同頻率標記，capture guide 關閉、總音量 50%；monitor 混入預期 guide，不能用單 tone 的殘差評估四聲道音質。

原曲從現有曲庫唯讀複製三個不同編碼，以匿名編號紀錄；沒有帶入原本曲目 metadata、歌詞或分離結果。
各輪 monitor gain 固定為 1、capture 為 0.5；不是聲稱使用者正式環境也採用這組音量。

| 原曲副本 | 來源                       | 對照                                   | 累積 monitor peak | capture peak | 可確認的範圍                                                                                     |
| -------- | -------------------------- | -------------------------------------- | ----------------- | ------------ | ------------------------------------------------------------------------------------------------ |
| 1        | Opus／WebM，48 kHz，雙聲道 | minimal、完整 dry、雙路 pitch 歸零     | 1.1526295         | 0.5763147    | minimal 與完整 dry 各自的 source-decoded／monitor-output WAV hash 相同；超滿刻度值在解碼後已存在 |
| 2        | MP3，48 kHz，雙聲道        | 完整 dry＋capture，片長較短，包含 loop | 0.2853481         | 0.1426740    | 這段沒有超滿刻度值，不代表其他曲目或裝置正常                                                     |
| 3        | AAC／MP4，44.1 kHz，雙聲道 | 完整 dry＋capture、雙路 pitch 歸零     | 1.1816906         | 0.5908453    | 同一 context 為 48 kHz；dry 與歸零的 peak 相同，capture 未超滿刻度                               |

上述六輪皆未記非有限值或 context frame 缺口；沒有人工確認「聽到了同樣電子音」的 marker。
Opus 與 AAC 的超滿刻度浮點值再次支持 headroom 需求，但沒有錄到硬體輸出削波，不將它認定為隨機雜訊根因。
三個完整副本也以 FFmpeg 9.0 離線解碼至 null，exit code 皆為 0、error log 為空；這不能排除 live decoder／串流／裝置問題。

## 保存設定的唯讀線索

慣用 App config 目前保存 monitor volume 0.3、capture volume 0.5、monitor 未靜音，且沒有選定 capture device。
這只代表本輪讀到的保存值，不代表發生症狀當時或其他 profile 的執行狀態。
因此不能把測試中 monitor gain=1 的超滿刻度值套用成使用者實際監聽一定削波，也不能假設這次症狀必定經過獨立 capture graph。

OBS 的保存 profile 列到 48 kHz，場景檔含應用程式音訊擷取 source；沒有將這些檔案當作正在直播的權威設定，也未修改或連線正式 OBS。
下一輪須明記是裝置輸入／虛擬線，還是應用程式擷取，以及實際命中的程序。
Windows 的 process loopback 不綁定單一 endpoint，因而不能假設 capture master 會控制 OBS 所收的所有 App 音訊；實際收音仍需量測。[Microsoft 範例](https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/)
OBS 官方也提醒應用程式擷取與 Desktop Audio 同收會產生重複／echo，對照時應檢查測試設定是否重複接收。[OBS 指南](https://obsproject.com/kb/application-audio-capture-guide)

十分鐘單輪探索使用副本 3（AAC 44.1 kHz）、雙路 pitch +2→0、48 kHz contexts 與 capture 50%，marker 後另保留十秒。
兩個 recorder 各處理約 2,926 萬 frames，最後各保存 120 萬 frames；沒有非有限值、缺聲道、context frame 缺口或 trace 覆寫。
兩次自然 loop 產生 seeking／seeked 及 playing；三次 waiting 對應初次啟播與兩次 loop，沒有 media／processor error。
這段 monitor 累積 peak 為 1.377078，capture 為 0.688539；高於短測 peak，說明短片段的 peak 不能代表整首。
這是 silent sink 的單輪探索，沒有人工聽感異常 marker；原計畫的每條件三輪十分鐘及真實裝置驗收仍未完成。

## 失敗輪與驗證

首次 Electron 在 sandbox 內於產出 report 前退出，沒有把它算成播放通過；後續使用允許的相同原生執行邊界。
兩個原曲最小圖嘗試發生 media code 4：工具在同一 track 目錄留下 synthetic WAV 與 WebM，正式 resolver 只允許其中 canonical 第一個音源，因此拒絕 WebM。
已修正實驗 fixture 使每次只保留一個 audio 資產；失敗資料保留，沒有修改正式 resolver 或歸咎於原曲解碼。

完整測試的 sandbox 輪有 Temp rename／link EPERM（88 檔失敗），未作為程式回歸結論。
以允許的執行環境重跑後，1,127 檔、11,376 項通過、1 項原有 skipped。
focused tests 9 檔／137 項通過；改動 graph 的 focused coverage 為 statements 94.38%、branches 82.4%、functions 95.45%、lines 98.02%。
完整 lint 與 build 通過，原有大 chunk 提醒仍存在；文件、format、diff 與 owned process 清理結果見機器紀錄。
未建立新安裝包，沒有把未測過的正式 executable 宣稱為已修復版本。

## 下一個實機步驟

在獨立測試設定啟動工具，選原曲副本與實際 capture 裝置，再開始播放；聽到異常時按 marker。
同時錄 monitor endpoint、capture 接收端與 OBS 單一音訊軌，並保留這三處的 rate／monitoring／filter 設定。
先比較第一個異常測點，再恢復／停用 pitch、capture 或背景工作；不在取得片段前重建 graph。
若只有正式完整 UI／背景作業時發生，再把同一 recorder 的觀測接到完整 App 的隔離 profile，逐類恢復背景負載。
目前工具的寧靜 player harness 沒有測到這些負載，不能以它的短測結果排除資源競爭。
