# 區段練習：行為提案

2026-10-26；未實作／量測，A01–A18 待驗。共用前置見[規劃入口](player-practice-planning-2026-10-26.md#共用前置)。以既有主播放器反覆練片段；0 秒等待不承諾無縫或 sample-accurate。

## 區間與 session

A、B 為原始媒體秒數，[A, B)；tempo、歌詞 offset 不改端點。只接受有有限正 duration、本機可讀且整段位於連續 seekable 範圍的主曲目；metadata 未就緒先等待。manual、BGM、試聽、串流不適用。

端點須有限且 0 ≤ A < B ≤ duration；不交換／clamp 壞值，不把近 EOF 的 B 偷移早。最短 500ms、等待 0／1／2／4 秒是原型候選，須按實測品質決定。

標記、等待與 enabled 只屬當前載入 session；收面板保留，明確新開始／換曲／換庫／clear／App 重啟清除，不寫 sidecar／resume。上下文另含媒體來源 generation、練習 generation 及 lap token；每輪不新建 playbackRevision，不重讀逐曲設定。

## 操作

| 操作                          | 提案行為                                                                   |
| ----------------------------- | -------------------------------------------------------------------------- |
| 設 A／B                       | 只改草稿；已 enabled 先停用、取消返回／倒數，不拖曳即 seek。               |
| paused 啟用                   | 驗證、armed，不播不 seek；下次 Play 位置不在區間才回 A。                   |
| playing 啟用，位置在區間      | 保留進度，到 B 返回。                                                      |
| playing 啟用，位置在區間外    | 明示從 A 開始，經 pause／seek／確認再播，首次不加每輪等待。                |
| Pause                         | 取消在途自動開始，保持 paused；標記／enabled 保留，需明確 Play。           |
| gap 中 Play／媒體鍵播放       | 取消剩餘倒數、立即經共同開始路徑播放，不讓舊 timer 再播。                  |
| 停用／清除                    | 停用保留標記，清除亦刪標記；playing 繼續向後，gap／returning 保持 paused。 |
| 區間內／外 seek               | 內側重排觀察；外側含 B 停用、保留標記，不拉回 A。                          |
| 改等待                        | 下輪生效；當輪用快照，立即開始可按 Play。                                  |
| 整首 restart／上一首 fallback | 結束練習、清標記，走原 restart／逐曲設定政策。                             |
| 下一首／其他曲目              | 先失效練習 token，再交 transport。                                         |

標記、enabled、returning／gap／blocked 由單一練習 owner 持有；真實 playing／paused／buffering 仍來自 audio，不另造播放 Boolean。Key／cents／tempo／導唱臨時值每輪保留，不自動保存。

## 邊界返回與取消

1. timer／rAF 只喚醒讀取實際 clock；即使按 rate 預估，也要讀到 currentTime ≥ B 才返回，不提前切尾音。
2. 同步鎖定當輪 token，pause、seek A，再等 seek 完成並驗落點／身份／可用性；賦值 currentTime 不等於已完成。
3. 從有效返回後起算 monotonic wall-time 等待，audio paused。0 秒也等 seek／路由；歌詞／Output 投影真實 A。
4. 到期重驗 token／enabled／範圍／必要音訊路徑，再送既有 Play；每輪不重跑整曲 pre-roll。confirmed playing 才算真的恢復。

目前 pause 事件沒有練習原因／lap token，需受控區分內部返回與使用者操作；不能以 ignoreNextPause 吞掉稍後真正暫停。Pause、停用、clear、外側 seek、換曲／庫、restart、場次／BGM／試聽接手、錯誤及 cleanup 都先失效 auto-start。

timer 已到期或 play promise 在途也需防晚回；若原生播放已開始，取消仍立即 pause，不能只丟棄 promise 結果。休眠／長時間中斷後不補跑錯過輪次，需手動恢復。

## EOF 與 repeat 的唯一判定

現有 onEnded 分別通知 transport、BGM 與 history。只讓下一首回傳「已處理」仍會觸發其他 consumer，註冊順序不是契約。須在預設 fan-out 前同步分類，再做非同步返回；媒體 ended 的原生事實仍供內部狀態／診斷觀察。

| 判定                         | 分派                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------- |
| 有效 practice-return         | 同輪返回；不發整首完成、不進 Queue／場次／BGM post-roll／短曲 qualification。 |
| 無練習的當前真實 final-ended | 沿原終止路徑。                                                                |
| 重複／舊來源事件             | 依 source、audio.ended 與 lap token 丟棄，不再 seek／換曲。                   |
| 練習範圍／返回失效           | blocked／paused，不把錯誤當完成往下播。                                       |

已消費的 EOF 不因稍後取消而重解釋成整首結束。A–B enabled 時 effective audio.loop=false，畫面原 playbackMode 保留；不讓瀏覽器先 wrap 或觸發 reset。Queue／shuffle 不因每輪改動；使用者明確換模式則先結束循環再套新值，不能用舊快照蓋回，gap 中仍 paused。

EOF／近 EOF 未通過整合測試就不開放該範圍。若先交中段，安全邊界須按實測預算明示，不偷改端點假裝支援。

## BGM、場次與紀錄

首次 Play 經現有交接；returning／gap／buffering 保留練習占用，禁止自動 BGM restore／試聽插入。現有 preview lease 不是 practice hold，需在同一 coordinator 擴充可釋放、帶 generation 的政策，維持唯一 hook；不建立新 audible lane／Audio。

一般 Pause 留安靜練習狀態；明確要求 BGM／試聽時，先取消並停用循環、pause／釋放 hold，再沿原交接，Live 中試聽限制不變。單純停用 A–B 並非整首結束：playing 的原 lane 繼續持有，真實 EOF 才 post-roll。

第一版在場次 ownsPlayback／pending start 時不可啟用，需明確離開控制，不暗中改 occurrence 為完成／中止。練習中開始場次，先清練習再由原開始路徑接手；manual 沒有此 clock。

每輪保留 playbackRevision，實際 seek 更新 continuityRevision。history 只累計有效 media progress，同 logical playback 至多一次；seek／等待／buffering 不構造進度，練習 EOF 不走短曲捷徑，已 qualified 不回溯刪除。章節／演出時間戳沿原去重，Output／提詞器不發布假連續時間、不自動啟用公開輸出。

## 來源與故障

metadata／時間座標未變則保留；URL 改換須取消舊返回，沿 library sync 驗原始媒體等價、新 duration／seekable。原先 playing 且證據成立可沿原 sync 恢復；gap／paused 換來源不自動重開。未知來源、duration 縮短或端點失效停用／paused，保留標記供修正，不按 trackId 猜或縮 B。

seek／落點／deadline、媒體／DSP 或觀察長中斷出錯，取消 auto-start、保留 blocked，不無限重試；修復後明確 Play。teardown 清 hold／timer／訂閱。前景限制為待評審政策：隱藏／最小化取消並 pause、保留標記，回來手動 Play；可見但失焦不因此停。背景持續循環另驗。

## 品質原型與待執行驗收

實驗前固定長短曲、容器、sample rate、原曲／四聲道、0.5／1／1.5 倍速、冷暖、前景／最小化與負載分母。初始待評審目標：B 超出 p95≤100ms／max≤250ms；A 落點誤差 p95≤80ms／max≤150ms，均為媒體座標。數字尚未接受／量測，不能測後挑門檻；500ms 與 EOF 安全範圍一併決策。

另記 seek 耗時、倒數到 playing 落差、取消誤播、停頓／尾音／click、CPU／RAM與全部失敗。clock／mock 不證 scheduler／seek／monitor／capture 聽感，仍需可見 Electron／裝置／OBS。

| ID  | 情境與必要結果                                                         |
| --- | ---------------------------------------------------------------------- |
| A01 | 缺／反向／NaN／越界／不連續 seekable／未知時長拒啟用，不 clamp。       |
| A02 | paused 內／外啟用均不播，下次 Play 才必要回 A。                        |
| A03 | playing 內側到 B、外側明確從 A，不誤播舊位置。                         |
| A04 | 各等待／倍速不改座標，seek 後起算、保留本次演唱值。                    |
| A05 | 同輪 timeupdate／ended／重複 callback 只返回一次。                     |
| A06 | gap Pause／Play／停用／改秒數遵守取消、立即播與下輪快照。              |
| A07 | 內／外 seek、編輯標記不拉回、不晚到重啟。                              |
| A08 | EOF／近 EOF、repeat-one／list／shuffle 不漏到 BGM／history／Queue。    |
| A09 | 改模式／結束循環不蓋較新選擇，gap 不自動播。                           |
| A10 | 下一首、同曲新開始、restart、A→B→A／換庫拒舊 timer。                   |
| A11 | BGM 交接首次一次，每輪無插播、重複 pre-roll 或雙 lane。                |
| A12 | BGM／試聽接手及 Live 拒絕遵共同政策，不讓倒數搶回。                    |
| A13 | 場次／manual 拒啟用；練習轉場次不假完成或另建 occurrence。             |
| A14 | 進度累計至多一次，短區段多輪 EOF 不觸發短曲捷徑。                      |
| A15 | Output／提詞器／時間戳真實 seek／phase，無每輪章節。                   |
| A16 | 來源／分離切換、duration 縮短、缺檔依證據處理，不蓋 Key／縮端點。      |
| A17 | seek／DSP／超時、緊貼 play 的取消／cleanup 不誤播、卡等待或漏 hold。   |
| A18 | 最小化／失焦／負載／睡眠／長循環遵政策，保存完整誤差與失敗、不補輪次。 |

## 實作前決策與證據

先審操作、前景範圍與品質門檻，再固定 fan-out 前 terminal decision、pause 原因及 practice hold 契約。先驗中段／取消／BGM，EOF／repeat、history／Output、來源切換各過 gate；不加入書籤、筆記、自動選段、逐輪導唱漸退、錄音或分數。

當輪依據：[player](../../../src/composables/usePlayer.js)、[clock](../../../src/utils/playbackClockSample.js)、[transport](../../../src/composables/usePlaybackTransport.js)、[BGM](../../../src/bgm/handoffCoordinator.js)、[history qualification](../../../src/utils/playbackHistoryQualification.js)、[場次](../../../src/composables/usePerformanceSessionPlaybackController.js)。既有 7 份測試 137 passed，僅基線；原 L01–L09 留[初始證據](player-practice-planning-2026-10-26.json)。
