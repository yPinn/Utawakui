# 逐曲演唱設定：行為提案

2026-10-26；逐曲保存與完整 T01–T18 仍待實作／驗收。DSP 結果與播放交接的第一切片見[現行契約](../../contracts/player-audio-controls.md)，不代表整項已交付。共用 ownership、保存／取消與狀態規則見[規劃入口](player-practice-planning-2026-10-26.md#共用前置)。目標是明確保存本曲條件，現場調整仍為暫時值。

## 第一版範圍

| 欄位                     | 範圍                   | 無保存時基準 |
| ------------------------ | ---------------------- | ------------ |
| transposeSemitones       | -12～+12 整數          | 0            |
| pitchCents               | -50～+50 整數          | 0            |
| tempoRate                | 0.5～1.5，現行控制步階 | 1            |
| monitorGuideVocalEnabled | Boolean                | true         |

實作共用 canonical 值域；保存拒絕未知欄位、字串數字、NaN／Infinity、越界及非法步階，不把壞值 clamp 成有效設定。Key／cents 仍由 combinedSemitones 合成。

每個 library／canonical track 一份；同曲跨集合共用，不按歌名／artist／作品合併錄音，不跨 track／library remap。Main-owned track sidecar 為候選，確切檔名／schema／IPC 待契約固定。

不保存導唱比例、擷取導唱開關、master／capture 音量、mute、裝置、BGM、歌詞／offset、A–B 或播放位置。新曲原本關閉擷取導唱的政策維持；套用命令本身不重設使用者已操作的擷取導唱。第一版不做帳號、多份 preset、場次 override、批次或分享包。

沒有分離結果時導唱為不可用，不自動分離、不假稱能去原曲人聲。仍可保存已套用 Key／cents／tempo；導唱保留已存選擇，首次採 true 基準。Main 依固定更新欄位合併完整記錄，回報導唱維持既有／基準，不將不可用存成 false。

## 值與命令

區分 Main 已存 revision、待套用目標及播放器已確認值；只有已確認欄位可保存。dirty 由快照差異推導，保存成功不代表後來的臨時調整也已保存。

| 命令             | 保存效果                               | 當前播放                               |
| ---------------- | -------------------------------------- | -------------------------------------- |
| 保存目前設定     | CAS 寫點擊時快照；DSP pending 時拒絕。 | 不改值／seek／播放狀態。               |
| 套用已存設定     | 不寫檔。                               | 批次替換四項，清其臨時覆寫，位置不變。 |
| 重設目前演唱設定 | 不刪已存資料。                         | 批次回四項基準，位置不變。             |
| 移除歌曲設定     | CAS 移除並前進 revision。              | 本次值保持，下次新開始用基準。         |
| 重新讀取         | 不寫檔，更新 baseline。                | 不覆蓋臨時值。                         |

批次套用／重設在播放中採明確「暫停並套用」意圖，完成保持 paused；一般滑桿仍可現場調整。保存中再改值，晚回只更新點擊時 baseline，不拉回新值；同類寫入合併／停用，不並行覆蓋。

## 開始與 DSP 結果

1. 新開始建立 token、依原政策停止舊演唱；先解析 scope／track／profile／媒體綁定，可在 BGM 仍播時準備資料。
2. 明確 absent 才採 defaults。壞檔、未知版本、I/O、stale 不當無設定；保持停止，提供重試／取消或明確本次 defaults。
3. 沿唯一 BGM coordinator 交接，再於 paused 狀態設定媒體／路由及整組目標；不另註冊 pre-start hook。
4. Key／cents 合成後一次排程，tempo／導唱納入共同結果；本次必要的監聽／擷取路徑均有明確結果才算完成。未啟用擷取不自動建裝置。
5. 再驗上下文才走既有 Play；取消／錯誤須釋放交接，不能讓 pending 永遠卡住。

現有 setter 會先寫 state、部分錯誤捕捉後 fulfilled；不能以 await 完成當成功。需有序列化 batch intent、每路結果與已確認快照。程式成功只證資源／排程／路由，不證硬體已發出正確聲音，也不承諾跨 Web Audio／media element 的 sample 級原子提交。

已啟用擷取失敗不能包成整體成功；保持停止、沿原 owner 修復或由使用者明確關閉後重驗，不改裝置偏好來掩蓋問題。回復先前快照若無法確認，標未確認；本次 defaults 也不繞過必要路徑錯誤或覆寫已存設定。讀取／套用需有界等待與可取消，預算待量測。

## 生命週期

| 事件                              | 提案策略                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| 新曲／新 occurrence，即使同 track | 清臨時值，重新解析並套用已存／明確 defaults。                                         |
| Pause／resume、buffering、seek    | 保留值；resume 只驗必要路徑。                                                         |
| repeat-one／A–B 同次返回          | 不重讀、不 reset；需改現有 repeat-one wrap reset。                                    |
| 明確整首 restart                  | 取消區段，準備成功後到 0 並重套；保留原 paused／playing 意圖，防晚回。                |
| metadata／原曲與分離 URL 更新     | 沿 library sync 保留位置、token 與臨時值；導唱可用性變動不覆蓋選擇。                  |
| App restore                       | 讀已存、不恢復臨時值，保持 paused；DSP 到明確 Play 前才準備，不塞進 resume snapshot。 |
| 換庫／刪曲／取消／clear           | 失效舊操作，不復活媒體。                                                              |

restart 呼叫者含上一首 fallback／場次 controller，須保留 occurrence 歸屬，不為重套額外記完成／播放。paused restore 晚讀可更新 baseline，不能蓋過已開始的本次編輯。

## 媒體綁定與保存復原

metadata／封面／發行關聯、分離結果更新不讓原音源偏好自動失效；原始媒體更換則保留值待確認，不自動 remap。Main 只能在 fresh-verify [tag 等價證據](../../contracts/audio-tag-writeback.md)後遷移 binding；不能單比 trackId、URL 或整檔 hash。現有 contentHash 不等於每次已新鮮驗實體檔，身份 owner／快取成本仍待定，不暗加每次全檔 hash。

Main 短提交序列化並重驗 scope／track／revision；刪除後 token 也失效，避免 absent=0 的 ABA 舊寫入。程序重啟重取 token。回應遺失先重讀；CAS 衝突保留本次值，讀最新後由使用者重存。invalid／unsupported 不自動覆寫或移除，保留原檔；重建／備份政策待契約固定。

入口沿原控制／歌曲情境，不造 Settings 曲目清單或另一組滑桿。正常不每首彈通知；分清無保存、讀取／套用中、與已存不同、保存失敗及導唱不可用。

## 待執行驗收

| ID  | 情境與必要結果                                                                |
| --- | ----------------------------------------------------------------------------- |
| T01 | 無設定原曲採基準，不準備 Provider／模型，confirmed playing 才更新進度。       |
| T02 | 保存後重啟值回來、先 paused，未存臨時值不回來。                               |
| T03 | 跨集合共用；同名不同錄音、不同 track／library 不混用。                        |
| T04 | 缺分離仍存三項，導唱保留／基準，不自動處理或假去人聲。                        |
| T05 | pending／失敗 DSP 目標不可當已套用快照保存。                                  |
| T06 | 保存等待中再改值，成功只更新舊快照，新值保持 dirty。                          |
| T07 | 重設／套用／移除範圍分明；移除不改本次值，machine preferences bytes 不變。    |
| T08 | pause／seek／repeat／A–B 保留臨時值，無每輪 profile I/O。                     |
| T09 | restart／上一首 fallback／場次重套且到 0，意圖／occurrence 正確，無額外完成。 |
| T10 | A→B→A、同 id 換庫、取消拒絕舊讀／DSP／保存，不復活曲目。                      |
| T11 | metadata／URL／分離切換保留位置、臨時值與 arrangement token。                 |
| T12 | tag 等價、未知替換、缺檔依 Main 證據處理，保留原設定。                        |
| T13 | 壞檔／未知版本／I/O／超時可辨，不自動錯 Key 開唱或寫回 defaults。             |
| T14 | 兩舊 revision、保存－移除－舊寫入，拒 stale／ABA。                            |
| T15 | 任一路 DSP／裝置失敗結果準確，依原 fail-closed，不假報整體成功。              |
| T16 | BGM／預覽交接、失敗／取消無雙 lane、卡 pending 或晚 timer 重開。              |
| T17 | restore 中編輯／Play，晚讀不蓋值，開始有一致結果。                            |
| T18 | 已提交後遺失回應／換庫可重讀確認，不污染新頁或盲重送。                        |

## 實作前決策與證據

先評審缺分離保存、批次暫停／restart／defaults；固定 sidecar／IPC／revision、媒體等價與損壞復原。先證 batch DSP／BGM／restore 整合與有界等待，再接 UI；仍需可見 Electron／裝置／OBS 驗收。

當輪核對 [player](../../../src/composables/usePlayer.js)、[audio graph](../../../src/composables/player/usePlayerAudioGraph.js)、[偏好保存](../../../src/composables/useAudioPreferencesPersistence.js)、[library sync](../../../src/composables/player/usePlayerLibrarySync.js)、[restore](../../../src/composables/usePlaybackResume.js)及[BGM controller](../../../src/bgm/sessionController.js)；既有 5 份測試 93 passed，僅基線。初始 P01–P08 留在[原證據](player-practice-planning-2026-10-26.json)。
