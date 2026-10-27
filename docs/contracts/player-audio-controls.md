# 播放器音訊設定套用

本契約定義要求值、DSP 結果與播放交接，以及逐曲設定的 Main 保存邊界；產品現況見 [spec](../spec.md)。完整操作與生命週期沿[行為提案](../research/product/track-performance-preferences-detail-2026-10-26.md)，分階段驗證後接入。

## Main 逐曲保存

`electron/lib/performanceSettings/` 持有資料、媒體驗證與 session tokens；`main/performanceSettingsHandlers.js` 提供固定 get／save／remove／set-default／cancel IPC，僅接受主視窗 main frame。Preload 只投影 trackId、opaque token、expectedRevision、1–3 的 slot 與四欄值；路徑、原音檔 SHA-256、tag 收據與備份不跨 IPC。`shared/performanceSettings.mjs` 與既有 graph 共用 strict validator／defaults。

每個 canonical track 保存一份 `tracks/<trackId>/performance-settings.json` v2：UUID revision、Main 私有原音檔 binding、三個固定 slots 與 defaultSlot。每組是完整四欄值或 null；首次保存成為預設，之後只經明確 set-default 更改，下次新開始／restore 取該組。移除只清選定組；移除預設時選第一個仍已保存的組，無保存則回位置 1／基準。整份文件共用 CAS，任何組的變更都使舊 revision 失效；全部清空仍保留 tombstone 防止 ABA。早期 v1 單組唯讀映射到位置 1，下一次明確寫入才存 v2。程序重啟後重新讀取取得 token；不修改 machine config、library metadata 或 resume snapshot。

get 對目前原檔取得驗證快照，回傳 absent／saved／removed、revision、token、三組 values、預設位置與導唱可用性。Token 最多保留 128 份，十五分鐘後需重新驗證，綁定程序 generation、曲庫路徑與 epoch、track 實體目錄 identity、原音檔及 sidecar 原 bytes。過期本身不要求手動重讀：原 save／remove／set-default 在 Main 共享提交 lane 重驗同一 scope／曲目 identity、原音源 binding 與 exact sidecar bytes／expectedRevision，全部一致才靜默續期並完成使用者原操作，成功回應取得新 token。不能為續期先 get 最新 baseline 或放寬 CAS；真正資料變更、取消／刪曲／換庫、程序重啟或 token 被撤銷／淘汰仍拒絕，不復活舊權限。換庫與刪曲撤銷舊 token，固定 invalidated 通知取消 Renderer 等待中的開始與舊 occurrence。save／remove／set-default 重用既有 works service 的 library lane，於最後同步提交前重驗 scope、token、媒體 stamp、sidecar bytes／revision 及未完成 journal，才原子替換小型 sidecar。取消或十秒期限在提交前生效後，晚到的工作不能寫入。已提交但回應遺失時重新讀取確認，不回滾新 scope 或盲目重送。

原音源第一次按需使用時以既有 streaming SHA-256 verifier 驗證；只對原檔路徑、檔案 dev／ino／size／mtime／ctime 及曲庫 epoch 相同者重用 process memo，最多 128 筆。每次提交前仍同步重讀 stamp；不把 index contentHash、trackId 或分離 URL 當 fresh 證據，不在每次 play 或啟動時全庫 hash。曲目目錄／原音檔 redirect 或多重 hardlink 拒絕作為寫入目標。

metadata、封面及分離結果不改原音源 binding。原音檔 hash 改變時，get 只在既有 tagContentAliases 以目前原檔、收據鏈及每份實體原檔備份的 hash／essence fresh 驗證後遷移 binding／revision，四欄值保持；提交前再驗原檔與 sidecar。無等價證據回 source-stale 並保留原 bytes，不自動重綁或覆寫。

缺分離時 save 只更新三個數值欄位；監聽導唱沿該組已存值，首次採 true，回報 retained／default。不得把不可用存為 false，也不排程分離。invalid、unsupported、not-found、source-stale、conflict、stale、timeout、recovery-required 與 unavailable 分開；壞檔／未知版本不轉成 absent、不自動修復或移除。I/O 失敗由 Main 記私有診斷，IPC 僅回有界狀態。

## Renderer 保存與套用

`player/usePlayerPerformanceSettings.js` 只擁有讀取、已存 baseline、選定組別與保存世代；只接受 graph 當前仍有效的完整 applied 快照。保存固定點擊時四欄及 slot，晚回只更新 baseline，不拉回其後臨時調整。切換組別載入目標組的已存四欄，空組採基準，捨棄離開組未保存的調整而不寫入磁碟；重按目前組不重設。複製只取目前組已保存的四欄快照，不取其臨時調整，沿同一 preservePlayback 交易套用至另一組，成功才切換選組；目標只成為未保存草稿，既有存檔／預設組不變。來源空組、無曲目、忙碌、同組或非法位置不執行。即使複製值與空組基準或既有目標相同，copiedDraft 仍表示需明確保存；只屬 renderer 的編輯意圖，不是第二份 applied 值，不寫入 sidecar。保存成功清除草稿標記，離組／新 occurrence／clear 捨棄，取消替換曲目返回原 occurrence 時保留。沿既有 DSP 批次確認成功後才更新選取位置，失敗維持原選取並提示錯誤；保存、切換組別、重設目前四欄、移除選定組與指定下次預設各自有界線。保存／移除／指定預設不 pause、seek 或改 current values；切組與重設透過同一批次的 preservePlayback intent 即時更新 DSP，不呼叫 pause／play／seek，也不改 occurrence，保留原播放／暫停狀態。暫停且 graph 尚未建立時可接受 deferred 目標作為所選組，不把它升為 applied 或允許保存；明確 Play 再確認必要路徑。目前組重設保留選組；右鍵其他組在成功後切入指定組，兩者均只回四欄基準、不改已保存資料。

新 occurrence 在 BGM hook 前讀預設組，取得交接後才準備完整四欄並走原 start transaction。Pause／resume／seek／repeat-one 不重讀或重設。明確 restart 在資料準備成功後到 0、保留 paused／playing 意圖及原 occurrence；失敗後明確本次 defaults 重試也不新增 playback revision。App restore 只 stage requested 值、保持 paused／lazy；晚讀不能蓋過編輯。讀取失敗可重新讀取或明確本次 defaults，兩者不覆寫壞檔；重讀成功同步選取實際 defaultSlot，晚回須同時符合 restore generation 與曲目。取消尚未完成的 Play 不取消仍屬目前曲目的背景 restore，下一次明確 Play 仍可正常開始。Library metadata／分離 URL refresh 保留臨時值與 occurrence。

準備替換曲目時只保留一份原 track／playbackRevision 綁定的返回組別；同 track 重新開始在取得新 identity 前也屬替換。取消、讀取失敗或 BGM 交接未允許後恢復原曲，重讀 Main baseline／token，恢復原選組、複製草稿及本次預設選擇，不重套音訊值。快速多次替換仍指向原 occurrence；成功取得新 identity，或明確 restart 已接受目標時，清除返回選組，不能被之後的取消回滾。clear／scope 失效清除，不能將舊選組套到新 occurrence。保存仍由恢復的選組決定 slot。

切組／右鍵重設／複製只接受仍為 graph 最新 revision 且與目前要求值一致的 applied 或 paused deferred 結果。Promise fulfilled 的歷史成功不能切換組別；被新調整取代的 cancelled 結果靜默結束，真正失敗才通知。讀取／套用／寫入或 pending start 期間停用其他設定操作，包含重新讀取；滑桿在保存期間的後續調整仍可保留。

演出工具沿既有調整／導唱／節拍器三分頁。調整及導唱共用 footer：三組選擇、垂直 UiSeparator、保存 icon button、最右側更多選單；三個獨立 secondary 按鈕均常駐外框，以 active 底色標示目前選組，空組採虛線框、已存組採實線框；不另顯示空組／已保存／未保存變更的文字行；空組與未保存變更使用 Save accent，已保存且無變更時採 ghost。tooltip 精簡為組別、預設或空組，每組均顯示右鍵重設；完整保存／未保存及處理狀態保留於 aria 描述與 visually-hidden live status，錯誤由共用通知說明，不將未知資料標成空組。切組即套用，不另設套用已存入口；複製已存設定到沿 UiActionMenu submenu 提供另外兩組，標示空組或保存後覆寫；右鍵指定組別透過 resetSlot 沿同一 live batch 直接回四欄基準，確認成功後切到該組，不先載入其已存值再重設；目前組同樣重設。此操作不寫檔、不改存檔或預設組，忙碌、無曲目或非法 slot 時忽略；重設／移除／指定預設／重新讀取沿同一選單，作為鍵盤可用的正式入口，逐曲讀取／保存／套用錯誤由原 owner 投影至 useAppNotifications，固定 key 去重並採 persistent danger；重試／換曲／scope 失效清除舊通知。控制列不嵌錯誤區塊或另加刷新列，重新讀取保留在更多選單，blocked start 仍提供重讀／本次預設，pending start 可取消。保存成功及 token 靜默續期不發全域成功通知，只更新已保存狀態；真正衝突或操作失敗才通知。沒有曲目時三個組別、保存與更多均停用，提示先選曲；owner 同時靜默拒絕無曲目的 intent，不發錯誤通知。不另增滑桿、Settings 曲目清單或 BGM 設定。

## Owner 與範圍

`usePlayer.js` 持有 audio element、開始 revision 與唯一 BGM pre-start hook；`player/usePlayerAudioStart.js` 執行取得交接後的準備／play／錯誤與取消交易，不持有第二個 clock。`player/usePlayerAudioGraph.js` 持有 monitor／capture 路徑及 DSP。`utils/audioControlApplication.js` 只持有一次套用的 revision、取消、期限與結果，不持有播放時間、裝置偏好或第二個播放器。

`applyAudioControls()` 接收完整四欄快照：`transposeSemitones`（-12～12 整數）、`pitchCents`（-50～50 整數）、`tempoRate`（0.5～1.5、0.05 步階）、`monitorGuideVocalEnabled`（Boolean）。缺欄、額外欄位、錯誤型別、非有限值、越界及非法步階直接回 `invalid`，不改控制或暫停。

原批次命令預設暫停並套用，成功後保持 paused、位置不變；set 切換及重設明確要求 preservePlayback，沿既有 graph 同樣的四欄交易即時更新，不以 pause 後再 play 偽裝持續播放。原本的單欄 live setters 仍可在播放中使用；監聽導唱的開關先立即操作 gain，不等候 pitch 資源。粗調／微調仍合成一次 `semitones`，速度由原 audio element 設定。Master／capture 音量、mute、導唱比例、擷取導唱開關與裝置偏好不屬於此快照。

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

相鄰測試覆蓋三組獨立保存／預設與跨組 CAS、移除／ABA、來源與 scope 失效、fresh tag 等價、壞檔保留，以及 DSP 驗證拒絕、整組／部分成功、worklet 回應、晚回、取代、取消、期限、裝置失效、paused restore、library refresh 與原 BGM 交接。Set 交叉情境沿詳細提案 T19–T26，回歸集中於 [owner](../../src/composables/player/usePlayerPerformanceSettings.test.js)、[player 整合](../../src/composables/usePlayer.test.js)及[控制列行為](../../src/components/playback/PlayerPerformanceSettingsControls.behavior.test.js)：包含同曲取消／失敗後恢復、已完成 restart 的提交界線、restore retry 預設組、copy／default／remove 互不代存、保存中的操作鎖與後續編輯，以及 cancelled／歷史成功不改選組。Web Audio／裝置由 mocks 提供；這些測試不等於真實 Windows 裝置、Electron 聽感或 OBS 錄音驗收。

隔離可見 Electron 以正式 Main／preload、production renderer 與合成靜音音源驗保存讀回、各組已存值切換、空組基準及未保存調整捨棄、指定第二組預設與重新載入、批次保持 paused／位置、重設／移除及 machine preferences 隔離。另驗播放中右鍵目前／其他已存及空組、複製至空／已存目標後手動保存、同曲與異曲讀取中取消後保留原組與暫時值、十六分鐘閒置續期及同 revision 外部改檔衝突；未保存操作保持 sidecar bytes，錯誤通知去重、無可見狀態行，刪曲後控制停用。亮暗／960 與 1280 視窗無水平溢出。此證據不包含聲學品質。真實裝置／OBS 仍需驗新開始／resume、非零 pitch 與 capture、裝置失效／重選、快速換曲／取消與 BGM 回復；節拍 drift 與偶發失真根因保持未結案。
