# Mic 輸入與電平研究

本契約限定 R02 的開發版內部原型。產品現況由 [spec](../spec.md#73-研究候選尚未接受為開發路線) 持有；研究目的及後續音準階段見[播放器／排練規畫](../research/product/player-practice-planning-2026-10-26.md#7-mic-電平驅動畫面研究方案)。不代表正式 Mic 功能或實機品質驗收完成。

## 入口與權限

- 開發版按 F5／F6／F7 進入內部工具，再選 Evaluation → Mic Level R02。沒有新增快捷鍵或正式 Settings 入口；原型 renderer 只在 `import.meta.env.DEV` 分支載入。
- `microphoneResearchAccess.js` 持有開發限定的短期授權。兩個固定 IPC 為 `microphone-research:begin` 與 `microphone-research:end`；沿既有 Main sender／main frame policy，不接收路徑、來源 URL 或音訊。
- begin 產生 Main-owned lease id，有效 30 秒，只綁定目前主視窗與文件 URL。導覽（包含相同 URL reload）、renderer 結束／crash 使 lease 失效；舊 lease 的 end 不能撤銷新 lease。
- `audioOutputPermissions.js` 的兩個權限 hook 同時驗主 frame、目前文件與 lease。request 僅接受單一 `mediaTypes: ['audio']`，check 僅接受 `mediaType: 'audio'`；缺省、未知、video、混合請求及其他視窗一律拒絕。既有 speaker／font 規則不變。
- 正式 Main 不註冊研究 IPC，正式 preload 不暴露研究方法，Mic 權限預設拒絕。編譯入 Main 的 policy 不代表正式啟用。

## 輸入生命週期

`useMicrophoneResearch` 是介面作用域的狀態橋接；`src/microphone/researchRuntime.js` 擁有單一 stream、AudioContext、計時器與事件。建立／掛載工具不列舉、不呼叫 getUserMedia，不保存裝置或啟用偏好。

讀取裝置是明確操作，臨時取得 lease 後列舉 `audioinput`；排除 default／communications 的動態角色，只列最多 64 個、id 不超過 512 字元的具體輸入，名稱顯示最多 200 字元。未選擇裝置不能開始；選擇不自動啟動。列舉完成／失敗均釋放 lease，過期回覆不覆蓋新狀態。

開始另取 lease，以 `deviceId.exact`、`video: false` 要求所選輸入；單聲道為偏好值。自動增益、降噪及回音消除預設關閉，可於停止時明選，啟動時固定該次 requested options。以 getSupportedConstraints 確認環境支援，再以 track.getSettings 顯示實際回報；要求值不當成生效證據，未回報或未按要求套用分開提示。返回後須恰有一條 live、非 muted 的 audio track，且實際 deviceId 相符；不符即停止，不使用替代裝置。啟動總等待上限 15 秒，逾時釋放授權；getUserMedia 無原生取消，任何晚回串流仍立即 stop。

分析使用獨立 AudioContext。`inputProcessing.js` 擁有 MediaStreamSource → 裝置回傳 Analyser 支線，以及可選高通 → Gain → 分析後 Analyser；沒有連接 destination、MediaRecorder、播放器、BGM capture 或 Output。部分建圖失敗亦斷開已建立節點，停止時由 runtime 釋放 stream／context。AudioContext 成功 resume 後才標示 running；不新增播放時鐘或混音權威。

停止、換裝置、離開工具、pagehide、track mute／ended、裝置消失與 running context 中斷均取消計時器、移除事件、斷開節點、停止 tracks、關閉 context 並歸零。失訊保留可供確認的選擇，不自動切換、重啟或重連。舊請求的成功、失敗與 finally 不能影響新 session。裝置變動讀取失敗也停止分析；未改變曲庫、播放或 OBS。

## 電平與控制

`MicrophoneInputSettings` 只供 Utawakui 本機電平及未來音準分析入口，不改 Windows／VM 音量，也不提供處理後的人聲給 OBS。設定留本次工具作用域，不保存機器偏好、不啟用監聽。

- 數位分析增益範圍 −24 至 +24 dB，預設 0；可在 running 時以 GainNode 的 10ms target 平滑調整，啟動中與量測窗口則鎖定。提高增益也提高底噪，不能復原已由前級削波的訊號。
- 低切為關閉／80／120／180Hz，預設關閉；先停止再設定，重新開始套用二階高通。高通 Q 使用 `20 * log10(1 / sqrt(2))` dB，避免把 Web Audio 高通的 Q 當線性值。此濾波會改變低頻內容，不代表已驗證歌唱或音準品質。
- 降噪、回音消除及自動增益均為明確 boolean 選項、預設關閉，只能在停止時調整。未確認支援時停用入口；實際回報與要求不符或未知，不顯示為已套用。環境支援 constraint 不代表每個裝置都會照要求處理。
- 裝置回傳電平在本機低切／增益之前，但在 Chromium／裝置的可選輸入處理之後，不是 ADC 原始量測。分析後電平、歷史圖與量測摘要包含本機低切／增益；兩條 sample peak 提示分開顯示。
- 相對電平門檻、靈敏度與平滑只改舊 0–1 電平投影，不是音訊降噪或 gate。輸入 options（包含停止時的待用選項）或實際設定改變，即清除各步比較；不把不同處理條件的結果混在一起。

- `level.js` 由短暫 PCM buffer 計算 RMS dBFS 與 sample peak；靜音數值底為 −100 dBFS，介面顯示 −∞。非有限樣本回到基準。`peak >= 0.999` 顯示接近削波，不宣稱 true peak、聲壓、聲音品質或演唱者識別。
- Analyser 的窗口為 2048 samples，每 33ms 輪詢一次，非 sample-accurate 排程。這些常數不是量得的輸入到畫面延遲。
- 相對電平門檻 −90 至 −10 dBFS，起始值 −55，未代表適用所有裝置；靈敏度 0.25 至 4，預設 1；平滑 0 至 1000ms，預設 150。所有值有界、只留工具 session，不修改音訊。低於門檻強度立即回零，其他值依實際取樣間隔作指數平滑，再限制於 0–1。

## 輸入活動與雙門檻

`activity.js` 擁有純數值活動投影，`researchRuntime.js` 隨同一 stream 輪詢它；不 gate PCM、不修改 Analyser 或 RMS 數值，不辨識人聲或音準。原本 `level.js` 的相對電平投影保留並分開命名，校準不改其 -55 起始值；活動包絡則為 active／holding 時 1、release 時退到 0。量測表只顯示 dBFS 摘要與筆數，不把舊相對電平的超門檻計數冒稱活動判斷。

預設模式為校準建議，未套用時只顯示電平、活動狀態為未校準。手動模式可明確啟用未校準門檻，起始開啟 -55／關閉 -61dBFS；兩者各有 -90 至 -10 範圍且開啟必須大於關閉，不接受反序。校準模式不接受手動寫門檻，必須經候選重新計算與條件比對。

| 控制     | 預設／範圍      | 語意                                                          |
| -------- | --------------- | ------------------------------------------------------------- |
| 啟動確認 | 25ms／0–500ms   | 第一筆嚴格超過開啟值後連續滿足才 active；短脈衝中斷重算       |
| 保持     | 200ms／0–2000ms | active 後低於或等於關閉值才開始等待；回到關閉值以上即取消關閉 |
| 退場     | 150ms／0–2000ms | 保持完畢後畫面包絡線性退至零；退場中超過開啟值需重新確認      |

時間用單調時鐘差值，不按固定 frame 累加。33ms 輪詢只能在下一筆有效樣本確認 25ms，不能宣稱 25ms 實測延遲；非有限值、倒退／重複時間、超過 500ms 取樣間隙重設，不用舊時間跳成 active。停止／失訊清成 idle；隱藏時 activity 暫停並歸零，返回後從新樣本確認，另沿既有 owner 取消量測。正常校準與同一裝置／格式的單純停止重啟可保留校準門檻；換裝置、輸入處理或實際格式變更會撤銷校準。外部前級／距離變化無法自動偵知，仍須重測。

## 本次輸入的門檻建議

`calibration.js` 依完整安靜／連續輕聲摘要提出雙門檻：安靜 P95 為 N，輕聲 P10 為 S；要求相同明選裝置及 controls／inputOptions／activityOptions／實際格式，各至少 80 筆。裝置身分與摘要只在本次工具記憶體，不新增錄音或偏好保存。

`recommendMicrophoneActivityThresholds` 要求關閉值至少 N+3、開啟值至多 S-3，開關差 6dB，因此需至少 12dB 參考差。合法開啟整數區間為 max(-84, ceil(N+9)) 至 min(-10, floor(S-3))，在區間內取最靠近 N／S 中點者，關閉為開啟減 6；沒有合法值則拒絕。原純單門檻 helper 仍可計算其原本 6dB 差距政策，但不再是介面套用入口。25／200／150ms 與 6dB 差參照 OBS 公開設定；3dB 保護、百分位與 12dB 條件是本專案研究政策，不是 Discord 演算法或已證實歌唱預設。P10／P95 不保證尾音 coverage，使用者需持續以最輕常用音量發聲。

缺結果、無效摘要、條件不同、原生 AGC 要求或回報開啟、接近數位靜音、裝置回傳或分析後接近削波、間距不足及超界均拒絕；數位靜音不能反推實體底噪。未回報的裝置內建處理仍是限制。

`MicrophoneThresholdCalibration` 分開顯示目前雙門檻與建議；running 且非量測中才可套用。即使建議等於初始門檻，第一次成功套用仍會標示本次已校準。runtime 先重算候選並核對當前完整條件，`useMicrophoneMeasurement.applyCalibration` 只在成功後明確清除舊比較，相同數值也清，拒絕則保留。活動設定改變也讓比較失效；正在量測時鎖定模式、門檻與時間。所有活動設定只在本次工具保留，不自動改增益、NS／AEC／AGC。

`MicrophoneLevelHistory` 沿唯一 100ms 量測觀察排程呈現最近 10 秒、最多 120 筆的真實分析後 dBFS，固定 -100 至 0 刻度；活動已啟用才畫開啟／關閉雙虛線，未校準顯示門檻未啟用。無 PCM 波形或頻率推論，停止清空。高頻 meter 與包絡不設 live region；狀態／錯誤用既有 Chip／Hint，操作沿 shared controls 與語意 tokens。

- 原始音訊不保存、不跨 IPC、不發布；裝置名稱／id 不進公開錯誤或對外研究報告，裝置 id 僅在本次工具記憶體用來比對量測條件。錯誤沿既有有界診斷；公共訊息不含原生例外內容。

## 驗收與後續門檻

`MicrophoneMeasurementPanel` 提供安靜、發聲、伴奏與混合四個由操作者明選的情境，每步必須按開始，先顯示 3 秒倒數，再量 10 秒。情境是操作指示，不是自動識別聲音真值；不控制播放器、VM 或 OBS。倒數／量測期間鎖定情境與三個調整值，保留本步取消與全域停止輸入；主動按鈕沿同一 DOM 節點更新標籤，避免完成時丟失焦點。

`useMicrophoneMeasurement` 持有唯一 100ms 觀察排程，`measurement.js` 持有窗口、數值歷史及分情境摘要。一般 meter 更新不額外計數。只有當前輸入 running 且裝置已明選才可開始；首筆落後預定起點超過 500ms、後續間隔超過 500ms、無效數值或快照少於 80 筆，不保存這次結果。取消、失訊、視窗隱藏或離開工具也取消當前窗口，保留先前完成結果；返回不自動重開量測。

裝置、controls、inputOptions 或有效輸入格式變更會清除各步比較結果，包含停止後調整；單純停止造成 settings 為空則保留已完成摘要。重測只有完整完成後才替換該步結果。摘要含快照數、nearest-rank 第 10 百分位／中位數／第 95 百分位、最高 dBFS、嚴格超過當次門檻的筆數、相對強度大於零與裝置回傳或分析後近削波提示快照數；均留本次工具記憶體。顯示完成／進度對應目前所選情境，不沿用上一情境的完成狀態。快照不是獨立聲學窗口、語音 coverage、削波時長、評分或延遲，介面不自動修改門檻。

自動化分別驗權限預設拒絕、短 lease／舊 end、導覽／crash、正式 preload 隔離、精確裝置、晚到請求、停止／失訊／清理、RMS／峰值／門檻／平滑。Electron 合成輸入可證明實際 API 接線及資源釋放，不能替代真 Mic 聲學與負載證據。

正式採用或接 Output 前仍須以使用者明確選定的實體輸入，量測安靜、噪聲、伴奏串音、輕／強唱、削波、USB 中斷／重插、Windows 權限變更，及同時播放／切歌／BGM／OBS 的 CPU、記憶體、音訊中斷與輸入到畫面延遲分布。先固定測試裝置、驅動、sample rate、處理回報與取樣方法，再決定品質預算；未量測不填通過。

R03 音準、可信參考旋律、Key／tempo 與時間校準另行研究；人聲監聽、錄音、自動 BGM ducking、評分／排行與 Output transport 不隨本切片納入。
