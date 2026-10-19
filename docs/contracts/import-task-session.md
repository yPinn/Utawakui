# 匯入工作 session 契約

本契約描述外部來源匯入的 renderer owner、已確認工作與 Dock 投影。
本機匯入與伴奏佇列維持原有生命週期。

## 狀態與意圖

`useImportSession` 是 module-scope public facade。搜尋文字、來源解析、候選、勾選與
預覽狀態屬於 draft；每次清除／更換來源增加 revision，舊來源的非同步回應不得覆寫
新草稿。`state.isImporting` 只反映目前草稿所提交的工作；全域準備活動使用
`activity.isImporting` 與 batches，不因切換來源而失去忙碌／失敗狀態。

確認時擷取選取曲目、顯示 metadata、下載 identity、collection source 與目標快照。
單曲是一首的 group；批量是一個固定 group，不把每首呈現為獨立 Dock 卡片。
新勾選、新搜尋、關閉 Modal、換分頁及收合 Dock 不修改已接受的快照與分母，也不取消工作。
同一草稿的重複提交不建立第二批；來源清單可在工作中重新開啟該批明細。

`submitImport` 回傳接受的 batch id，不等待下載完成。Modal 從勾選預覽轉成該 id 的
唯讀執行明細；晚到的提交結果不得自行重開已關閉的 Modal。
`confirmImport` 保留既有候選單曲入口與等待完成契約；目前草稿執行中再次呼叫代表停止。

## 下載、停止與重試

`useImportExecution` 為所有 accepted groups 共用最多兩個 renderer 下載提交位置，
不增加使用者執行緒設定。Main 原有全域 scheduler、同曲合併、gate 及逐首曲庫提交
仍具權威；renderer 不提供任意路徑、執行檔或 provider options。

同一 download key 的 in-flight 工作可被不同 groups 訂閱。停止某一 consumer 只移除
其訂閱，其他批次繼續；最後一個 active consumer 停止才呼叫 Main cancel。
同一 consumer 的重複停止共用一次取消要求。取消未被接受時保留工作、顯示停止未完成，
並將取消等待期間的新同曲訂閱合回原工作。取消已被接受後，新同曲工作須等待舊 Promise
結束才能使用相同 key；其他歌曲仍可使用空位。

終態區分成功、失敗、停止；失敗／停止批次可重試未完成歌曲，成功歌曲保留。
取消是預期行為，不寫入下載失敗診斷；其他錯誤沿用 bounded public error 與 diagnostics。
Provider dependency missing 保留 setup recovery，不暴露私人 stderr 或路徑。

## 清單提交與件數

`queued`／`running`／`finalizing` 都是忙碌狀態。歌曲 Promise 完成後仍須等待
playlist／album 保存；finalizing 不提供停止，不提前顯示整批成功。
清單保存失敗保留可重試結果，重試不再次下載成功歌曲。同來源 collection 的寫入序列化，
合併本 session 已成功保存的成員，避免重疊批次彼此覆蓋或重複建立 playlist。

件數分母只計確認時需下載的曲目，不包含原本已在曲庫的項目；這些本機項目仍加入
collection 成員。已處理數是成功＋失敗＋停止，並另列執行／等待／失敗數。
分母不隨後續來源與勾選改變；重試可讓已處理數回退。沒有 byte／percent progress IPC，
不得從 provider stdout 或經過時間推算下載百分比。

## 呈現與容量

Dock 使用正式 `UiTrackRow`／`UiProgress` 與 Dock tokens；執行監看沿用
`useDeferredLoading` 的 180ms 延遲。快任務直接顯示持續可查看的結果，不閃現進度條；
失敗／停止結果立即保留。已出現的監看於重試維持穩定位置。
Dock 保留所有未完成批次與最新一批成功摘要，其餘成功明細只在 session 中保留。
按 batch id 重開明細，不從目前草稿重建舊工作；關閉／Escape 只關明細，停止是獨立意圖。

Modal 沿用共用 workspace shell、單一捲動 owner、select-none 與可複製 recovery notice。
勾選入口負責批次確認；接受後的明細提供逐首停止、整批停止／重試，不改動伴奏批次入口。

每批最多 500 個不同 track id，session 最多 50 批；滿額時先淘汰成功記錄，若全是執行中
或未完成記錄則拒絕新批次並提示清理。使用者只能清除終態記錄，不能以清除替代停止。
工作只在目前 renderer session 中存在；本契約不提供重啟恢復或續傳。

## 驗證邊界

Focused session tests 覆蓋來源 revision、固定快照／target、兩路並行、跨批次共用、取消隔離、
取消回覆競態與失敗、重複提交、成功成員合併，以及 finalizing／保存失敗重試。
Mounted tests 驗證 Dock 關閉／換頁／重開、晚到提交不重開與短任務延遲。
可見 Electron 使用真實組件與隔離資料 bridge 驗證輸入、新來源、件數、快慢任務、
深淺／密度／窄版及明細關閉重開。真實 provider 網路與人工視覺驗收仍為獨立邊界。
