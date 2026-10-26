# 播放器音訊設定套用

本契約定義逐曲設定的第一個程式前置：要求值、DSP 結果與播放交接；產品現況見 [spec](../spec.md)。逐曲保存、來源綁定與操作介面仍見[行為提案](../research/product/track-performance-preferences-detail-2026-10-26.md)。

## Owner 與範圍

`usePlayer.js` 持有 audio element、開始 revision 與唯一 BGM pre-start hook；`player/usePlayerAudioStart.js` 執行取得交接後的準備／play／錯誤與取消交易，不持有第二個 clock。`player/usePlayerAudioGraph.js` 持有 monitor／capture 路徑及 DSP。`utils/audioControlApplication.js` 只持有一次套用的 revision、取消、期限與結果，不持有播放時間、裝置偏好或第二個播放器。

`applyAudioControls()` 接收完整四欄快照：`transposeSemitones`（-12～12 整數）、`pitchCents`（-50～50 整數）、`tempoRate`（0.5～1.5、0.05 步階）、`monitorGuideVocalEnabled`（Boolean）。缺欄、額外欄位、錯誤型別、非有限值、越界及非法步階直接回 `invalid`，不改控制或暫停。

合法批次是明確的暫停並套用命令，成功後保持 paused、位置不變。原本的單欄 live setters 仍可在播放中使用；監聽導唱的開關先立即操作 gain，不等候 pitch 資源。粗調／微調仍合成一次 `semitones`，速度由原 audio element 設定。Master／capture 音量、mute、導唱比例、擷取導唱開關與裝置偏好不屬於此快照。

## 要求值與結果

原有四項 reactive 控制欄位是目前要求值；`state.audioControlApplication` 是該 owner 最新的不可變結果。各 action 的 Promise 回傳當次歷史結果，不能取代重新檢查當前 scope／revision。

| 欄位       | 語意                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------- |
| revision   | 本次 Renderer owner 的操作序號，不是未來 Main sidecar revision。                              |
| status／ok | pending、applied、failed、cancelled、timeout、deferred 或 invalidated；只有 applied 為 true。 |
| requested  | 點擊／命令時固定的四欄快照，不在 await 後重讀另一組要求。                                     |
| applied    | 兩條必要路徑均確認時才有完整快照；其他結果一律 null。                                         |
| lanes      | 分別記 monitor／capture 的 applied、disabled、failed、pending、deferred 或 unconfirmed。      |

`invalid` 是驗證拒絕的回傳，不取代仍有效的操作或發布新的成功狀態。Monitor 的「applied」只證明必要節點、排程回應、gain 路由及 audio rate 設定；不證明硬體已發聲、音準／音色品質或跨路徑 sample 級原子提交。部分 monitor 成功而 capture 失敗仍為整體 failed，不能用來保存為整組已套用設定。

未建立 graph 的 defaults／paused restore 保持 lazy，回 deferred，不能冒充已驗證的音訊路徑；未選 capture 不建立擷取裝置。已準備但未啟動的 capture 也不能被當作 disabled。新的實際播放會準備並重新確認必要路徑。

## 非同步與失效

新命令立即取代舊命令；資源準備可共用同一 worklet Promise，只有仍擁有 revision／scope 的操作可提交後續 schedule、路由與結果。每個資源或排程 await 後重驗 owner；同一節點已發出的訊息不能撤回，晚回不更新新狀態。新指令保有後續排程權威，不承諾回滾已發到硬體的處理。

`schedule()` 的非同步回應也必須完成；只呼叫方法或 Promise fulfilled 不是成功依據。Monitor／capture 的確認分開，舊錯誤不回寫新曲。Monitor lazy 初始化晚回時，若 owner 已 teardown，不再連接節點。節點故障、擷取裝置切換／遺失或播放中 context 停止，會使相應確認失效。

取消、取代與 teardown 立即結束操作等待，不等待底層初始化完成。每次操作最多等待 10 秒，超時回 timeout；這是防止卡住的操作期限，並非 DSP 性能、輸入／輸出延遲或無縫品質預算。底層工作仍可能晚回，但不能恢復播放或覆寫結果。

## 播放與交接

新的 play／resume 先沿既有 BGM pre-start hook 取得交接，再等候 monitor resume、已選 capture 就緒及完整控制結果；實際呼叫 `audio.play()` 前還要 fresh 檢查同一結果與裝置狀態，不能接受剛失效的舊成功。必要路徑失敗／超時就不呼叫 play。已啟用 capture 不再採用背景啟動、失敗仍讓新演唱開始的行為。

失敗沿既有 stopped 事件釋放 BGM 交接、清除 pending start，保留 bounded public error。取消已進入 graph 準備的開始也明確發出 start-cancelled；不能依賴對已暫停的 element 再呼叫 pause 會產生事件。尚在 pre-start gate、尚未取得播放 identity 的取消不偽造新曲停止事件。

原有 live monitor 可在 capture DSP 失敗時保留；本次結果仍失敗，下一次開始必須重新確認，或由使用者明確關閉 capture 再重試。裝置遺失的清理仍沿既有裝置 owner，不從批次設定暗改已保存的機器偏好來假造成功。

Library URL refresh 也檢查明確的 readiness 結果，不能因 fulfilled 就再次 play；過期 refresh 不能覆蓋新 occurrence。播放進度、history／arrangement 完成與 Output 仍由既有 audio events／owners 持有，不由設定成功產生。

## 驗證邊界

相鄰測試覆蓋驗證拒絕、整組／部分成功、worklet 回應、晚回、取代、取消、期限、裝置失效、paused restore、library refresh 與原 BGM 交接。Web Audio／裝置由 mocks 提供；這些測試不等於真實 Windows 裝置、Electron 聽感或 OBS 錄音驗收。

實機仍需驗新開始／resume、非零 pitch 與 capture 開關、裝置失效／重選、批次暫停／位置、快速換曲／取消及 BGM 回復。逐曲保存與完整 T01–T18 的產品驗收保持後續範圍。
