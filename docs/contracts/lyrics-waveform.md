# 歌詞編輯波形

沿用逐行／逐字對時提案 R15–R17 與 [backend 預算驗證](../research/engineering/lyrics-waveform-backend-2026-10-28.md)。波形是原音訊振幅參考，不代表人聲活動、歌詞正確或人工確認；不建立第二個播放 owner。

## 按需摘要與信任邊界

只有使用者明確開啟才讀取。Main 接受 track id、請求 id 與 overview／固定 10 秒 detail tile index，原檔、內容綁定、解碼器與路徑均由 Main 推導。讀取及 cache hit 均重查既有 audio-processing-flow gate 及已準備 FFmpeg；不下載、不自動準備。取消與清除不受 gate 阻擋。

每次讀取捕捉曲庫 dir／epoch、track 目錄身分、原媒體 stat 與內容 SHA-256；排程開始、解碼完成、落盤及回傳前再次核對。來源變更、刪曲、曲庫 scope 改變、gate／解碼器不可用時拒絕舊結果。歌詞來源、offset、tempo 不進 cache key；同曲各歌詞來源共用原媒體摘要。

Main 每次最多 8 個消費者，只保留一個可排程的摘要工作；同 key 合併，其他 key 回 busy，不建立無界 queue。解碼接既有 heavyJobScheduler；等待開始時可取消。最後一個消費者取消會等待 worker／FFmpeg 關閉。清除先失效、取消並等待，再刪除該 scope／track 的 cache；晚到結果不得重建。

原媒體 hash 與 metadata 也在同一排程的可取消 worker 讀取，Main 不完整解析音訊或 cover art；最多 128 份 stat 相符的前置證據。Main frame 以外的 sender、額外欄位、非固定 tile 或任意路徑意圖均拒絕；renderer 結束會取消其工作。解碼 stderr／私有路徑只進 Main 診斷，正常 gate-disabled／取消不記失敗。

刪曲沿既有 work organization owner 等待 reader 的 hold；worker／FFmpeg 關閉前不刪原檔，刪除成功或失敗均釋放 hold。取消若無法由 OS 確認 decoder 退出，回清理失敗，不把它當作已關閉而繼續刪曲。worker 終態必須等 IPC send callback 排空，再 disconnect；parent 同時等待 close，避免大摘要在程序退出時遺失。

## 預算與 cache

原媒體最多 1 GiB／30 分鐘、1–8 聲道、8–192 kHz；分塊 PCM 最多 256 KiB，30 秒 deadline。跨所有聲道取 signed min／max，不 downmix、不保存完整 PCM。overview 最多 4096 對、detail 最多 8192 對；單份二進位摘要最多 64 KiB。這些是應用層輸入／輸出上限，不宣稱 OS 硬 RSS 限制。

專用 userData waveform cache 以 scope／track 分組，內容、producer 版本、已準備 decoder 身分及 tile 為 key。只操作自有命名檔案；每份含有界 metadata 與 base64 float32 摘要，檔案最多 96 KiB，總計最多 64 MiB／512 份，LRU 淘汰。壞資料當 miss，連結及超界資料拒絕；原子安裝前重查失效柵欄。清除不刪歌詞、對時、演唱設定或人工確認收據。

啟動下一次 cache 操作會清理自有 UUID 暫存檔；未知檔名保留，目錄掃描最多 2048 項。每曲清理期間拒絕新讀取，最多 8 個清理請求。切換來源或修改時間不改 cache key；tag bytes 改變保守失效並重建，不在這層推定等價遷移。

## 介面與驗收順序

先完成 Main 來源失效、取消、清理與封裝 worker 驗證，再接歌詞編輯次頁的明確入口。振幅沿原媒體毫秒，歌詞 canonical 時間減 offset 才是波形位置，tempo 不乘入。關閉、換曲及卸載取消消費者，晚到結果不改新頁；不自動播放、不變更 queue，也不自動建立人工確認。

第一版提供唯讀原音訊概覽、固定 10 秒細節、已保存句首、同曲實際 clock 游標、重讀與清 cache。時間顯示 m:ss，沒有拖曳寫回或波形 transport；句級編輯沿原規劃後續。每份 SVG 最多 640 個 extrema 欄與 512 個可見句首，尾端預留桶依實際 frame 座標裁切，不把預算餘裕拉伸進媒體時間。超出原媒體的 offset 標記明示數量、不 clamp 回存。關閉不清 editor 草稿；清 cache 不自動再產生，讀取失敗可重試，操作失敗沿共用 notify，正常完成不通知。

## 已驗證範圍（2026-10-28）

Main 接入使用既有系統 FFmpeg，九種合成來源含 WAV／MP3／AAC／Opus／FLAC、30 分鐘長曲、單聲道及四／八聲道；暖 cache 不啟動 producer。執行中取消、原媒體變更、scope 改變及清除均拒絕晚回，沒有新 cache 安裝，worker／decoder 已退出。共用排程、消費者上限、cache 淘汰／壞資料／連結／暫存清理、刪曲等待與 hold 釋放由相鄰測試固定。

封裝測試驗七個入口與實體 metadata 相依解析，搬移後 worker 在隔離 artifact 內讀取，不借用開發目錄。可見 Electron 在亮色 960／深色 1280 驗開啟、切段、Escape 焦點、清除、讀取中關閉、換來源及長曲讀取中刪曲；主播放持續前進，新增 play／pause 呼叫均為 0，沒有水平溢出。測試使用靜音的合成反相音訊，不作聽感結論。

尚未用此正式路徑驗 app-managed FFmpeg 版本、真實歌曲長時間壓力、Performer／OBS 的人工畫面與聲音一致性；句級操作與 R18 品質仍依原規劃驗收。振幅不升格為對時或裝置校準證據。
