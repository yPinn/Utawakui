# 播放偶發失真：基線、證據缺口與比較實驗

日期：2026-10-26（Asia/Taipei）。來源基線為 v0.5.1／`74714d6f`，開始調查時工作樹乾淨。
本輪完成程式、既有診斷與歷史驗證的唯讀調查及實驗設計；未修改播放器、正式設定或 OBS，未執行新的真實裝置錄音。
機器摘要見[同名 JSON](playback-distortion-investigation-2026-10-26.json)。

## 結論與判定邊界

偶發電子音的根因仍未定位。原曲也會發生、位置不固定、暫停後可能恢復，均來自使用者描述；尚無帶異常時間標記的同步音訊與狀態紀錄。
不能將聲音描述當成解碼失敗，也不能將先前 transport／BGM／擷取音量修正當成失真已解決。

建議先建立可手動標記異常的隔離錄音及事件時間線，再做單變因比較。
一般錯誤 log 應保留；完整排查另需明確啟用、有界的實驗 trace，不能只增加成功事件或每個 audio quantum 寫 log。
最先比較「新 session 從未啟用 pitch」與「啟用後歸零」，以及監聽、擷取裝置實收、OBS 三段。

## 讀取的證據與時間線

以下時間使用 Asia/Taipei。提交時間不是異常發生時間；沒有對應錄音的事件不能建立因果。

| 時間／來源                                                     | 可確認的內容                                                                                                                                                                     | 不能證明的內容                                                                                                |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 10/25 舊隔離 `tasks/audio-runtime-audit/`                      | 合成 Opus、silent sink；`result-idle-dsp.json` 的 pitch 與歸零 bypass 各約兩秒，皆記到 768 次 processor callback；原始 HTML 確認有 worklet callback instrumentation              | 真實裝置、OBS、長播、音訊無失真；callback 次數不是 deadline miss／underrun 計數                               |
| 同目錄 `result.json`                                           | 約兩秒一段的 monitor／capture／capture-half／BGM／dim／cut；未記 media error，BGM cut RMS 為零                                                                                   | RMS／播放時間正常不等於聽感正常；capture 為假 sink，沒有驗收裝置時鐘                                          |
| 同目錄未完成嘗試                                               | `result-dual-partial.json` 停在 `starting-bypass`，不能視為完整雙處理器 bypass 驗證                                                                                              | 不能將部分成功併入完整通過分母；原因需另外追查                                                                |
| 同目錄 `original-levels.json`                                  | 三個 ordinal 記到約 +1.41／+1.58／+2.12 dBFS 的離線解碼 peak；來源與量測完整性未在本輪重做                                                                                       | 浮點解碼超過 1 表示有 headroom 需求，不等於已捕捉到裝置削波，更不等於偶發電子音根因                           |
| 10/26 00:24:05.783，本機慣用 App logs 位置                     | 唯讀取得的 `diagnostics.jsonl` 共 68 筆；只有一筆符合 player／audio-output／media 或音訊／程序錯誤篩選的事件，為 `AUDIO_OUTPUT_DEVICE_UNAVAILABLE`、版本 v0.5.0／Electron 43.8.3 | 沒有症狀發生時間、裝置實收或 v0.5.1 失真 trace；未向執行中的 App 查詢權威 logs path，不能保證涵蓋所有 profile |
| 上述檔案時間範圍                                               | 10/25 12:34:34.169 至 10/26 01:08:06.259；檔案未修改、未清除                                                                                                                     | 這個範圍沒有失真專用事件，不代表當時音訊正常                                                                  |
| 10/26 10:23:32，`3aaf3b4a`                                     | 待完成播放／恢復動作在 pause 後失效的既有修正                                                                                                                                    | 未重現或排除失真                                                                                              |
| [正式打包驗證](runtime-packaging-verification-2026-10-26.md)   | 合成音源的播放、pause、seek、換曲、BGM／capture peak 與合成 ONNX 四聲道 byte identity                                                                                            | 硬體輸出靜音、沒有 OBS，不涵蓋長時間真實裝置聽驗                                                              |
| [第一批符號轉換驗證](light-symbols-verification-2026-10-26.md) | 同來源 baseline／candidate 的 renderer 與音訊 worker byte identity；有界規則負載下合成播放持續前進                                                                               | 不是所有版本都無失真的證明；Main event-loop p95 不是音訊 buffer latency                                       |
| 10/26 15:32:53，`74714d6f`                                     | 目前 checkout 的 v0.5.1 發行準備提交                                                                                                                                             | 未核對使用者實際執行中的 executable／ASAR hash                                                                |
| 10/26 15:46，本輪 focused tests                                | 9 檔／135 項通過，涵蓋 player、phase、diagnostics、library sync、pitch 算術、BGM、device owner、protocol 與 Range                                                                | Mock 與 byte/header tests 不提供真實裝置或聽感保證                                                            |

不將私有媒體名稱、裝置 id、profile 路徑或診斷 correlation id 寫入本報告。

## 目前實際音訊路徑

Owner 為 `src/composables/usePlayer.js`、`player/usePlayerAudioGraph.js`、`src/bgm/audioDeck.js` 與 `useAudioOutput.js`。
HTML audio 的事件仍持有時間與播放狀態。原曲也經 Chromium media decode 和 Web Audio；原曲不等於完全離開 App 的音訊圖。

```text
HTML audio → MediaElementSource（monitor AudioContext）
  原曲：直接進 monitor master，並直接進 accompaniment bridge
  四聲道：splitter → accompaniment L/R（0/1）＋ guide L/R（2/3）
    monitor：accompaniment ＋ guide gain → monitor master
    capture：兩條獨立 MediaStreamDestination bridges

monitor master → dry ─────────────────────────→ 預設裝置
               → Signalsmith → wet ───────────→ 預設裝置

bridges → capture AudioContext（指定 sink）
        → accompaniment ＋ capture guide gain → mix → dry／pitch-wet
        → capture master（預設 0.5）→ 指定裝置 → OBS 擷取

BGM 自有 audio／AudioContext → 自有 gain → 預設裝置
                                      → PCM bridge／lease gate
                                      → capture master（繞過演唱 pitch）
```

監聽使用系統預設輸出，擷取使用另一個指定 sink；兩段可能具有不同 sample rate、resampling 與裝置時鐘。
BGM 再持有自己的 context。capture 在 monitor 尚未完成裝置初始化時可非同步啟動，不阻塞監聽播放。

## 程式檢查結果與優先假設

1. `ensurePitchNode()`／`ensureCapturePitchNode()` 在首次非零 transpose 或 cents 才建立 Signalsmith。
   新 session、從未動過 pitch 的原曲正常走 dry，沒有 Signalsmith 節點。
   曾啟用 pitch 後，歸零只使用 `setTargetAtTime` 將 dry／wet 目標調為 1／0，沒有斷線或停止 processor。
   舊 callback 紀錄支持「歸零後 processor 仍運作」，但不能據此宣稱造成失真。
   應分別記錄控制參數、節點存在／接線、gain 當前值與目標；不能只記「pitch=0」。
2. `setTempoRate()` 直接改 `audio.defaultPlaybackRate`／`playbackRate`；不走 Signalsmith 的 `rate`。
   需觀測原生 `preservesPitch` 實際值；本輪沒有驗證 Chromium 的原生 tempo 處理是否涉及異常。
3. `connectSourceNode()` 先 `disconnect()` 再選原曲直通或四聲道 splitter。
   靜態路徑沒有找到原曲與 splitter 同時被 source 餵入的明確穩態重複接線。
   仍需以實際 connect／disconnect、lane 數與切換後 PCM 驗證，不把原始碼意圖當成現場拓樸證明。
   另外確認 monitor 的系統預設裝置與所選 capture 是否落在同一實體 endpoint；兩個 context 各自正常輸出，也可能在裝置或 OBS 再被加總。
4. capture 經兩條 MediaStream bridges 再進另一個 AudioContext。
   guide 和 accompaniment 的相對延遲、長時間漂移、sink 重建與 rate 不同值得先量測；目前沒有橋接延遲或漂移時間線。
5. 有一個待重現的明確時序候選：`syncCaptureChainToCurrentState()` 在 await 初始化之前判斷 `needsPitch`，await 後直接將 dry／wet 切到 0／1。
   若等待時控制已歸零，另一個 setter 已完成 dry=1／wet=0，舊初始化仍可能最後將 wet 打開，即使 schedule 的 semitones 已讀到 0。
   以 deferred registration 精確控制順序，檢查最後 gain 目標；目前僅為程式推導，未證實可聽異常。
6. monitor 的 `ensurePitchNode()` 在 await 前後沒有與 capture 相同的 disposed／graph identity 檢查。
   cleanup、初始化與重新載入的競態另列 lifecycle 測項；未觀察到舊節點實際接回。
7. pause、seek、換曲並未呼叫 processor reset 或重建 monitor context。
   Signalsmith 此處吃 live input，App 沒有自行餵入 `addBuffers()` 或維護 real-time ring queue。
   installed 1.3.2 wrapper 的 live input 以每聲道 Float32Array 複製進 WASM；不能照另一個處理器的環形佇列模型推論 bug。
   暫停可能改變輸入／裝置排程，但「恢復正常」不能直接證明 buffer 已被清空。

目前不選定任一項為根因，也不先加 buffer、調 configure、改 sample rate 或同時重構播放器。

## 診斷缺口與最小補強規格（尚未實作）

現有 `usePlayerDiagnostics.js` 僅記 buffering、context-state、processor-error、media-error，依 operation／reason 節流 30 秒。
buffering 只在 phase 已是 playing 時記錄；不是完整事件序列。
Main 收到時產生 timestamp，可能晚於 renderer 實際事件；現有時間不能精確對齊音訊。
`diagnostics.js` 的 context allowlist 也不會保留任意新增欄位，不能只在 renderer 多塞 sample rate 就宣稱已有紀錄。
一般 renderer diagnostic 上限為每分鐘 120 筆，不能用來逐 quantum 傳 PCM 或高頻 trace。

第一階段先用隔離實驗 driver 的觀測橋接，重用實際 player／graph，避免先擴大正式 IPC／schema。
正式 App 內的可選支援工具若有需要，另以固定有界 intent、主程序決定路徑與明確啟停設計；不得新增 renderer 任意檔案路徑入口。
一般錯誤紀錄與實驗 trace 的資料、保留期限、音訊匯出須清楚分開；若改正式診斷 schema／retention，先依 ADR 0008 更新契約。

實驗 trace 的規格：

- 時間：run id、遞增 seq、renderer `performance.now()`／`timeOrigin`、Main monotonic clock 對時及誤差範圍、各 context 的 `currentTime`；可用時另記 `getOutputTimestamp()`。
  audio.currentTime 為來源位置，context clock 為觀測值；它們都不接管產品播放狀態。
- HTML audio：play／playing／pause／waiting／stalled／seeking／seeked／ended／metadata／error／ratechange／emptied；記 currentTime、paused、ended、readyState、networkState、playbackRate、preservesPitch、buffered ranges 的有界投影。
- 非同步：start request／track occurrence／source generation／capture selection revision、pitch init 開始與完成、stale 拒絕、graph create／dispose；使用 run-local token，不記 URL、曲名或真實裝置 id。
- 接線：run-local context／node id、connect／disconnect 的端點及聲道、原曲／四聲道模式、dry／wet 實際值與目標、guide／master／BGM gate、仍存活 lane／node 數；不要每次 timeupdate dump 完整 graph。
- 裝置與時鐘：各 context sampleRate、baseLatency／outputLatency（未提供寫 unavailable）、state／sinkchange、橋接 track 狀態；來源 codec／sample rate 由隔離檔案 manifest 取得。
  Windows 裝置格式與 OBS rate 另外記錄，不能用 context.sampleRate 代替。
- PCM：來源 decode 後、monitor 最終 gain 後、bridge 進 capture 前後、capture 最終 master 後等測點，先分層少量啟用。
  每區塊累積 peak、RMS、非有限值、連續超過滿刻度樣本、靜音段與樣本計數；異常指標僅標記候選，不能對任意音樂自動判定聽感失真。
- 負載：每秒彙總 owned process CPU、Main／renderer event-loop delay、可用的 long-task／GC 證據、背景 job 開始／結束／取消與種類。
  unavailable 保留；CPU 尖峰與事件迴圈 delay 都不直接等於 audio thread underrun。
- 有界錄音：選定兩個立體聲測點，48 kHz float32、每點前 15 秒＋後 10 秒約 9.6 MB，兩點約 19.2 MB；sample rate 不同依 manifest 計算，先檢查記憶體上限。
  使用預配置循環 PCM 儲存與批次傳送，記 dropped blocks；在 audio callback 不做 console、JSON、磁碟寫入或逐次配置大型 buffer。
  這是診斷錄音儲存，不變更播放 buffer；第三個測點另輪實驗，避免一次掛滿。
- 標記：聽到異常時先記 marker 並保留前後音訊；marker 是人工反應時間，不等於故障起點。
  在 marker 後保留症狀片段，再執行 pause／resume；若必須立刻停止，明確記錄停止動作與可用後段長度。
  不自動重播／重建，避免清掉現場狀態；保留無異常輪與失敗輪。

先做 recorder／trace 關閉與開啟的觀測成本對照，記 instrumentation 版本及 dropped blocks。
普通 AnalyserNode 定時 snapshot 會漏掉兩次採樣間的短雜訊，不能替代連續錄音。
MediaRecorder 若輸出有損編碼，不能當逐 sample 差分或滿刻度判定的唯一來源。
未觀測到 worklet exception 不代表 deadline 沒有錯過；沒有實際 underrun counter 就寫不可觀測，不捏造計數。

## 實驗執行規則

每次使用獨立 userData、sessionData、logs、曲庫、輸出資料夾及測試用 OBS portable profile／scene collection，確認 singleton lock 與執行路徑也隔離。
不連正式直播、不更改正式預設裝置／裝置格式／OBS 場景；裝置 rate 實驗排在閒置時段並先保存原值。
外部播放比較指向 App 真正使用的同一媒體 bytes，若 import 有轉碼，不能拿原始下載檔冒充同一檔案。
manifest 保存 hash、容器／codec／rate／channels／duration、build／ASAR／renderer／processor hash、作業系統與裝置版本、gain、背景工作設定與固定腳本 seed。
私有素材只留本機，報告以 ordinal 表示。

先以合成 44.1／48 kHz 雙聲道 tone／sweep／脈衝與四聲道不同頻率標記驗證錄音、聲道、延遲與 clock 對齊，再複製已知可疑原曲測試。
合成音的預期 peak 留足餘裕；原曲保留原 bytes，額外低增益條件另記，不能覆蓋基線。
為跨裝置錄音做互相關／脈衝對齊，記 offset 與隨時間 drift，不能直接依 wall clock 把波形逐 sample 相減。

## 比較矩陣與停止條件

下表是待執行計畫，沒有任何一列被本輪標記為聽感通過。
先跑 A～C，取得可重現差異後才進相關分支；不全組合窮舉。
初始每條件三輪、每輪至少 10 分鐘、A／B 交錯；若取得使用者較長的常見發生間隔，再延長至至少該區間。
零事件只能報觀測分鐘數與條件，不能排除罕見失真。長播不與 build／測試同時進行。

| 組別              | 單一比較與固定條件                                                                                                                                                                                      | 能縮小的範圍                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A：輸出定位       | 同次原曲播放同步錄下 monitor 裝置 loopback、指定 capture 裝置接收端、OBS 單一來源獨立錄音軌；另分輪取 App pre-sink PCM。OBS 關閉 monitoring、額外 desktop capture、filter／plugin；僅調測試 profile     | App PCM 先異常：往 decoder／graph 查；App PCM 正常而裝置實收異常：往 sink／driver／bridge 查；實收正常而 OBS 異常：往 OBS ingress／mix／encode 查。需確認錄音工具沒有把兩路回送相加 |
| B：真正旁路       | 同 bytes、同裝置與相符增益：外部播放器；新 audio 元素原生直出（從未 createMediaElementSource）；最小 Web Audio source→gain→destination；正式 graph、capture 關閉且從未啟用 pitch；正式 graph 加 capture | 原生 media 與 Web Audio／完整圖、capture bridge 的分界。已綁 MediaElementSource 的元素不能藉 disconnect 冒充原生直出，應換新元素／session                                           |
| C：pitch 歷史     | fresh session 從未啟用，對比 +2→0、cents 25→0、完整 wet +2；分 monitor-only、再 capture，固定 tempo=1。另比較隔離 harness 物理斷開 processor 的條件                                                     | 區分參數歸零、wet 靜音與 processor 完全未參與。物理旁路需記明是實驗條件；若改善，先恢復原接線再次挑戰，再決定最小產品修正                                                           |
| D：接線與混音     | 原曲／四聲道；BGM 關閉→啟用→切回；guide 逐路開關；capture 關閉→開啟。每輪只改一項，脈衝／聲道標記驗證，記有效 edges 與延遲                                                                              | 重複訊號、相位梳狀濾波、舊 lane、guide 聲道錯位；gain 測試包括 pre-master peak 與 post-master，不只看最終音量                                                                       |
| E：非同步生命週期 | deferred worklet：先設非零 pitch→選 capture→等 registration 開始→歸零並等 setter 完成→放行 registration；再做 pause、seek、換曲、capture replacement、cleanup 的固定順序與 seed stress                  | 首先驗證最後 dry／wet 目標與 source generation；即使抓到控制狀態 bug，也仍需原生 PCM／症狀重現，才能連結失真                                                                        |
| F：rate／clock    | 先記原設定；44.1／48 kHz source 互換，維持裝置與 OBS rate；再固定 source 逐一改測試裝置或測試 OBS rate。比較 bridge 前後脈衝間距與長時間 drift                                                          | resampling、跨 context／裝置 clock 問題；不預先強制全鏈 48 kHz，也不在同輪一起改所有 rate                                                                                           |
| G：背景工作       | 隔離 profile 關閉自動歌詞／分析／下載／分離，取得 baseline；逐類恢復固定 job set 與開始時間                                                                                                             | 可重複與特定工作共現才深入其 CPU／IO／GC／執行緒證據。單次尖峰不能定因                                                                                                              |
| H：檔案與串流     | 同 bytes 外部與 App；同 codec 原檔和隔離離線 PCM 對照；真實 `utawakui-media:` 連續播放＋固定 seek／取消，對照 minimal media path                                                                        | 來源 bytes、codec 與協定分界。保留原檔，轉 PCM 改善仍只定位到原編碼鏈，不能直接證明 decoder bug                                                                                     |

Range trace 需要 request token、請求範圍、status、Content-Range／Length、首／末 byte、累積 byte 數、開始／結束／cancel／error 與 source generation；主程序解析來源，公開 trace 不含 raw URL 或檔案路徑。
現有 `range.js` 的 200／206／416 與 `Readable.toWeb(createReadStream(...))` 保持不變；補 trace 時覆蓋非同步 stream error／cancel，不能只包同步 try/catch。
協定驗證同時比對 bytes／headers，以及真正 Electron 的中途取消與 seek，不以純函式通過替代。

遇到異常先凍結相關前段、收足後段並標記首次可見失真測點；記 pause/resume 前後、是否沿用同 context／node、是否真的恢復。
要判定某環節為原因，至少要求同條件重複異常、單一干預後改善、恢復原條件再次出現，且不是 recorder 自身 dropped blocks。
對照條件無事件或只有負載相關性時，結論維持未定位；確認局部狀態 bug 也不將其擴張成所有隨機失真的根因。

## 下一步與驗證門檻

實作順序為隔離 recorder／時間線與觀測成本驗證 → A／B／C 基線 → E 的精確 race 重現 → 依最早異常測點選單一修正。
第一批不改 DSP 算法、播放 buffer、timeout、四聲道順序、HTML audio authority 或正式設定。
實驗 driver 與資料放 ignored 的 `tasks/`；可重用的契約測試放對應 production 檔旁。
若產生任何程式變更，依專案規範先補有意義回歸、做 code review，跑 focused tests／lint／format／build；Main／preload 變更要完整重啟。
若更動 runtime assets／封裝，另核對 inventory 與 packaging tests。

本輪已執行的命令：

```powershell
npm.cmd test -- src/composables/usePlayer.test.js src/composables/usePlayer.playbackPhase.test.js src/composables/player/usePlayerDiagnostics.test.js src/composables/player/usePlayerAudioGraph.pitch.test.js src/composables/player/usePlayerLibrarySync.test.js src/bgm/audioDeck.test.js src/composables/useAudioOutput.test.js electron/main/mediaProtocol.test.js electron/lib/library/range.test.js
```

本輪交付僅調查與設計文件，不需要重新封裝來驗證未修改的音訊程式。
文件檢查結果以同名 JSON 記錄；實作前依使用者提供的 AGENTS.md 工作流程確認方案。
