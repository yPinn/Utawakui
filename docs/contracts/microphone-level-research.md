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

開始另取 lease，以 `deviceId.exact`、`video: false` 要求所選輸入；單聲道為偏好值。請求關閉自動增益、降噪及回音消除，實際回報值另顯示；要求值不當成生效證據。返回後須恰有一條 live、非 muted 的 audio track，且實際 deviceId 相符；不符即停止，不使用替代裝置。啟動總等待上限 15 秒，逾時釋放授權；getUserMedia 無原生取消，任何晚回串流仍立即 stop。

分析使用獨立 AudioContext 的 MediaStreamSource → AnalyserNode，沒有連接 destination、MediaRecorder、播放器、BGM capture 或 Output。AudioContext 成功 resume 後才標示 running；不新增播放時鐘或混音權威。

停止、換裝置、離開工具、pagehide、track mute／ended、裝置消失與 running context 中斷均取消計時器、移除事件、斷開節點、停止 tracks、關閉 context 並歸零。失訊保留可供確認的選擇，不自動切換、重啟或重連。舊請求的成功、失敗與 finally 不能影響新 session。裝置變動讀取失敗也停止分析；未改變曲庫、播放或 OBS。

## 電平與控制

- `level.js` 由短暫 PCM buffer 計算 RMS dBFS 與 sample peak；靜音數值底為 −100 dBFS，介面顯示 −∞。非有限樣本回到基準。`peak >= 0.999` 顯示接近削波，不宣稱 true peak、聲壓、聲音品質或演唱者識別。
- Analyser 的窗口為 2048 samples，每 33ms 輪詢一次，非 sample-accurate 排程。這些常數不是量得的輸入到畫面延遲。
- 噪聲門檻 −90 至 −10 dBFS，預設 −55；靈敏度 0.25 至 4，預設 1；平滑 0 至 1000ms，預設 150。所有值有界、只留工具 session，不修改音訊。低於門檻強度立即回零，其他值依實際取樣間隔作指數平滑，再限制於 0–1。
- 本輪只呈現量測 meter 與相對強度。沒有閃爍、位移、持續 CSS 動畫或額外裝飾；數值更新不透過 live region 朗讀。狀態／錯誤使用既有 Chip／Hint，操作沿 Button／Select／Range 與語意 tokens。
- 原始音訊不保存、不跨 IPC、不發布；裝置名稱／id 不進公開錯誤與研究摘要。錯誤沿既有有界診斷；公共訊息不含原生例外內容。

## 驗收與後續門檻

自動化分別驗權限預設拒絕、短 lease／舊 end、導覽／crash、正式 preload 隔離、精確裝置、晚到請求、停止／失訊／清理、RMS／峰值／門檻／平滑。Electron 合成輸入可證明實際 API 接線及資源釋放，不能替代真 Mic 聲學與負載證據。

正式採用或接 Output 前仍須以使用者明確選定的實體輸入，量測安靜、噪聲、伴奏串音、輕／強唱、削波、USB 中斷／重插、Windows 權限變更，及同時播放／切歌／BGM／OBS 的 CPU、記憶體、音訊中斷與輸入到畫面延遲分布。先固定測試裝置、驅動、sample rate、處理回報與取樣方法，再決定品質預算；未量測不填通過。

R03 音準、可信參考旋律、Key／tempo 與時間校準另行研究；人聲監聽、錄音、自動 BGM ducking、評分／排行與 Output transport 不隨本切片納入。
