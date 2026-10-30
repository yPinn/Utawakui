# 播放器音訊設定套用

本契約定義要求值、DSP 結果與播放交接，以及逐曲設定的 Main 保存邊界；產品現況見 [spec](../spec.md)。完整操作與生命週期沿[行為提案](../archive/track-performance-preferences-detail-2026-10-26.md)，分階段驗證後接入。

## Main 逐曲保存

`electron/lib/performanceSettings/` 持有資料、媒體驗證與 session tokens；`main/performanceSettingsHandlers.js` 提供固定 get／save／remove／set-default／cancel 與唯讀 verify-source IPC，僅接受主視窗 main frame。Preload 只投影 trackId、opaque token、expectedRevision、1–3 的 slot 與四欄值；路徑、原音檔 SHA-256、tag 收據與備份不跨 IPC。verify-source 只驗來源等價，不重讀保存 baseline 或放寬 CAS，使用邊界見[區段練習契約](player-ab-practice.md)。`shared/performanceSettings.mjs` 與既有 graph 共用 strict validator／defaults。

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

## Capture-only 輸出路徑

原 `usePlayerAudioGraph` 在既有 Play／resume 準備交易中，只有 monitor 明確靜音或音量恰為 0、capture 已選、平台支援 source context sink 切換，且所有 programme input gates 都關閉時，才採 capture-only 直接分支。來源仍是同一 HTML audio／MediaElementSource，四聲道與原曲分支保持；在來源 context 內建立 capture 自己的導唱、mix、pitch、總音量與終端 gate，演唱不再經 inst／voc MediaStream bridge。Monitor 與 capture 的 logical DSP 確認仍各自成立，不合併節點或混音。Capture 音量 0 不等於停用；同裝置、微小 monitor 音量或暫時內容靜音都不構成合併條件。Monitor-only 延後建立不需要的 bridge。

開始準備時就需要 monitor／capture 的兩路場景，保留原來源 default＋獨立 capture context，即使裝置相同也不合併混音。播放中把 monitor 拉到 0 不立即進入 capture-only 模式；切換／關閉 capture 或 BGM 準備先退休 monitor relay、關閉受影響終端 gate，經來源 sink 串行重綁與就緒檢查回到原路徑，再允許輸出。不 pause／play／seek 或改 occurrence；paused 不自動播放。明確路徑切換可能有短暫缺口，未承諾無縫。

從健康 capture-only 開回 monitor 時，預設保持原 capture graph／gate／sink 直出，另將 monitor 自己的 dry／wet 合流（已套用 monitor 音量、導唱與 DSP，位於舊 terminal 前）以單一 stereo MediaStream bridge 送往新的 default context。新 context 只有 stream source 與終端 gate，不重複套用音量或 pitch；來源 context 的 monitor terminal 維持 0，沒有第二份 capture。單純開 monitor 不 setSinkId、不拆 capture 或重建 element source；普通非零音量拖動合併同一準備，mute／volume=0 只退休自有 relay。

候選 relay 終端 gate 為 0，確認 resume、必要兩路 DSP ACK、來源／裝置／控制世代與 source／relay 資源仍有效才開 gate；ACK 不等於首份真 PCM ready。路徑 readiness 明確區分初始 direct eligibility 與「capture direct＋default monitor relay」，不把 sourceAtDefault 假報為 true。準備／取消不使用 source native lane 的失效清理；失敗／取消只拆自有 relay nodes／listeners／stream tracks、close 自有 default context，不關健康 capture 或借用來源 context。完整 cleanup 先拆自有 targeted edges，再由原 owner 清 shared nodes。

relay 與其父套用操作沿用 10 秒期限；只有對應父 revision 的取消／逾時能撤銷其候選，不能以舊 DSP job 結果撤銷新裝置／BGM／monitor 交易。每個必要 await 後重驗操作 scope，取消的 capture DSP 初始化／ACK 晚回不能 schedule 舊控制或改 gain；現役 graph 的 worklet factory 仍由 graph 生命週期持有，供最新有效操作共享。新裝置、BGM prepare、來源／控制變更、mute、取消或 teardown 使不適用候選失效，不由晚回重試或播放。

監聽獨有失敗以 graph-owned `monitorOutputError` 的有界 code／message，經既有 player 通知 owner 投影；「重試監聽」只重試當前仍有效的 relay，不 toggle／pause／play 演唱，不清健康 capture 偏好，也不假報 capture 失效。新的來源／裝置／mute／成功或 cleanup 會撤銷過期錯誤；一般 playback error 保留原錯誤重試行為。

內部建構選項 `monitorBridgeReturn=false` 保留前一版 staged legacy 回退：先準備綁 capture sink 的靜音候選，再進來源 native lane 關舊 gate、恢復來源 default、接 inst／voc bridge 並升級。此路徑前置不接來源／input，失敗保留健康原 capture／偏好；提交後失敗則關閘，native lane 仍等實際呼叫 settle，再由最新有效交易復原，不退成未確認 dry。裝置／BGM 準備仍沿原雙路交易，relay 準備或 close 晚回不占該 lane。

relay 將 bridge 的 buffering／sample-rate／時鐘及短零風險放到 monitor，未消除 bridge 風險，不保證監聽零延遲或品質。此路徑的 monitor 品質未通過；有限實機與人工驗收紀錄另行保存，實體聲學延遲尚未量測。

BGM 保留自己的 audio、混音與 post-gain bridge；既有 `prepareCaptureOutput()` 確認回到原 capture context 後才回 true，包含尚在排隊的直接準備。Lease 仍在最後 capture 總音量前、繞過演唱控制；未經準備不能在直接分支啟用 input。Mic 研究、試聽、節拍器與其 owners 不接入此路徑。

取消／期限結束的是邏輯等待，不能取消已發出的 native sink 呼叫。原生操作仍持有串行 lane 至完成；晚回僅靜音清理／重驗最新目標，不開舊 gate 或再次 play。回到原雙路路徑須來源 default sink 已恢復、必要 capture／DSP 仍有效；裝置遺失沿原失效與偏好清除流程，不把 default 當 capture 替代。直接 graph 借用來源 context，capture teardown 只拆自己的 edges／nodes／listeners；完整 owner cleanup 才 close 來源 context。`captureOnlyDirect=false` 可停用整體 direct 優化，沒有新增設定 UI、IPC 或持久化偏好。

上述為程式路由契約；真實 Electron／裝置／OBS 連續性與人工聽感需另驗，不覆蓋 R01 歷史失敗或其 CPU、內容對齊限制。

## 驗證邊界

相鄰測試覆蓋三組獨立保存／預設與跨組 CAS、移除／ABA、來源與 scope 失效、fresh tag 等價、壞檔保留，以及 DSP 驗證拒絕、整組／部分成功、worklet 回應、晚回、取代、取消、期限、裝置失效、paused restore、library refresh 與原 BGM 交接。Set 交叉情境沿詳細提案 T19–T26，回歸集中於 [owner](../../src/composables/player/usePlayerPerformanceSettings.test.js)、[player 整合](../../src/composables/usePlayer.test.js)及[控制列行為](../../src/components/playback/PlayerPerformanceSettingsControls.behavior.test.js)：包含同曲取消／失敗後恢復、已完成 restart 的提交界線、restore retry 預設組、copy／default／remove 互不代存、保存中的操作鎖與後續編輯，以及 cancelled／歷史成功不改選組。Web Audio／裝置由 mocks 提供；這些測試不等於真實 Windows 裝置、Electron 聽感或 OBS 錄音驗收。

隔離可見 Electron 以正式 Main／preload、production renderer 與合成靜音音源驗保存讀回、各組已存值切換、空組基準及未保存調整捨棄、指定第二組預設與重新載入、批次保持 paused／位置、重設／移除及 machine preferences 隔離。另驗播放中右鍵目前／其他已存及空組、複製至空／已存目標後手動保存、同曲與異曲讀取中取消後保留原組與暫時值、十六分鐘閒置續期及同 revision 外部改檔衝突；未保存操作保持 sidecar bytes，錯誤通知去重、無可見狀態行，刪曲後控制停用。亮暗／960 與 1280 視窗無水平溢出。此證據不包含聲學品質。真實裝置／OBS 仍需驗新開始／resume、非零 pitch 與 capture、裝置失效／重選、快速換曲／取消與 BGM 回復；節拍 drift 與偶發失真根因保持未結案。

## 驗收案例

案例編號沿用[原提案](../archive/track-performance-preferences-detail-2026-10-26.md)；表格列完整情境，不是進度表，現況見 [spec](../spec.md)。

| ID  | 情境與必要結果                                                                   |
| --- | -------------------------------------------------------------------------------- |
| T01 | 無設定原曲採基準，不準備 Provider／模型，confirmed playing 才更新進度。          |
| T02 | 保存後重啟值回來、先 paused，未存臨時值不回來。                                  |
| T03 | 跨集合共用；同名不同錄音、不同 track／library 不混用。                           |
| T04 | 缺分離仍存三項，導唱保留／基準，不自動處理或假去人聲。                           |
| T05 | pending／失敗 DSP 目標不可當已套用快照保存。                                     |
| T06 | 保存等待中再改值，成功只更新舊快照，新值保持 dirty。                             |
| T07 | 重設／套用／移除範圍分明；移除不改本次值，machine preferences bytes 不變。       |
| T08 | pause／seek／repeat／A–B 保留臨時值，無每輪 profile I/O。                        |
| T09 | restart／上一首 fallback／場次重套且到 0，意圖／occurrence 正確，無額外完成。    |
| T10 | A→B→A、同 id 換庫、取消拒絕舊讀／DSP／保存，不復活曲目。                         |
| T11 | metadata／URL／分離切換保留位置、臨時值與 arrangement token。                    |
| T12 | tag 等價、未知替換、缺檔依 Main 證據處理，保留原設定。                           |
| T13 | 壞檔／未知版本／I/O／超時可辨，不自動錯 Key 開唱或寫回 defaults。                |
| T14 | 兩舊 revision、保存－移除－舊寫入，拒 stale／ABA。                               |
| T15 | 任一路 DSP／裝置失敗結果準確，依原 fail-closed，不假報整體成功。                 |
| T16 | BGM／預覽交接、失敗／取消無雙 lane、卡 pending 或晚 timer 重開。                 |
| T17 | restore 中編輯／Play，晚讀不蓋值，開始有一致結果。                               |
| T18 | 已提交後遺失回應／換庫可重讀確認，不污染新頁或盲重送。                           |
| T19 | 切已存／空組取各自值；重按同組不重設；離組捨棄未存變更，播放／位置不變。         |
| T20 | 右鍵目前／其他已存或空組，單次基準批次成功才切組，不先套舊值、不寫檔。           |
| T21 | 複製取來源已存值、不取暫時值；相同基準仍為草稿，離組捨棄、空來源停用。           |
| T22 | 複製至已存目標不先覆寫；微調後保存只寫目標，預設／來源保持，晚回不拉回新值。     |
| T23 | cancelled／歷史 fulfilled DSP 不換組、不誤發失敗通知；真實失敗保留選組並通知。   |
| T24 | 閒置過期同曲同檔靜默續期；同 revision 改 bytes 仍衝突，scope 撤銷不可復活。      |
| T25 | 同曲取消／換曲失敗恢復原組與暫時值；restore 重試選預設；已完成 restart 不回滾。  |
| T26 | 無曲目／忙碌停用，鍵盤選單可用；短 tooltip、框線／底色及 Save 狀態無可見狀態行。 |
