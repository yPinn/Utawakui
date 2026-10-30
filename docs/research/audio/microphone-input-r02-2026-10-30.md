# R02 Mic 輸入原型首輪驗證

日期：2026-10-30（Asia/Taipei）。本輪先建立單一輸入與本機電平基礎，再驗實際 Electron 權限和清理。產品現況見 [spec](../../spec.md#73-研究候選尚未接受為開發路線)，行為見[研究契約](../../contracts/microphone-level-research.md)；原型與短暫開啟裝置不代表完整聲學品質通過。

## 方法與隔離

使用 Electron 43.8.3／Chromium 150.0.7871.250 的獨立可見 BrowserWindow、profile 與 Vite 連接埠，載入實際 Workbench、專案 preload、可信 IPC wrapper、Main permission handlers 及輸入 runtime。沒有操作既有 App／OBS，沒有改 Voicemeeter 路由、系統音量或曲庫。

合成測試使用 Chromium fake capture 讀取本機產生的 440Hz、振幅 0.25、48kHz 單聲道 PCM16 WAV。它是測試素材，非使用者錄音；裝置實際回報可不同於檔案格式。輸入沒有連到揚聲器或錄音器。

使用者另明確允許 VM Out B1 或直接麥克風。原生列舉取得 3 個具體輸入後，以實際名稱明選 `Vm Out B1`，再另開新測試選實體麥克風；不是 runtime 自動替換。兩次各以 100ms 目標間隔讀取 100 筆已計算的 meter 快照，約 10 秒，只保存數值摘要，不保存原始 Mic PCM。裝置 id／完整標籤、profile 與操作收據只留本機 ignored scratch。

## 當輪觀察

| 情境       | 證據與結果                                                                                            | 限制                                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 初始與列舉 | 初始選擇為空、輸入呼叫為 0；明確讀取可列出 3 個實際輸入，仍為 0 次 getUserMedia。                     | 列舉不是收音證據。                                                                                                             |
| 未授權請求 | 未持 lease 的 audio 請求回 NotAllowedError；原生回呼有 audio／video 拒絕。                            | 混合請求／其他 frame 另由定向測試覆蓋。                                                                                        |
| 合成訊號   | running meter 約 −15.09 dBFS，與振幅 0.25 正弦的 RMS 約 −15.05 dBFS 相近；相對強度有反應。            | 窗口／平滑影響瞬時讀值，不當校準或誤差上限。                                                                                   |
| 停止與晚回 | 停止後 meter 為 −100／0、tracks 全 ended；延後回傳的 native getUserMedia 在停止及卸載後也全部 ended。 | 不是 USB 熱插拔或長場次證據。                                                                                                  |
| VM Out B1  | 100 筆快照的最低／最高皆為 −100 dBFS 數值底限；停止後 tracks 全 ended。                               | 未取得有聲輸入，不能判斷 bus 路由、噪聲或訊號品質。                                                                            |
| 直接麥克風 | 另一個明選 session 的 100 筆最低／最高亦皆為 −100 dBFS；停止後 tracks 全 ended。                      | 未安排同步發聲或確認硬體電平，不對底限原因下結論。                                                                             |
| 可見介面   | 深淺色 idle／running 與 650px 窄窗擷取經獨立審查，元件範圍 SHIP。                                     | 非完整 App 導航、實體鍵盤或螢幕閱讀器驗收；root scrollWidth 大於 clientWidth，尚未區分裝飾 overhang 與內容，不宣稱幾何零溢出。 |

## 工程驗證

13 個相關測試檔、126 項通過；另 4 個 packaging／runtime 測試檔、42 項通過。覆蓋執行的 24 項是相關測試的子集，不再加總。四個核心檔案的 statements／branches／functions／lines 為 93.58%／86.18%／90.74%／97.59%，不是整庫覆蓋率。

Production build、完整 ESLint、本切片 Prettier、Markdown（最終 240 檔）、diff whitespace 與一次 UI detector 通過。正式 renderer 產物搜尋未包含原型 route／標題／研究 bridge；編譯 preload 測試確認正式 API 沒有 begin／end。初輪完整 lint 曾因並行 R01 crash fixture／recovery test 的 15 個錯誤失敗，未更改那些檔案；並行工作更新後重跑通過。Release inventory 的新表格需繞過既有 `release-*` Prettier ignore 才能完成對齊，保留表格內容。

工具失敗保留本機：沙箱內 Electron 原生啟動失敗，改用授權的沙箱外獨立視窗；Playwright Electron 啟動不適用目前 Node inspector fuse，改由自有 Main 驅動。首次 capturePage 回 UnknownVizError，第二次取得可見視窗圖像。早期 harness 的 token root／theme 與非同步完成判斷修正後才採用收據，不改產品 timeout、不關閉 sandbox。

## 接續條件

### 19:03–19:04 B1 訊號重試

使用者確認目前有輸入訊號並要求重試。沿相同指定 B1 與實際原型重建 session，不更動 VM／OBS 路由、不錄音；列舉當時有 4 個具體輸入。Main access 模組已由並行工作更名為 `microphoneResearchAccess.js`，本機 harness 隨現行名稱載入，未改產品分析實作。

- 19:03 首次重試：100 筆電平摘要仍皆為 −100 dBFS 底限，停止後 tracks 全 ended。
- 19:03 獨立對照：相同 stream 另接一個 Analyser → 固定零增益 → destination，只有本機數值摘要。原型 92／100 筆高於 −99 dBFS，最高 −14.56 dBFS；對照亦為 92／100、最高 −13.65 dBFS。兩個窗口非同步取樣，不用其差值估算精度。對照 context 關閉，輸入停止後 tracks 全 ended。
- 19:04 依使用者再次要求，移除額外對照，只跑原型：99／100 筆高於 −99 dBFS，最高 −49.29 dBFS、最低 −100 dBFS；停止後 meter 回 −100／0，tracks 全 ended。

這證明本輪原型能取得 B1 的非底限訊號，不能把先前底限確診為圖接線或 VM 錯誤；各輪沒有固定發聲內容／音量，數值不可直接當同條件比較、噪聲評估或演唱品質。私有收據分別保留為本機 `vm-b1-signal-retry-1903.json`、`vm-b1-pull-control-1903.json`、`vm-b1-prototype-only-1904.json`，不覆寫初始 B1／直接 Mic 觀察。

### 尚未完成的品質矩陣

後續仍需固定所選 bus／Mic 的來源與實際電平，再安排安靜、正常說話與輕強唱窗口。初始底限與後續有聲摘要都不足以估算噪聲、coverage 或輸入延遲；不以改門檻或自動換裝置掩蓋。

其後固定伴奏單獨播放、播放加發聲與 OBS 同時使用的矩陣，量測串音誤觸、平滑取捨、畫面延遲分布、CPU／RAM 與播放中斷。R02 完整品質、Output transport 與 R03 音準仍保留前置；本輪沒有錄音、人聲監聽、音準模型或評分實作。

## 第二階段：19:10–19:11 條件分組試測

原型先以 `cfe6193b` 階段提交，後續工具／量測獨立續接。使用者聲明 B1 只有麥克風；沿同一明選輸入，不改 VM／硬體增益或路由。門檻 −55 dBFS、靈敏度 1、平滑 150ms 固定；裝置回報 48kHz、2 聲道、自動增益／降噪／回音消除均關閉。

獨立視窗在開始前顯示條件與三秒準備提示，取樣時顯示「量測中」，Main 標記即時轉送到 launcher。每組取 100 筆 meter 快照，只保留摘要。百分位使用 nearest-rank；門檻計數採嚴格大於。工具先以已知數值斷言核對，並獨立審查啟動提示及錯誤來源標記，修正後才實測；matrix 模式拒絕未指定 physical B1 或混用 direct／fake／pull-control 的組合。

| 指示條件       | dBFS 中位數 | dBFS 第 95 百分位 | dBFS 最高 | 高於 −65／−55／−45 dBFS 的快照數 | 相對強度大於零 |
| -------------- | ----------- | ----------------- | --------- | -------------------------------- | -------------- |
| 保持安靜       | −92.39      | −56.59            | −56.59    | 11／0／0，分母 100               | 0／100         |
| 連續說話或輕唱 | −65.13      | −57.78            | −55.45    | 50／0／0，分母 100               | 0／100         |

兩組均完成停止，所有 tracks 為 ended，meter 回 −100／0，無接近削波提示快照。第一至末筆耗時分別約 10.79／10.80 秒，99 個取樣間隔的中位數約 109.2／109.0ms、第 95 百分位約 111.2／111.7ms；這是 meter 取樣排程，不是輸入到畫面或聲學延遲。

以上是「指示條件」；使用者後續確認發聲只有部分時間對上窗口，因此保留為試測，不能當獨立語音真值、連續聲音覆蓋率或誤觸率，也不用來決定預設門檻。快照可能重複同一底層 meter 值，100 筆不是 100 個獨立音訊窗口。固定 −55 門檻下兩組的畫面反應均為零；事後 −65 計數會同時涵蓋安靜條件的 11 筆與發聲條件的 50 筆，故不直接修改預設門檻或宣稱已找到最佳校準。伴奏單獨／混合、聆聽裝置與音量、實際發聲確認、播放／OBS 負載與獨立時間對照均仍待驗。

### 引導面板與真人操作修正

使用者確認 19:11 指示發聲窗口只有部分時間發聲，且聊天／外部腳本時序不直觀；該組保留為試測，不用來決定預設門檻。聆聽方式另確認為耳機、B1 只有麥克風；尚未重新完成操作者控制的真實安靜／發聲／伴奏／混合矩陣。

因此改由開發版工具內的四步面板主導：操作者明選情境並開始，畫面倒數3秒、量10秒，能取消／重測；最近10秒dBFS歷史與門檻線持續可見，結果留在本次工具。設定／裝置變更清除比較，失訊／隱藏／取樣中斷不發布半套結果；不自動調整門檻，不擷取或保存原始PCM。

新工具先以狀態／作用域測試核對，再在隔離可見Electron以合成音源驗倒數、鎖定、完成、切情境、取消保留原結果、停止與晚回／卸載清理。最終guided收據failure:null，安靜這一合成情境恰100快照；這是介面接線驗證，不是真實安靜品質。明暗／650px截圖保存本機。初期重複watch計數、首筆延遲、停止後條件失效與跨情境完成狀態均補測修正；harness對齊主視窗backgroundThrottling:false後才採用最終互動證據，先前中斷收據保留。新引導切片尚未另行提交。

### 19:36–19:37 分析輸入基本設定

使用者明確限定用途為 Utawakui 電平／音準分析。新增數位分析增益、停止後選擇的低切，以及環境支援時可選的降噪／回音消除／自動增益。三個原生選項與低切預設關閉，數位增益預設0dB；不修改系統／VM／OBS設定。裝置回傳與本機分析後電平分列；上游原生處理已反映於前者，因此不稱ADC原始值。操作與測量失效邊界見研究契約。

隔離可見Electron沿同一實際元件／runtime，僅讀合成tone檔，不取真Mic。120Hz低切下，以20筆meter快照的dB值平均作短窗比較：440Hz時，數位增益0→+6dB令分析後增加6.014dB，裝置回傳平均只改變約0.03dB；120Hz低切對440Hz約−0.022dB。55Hz時，低切相對裝置回傳降低13.782dB，增益0→+6dB則增加6.033dB。這些是兩組已知合成訊號的接線觀察，不是廣泛品質誤差界線或聲學延遲。

停止／重啟後勾選原生降噪，getSettings回報noiseSuppression=true、echoCancellation=false、autoGainControl=false；畫面對應顯示實際開／關。兩輪停止後全部tracks ended，雙電平回到數值底限。是否確實改善真實背景噪音、是否損傷歌聲、對未來音準的影響仍待真人操作與品質驗證，不由開關回報推論。

高通Q依[Web Audio規範](https://webaudio.github.io/web-audio-api/#dom-biquadfilternode-q)使用dB單位，將Butterworth的線性Q換算為約−3.0103dB；初始未換算版本的兩份收據留本機，不回填為最終程式驗證。最新本機收據為input-settings-440-report.json／input-settings-55-report.json，深淺色及窄窗也保留；不發布使用者裝置id或原始音訊。

## 不同麥克風的門檻政策參考（2026-10-30）

使用者指出不同Mic／前級／VM增益使固定門檻無法通用。本輪查核官方資料：

- [Discord Voice Input Modes](https://support.discord.com/hc/en-us/articles/211376518-Voice-Input-Modes-101-Push-to-Talk-Voice-Activated)：自動／手動靈敏度分開，手動門檻落在噪音與最輕聲之間；背景噪聲或音量變動可使自動模式失準、切掉句尾。官方沒有公開完整自動演算法，不能把其效果或延遲當作本案依據。
- [Discord Krisp FAQ](https://support.discord.com/hc/en-us/articles/360040843952-Krisp-FAQ)：機器學習降噪是獨立處理；安靜環境與高品質Mic可能不需開啟，處理可能降低聲音品質。不是單純拉高輸入門檻。
- [OBS Noise Gate](https://obsproject.com/kb/noise-gate-filter)：開／關門檻及attack／hold／release分開；[Expander](https://obsproject.com/kb/expander-filter)則以比例漸弱低音量訊號，能較平順開關。這些是音訊處理，本案僅畫面投影，不能直接移植其絕對預設或聲稱已實作gate。
- [Zoom professional audio](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059985)：音樂模式與一般噪音處理分開，保留原音可能需移除部分濾波。本案NS／AEC／AGC仍預設off，不因語音聊天慣例自動開啟。

工程決策：-55dBFS標為未校準起始值；沿現有安靜＋連續最輕常用音量量測，在同條件取得P95／P10，提出本次輸入畫面門檻。雙側各3dB、總間距至少6dB為本專案研究政策，非來源公布參數，也非跨裝置真實聲學驗證。只有明確套用才改門檻；比較結果隨configure清除，失敗不退回假稱正確的自動值。不加入NS模型、語音VAD、音準偵測或音訊gate。未來若做分析活動狀態，開／關遲滯與尾音保留應另作行為與歌唱驗證，不能用目前threshold投影直接冒稱人聲。

## 常見語音通訊軟體的預設與量化參數調查（2026-10-30）

本節回應使用者要求的跨軟體設定值比較，不修改 Utawakui 產品參數。查核官方支援文件、官方 SDK 及版本固定開源程式；未公開代表本次查閱的官方資料未提供數值，不用網路教學的推薦值或使用者截圖冒充出廠預設。

### 通訊產品的公開設定

| 軟體／範圍             | 可確認的預設與選項                                                     | dB、底噪與濾波數值的公開程度                                                                                             |
| ---------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Discord 桌面／網頁 App | 支援自動／手動輸入靈敏度；Krisp 為另一項降噪功能                       | 官方使用說明未提供可核對的全平台固定門檻、Krisp 抑制 dB、低切 Hz 或完整 AGC 常數；不能把 SDK 值或教學推薦值當 App 出廠值 |
| Zoom 桌面              | Noise removal；背景降噪 Auto 預設，另有 Low／Medium／High              | 官方未提供各級對應的固定抑制 dB、VAD 門檻或低切 Hz；Auto 是動態模式                                                      |
| Microsoft Teams        | 桌面降噪預設開啟；官方目前 iOS 文件列 Auto 預設、Low／High             | 不把 iOS 模式清單當所有桌面版本 UI；未提供固定 dB 門檻、各級抑制 dB、低切 Hz                                             |
| Google Meet            | 多數列明商務方案降噪預設開啟，教育方案預設關閉；依方案／裝置而異       | 無共通原廠 dB 門檻；支援文件未提供抑制 dB 或低切 Hz                                                                      |
| Slack Huddles          | 有 AGC 與 Noise suppression 選項                                       | 查到的官方文件未明載兩者統一出廠開關，也未提供固定門檻、AGC 目標或降噪 dB                                                |
| Webex App              | Noise removal 預設；另有 Optimize for my voice／all voices、Music mode | 官方未提供固定底噪、VAD 門檻、抑制 dB 或低切 Hz                                                                          |

來源：[Discord 輸入模式](https://support.discord.com/hc/en-us/articles/211376518-Voice-Input-Modes-101-Push-to-Talk-Voice-Activated)、[Discord Krisp](https://support.discord.com/hc/en-us/articles/360040843952-Krisp-FAQ)、[Zoom](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0059985)、[Teams](https://support.microsoft.com/en-au/teams/meetings/reduce-background-noise-in-microsoft-teams-meetings)、[Meet](https://support.google.com/meet/answer/9919960?hl=en)、[Slack](https://slack.com/intl/en-gb/help/articles/1500002037922-Adjust-your-huddles-preferences)、[Webex](https://help.webex.com/en-us/article/yrsw3l/Webex-App-%257C-Remove-background-noise-and-speech-in-calls-and-meetings)。

### Discord 官方 Social SDK：不能與 App 預設混用

| 項目                        | 官方預設／範圍                                     | 用途／限制                                                                                |
| --------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| VAD 手動 threshold          | -60；範圍 -100 至 0                                | 活動偵測；該 API 條目未明載 dBFS 參考與 RMS／peak 量測方式，不補寫為 SPL，也不當 App 預設 |
| No-audio-input threshold    | -100 dBFS，表示偵測停用                            | 輸入故障／靜音提示；官方示例 -60 dBFS 是啟用示例，不是出廠值                              |
| Noise suppression／AEC／AGC | 預設全部開啟                                       | SDK 的 WebRTC 處理；不能據此斷言所有 Discord App profile 相同                             |
| Krisp cancellation          | 預設關閉；開啟會關閉基本 suppression               | SDK 選項，不是 App 的已驗出廠選項                                                         |
| PTT release delay           | 預設 0 ms；官方建議 20 ms，並稱 Discord 使用 20 ms | 這是放開按鍵後延時，不是 VAD release 或端到端延遲                                         |
| Input volume                | 範圍 0–100，perceptual loudness                    | 百分比不是線性 gain 或固定 dB；該條目未載統一初始百分比                                   |

來源：[Call API](https://discord.com/developers/docs/social-sdk/classdiscordpp_1_1Call.html)、[Client API](https://discord.com/developers/docs/social-sdk/classdiscordpp_1_1Client.html)、[官方 voice guide](https://github.com/discord/discord-api-docs/blob/main/developers/discord-social-sdk/development-guides/managing-voice-chat.mdx)。

### Mumble 1.5.857：程式初始化常數

固定 tag 的 [Settings.h](https://raw.githubusercontent.com/mumble-voip/mumble/v1.5.857/src/mumble/Settings.h) 顯示預設 Speex、降噪強度 -30、voice hold 20 frames（200 ms），Amplitude VAD min 0.80／max 0.98，iMinLoudness 1000。這是未套用個人設定時的初始化值，不宣稱經安裝／設定精靈後仍相同。

[AudioInput.cpp](https://raw.githubusercontent.com/mumble-voip/mumble/v1.5.857/src/mumble/AudioInput.cpp) 將 VAD level 定義為 `1 + dPeakCleanMic / 96`；因此由初始化常數推算，開啟參考 -1.92 dBFS、保持參考 -19.2 dBFS。這不是 98%／80% PCM 振幅，也不建議拿此未校準常數作他案預設。clean mic 使用處理後 RMS 扣除 AGC gain，與本案分析後 RMS 的路徑不同。

同一來源以 `floor(20 * log10(30000 / iMinLoudness))` 設 AGC 最大增益；代入 1000 為 29 dB。-30 降噪設定還會依當前 AGC gain 修正送入 Speex 的值，不能把設定強度當成實測的全頻降噪量。

### OBS 新增濾波器的預設：工程對照，不是通訊 App 出廠值

| 濾波器            | 官方列出的預設                                                                  | 補充                                                                |
| ----------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Noise Gate        | 開 -26 dB、關 -32 dB；Attack 25 ms、Hold 200 ms、Release 150 ms                 | 開關差 6 dB 是這個濾波器的遲滯，不是「語音高於底噪 6 dB」的品質保證 |
| Expander          | Threshold -40 dB；Ratio 2:1；Attack 10 ms；Release 50 ms；Output gain 0 dB；RMS | 官方建議 attack 5–10 ms／release 50–120 ms 是建議範圍，與預設欄分開 |
| Noise Suppression | Method RNNoise；Speex 模式強度 -30 dB                                           | -30 dB 只屬 Speex 參數；RNNoise 不使用同一強度滑桿                  |

來源：[Gate](https://obsproject.com/kb/noise-gate-filter)、[Expander](https://obsproject.com/kb/expander-filter)、[Suppression](https://obsproject.com/kb/noise-suppression-filter)。這些是新增該濾波器的預設，不表示 OBS 的所有 Mic 都預先掛載它們。

### WebRTC：底層套件參數，不代表各 App 最終設定

查核日 main 的 [APM header](https://webrtc.googlesource.com/src/+/refs/heads/main/api/audio/audio_processing.h) blob 為 a4f3f52fe133d4c1b14b76f1b03d3b87a711d19a。NS／AEC／AGC／HPF 結構預設 disabled，與整合它的產品可預設開啟不矛盾。

| 元件          | 初始化參數                                                                                      | 解讀                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| NS            | APM level Moderate；底層 NsConfig target 12 dB                                                  | NS 本身未啟用時不處理音訊                                                      |
| AGC1          | target_level_dbfs 3（即目標 -3 dBFS）；compression gain 9 dB；limiter true                      | 目標 peak／envelope，不是要把所有樣本或 RMS 推到 -3 dBFS                       |
| AGC2 adaptive | headroom 5 dB；max gain 50 dB；initial gain 15 dB；max change 6 dB/s；max output noise -50 dBFS | 這些控制器初始化仍未啟用；-50 是輸出噪聲約束，不是輸入 gate 門檻或實際房間底噪 |
| AGC2 fixed    | 0 dB                                                                                            | 固定數位增益初始化值                                                           |

[NS config](https://webrtc.googlesource.com/src/+/refs/heads/main/modules/audio_processing/ns/ns_config.h) 的等級為 6／12／18／21 dB，預設 12；[suppression parameters](https://webrtc.googlesource.com/src/+/refs/heads/main/modules/audio_processing/ns/suppression_params.cc) 對應最小 gain 0.5／0.25／0.125／0.09，約 -6.02／-12.04／-18.06／-20.92 dB。這是演算法設定與增益界線，不保證任意背景噪音都實測下降同樣 dB。

[高通原始碼](https://webrtc.googlesource.com/src/+/refs/heads/main/modules/audio_processing/high_pass_filter.cc) 以 16／32／48 kHz 對應係數，並非提供使用者共通的 80／120 Hz 下拉預設。本調查不從產品名稱推定其低切 Hz。

### 對 Utawakui 現有數字的證據評估

- 未找到通訊產品一致採用 -55 dBFS 的依據；本案值不能稱業界標準或已證明最佳預設。
- 本案 3 dB 雙側保護及 P95／P10 是專案研究政策；OBS 的 6 dB 開關差屬不同參數，不能當成本案品質驗證。
- 語音通訊常見有動態降噪、AGC、回音處理；「本機歌唱分析預設關閉」是本案保留可比性的設計選擇，不代表符合多數通訊軟體原廠預設。
- 底噪是要量測的輸入／處理後噪聲，不是每套軟體有一個固定可填的底噪值。dBFS 是數位滿刻度參考，dB 是差值，dB SPL 是實體聲壓；沒有校準不能換算。不同 RMS／peak、窗長、AGC 前後的相同門檻數字不可直接比較。
- 這輪沒有修改產品程式、設定或提交；沒有真人 Mic 測試，也沒有以既有測試通過來代替外部預設值查核。

## Discord／OBS 參照吸收規格（2026-10-30，原提案）

此節保留 R02 實作前的研究規格；後續開發版已依[活動契約](../../contracts/microphone-level-research.md#輸入活動與雙門檻)落實，正式產品與聲學品質仍未驗收。使用者希望吸收 Discord／OBS 的設定模式；保留歌唱分析用途、耳機聆聽、明選輸入、不監聽／錄音／改 VM／OBS 路由的既有邊界。

### 採用範圍

| 來源           | 吸收內容                                       | 不直接移植的內容                                                                    |
| -------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| Discord App    | 即時電平、門檻位置可見、校準建議／手動兩種操作 | 未公開的自動靈敏度演算法；SDK -60 不冒稱桌面 App 預設；語音聊天模式不當歌唱音準判斷 |
| OBS Noise Gate | 開／關雙門檻與分開的啟動、保持、退場時間       | -26／-32 dB 不直接作所有 Mic 的絕對門檻；不把音訊 gate 變成必開音訊處理             |
| OBS 濾波器模型 | 輸入增益、低切、降噪、活動判定分開             | RNNoise／Speex／Krisp 不是同一強度刻度；不把設定抑制量當成實測底噪                  |

[Discord 官方輸入模式](https://support.discord.com/hc/en-us/articles/211376518-Voice-Input-Modes-101-Push-to-Talk-Voice-Activated) 支持可見門檻與手動調整的操作參照；[OBS Gate](https://obsproject.com/kb/noise-gate-filter) 公開開／關 -26／-32 dB、Attack／Hold／Release 25／200／150 ms。只借用已公開可核對的設計與數值，不主張重製演算法或相同聲學效果。

### 新增活動投影，保留電平原義

現有 RMS dBFS、裝置回傳／分析後 meter 仍直接反映各自取樣路徑。另加本機「輸入活動」投影，輸出狀態與 0–1 畫面包絡；不截斷 PCM、不修改音訊圖、不作人聲或音準識別。原本的數值快照不能因保持時間而偽造為仍有同樣音量。

| 研究起點                 | 候選值／規則               | 本案明確語意                                                                                                           |
| ------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 操作模式                 | 校準建議／手動；首次未校準 | 未校準時仍顯示真實電平，活動投影不冒稱有效；不自動開啟裝置                                                             |
| 開啟／關閉門檻           | 校準取得，開啟高於關閉     | 只有超過開啟門檻才開始確認；已啟動後以較低的關閉門檻延續                                                               |
| 開關間距                 | 6 dB 候選                  | 參照 OBS 公開預設差值；不是噪聲與人聲能分離的驗證證據                                                                  |
| 啟動確認                 | 25 ms 候選                 | 連續高於開啟門檻才進入 active，短脈衝中斷即重置確認。這是本案活動偵測語意；OBS Attack 是開門／增益過渡時間，兩者不等同 |
| 保持                     | 200 ms 候選                | 低於關閉門檻後等待；回到關閉門檻以上即取消關閉，避免邊界閃爍                                                           |
| 退場                     | 150 ms 候選                | 保持完畢後僅讓畫面包絡退到零；不修改真實 meter／PCM，亦非音準輸入延遲                                                  |
| 增益／低切／NS／AEC／AGC | 既有 0 dB／全部關閉維持    | 仍屬本案分析用途選擇，沒有稱為 Discord 或 OBS 的共通預設                                                               |

時間取單調時鐘經過量，不以每個 frame 累加固定 33ms。現有約 33ms 輪詢表示 25ms 邊界只能在下一有效樣本確認，不能宣稱 25ms 實測反應或端到端延遲；首筆超門檻樣本之前不推算未知發聲起點。失訊、暫停、隱藏與長取樣間隙的既有清理／取消語意優先於保持、退場。

### 雙門檻校準候選與限制

取安靜 P95 為 N、連續最輕常用音量 P10 為 S。沿用「上下各留 3dB」作專案研究保護距離，但新增 6dB 遲滯要求後，雙門檻必須同時滿足：

- 關閉門檻至少 N + 3dB。
- 開啟門檻至多 S - 3dB。
- 開啟門檻減關閉門檻為 6dB。
- 兩者皆在受支援 -90 至 -10dBFS 範圍，使用整數 dB。

因此至少需要 12dB 的參考分離才能滿足這組雙門檻候選；12 = 3 + 6 + 3 是這套研究政策的幾何限制，不是 Discord／OBS 公布的人聲品質門檻。選開啟值時，在合法整數區間內取最接近 N／S 中點者，關閉值為開啟減 6；無合法區間則拒絕提出雙門檻，不暗中降低保護距離。

例如 N=-65、S=-35dBFS，可提案開啟 -50、關閉 -56dBFS。N=-60、S=-51dBFS 的 9dB 差距不符合這個雙門檻方案，應提示改善輸入或手動調整，不把背景推定為語音。現有單門檻 helper 的 6dB 最小差距不是這個尚未實作的雙門檻規則，不能直接沿用後宣稱已滿足。

校準過程不自動調整增益或 NS／AEC／AGC；裝置／格式／處理／前級或距離條件變動後重測。套用必須是操作者明確動作。現有缺樣本、條件不同、AGC 開啟、數位靜音、接近削波、分布重疊與超界拒絕條件保留。手動模式顯示未校準並檢查門檻順序，不把手動值顯示為建議已驗證。

### 實作前固定的驗證案例

| 案例                                      | 預期                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 安靜／低於開啟門檻／25ms 內短脈衝         | 不啟動；短脈衝不得累積成連續啟動時間                                                             |
| 持續超過開啟門檻                          | 第一筆超門檻樣本後，累積到確認時間的有效樣本才轉 active；不預測未知起點                          |
| 開關門檻之間抖動                          | inactive 不啟動；已 active 不關閉                                                                |
| 低於關閉門檻不足 200ms 又回升             | 保持 active，取消關閉計時                                                                        |
| 持續低於關閉門檻                          | Hold 完成後僅畫面包絡以 150ms 退場，原始 meter 仍如實更新                                        |
| 退場途中再超開啟門檻                      | 按確認規則重新啟動，不沿用過期的計時世代                                                         |
| 變動取樣間隔／停止／失訊／隱藏／晚到回覆  | 不用固定 frame 次數近似時間；失效事件直接重設活動狀態，舊樣本不得復活                            |
| 校準 30dB、12dB、9dB 分離／超界／增益改變 | 前兩者只在有效整數區間內提案；9dB 無雙門檻候選；超界或條件變動拒絕／失效                         |
| 已知長音、輕聲尾音、鍵盤／風扇、伴奏串音  | 合成先驗接線與邊界；再由使用者於同一路徑手動驗收。不能把數值 gate 成功等同人聲辨識或尾音品質通過 |

首次實作仍限定開發版分析原型；正式 Mic／音準／Output 是否採用由既有研究門檻決定。此段為實作前的範圍約束，後續實作證據另列，不據此宣稱已驗收。

## Discord／OBS 活動投影實作驗證（2026-10-30）

已將上節原提案落實於開發版原型，現行行為由[活動與雙門檻契約](../../contracts/microphone-level-research.md#輸入活動與雙門檻)持有；不是正式 Mic／音準／OBS 採用驗收。

- 新活動 owner 與既有 RMS／相對電平獨立；25ms 連續確認、200ms 保持、150ms 線性退場，開關遲滯；未校準不啟用，手動明示未校準。gap、時間倒退／無效值、停止／失訊／隱藏重設；不改 PCM／Analyser graph。
- 雙門檻以同條件安靜 P95／連續輕聲 P10 提案，兩側各 3dB 加 6dB 遲滯需至少 12dB 差；設定與實際格式／增益／裝置失效規則已實作。同格式正常停止重啟保留本次校準；外部距離／前級變動仍需人工重測。
- 56 項相關測試通過。活動 owner 單獨 coverage 行 100%、分支 92.85%；另 scoped runtime／calibration／量測 coordinator coverage 行 96.72%、分支 89.56%。獨立 code review 指出「候選恰等初始門檻未清舊結果」與「舊超門檻計數混淆」兩項，已補同 -55／-61 真 measurement／recommend 回歸、成功 coordinator 明確清除，表格僅顯示摘要／筆數且相對電平另名；複核兩項 resolved／SHIP。
- 可見隔離 Electron、真 Folder／元件與合成 WAV（低幅 15 秒、高幅 15 秒、低幅 10 秒）實跑，安靜約 -67.4、較高幅約 -27.5dBFS，建議及實際開／關 -47／-53，舊相對電平仍 -55。167 個數值觀察依序見確認／活動／保持／退場／等待；保持時真 RMS 已低於 -60 但活動包絡仍 1，退場有 0–1 中間值。gain 改變撤校準、手動啟用、Stop 包絡 0、所有 tracks ended、650px 各 viewport 無橫向溢出。
- 首次 native 測試在 running 與第一筆樣本之間發現 activity 暫留 idle；修為啟動同次 publish 正確狀態後重跑通過。舊失敗保留為 tasks/r02-mic/activity-start-phase-attempt.json，最終 tasks/r02-mic/activity-report.json／activity-launcher-report.json exit0。合成數值不是人聲／尾音品質、實體噪聲誤觸率或聲學延遲證明，沒有擷取真人 Mic、沒有變更 VM／OBS。
- 八張當前明暗／窄窗／校準／manual captures 經 fresh finish reviewer SHIP 於新增操作區；documenter 核對契約／架構與實作一致，沿用 DESIGN／design.json。一次 detector 空結果、完整 ESLint／240MD／build、Mic 範圍 Prettier 與 diff 通過。整庫 format 檢查另有並行 demo 檔格式警告，未修改該任務檔案，不宣稱整庫 format 已通過。

沒有新依賴／Main／preload／packaging 邊界改動，無錄音、監聽、輸出、真 Mic 自動測試或新 commit。人工可從 F5 → Evaluation → Mic Level R02 依序量測安靜與連續輕聲，再明確套用活動雙門檻；以歌唱／噪聲實際結果決定是否調整研究值。
