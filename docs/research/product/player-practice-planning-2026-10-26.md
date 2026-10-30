# 播放器與排練規劃

本頁保留原四項的順序與共用前置，不另立 roadmap。四份詳細提案已實作並歸檔，行為與驗收案例改由對應契約持有。功能現況與投入分類只見 [spec](../../spec.md#3-功能現況)，實作行為與驗收界線由各契約持有；外部需求證據見[競品研究](competitive-research.md)。已接受的切片不等於整項驗收完成，研究候選也不因文件存在就成為交付承諾。

## 原四項順序

| 順序 | 原提案（已歸檔）                                                                 | 要解決的問題                                       | 整合與驗收前置                                            |
| ---- | -------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| 1    | [逐曲演唱設定](../../archive/track-performance-preferences-detail-2026-10-26.md) | 明確保存／套用本曲 Key、微調、速度與監聽導唱。     | 重用既有 DSP 結果與播放交易；固定保存／綁定／CAS 邊界。   |
| 2    | [區段練習](../../archive/ab-practice-detail-2026-10-26.md)                       | A–B 返回、重播前等待與取消。                       | EOF 分派前仲裁、BGM 練習占用及實測邊界。                  |
| 3    | [歌詞對時確認](../../archive/lyrics-timing-review-detail-2026-10-26.md)          | 在既有 editor 驗聽／修正，保存來源版本的人工確認。 | timing／offset revision、部分保存語意及有界波形 backend。 |
| 4    | [可自訂／全域快捷操作](../../archive/keyboard-shortcuts-detail-2026-10-26.md)    | 十命令的 App／背景綁定、焦點與失敗復原。           | App 輸入優先序、Main 交易、候選試用及逐命令平台門檻。     |

沿此順序分切片接續，不要求四項全部實作後才能交付。App 自訂、背景註冊、候選互動與完整平台操作分層驗證；程式、合成媒體及隔離介面證據都不能取代各項的實機／品質門檻。

## 共用前置

四項共同適用下列規則，各契約只補特有行為：

- 沿現有 player／queue／lyrics owners；HTML audio 是時間與播放狀態權威。BGM 仍由唯一 coordinator／pre-start hook 仲裁，Performer／Output 只消費投影。
- Main 導出路徑、媒體證據與保存位置；Renderer 只傳固定命令、ids、scope／epoch、expected revision 及有界值。不同功能可共用原則，不強制使用同一個 revision 或全能 controller。
- 分清 requested／已套用、草稿／已保存、設定／runtime 有效。Promise 完成、儲存成功或設定檔存在，都不能代替下一階段成功的證據。
- 每個 await／timer／事件重驗 scope、目標及操作 generation；取消、換曲、換庫、刪除與 teardown 使舊意圖失效。晚回成功、失敗及 finally 都不能覆蓋新狀態。
- 原子保存與 CAS 保護當前資料；缺少、壞檔、未知版本、I/O 與 stale 分開。保留原 bytes，失敗不自動覆寫；提交前失效拒絕，已提交的原 scope 結果不為新 UI 反向撤回。
- 設定與控制不新增播放／場次完成、章節或上傳；前景／背景、裝置／OBS 聽感與失敗復原須按功能驗證。純資料／mock 測試不是實機驗收。

各契約「驗收案例」的 T／A／R／S 是完整情境，不是全部待做或全部通過的進度表。各輪證據保留其分母與限制，不能加總成完整功能通過數；未決的預設、預算與支援範圍仍須先確認。

## 目前實作核對與分類補正

初始程式 hash、manual／confirmed-start 分類補正與 P／L／T／K／M／R 草案保留在[初始規劃證據 JSON](player-practice-planning-2026-10-26.json)，只供追溯。現行 manual 沿[演出安排契約](../../contracts/performance-session-preparation.md)，逐曲值與機器偏好隔離沿音訊套用契約；句級草稿、波形與人工確認分別沿下列第 3 項契約，不沿初始快照重建已存在的 owner。

## 1. 逐曲演唱設定

三組保存／下次預設、媒體綁定、批次套用及 T01–T26 見[音訊設定套用契約](../../contracts/player-audio-controls.md)；設計沿革見[原提案](../../archive/track-performance-preferences-detail-2026-10-26.md)。切組、保存與播放交接沿原交易，不另建 DSP owner。

## 2. 區段練習

區間、等待／取消、terminal、BGM hold、來源、EOF／history／Output、品質門檻及 A01–A18 見[區段練習契約](../../contracts/player-ab-practice.md)；設計沿革見[原提案](../../archive/ab-practice-detail-2026-10-26.md)。不承諾無縫或 sample-accurate loop。

## 3. 歌詞對時確認

來源確認、offset、句級相依、部分成功與 R01–R18 見[保存與確認契約](../../contracts/lyrics-timing-review.md)，設計沿革見[原提案](../../archive/lyrics-timing-review-detail-2026-10-26.md)；按需原音訊摘要、FFmpeg gate、排程與 cache 見[波形契約](../../contracts/lyrics-waveform.md)。人工確認不將 T1+ 升格 T2，波形不代替聽辨品質。

## 4. 可自訂／全域快捷操作

App 設定／錄製見[輸入契約](../../contracts/input-bindings.md)；背景作用範圍、候選試註冊、套用／取消、失敗復原與 S01–S18 見[全域契約](../../contracts/global-keyboard-shortcuts.md)；鍵位與設定呈現的沿革見[原提案](../../archive/keyboard-shortcuts-detail-2026-10-26.md)。隔離工廠驗證不授予正式命令能力，逐命令平台門檻通過後才可 opt-in。

## 5. 無伴奏演出：既有能力覆核

沿[演出安排契約](../../contracts/performance-session-preparation.md)驗既有 manual 的新增、開始／完成／中止、外部接手、BGM、封存與匯出；不建立假媒體或第二個 clock。定時結束仍需另定 pause／背景／重啟政策，不能算成已具備。

## 6. 衍生音訊減量：研究方案

R01 的方法、格式比較、採用前驗證與候選建議見[衍生四聲道音訊減量研究](../audio/derived-audio-reduction-r01-2026-10-30.md)，是否採用仍依 spec 的研究分類與前置門檻。以四聲道 WAV 為基線，比較短／長曲、不同 sample rate、原曲型態的容量、編碼耗時、冷暖載入、隨機 seek、CPU／RAM、聲道同步與 DSP 聽感；synthetic 訊號可驗路由與數位定位，不能代替自然音樂品質。

若採用，先對新結果 opt-in；舊結果需 staging、驗證、manifest 原子切換、取消／回復與安全磁碟空間。原始素材、播放／Queue 保護及既有[清理政策](../../contracts/library-storage-management.md)保留；不從單曲外推整庫壓縮率。

## 7. Mic 電平驅動畫面：研究方案

R02 的單一輸入／本機電平開發原型沿[研究契約](../../contracts/microphone-level-research.md)，完整聲學與播放／OBS 品質研究仍待執行，現況只由 spec 持有。使用者明確啟用並選裝置，只做輸入分析與有界強度摘要；停用／失訊停止，不自動換 Mic，不做人聲回放、錄音或原始音訊發布。

[首輪驗證](../audio/microphone-input-r02-2026-10-30.md)保存原生接線、合成輸入、初始裝置底限觀察與後續 B1 有聲重試；輸入有反應不代表完整聲學或延遲驗收通過。

以 dBFS／相對包絡驗安靜、噪聲、伴奏串音、輕／強唱、爆音與削波；固定靈敏度、噪聲門檻、平滑與上限，只影響裝飾幅度／密度／亮度。失訊回基準、保留歌詞可讀性與 reduced motion；先量測單一本機原型的延遲／誤觸／播放成本，再決定 Output 模板與摘要 transport。噪聲或落後不可控、影響播放時退出，音量不等於品質或演唱者身份。

## 8. Mic 音準視覺化：研究方案

R03 尚未執行，model 未選。依序驗輸入音高、可信參考旋律及歌曲時間對照：

- 輸入涵蓋靜音、噪聲、滑音、高低音與八度混淆；回報延遲、覆蓋及未知，不沿用上一音假裝有結果。
- 參考只用已有可用素材驗證；和聲、混響與非主旋律能拒判，不把最強頻率當真值，不隱式準備分離。
- 分開輸出／輸入／分析窗延遲，驗 jitter／drift 與硬體改變；固定 offset 不當全問題已解。

先做音高線、可信度與未知區段，不做總分、成績比較／排行榜或人聲監聽。可重用電平研究驗過的輸入生命週期，兩種用途仍分開驗收。

## 驗證與實作前待定事項

現有能力驗收優先；手機／外觀沿已接受方向、引導等視覺、Mic／影片／榜單保持研究，多人等社交配套與行銷定位，分類只見 [spec](../../spec.md#6-方向與優先順序)。外部研究提供理由，不提高為交付承諾。

續接時對照 spec 與對應契約的未驗門檻，保留原四項順序與 owners；演出工具沿現有調整／導唱／節拍器入口，不複製滑桿。此頁不另立帳號、媒體包或雲端架構。
