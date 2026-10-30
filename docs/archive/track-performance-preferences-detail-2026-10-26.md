# 逐曲演唱設定：行為提案

> 已歸檔（2026-10-30）：已實作，行為與驗收案例由[音訊設定套用契約](../contracts/player-audio-controls.md)持有；本文只保留設計推導，其中的階段與待辦不代表現況。

2026-10-26 提案，2026-10-27 補三組保存決策與交叉情境；功能現況由 [spec](../spec.md) 持有，DSP／保存與播放交易的實作邊界見[現行契約](../contracts/player-audio-controls.md)。完整 T01–T26 是分層驗收情境，程式或 mock 通過不代替實機驗收。共用 ownership、保存／取消與狀態規則見[規劃入口](../research/product/player-practice-planning-2026-10-26.md#共用前置)。目標是明確保存本曲條件，現場調整仍為暫時值。

## 第一版範圍

| 欄位                     | 範圍                   | 無保存時基準 |
| ------------------------ | ---------------------- | ------------ |
| transposeSemitones       | -12～+12 整數          | 0            |
| pitchCents               | -50～+50 整數          | 0            |
| tempoRate                | 0.5～1.5，現行控制步階 | 1            |
| monitorGuideVocalEnabled | Boolean                | true         |

實作共用 canonical 值域；保存拒絕未知欄位、字串數字、NaN／Infinity、越界及非法步階，不把壞值 clamp 成有效設定。Key／cents 仍由 combinedSemitones 合成。

每個 library／canonical track 最多三組，指定一組作為下次新開始的預設；同曲跨集合共用，不按歌名／artist／作品合併錄音，不跨 track／library remap。2026-10-27 Owner 將原單組範圍調整為三組，保存格式與 IPC 見[套用契約](../contracts/player-audio-controls.md#main-逐曲保存)。

三個固定位置取代原「尚未保存」文字區；切換位置載入該組已存四欄，空組採基準；離開組未保存的調整直接捨棄，不自動保存或保留跨組草稿。重按目前組不重設；切換沿既有批次即時更新，不 pause／play／seek，保留原播放／暫停狀態與 occurrence，確認成功後才改選取，失敗保留原選取並提供重試。三個獨立 secondary 按鈕均常駐外框，以 active 底色標示目前選組，空組採虛線框、已存組採實線框，不另顯示文字狀態行；需保存時強調 Save、已存且無變更時採 ghost，完整狀態保留 aria，維持手動保存；下次預設保留於 tooltip，選單可將已保存組設為預設；首次保存自動成為預設。移除只清該組；若移除預設組，改採第一個仍已保存的位置，全部移除才回基準。共用垂直分隔線分開組別與保存／更多圖示按鈕，更多永遠位於最右。

不保存導唱比例、擷取導唱開關、master／capture 音量、mute、裝置、BGM、歌詞／offset、A–B 或播放位置。新曲原本關閉擷取導唱的政策維持；套用命令本身不重設使用者已操作的擷取導唱。第一版不做帳號、自訂組數、場次 override、批次或分享包。

沒有分離結果時導唱為不可用，不自動分離、不假稱能去原曲人聲。仍可保存已套用 Key／cents／tempo；導唱保留已存選擇，首次採 true 基準。Main 依固定更新欄位合併完整記錄，回報導唱維持既有／基準，不將不可用存成 false。

複製沿更多選單選擇其他組：來源限已保存四欄，來源的臨時調整不納入。複製後即時載入目標組作為未保存草稿，不立即寫檔；可再微調並手動保存，目標原存檔及預設組在保存前保持。空組來源不可複製，目標可為空組或已保存組，後者提示保存後覆寫；離組會捨棄複製草稿。數值恰好等於原調基準也保持未保存狀態，不誤報已保存。

## 值與命令

區分 Main 已存 revision、待套用目標及播放器已確認值；只有已確認欄位可保存。dirty 由快照差異推導，保存成功不代表後來的臨時調整也已保存。

| 命令             | 保存效果                               | 當前播放                                   |
| ---------------- | -------------------------------------- | ------------------------------------------ |
| 保存目前設定     | CAS 寫點擊時快照；DSP pending 時拒絕。 | 不改值／seek／播放狀態。                   |
| 切換設定組別     | 不寫檔；捨棄離開組未保存的調整。       | 載入目標組已存四項，空組採基準，位置不變。 |
| 右鍵指定組別     | 不寫檔；不改該組已存內容或預設。       | 直接套用基準，成功後切入該組，位置不變。   |
| 複製已存設定到   | 不寫檔；目標為需手動保存的草稿。       | 取來源已存四欄，成功後切入目標，位置不變。 |
| 重設目前演唱設定 | 不刪已存資料。                         | 批次回四項基準，位置不變。                 |
| 移除此組設定     | CAS 清空選定組並前進 revision。        | 本次值保持，下次依剩餘預設組或基準。       |
| 設為下次預設     | CAS 指定已保存組，不修改組內值。       | 本次值保持，下次新開始採指定組。           |
| 重新讀取         | 不寫檔，更新 baseline。                | 不覆蓋臨時值。                             |

切組沿原 graph 即時套用，不中斷音樂；暫停曲目尚無 graph 的 deferred 目標只先載入，不誤報失敗或視為可保存。每個 set 的右鍵均可直接切入該組並重設；以一次四欄基準批次完成，不先載入舊值。與更多的目前組重設同義，存檔及預設位置保持，仍需明確保存；tooltip 只留組別／預設或空組及右鍵提示，完整狀態由框線／Save 強調及 aria 描述承接。目前組重設沿原 graph 即時回四欄基準並保留所選組；右鍵其他組成功後切入該組。兩者保留原播放／暫停狀態、位置與已存資料；一般滑桿仍可現場調整。沒有曲目時，組別、保存與更多均停用；程式端靜默拒絕無曲目操作，不發錯誤通知。保存中再改值，晚回只更新點擊時 baseline，不拉回新值；同類寫入合併／停用，不並行覆蓋。

## 開始與 DSP 結果

1. 新開始建立 token、依原政策停止舊演唱；先解析 scope／track／profile／媒體綁定，可在 BGM 仍播時準備資料。
2. 明確 absent 才採 defaults。壞檔、未知版本、I/O、stale 不當無設定；保持停止，提供重試／取消或明確本次 defaults。
3. 沿唯一 BGM coordinator 交接，再於 paused 狀態設定媒體／路由及整組目標；不另註冊 pre-start hook。
4. Key／cents 合成後一次排程，tempo／導唱納入共同結果；本次必要的監聽／擷取路徑均有明確結果才算完成。未啟用擷取不自動建裝置。
5. 再驗上下文才走既有 Play；取消／錯誤須釋放交接，不能讓 pending 永遠卡住。

單項 setter 會先寫 state，返回不代表整組已套用；逐曲 owner 必須消費現有 `applyAudioControls()` 的 requested／applied 與每路結果，保存已確認快照，不另造 batch state machine。開始／取消沿 `usePlayerAudioStart` 與唯一 BGM hook；Main 保存、媒體綁定與 CAS 的接入邊界見現行契約。程式成功只證資源／排程／路由，不證硬體已發出正確聲音，也不承諾跨 Web Audio／media element 的 sample 級原子提交。

已啟用擷取失敗不能包成整體成功；保持停止、沿原 owner 修復或由使用者明確關閉後重驗，不改裝置偏好來掩蓋問題。回復先前快照若無法確認，標未確認；本次 defaults 也不繞過必要路徑錯誤或覆寫已存設定。讀取／套用採十秒有界等待與可取消；這不是聲學延遲或品質預算。

## 生命週期

| 事件                              | 提案策略                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| 新曲／新 occurrence，即使同 track | 清臨時值，重新解析並套用已存／明確 defaults。                                         |
| Pause／resume、buffering、seek    | 保留值；resume 只驗必要路徑。                                                         |
| repeat-one／A–B 同次返回          | 不重讀、不 reset，保留同次臨時調整。                                                  |
| 明確整首 restart                  | 取消區段，準備成功後到 0 並重套；保留原 paused／playing 意圖，防晚回。                |
| metadata／原曲與分離 URL 更新     | 沿 library sync 保留位置、token 與臨時值；導唱可用性變動不覆蓋選擇。                  |
| App restore                       | 讀已存、不恢復臨時值，保持 paused；DSP 到明確 Play 前才準備，不塞進 resume snapshot。 |
| 換庫／刪曲／取消／clear           | 失效舊操作，不復活媒體。                                                              |

restart 呼叫者含上一首 fallback／場次 controller，須保留 occurrence 歸屬，不為重套額外記完成／播放。paused restore 晚讀可更新 baseline，不能蓋過已開始的本次編輯。

同曲重新開始在讀取或 BGM 交接中取消，仍返回原 occurrence 的選組及臨時值；其他曲目讀取失敗後恢復原曲亦同。成功接受新開始或 restart 目標後，舊返回組別不再有效。restore 讀取失敗後重試須同步實際已存預設組；取消 transport 不得讓背景 restore 失效而阻擋第一次 Play。切組／複製／重設被後續調整取代時，不換組或誤報套用失敗；仍需驗最新 DSP revision 與目前值。

## 媒體綁定與保存復原

metadata／封面／發行關聯、分離結果更新不讓原音源偏好自動失效；原始媒體更換則保留值待確認，不自動 remap。Main 只能在 fresh-verify [tag 等價證據](../contracts/audio-tag-writeback.md)後遷移 binding；不能單比 trackId、URL 或整檔 hash。現有 contentHash 不等於每次已新鮮驗實體檔，身份驗證與有界 stamp memo 由 Main owner 持有，不暗加每次全檔 hash。

Main 短提交序列化並重驗 scope／track／revision；刪除後 token 也失效，避免 absent=0 的 ABA 舊寫入。程序重啟重取 token。長時間試唱的十五分鐘 token 到期由 Main 在原提交 lane 靜默重驗及續期，曲目 identity／音源／存檔 bytes 與 revision 未變時直接完成原手動操作，不要求使用者重讀；不是改成自動保存，也不以最新檔案覆蓋衝突。回應遺失先重讀；CAS 衝突保留本次值，讀最新後由使用者重存。invalid／unsupported 不自動覆寫或移除，保留原檔；第一版不提供自動重建或覆寫壞檔。

入口沿原控制／歌曲情境，不造 Settings 曲目清單或另一組滑桿。正常不每首彈通知；分清無保存、讀取／套用中、與已存不同、保存失敗及導唱不可用。保存成功不彈通知，只更新已保存狀態；真正衝突或操作失敗才通知。

## 分層驗收情境

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

## 初始實作前決策與證據

最初切片順序為先固定缺分離保存、批次套用／restart／defaults、sidecar／IPC／revision、媒體等價與損壞復原，再整合既有 batch DSP／BGM／restore，驗證後接保存／套用 UI。此處保留決策脈絡，現行接入與驗證邊界由契約及 spec 持有。

當輪核對 [player](../../src/composables/usePlayer.js)、[audio graph](../../src/composables/player/usePlayerAudioGraph.js)、[偏好保存](../../src/composables/useAudioPreferencesPersistence.js)、[library sync](../../src/composables/player/usePlayerLibrarySync.js)、[restore](../../src/composables/usePlaybackResume.js)及[BGM controller](../../src/bgm/sessionController.js)；既有 5 份測試 93 passed，僅基線。初始 P01–P08 留在[原證據](../research/product/player-practice-planning-2026-10-26.json)。
