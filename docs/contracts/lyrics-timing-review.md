# 歌詞對時確認的來源與保存邊界

沿[原第 3 項提案](../research/product/lyrics-timing-review-detail-2026-10-26.md)的 source session／revision／offset barrier／receipt 順序推進。現況只見 [spec](../spec.md)。確認收據及句級草稿沿既有保存路徑的版本與取消防線；唯讀波形見[波形契約](lyrics-waveform.md)。本契約記錄對當前來源全部已計時內容的人工檢查，不建立聲學品質或裝置同步承諾。

## Source session 與 CAS

Main 的既有 `lyrics:get-track` 回應附加 opaque `sourceSession`：`id`、`timingRevision`、`offsetRevision`。Main 私有快照綁定目前曲庫路徑／epoch、實體 track 目錄、來源檔 identity 與原文 fingerprint。Renderer 不提供路徑、檔案 stamp 或原音源證據。Session 最多 128 份，取消、淘汰、換庫或來源替換後不能重用。

Main 對仍相符的同來源刷新重用 context id，回應仍各帶不可變的 timing／offset revision；不是替舊草稿換 baseline。來源切換取消已持有的舊 context，晚到的唯讀載入不可撤銷同來源更新載入正在使用的 context。來源讀寫與取消只接受主視窗 main frame；已知衝突回有界 public error，未預期 I/O 才在 Main 記原始診斷並保留 `diagnosticRecorded`。

既有 timing／offset 保存 IPC 附帶 source session。Timing 比較本次草稿起始時的 timing revision，offset 比較該串行保存的 offset revision；兩者獨立，人工確認時才組合完整 snapshot。舊 timing 不因同原文的其他時間修訂而取得新 baseline；offset 回舊數值也不能重用舊 revision。Label／讀音／外觀不改這兩個語意版本。

保存仍由現有 Main writer 執行。Timing revision 包含既有 sidecar 的 fresh bytes／實體 stamp，辨識同原文修訂及 A→B→A；純 no-op 不重寫 sidecar 或換版本。Offset 的程序內 revision 在實質保存或觀察到外部數值變化時前進，程序重啟使所有 session 失效。這不是持久化人工確認；收據另持有 durable snapshot 與失效狀態，不拿此程序內 token 當確認收據。

壞檔、未知 schema 及讀取失敗不以空文件覆寫。原文仍由 fingerprint 驗證，時間仍由既有 canonical validator 驗證，不升格 T0／T1／T1+ 或 partial T2。

## Renderer 保存屏障

句級與逐字操作共用 `useLyricsTimingEditor` 的單一文件草稿、起始 session、最多 100 步復原及保存 mutation。句級入口不以能否分詞為前置：有合法起點的 T1／T2 可調整；T0 不自動造時間。沒有句尾可明確補尾，未取得正長度範圍時不啟用逐字記錄。只有明確啟用逐字校時才從保真文字／讀音切片建立待記錄邊界，不均分時間或把句尾設定升格成 T2。

整句平移將起點、已知終點及既有片段時間加同一整數 delta，未知終點保持未知；被手動平移的推定句尾轉為明確終點。單改句首／句尾只改端點，不裁切或壓縮既有片段；明確設句尾會移除 `endInferred`。句首變更同時更新前一行相依的推定句尾，片段越界或句首非單調即拒絕整次操作。合法行重疊、相同文字、line／segment ids 與未改行均保留。

所有句級操作只改作者草稿，不寫 offset、不改 transport、不發布到 Performer／Output。復原／取消不假回滾已存 timing 或自動保存 offset。數值欄位、微調與波形句界把手沿同一 editor 驗證及復原；音訊摘要本身仍唯讀。保存與保存並確認沿下列既有屏障，不新增自動保存或另一確認通道。

波形把手只對已啟動的句級草稿及已知、位於媒體與檢視範圍內的端點顯示。起／迄分居畫布上／下側，沿共用按鈕提供 Tooltip、焦點與左右鍵 0.1 秒微調；未知句尾仍從既有數值／記錄入口明確補尾，不在波形造新端點。按下把手固定檢視並退出跟隨，不暫停播放；3px 後才預覽，使用按下時的跨度、端點與 offset，以位移換算 canonical 整數毫秒，避免命中把手邊緣時跳位。整份草稿與相依 inferred end 由 editor 的無副作用預覽驗證，移動中不改草稿、錯誤或 undo。有效放開才提交一次；最終落點非法時不採用先前有效預覽，不裁片段或 clamp 回存。一次拖曳一次復原，仍需手動保存。

Escape 在拖曳中先取消手勢，空閒時才關閉面板；取消／失去 capture 不改草稿。來源／session／文件／草稿身分、offset、viewport、媒體摘要或啟用條件改變，以及清除、關閉、隱藏、保存鎖定、卸載，皆撤銷預覽並拒絕晚到放開。拖曳中不顯示遮擋波形的 Tooltip，錯誤沿畫布外既有固定狀態列。普通波形拖曳仍只平移檢視，不變更 timing。

整句波形平移沿同一手勢 owner 的「移」把手，不把整片波形改成時間編輯。已知範圍的把手置於可見範圍中央附近，未知句尾僅以已知句首作錨點；未知尾不補值。沿相同 3px 門檻、凍結檢視、取消及晚回防線，以按下時的跨度換算整數 delta，起／已知迄／既有片段同量移動。全文件驗證與前一句推定尾相依重用 editor；所有已知移動時間亦須在原媒體範圍內。移動只預覽，有效最終放開才呼叫原 shift mutation 一次、一次復原、手動保存；左右鍵沿相同驗證平移 0.1 秒。非法終點不採前次有效預覽，不 clamp 或裁片段。

句文字旁的「定位句首」與「從句首播放」是兩個明確入口，操作目前草稿句首；沒有草稿時使用目前已保存行。既有 useLyrics owner 在顯示及操作當下檢查 source session／timing revision、offset 保存狀態、同曲實際 clock、目前原音訊／分離 URL 與播放器 duration。canonical 減 offset 一次，不乘 tempo，越界或恰在 EOF 不 clamp／播放。定位只呼叫原 player.seek，保留 paused／playing；播放在 seek 後只對 paused 呼叫原 player.play。沒有新 audio element、Queue／playTrack 或 occurrence 切換；播放器 pending 或安排 busy 時停用，其他曲目須先明確改播再使用此入口。沿用目前混音，分離音訊以「目前混音」及 Tooltip 明示，波形仍是原音訊；不改導唱比例或準備分離。拖曳／隱藏／摘要失效期間不發定位或播放，重讀／保存仍不觸發 transport。

同一來源的 offset 自動保存依序提交，保留即時預覽；Main 已存值與預覽分開。只有目前來源、request generation 及最新版回應可更新錯誤／isSaving，舊來源的 success／failure／finally 都不能覆蓋新狀態。

`waitForSavedOffset()` 等待目前來源的在途保存收斂，成功條件是 Main 已存值等於當前預覽且無錯誤。它不確認歌詞正確，也不回滾已提交 offset；後續確認流程須先通過此屏障再 fresh-read。

Timing 草稿保存攜帶開始編輯時的 session／revision。晚回可保留已提交的事實，但不能清除較新草稿、替換新來源或覆蓋新錯誤。換曲／來源／曲庫的上下文 generation 必須一起驗，不只比 trackId／filename。

作者頁有草稿時鎖住來源與編輯模式切換；暫離視圖不自動保存。返回相同 source session 與行身分時恢復時間編輯；來源／scope 已失效則清除舊草稿，不能以新 session 重綁舊 baseline。開頁後的上下文變更沿既有 watch 取消草稿。

波形讀取、預讀、檢視拖移與媒體失效只改唯讀參考，不替時間草稿重綁 source session 或自動保存。手動保存成功後的曲庫通知可重驗波形，但仍沿原 CAS／草稿身分屏障收斂；作者頁已觀察到來源／scope 切換後，晚回不能覆蓋新來源、復活舊波形或舊草稿。Main 保存衝突仍保留草稿及錯誤，不以波形讀取更新其 baseline；波形無法使用時也保留草稿，讓使用者修復媒體或取消編輯。

## 句級操作的視覺驗收

從演唱工具「歌詞」的「編輯歌詞」，或曲庫既有歌詞編輯入口，進入第二級頁面。選「編輯 → 調整對時」，再點行旁時鐘；T1／T2 可直接編輯句首／句尾秒數、設為目前歌詞位置及整句前後 0.1 秒。推定句尾可明確固定，前一句相依終點的變更會顯示提示。數值保留毫秒精度，不使用閱讀頁的 mm:ss 顯示回寫。

先驗微調後閱讀／公開投影仍為已保存值，再驗復原／取消；手動儲存才更新正式 timing。確認入口位於標題右側，保存並確認及撤銷沿原操作。末行缺尾可明確補尾；若需逐字校時，從同一草稿明確啟用並記錄每個邊界，取消不可產生 T2。波形入口仍在同列；開啟後可拖起／迄把手，比對保存虛線與草稿實線，驗證放開才改草稿、一次復原、Escape 取消及手動保存。

## 持久化人工確認

Main 的 `lyricsTimingReview` 沿同一 source session fresh-read canonical document，固定確認範圍為此來源全部已計時行。來源 T0、壞 timing 或未知 schema 不提供確認 token；不將未計時行、partial T2 或 T1+ 升格。Coverage 分別計算總行數、已計時行與含逐字時間的行數，由 Main 推導，Renderer 不填可信度或覆蓋率。

每個來源只保存一份 `tracks/<trackId>/lyrics/review/<filename>.json`，上限 32KiB。Schema 1 包含 receipt revision、confirmed／expired／revoked、確認／狀態變更時間，以及 Main 推導的來源 identity／fingerprint、canonical document／normalizer、timing revision、已存 offset、原媒體 content binding／實體 track identity 與 coverage。檔案不含絕對路徑、原文、無限操作歷史或裝置設定；刪除來源會清理這份收據。

原媒體沿既有 `createMediaVerifier` 做有界分塊 content hash，fresh stat 不符就重驗；FLAC tag 變更只有既有 `tagContentAliases` 驗證當前檔案與備份等價後才遷移 binding，否則過期。來源／曲庫、媒體、receipt 在所有 await 後及寫入前重驗；確認 token 最多 128 份，單次操作 deadline 10 秒，晚回不得寫入。

`lyrics:get-timing-review` 回投影及 opaque token；`lyrics:confirm-timing-review`／`lyrics:revoke-timing-review` 只送來源 session 與該 token。Token 綁定讀取時的完整 snapshot 與 receipt bytes，另一份確認／撤銷先提交後，舊 token 不能覆寫。`lyrics:cancel-timing-review` 只撤銷這次意圖的 token；Main 在非同步驗證後、落盤前重查，已提交的收據不假裝回滾。相同已確認 snapshot 的再次確認為 no-op，保留 revision／確認時間。

實質 timing／offset 保存先將有效收據持久標為 expired，接著才呼叫既有 writer；純 no-op 保留。先失效成功、後保存失敗時保守保持過期，不能假稱跨檔原子交易。已過期／撤銷不因值改回原值或程序重啟而復活；同來源未變的 A→B→A 切換可讀回 A。觀察到不同媒體、缺失原媒體或無法使用的 timing 時，也使有效收據過期。未被程式觀察到的外部 offset 改寫歷史無法還原；外部檔案不構成受追蹤的編輯交易。

Label／讀音／聲部／繁簡／外觀／pitch／tempo／導唱不改 canonical snapshot，不使確認失效。T1+ 分析顯示不借用 canonical 的確認標示，須先切回原歌詞。Receipt 壞檔／未知 schema 保留原 bytes 並禁止確認或撤銷；不以空資料覆寫。讀取或媒體驗證失敗顯示無法讀取，不能顯示已確認。

## 確認協調與操作

同一 source owner 組合 `useLyricsTimingReview`；入口只在編輯歌詞第二級頁面，演唱頁沿既有「編輯歌詞」進入，不另加播放工具。Popover 只保留單行狀態、coverage 範圍與主要確認動作；只有使用者勾選「已檢查全部已計時內容」才可確認，撤銷／重新讀取統一放最右更多。切換上下文、修改草稿或切換分析顯示會清除勾選。撤銷只改收據，不刪除或回滾時間／offset，也不干預播放。

一般儲存仍只存時間；有合法草稿時可選「儲存並確認」：保存草稿 → 成功後清除同一草稿 → 等待 offset 屏障 → Main fresh-read → 確認。任一 await 期間出現新草稿、offset intent、來源／scope 或視圖離開即停止後續確認；晚成功／失敗／finally 不蓋新操作。

Timing 失敗保留草稿；timing 已存、offset 失敗時保留時間並提示先處理同步調整；兩者已存、確認失敗時明示時間已儲存／確認未完成，只重試確認。回應遺失先 fresh-read 已提交事實，不盲目重送舊 timing。來源已變而無法讀取時，可在沒有草稿後重新載入歌詞與確認狀態。
